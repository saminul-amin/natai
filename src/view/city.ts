// The city (DESIGN.md 5.7): merged building chunks with the façade atlas and night window lights,
// tin roofs that reflect, roof props and trees that move with the same wind the kites feel, street
// lamps, the landmarks, the Buriganga with its launches and boats, the bridge, and the far bank as
// pre-rendered impostor cards.
import {
  Color,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  RenderTarget,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  Vector3,
  AmbientLight,
  type BufferGeometry,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn,
  attribute,
  cos,
  float,
  fract,
  hash,
  instanceIndex,
  max,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  step,
  texture,
  transformNormalToView,
  uv,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';
import { buildChunks, CHUNK_SIZE, heightOver } from '../procedural/buildings';
import { CITY, LANDMARKS, type CityLayout, type PropKind } from '../procedural/city';
import { ATLAS_SIZE, facadeAtlas } from '../procedural/facades';
import {
  ahsanManzil,
  boat,
  bridge,
  lampGeometry,
  launch,
  merge,
  minaret,
  mosque,
  PROP_VARIANTS,
  propGeometry,
  terminal,
  treeGeometry,
} from '../procedural/props';
import { ROOFTOPS } from '../sim/names';
import { rngFor } from '../sim/rng';
import type { Tier } from '../types';
import { shared } from './uniforms';

const dummy = new Object3D();

function dataTexture(data: Uint8Array, size: number, srgb: boolean): DataTexture {
  const t = new DataTexture(data, size, size, RGBAFormat);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Material for everything carrying vertex colours and a sway weight: props, trees, landmarks. */
export function swayMaterial(stiffness = 1, roughness = 0.85): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness, metalness: 0, side: DoubleSide });
  m.colorNode = vertexColor();
  const sway = attribute('sway', 'float');
  m.positionNode = Fn(() => {
    const p = positionLocal;
    const phase = hash(instanceIndex).mul(6.28);
    const t = shared.time;
    const wind = shared.wind;
    const strength = max(0.4, wind.length().div(6));
    const flap = sin(
      t
        .mul(7.0 / stiffness)
        .add(phase)
        .add(p.y.mul(2.1))
        .add(p.z.mul(3.3)),
    ).mul(0.18);
    const gust = sin(t.mul(1.3).add(phase)).mul(0.5).add(0.5);
    const dx = flap.mul(strength).mul(sway).mul(gust.mul(0.6).add(0.4));
    const dz = cos(
      t
        .mul(5.1 / stiffness)
        .add(phase)
        .add(p.x.mul(1.7)),
    )
      .mul(0.12)
      .mul(sway)
      .mul(strength);
    return p.add(vec3(dx, dx.mul(0.25), dz));
  })();
  return m;
}

export class CityView {
  readonly group = new Group();
  private readonly boats: InstancedMesh;
  private readonly boatState: { x: number; z: number; speed: number; dir: number }[] = [];
  /** Lamp heads and string-light bulbs glow at night. */
  readonly lampGlow: InstancedMesh;
  private readonly atlas: DataTexture;
  private readonly glass: DataTexture;
  /**
   * False over the roof of a building this tier leaves out, so nothing is placed floating on it.
   * Views only: the simulation always sees the whole city, so a seed flies the same on every tier.
   */
  readonly roofDrawn: (x: number, z: number) => boolean;

