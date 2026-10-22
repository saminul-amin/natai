// Post-processing (DESIGN.md 5.4), in this order: ambient occlusion on the lit scene, screen-space
// reflections, god rays, anti-aliasing, depth of field, bloom, AgX tone mapping, per-phase
// colour grading, vignette and grain. The phone tier keeps bloom, tone mapping, grading and vignette.
import {
  AgXToneMapping,
  Data3DTexture,
  LinearFilter,
  RenderPipeline,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  type Camera,
  type Node,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn,
  abs,
  blendColor,
  unpackRGBToNormal,
  packNormalToRGB,
  float,
  hash,
  int,
  length,
  luminance,
  metalness,
  mix,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  roughness,
  sample,
  screenCoordinate,
  screenUV,
  smoothstep,
  step,
  texture3D,
  uniform,
  vec2,
  vec3,
  vec4,
  velocity,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js';
import { radialBlur } from 'three/addons/tsl/display/radialBlur.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { gradingTable, LUT_SIZE } from '../procedural/grading';
import type { DayPhase, Tier } from '../types';

/** The addon post nodes are vec4 nodes at runtime; their type declarations do not say so. */
const v4 = (n: object): Node<'vec4'> => n as unknown as Node<'vec4'>;

function lutTexture(phase: DayPhase): Data3DTexture {
  const t = new Data3DTexture(gradingTable(phase), LUT_SIZE, LUT_SIZE, LUT_SIZE);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

export class Post {
  readonly pipeline: RenderPipeline;
  /** Distance to the subject the depth of field focuses on, metres. */
  readonly focusDistance = uniform(80);
  readonly focalRange = uniform(160);
  readonly bokeh = uniform(1.2);
  /** Sun position in screen uv and how visible it is (0 behind the camera or below the horizon). */
  readonly sunScreen = uniform(new Vector2(0.5, 0.3));
  readonly sunVisible = uniform(0);
  readonly godRayStrength = uniform(0.5);
  readonly bloomStrength = uniform(0.32);
  readonly lutMix = uniform(0);
  readonly grainTime = uniform(0);
  readonly vignette = uniform(0.32);
  readonly reducedMotion = uniform(0);
  private readonly luts: Record<DayPhase, Data3DTexture>;
  private readonly lutA;
  private readonly lutB;
  readonly tier: Tier;

  constructor(renderer: WebGPURenderer, scene: Scene, camera: Camera, tier: Tier) {
    this.tier = tier;
    this.luts = {
      afternoon: lutTexture('afternoon'),
      golden: lutTexture('golden'),
      dusk: lutTexture('dusk'),
      night: lutTexture('night'),
    };
    this.lutA = texture3D(this.luts.afternoon);
    this.lutB = texture3D(this.luts.golden);
    renderer.toneMapping = AgXToneMapping;
    renderer.outputColorSpace = SRGBColorSpace;
    this.pipeline = new RenderPipeline(renderer);
    this.pipeline.outputColorTransform = false;

    const scenePass = pass(scene, camera);
    let hdr: Node<'vec4'>;
    // Every stage can be switched off from the URL (?post=noao,nossr,norays,notaa,nodof,nobloom), for
    // comparison shots and performance checks.
    const off = new Set((new URLSearchParams(location.search).get('post') ?? '').split(','));
    if (tier === 'high') {
      scenePass.setMRT(
        mrt({
          output,
          normal: packNormalToRGB(normalView),
          metalrough: vec2(metalness, roughness),
          velocity,
        }),
      );
      const normalTex = scenePass.getTexture('normal');
      normalTex.type = UnsignedByteType;
      const mrTex = scenePass.getTexture('metalrough');
      mrTex.type = UnsignedByteType;
      const color = scenePass.getTextureNode('output');
      const depth = scenePass.getTextureNode('depth');
      const normalNode = scenePass.getTextureNode('normal');
      const normal = sample((u: Node<'vec2'>) => unpackRGBToNormal(normalNode.sample(u)));
      const mr = scenePass.getTextureNode('metalrough');
      const vel = scenePass.getTextureNode('velocity');
      let image: Node<'vec4'> = color;

      // 1. Ambient occlusion, half resolution, applied to the lit image.
      if (!off.has('noao')) {
        const aoPass = ao(depth, normal, camera);
        aoPass.resolutionScale = 0.5;
        aoPass.radius.value = 1.2;
        aoPass.samples.value = 10;
        aoPass.distanceExponent.value = 1.4;
        const aoValue = aoPass.getTextureNode().sample(screenUV).r;
        image = vec4(color.rgb.mul(mix(float(1), aoValue, 0.8)), color.a);
      }

      // 2. Screen-space reflections on the metallic surfaces: tin, tanks, the river.
      if (!off.has('nossr')) {
        const ssrPass = ssr(color, depth, normal, { metalnessNode: mr.r, roughnessNode: mr.g, camera });
        ssrPass.resolutionScale = 0.5;
        // The blur target starts at 1×1 with five mip levels, which WebGPU rejects if anything binds it
        // before the first frame sizes it; size it now.
        const size = renderer.getDrawingBufferSize(new Vector2());
        ssrPass.setSize(Math.max(64, Math.round(size.x * 0.5)), Math.max(64, Math.round(size.y * 0.5)));
        ssrPass.maxDistance.value = 220;
        ssrPass.thickness.value = 0.6;
        ssrPass.quality.value = 0.4;
        image = blendColor(image, ssrPass);
      }

      // 3. God rays: the bright sky around the sun, smeared radially from the sun across the frame.
      if (!off.has('norays')) {
        const sunUv = this.sunScreen;
        const source = Fn(() => {
          const c = color.sample(screenUV);
          const isSky = step(0.99999, depth.sample(screenUV).r);
          const d = length(screenUV.sub(sunUv).mul(vec2(1.6, 1)));
          const near = smoothstep(0.45, 0.0, d);
          // Compressed so the HDR sun disc and its halo cannot flood the frame when the sun is high.
          const soft = c.rgb.div(luminance(c.rgb).add(1));
          return vec4(soft.mul(isSky).mul(near).mul(0.6), 1);
        })();
        const shafts = v4(
          radialBlur(source, { center: sunUv, weight: float(0.85), decay: float(0.965), count: int(36), exposure: float(1.6) }),
        );
        // Shafts are scattered in the air between the eye and what it sees, so the near parapet and
        // roofs receive almost none; without this the streak paints over the foreground.
        const air = smoothstep(30, 300, scenePass.getViewZNode().negate());
        image = vec4(image.rgb.add(shafts.rgb.mul(air).mul(this.sunVisible).mul(this.godRayStrength)), 1);
      }

      // 4. Temporal anti-aliasing (?post=smaa swaps in a spatial pass, for comparison).
      if (off.has('smaa')) image = v4(smaa(image));
      else if (!off.has('noaa')) image = v4(traa(image, depth, vel, camera));

      // 5. Depth of field on the kite or the pench crossing.
      if (!off.has('nodof') && !off.has('softdof')) {
        image = v4(dof(image, scenePass.getViewZNode(), this.focusDistance, this.focalRange, this.bokeh));
      } else if (off.has('softdof')) {
        // A cheap variant: a half-resolution gaussian blended in by distance from the focal plane.
        const sharp = image;
        const blurred = v4(gaussianBlur(sharp, float(1), 3, { resolutionScale: 0.5 }));
        const viewZ = scenePass.getViewZNode();
        const coc = smoothstep(0, this.focalRange, abs(viewZ.negate().sub(this.focusDistance)))
          .mul(this.bokeh)
          .clamp(0, 1);
        image = vec4(mix(sharp.rgb, blurred.rgb, coc), 1);
      }

      // 6. Bloom: only emissives and the sun cross the threshold.
      if (!off.has('nobloom')) {
        const glowNode = bloom(image, 1, 0.55, 1.6);
        glowNode.strength = this.bloomStrength;
        image = vec4(image.rgb.add(v4(glowNode).rgb), 1);
      }
      hdr = image;
    } else {
      const color = scenePass.getTextureNode('output');
      const glowNode = bloom(color, 1, 0.5, 1.6);
      glowNode.strength = this.bloomStrength;
      hdr = vec4(color.rgb.add(v4(glowNode).rgb), 1);
    }

    // 7. AgX tone mapping, to display sRGB.
    const toned = renderOutput(hdr, AgXToneMapping, SRGBColorSpace);
    // 8. Grading: blend the tables of the two phases around the current minute.
    const gradedA = v4(lut3D(toned, this.lutA, LUT_SIZE, float(1)));
    const gradedB = v4(lut3D(toned, this.lutB, LUT_SIZE, float(1)));
    const graded = mix(gradedA, gradedB, this.lutMix);
    // 9. Vignette and grain, after anti-aliasing.
    const finalNode = Fn(() => {
      const d = length(screenUV.sub(0.5).mul(vec2(1.25, 1)));
      const v = float(1).sub(smoothstep(0.35, 1.0, d).mul(this.vignette));
      let c = graded.rgb.mul(v);
      if (tier === 'high') {
        const n = hash(screenCoordinate.x.add(screenCoordinate.y.mul(1931)).add(this.grainTime.mul(97)));
        c = c.add(
          vec3(
            n
              .sub(0.5)
              .mul(0.022)
              .mul(float(1).sub(this.reducedMotion.mul(0.6))),
          ),
        );
      }
      return vec4(c, 1);
    })();
    this.pipeline.outputNode = off.has('raw') ? renderOutput(scenePass, AgXToneMapping, SRGBColorSpace) : finalNode;
  }

  /** Sets the grading tables for the current blend of phases. */
  setGrade(from: DayPhase, to: DayPhase, t: number): void {
    this.lutA.value = this.luts[from];
    this.lutB.value = this.luts[to];
    this.lutMix.value = t;
  }

  render(): void {
    this.pipeline.render();
  }

  dispose(): void {
    this.pipeline.dispose();
  }
}