  constructor(layout: CityLayout, renderer: WebGPURenderer, noise: DataTexture, tier: Tier, seed: number) {
    const { color, glass } = facadeAtlas(seed);
    this.atlas = dataTexture(color, ATLAS_SIZE, true);
    this.glass = dataTexture(glass, ATLAS_SIZE, false);

    // ---- buildings ----
    const wallMat = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const tex = texture(this.atlas, uv());
    const tint = vertexColor();
    // Plaster takes the building's tint; walls darken a little toward the lanes.
    const groundShade = smoothstep(0.0, 14.0, positionWorld.y).mul(0.35).add(0.65);
    wallMat.colorNode = mix(tex.rgb, tex.rgb.mul(tint), tex.a).mul(groundShade);
    const glowSeed = attribute('glow', 'float');
    wallMat.emissiveNode = Fn(() => {
      const g = texture(this.glass, uv()).r;
      // Through dusk more and more windows come on; some are warm bulbs, some cool tube lights.
      const on = step(float(1).sub(shared.night.mul(0.62)), glowSeed);
      const warm = step(0.35, fract(glowSeed.mul(13.7)));
      const c = mix(vec3(0.75, 0.9, 1.0), vec3(1.0, 0.72, 0.4), warm);
      return c.mul(g).mul(on).mul(shared.night).mul(2.4);
    })();
    const tinMat = new MeshStandardNodeMaterial({ metalness: 0.75, roughness: 0.38, side: DoubleSide });
    tinMat.colorNode = Fn(() => {
      const rib = sin(uv().x.mul(Math.PI * 2 * 12))
        .mul(0.5)
        .add(0.5);
      const rust = texture(noise, uv().mul(vec2(0.5, 0.5))).r;
      const base = mix(vec3(0.52, 0.53, 0.55), vec3(0.45, 0.24, 0.13), smoothstep(0.45, 0.75, rust));
      return base.mul(rib.mul(0.25).add(0.75)).mul(vertexColor().mul(0.6).add(0.4));
    })();
    tinMat.roughnessNode = Fn(() => mix(float(0.3), float(0.75), texture(noise, uv().mul(0.5)).r))();

    // The balanced tier (500 k triangles) keeps the near ring whole and one distant building in three;
    // the impostor cards on the horizon cover the gaps.
    const keep = tier === 'high' ? () => true : (b: { detail: boolean; seed: number }) => b.detail || b.seed % 3 === 0;
    const dropped = heightOver(layout.buildings.filter((b) => !keep(b)));
    this.roofDrawn = (x, z) => dropped(x, z) === 0;
    // Balanced also keeps full façade detail only close to the rooftops the player can stand on.
    const fine =
      tier === 'high'
        ? (b: { detail: boolean }) => b.detail
        : (b: { detail: boolean; x: number; z: number }) =>
            b.detail && ROOFTOPS.some((r) => Math.hypot(b.x - r.x, b.z - r.z) < 110);
    for (const chunk of buildChunks(layout, keep, fine)) {
      const walls = new Mesh(chunk.walls, wallMat);
      // Only the near city casts shadows; far chunks sit beyond the last cascade anyway.
      const near = Math.hypot((chunk.cx + 0.5) * CHUNK_SIZE, (chunk.cz + 0.5) * CHUNK_SIZE) < 420;
      walls.castShadow = near;
      walls.receiveShadow = true;
      walls.matrixAutoUpdate = false;
      this.group.add(walls);
      if (chunk.tin.getAttribute('position').count > 0) {
        const tin = new Mesh(chunk.tin, tinMat);
        tin.castShadow = near;
        tin.receiveShadow = true;
        tin.matrixAutoUpdate = false;
        this.group.add(tin);
      }
    }

    // ---- ground: lanes on this bank, mud and fields beyond the river ----
    const groundMat = new MeshStandardNodeMaterial({ roughness: 0.95 });
    groundMat.colorNode = Fn(() => {
      const n = texture(noise, positionWorld.xz.div(90)).r;
      const lane = mix(vec3(0.16, 0.15, 0.14), vec3(0.24, 0.21, 0.18), n);
      const farBank = mix(vec3(0.24, 0.22, 0.16), vec3(0.3, 0.33, 0.2), n);
      return mix(farBank, lane, step(CITY.riverSouth + 5, positionWorld.z));
    })();
    const ground = new Mesh(new PlaneGeometry(6000, 6000), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, -600);
    ground.receiveShadow = true;
    this.group.add(ground);

    // ---- the river ----
    this.group.add(this.river(noise));

    // ---- props ----
    const propMat = swayMaterial(1, 0.8);
    const byKind = new Map<
      string,
      { kind: PropKind; variant: number; near: boolean; list: { x: number; y: number; z: number; rot: number; scale: number }[] }
    >();
    for (const [index, p] of layout.props.entries()) {
      const near = Math.hypot(p.x, p.z) < 320;
      // Balanced: a third of the near props and a sixth of the far ones; flags stay, they show the wind.
      if (tier !== 'high' && p.kind !== 'flag' && index % (near ? 3 : 6) !== 0) continue;
      if (!this.roofDrawn(p.x, p.z)) continue;
      const variant = p.variant % PROP_VARIANTS[p.kind];
      const key = `${p.kind}:${variant}:${near}`;
      let e = byKind.get(key);
      if (!e) {
        e = { kind: p.kind, variant, near, list: [] };
        byKind.set(key, e);
      }
      // Flags and washing lines face the wind: the flags fly toward -z.
      const rot = p.kind === 'flag' ? (p.rot % 0.5) - 0.25 : p.rot;
      e.list.push({ x: p.x, y: p.y, z: p.z, rot, scale: p.scale });
    }
    // Near props are instanced and cast shadows; far ones are baked into one static mesh, one draw call.
    const far: BufferGeometry[] = [];
    for (const e of byKind.values()) {
      if (!e.near) {
        const base = propGeometry(e.kind, e.variant);
        for (const p of e.list) {
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(0, p.rot, 0);
          dummy.scale.setScalar(p.scale);
          dummy.updateMatrix();
          far.push(base.clone().applyMatrix4(dummy.matrix));
        }
        continue;
      }
      const mesh = new InstancedMesh(propGeometry(e.kind, e.variant), propMat, e.list.length);
      e.list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = e.kind !== 'washing';
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    if (far.length > 0) {
      const farProps = new Mesh(merge(far), propMat);
      farProps.receiveShadow = true;
      this.group.add(farProps);
    }

    // ---- trees ----
    const treeMat = swayMaterial(2.6, 0.9);
    for (const kind of ['rain', 'coconut', 'banana'] as const) {
      const list = layout.trees.filter((t, i) => t.kind === kind && (tier === 'high' || i % 3 === 0));
      if (list.length === 0) continue;
      const mesh = new InstancedMesh(treeGeometry(kind), treeMat, list.length);
      list.forEach((t, i) => {
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }

    // ---- street lamps ----
    const lampMat = swayMaterial(1, 0.7);
    const lamps = new InstancedMesh(lampGeometry(), lampMat, layout.lamps.length);
    layout.lamps.forEach((l, i) => {
      dummy.position.set(l.x, 0, l.z);
      dummy.rotation.set(0, (i * 1.3) % 6.28, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      lamps.setMatrixAt(i, dummy.matrix);
    });
    lamps.computeBoundingSphere();
    this.group.add(lamps);
    const glowMat = new MeshBasicNodeMaterial();
    glowMat.colorNode = vec3(1.0, 0.62, 0.3).mul(shared.night.mul(9).add(0.05));
    this.lampGlow = new InstancedMesh(new PlaneGeometry(0.7, 0.35).rotateX(Math.PI / 2), glowMat, layout.lamps.length);
    layout.lamps.forEach((l, i) => {
      dummy.position.set(l.x + Math.cos((i * 1.3) % 6.28) * 0.75, 5.95, l.z - Math.sin((i * 1.3) % 6.28) * 0.75);
      dummy.rotation.set(Math.PI, 0, 0);
      dummy.updateMatrix();
      this.lampGlow.setMatrixAt(i, dummy.matrix);
    });
    this.lampGlow.computeBoundingSphere();
    this.group.add(this.lampGlow);

    // ---- landmarks: all far from the player, merged into one mesh ----
    const landMat = swayMaterial(1, 0.75);
    const landParts: BufferGeometry[] = [];
    const lm = (g: BufferGeometry, x: number, z: number, rot = 0): void => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      landParts.push(g.clone().applyMatrix4(dummy.matrix));
    };
    lm(ahsanManzil(), LANDMARKS.ahsanManzil.x, LANDMARKS.ahsanManzil.z);
    lm(mosque(), LANDMARKS.mosque.x, LANDMARKS.mosque.z);
    lm(terminal(), LANDMARKS.terminal.x, LANDMARKS.terminal.z);
    lm(merge(LANDMARKS.minarets.map((m, i) => minaret(m.x, m.z, 22 + (i % 3) * 5))), 0, 0);
    lm(bridge(CITY.riverNorth - CITY.riverSouth + 80), LANDMARKS.bridgeX, (CITY.riverNorth + CITY.riverSouth) / 2);
    // Launches moored at Sadarghat, bows to the bank.
    const launches = [launch(0), launch(1)];
    for (let i = 0; i < 7; i++) {
      lm(launches[i % 2] as BufferGeometry, LANDMARKS.terminal.x - 70 + i * 24, CITY.riverNorth - 42, Math.PI + (i % 3) * 0.04);
    }
    // Two launches out on the river, further away.
    lm(launches[1] as BufferGeometry, -180, CITY.riverNorth - 190, Math.PI / 2);
    lm(launches[0] as BufferGeometry, 260, CITY.riverNorth - 250, -Math.PI / 2.2);
    const landmarks = new Mesh(merge(landParts), landMat);
    landmarks.receiveShadow = true;
    this.group.add(landmarks);

    // ---- country boats crossing the river ----
    const brng = rngFor(seed, 'boats');
    const boatCount = 26;
    this.boats = new InstancedMesh(boat(), landMat, boatCount);
    this.boats.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < boatCount; i++) {
      this.boatState.push({
        x: brng.range(-900, 900),
        z: brng.range(CITY.riverSouth + 30, CITY.riverNorth - 70),
        speed: brng.range(0.6, 1.6),
        dir: brng.chance(0.5) ? 1 : -1,
      });
    }
    this.boats.frustumCulled = false;
    this.group.add(this.boats);
    this.updateBoats(0);

    // ---- the far bank: impostor cards ----
    this.group.add(this.farBank(renderer, layout, seed));
  }

  private river(noise: DataTexture): Mesh {
    const mat = new MeshStandardNodeMaterial({ metalness: 0.92, roughness: 0.1 });
    // Murky Buriganga water: a dark green-brown that reflects the sky and, at night, the fireworks.
    mat.colorNode = vec3(0.07, 0.085, 0.07);
    mat.normalNode = Fn(() => {
      const p = positionWorld.xz;
      const t = shared.time;
      const a = texture(noise, p.div(38).add(vec2(t.mul(0.004), t.mul(0.007)))).g;
      const b = texture(noise, p.div(11).add(vec2(t.mul(-0.011), t.mul(0.005)))).a;
      const ax = texture(noise, p.div(38).add(vec2(t.mul(0.004).add(0.01), t.mul(0.007)))).g;
      const bz = texture(noise, p.div(11).add(vec2(t.mul(-0.011), t.mul(0.005).add(0.01)))).a;
      const n = normalize(vec3(a.sub(ax).mul(2.2).add(b.sub(bz).mul(0.9)), 1, b.sub(bz).mul(1.6).add(a.sub(ax).mul(0.8))));
      return transformNormalToView(n);
    })();
    const w = CITY.riverNorth - CITY.riverSouth;
    const water = new Mesh(new PlaneGeometry(7000, w, 1, 1), mat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.25, (CITY.riverNorth + CITY.riverSouth) / 2);
    water.receiveShadow = true;
    return water;
  }

  /** Renders four little clusters of far-bank buildings to textures once, then places them as cards. */
  private farBank(renderer: WebGPURenderer, layout: CityLayout, seed: number): Group {
    const g = new Group();
    const rng = rngFor(seed, 'farbank');
    const cardW = 160;
    const cardH = 40;
    const rt = new RenderTarget(1024, 256, { samples: 4 });
    rt.texture.colorSpace = SRGBColorSpace;
    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1));
    // Reuse the façade atlas on simple boxes, lit flat; the cards are lit by the real sky later.
    const sample = buildChunks(
      {
        ...layout,
        buildings: layout.buildings
          .filter((b) => !b.detail)
          .slice(0, 160)
          .map((b, i) => ({ ...b, x: -cardW / 2 + (i % 16) * 10 + 5, z: -Math.floor(i / 16) * 12, detail: false })),
        heightAt: () => 0,
      },
      () => true,
    );
    const flat = new MeshBasicNodeMaterial();
    flat.colorNode = mix(
      texture(this.atlas, uv()).rgb,
      texture(this.atlas, uv()).rgb.mul(vertexColor()),
      texture(this.atlas, uv()).a,
    );
    for (const c of sample) scene.add(new Mesh(c.walls, flat));
    const cam = new OrthographicCamera(-cardW / 2, cardW / 2, cardH, 0, 0.1, 400);
    cam.position.set(0, 0, 100);
    cam.lookAt(0, 0, 0);
    cam.position.y = 0;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(new Color(0, 0, 0), 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);

    const cardMat = new MeshStandardNodeMaterial({ transparent: false, alphaTest: 0.5, roughness: 0.9, side: DoubleSide });
    const t = texture(rt.texture, uv());
    cardMat.colorNode = t.rgb.mul(0.85);
    cardMat.opacityNode = t.a;
    cardMat.emissiveNode = Fn(() => {
      // At night the far bank twinkles with windows.
      const cell = hash(uv().x.mul(220).floor().add(uv().y.mul(40).floor().mul(311)));
      return vec3(1.0, 0.75, 0.45).mul(step(0.86, cell)).mul(shared.night).mul(t.a).mul(1.4);
    })();
    const cards = new InstancedMesh(new PlaneGeometry(cardW, cardH).translate(0, cardH / 2, 0), cardMat, 46);
    const q = new Quaternion();
    for (let i = 0; i < 46; i++) {
      const row = Math.floor(i / 23);
      const x = -1700 + (i % 23) * 150 + rng.range(-30, 30);
      const z = CITY.riverSouth - 40 - row * 120 - rng.range(0, 60);
      const s = 0.8 + rng.next() * 0.5;
      q.setFromAxisAngle(new Vector3(0, 1, 0), rng.range(-0.15, 0.15));
      cards.setMatrixAt(i, new Matrix4().compose(new Vector3(x, 0, z), q, new Vector3(s, s * (row === 0 ? 1 : 0.8), 1)));
    }
    cards.computeBoundingSphere();
    cards.castShadow = false;
    g.add(cards);
    return g;
  }

  update(dt: number): void {
    this.updateBoats(dt);
  }

  private updateBoats(dt: number): void {
    this.boatState.forEach((b, i) => {
      b.x += b.speed * b.dir * dt;
      if (b.x > 950) b.x = -950;
      if (b.x < -950) b.x = 950;
      dummy.position.set(b.x, 0.2 + Math.sin(b.x * 0.3) * 0.05, b.z);
      dummy.rotation.set(0, b.dir > 0 ? 0 : Math.PI, Math.sin(b.x * 0.5) * 0.02);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.boats.setMatrixAt(i, dummy.matrix);
    });
    this.boats.instanceMatrix.needsUpdate = true;
  }
}
