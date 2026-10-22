// The sky (DESIGN.md 5.2): a physically based atmosphere from precomputed scattering tables, the
// Hillaire 2020 approach. The transmittance and multiple-scattering tables depend only on the
// atmosphere and are built once; the sky-view table is rebuilt every frame as the sun moves. A
// cirrus layer, the sun disc, stars, a crescent moon and the city's glow are composed on top. The
// same sky lights the scene through an environment map regenerated every few seconds.
import type { Color } from 'three/webgpu';
import {
  DataTexture,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  NodeMaterial,
  PMREMGenerator,
  QuadMesh,
  RenderTarget,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  SphereGeometry,
  BackSide,
  ClampToEdgeWrapping,
  Vector3,
  type Node,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  abs,
  acos,
  asin,
  atan,
  clamp,
  cos,
  dot,
  exp,
  float,
  floor,
  fract,
  hash,
  length,
  max,
  min,
  mix,
  normalize,
  positionWorldDirection,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  int,
} from 'three/tsl';
import { noiseTexture } from '../procedural/noise';
import type { Tier } from '../types';

type NodeLike = Node<'float'>;
type Vec3Node = Node<'vec3'>;
type IntNode = Node<'int'>;

// Atmosphere in kilometres. The Mie (aerosol) terms are raised well above a clean-air sky: a Dhaka
// winter afternoon is hazy, and the haze is what turns the low sun orange.
const BOTTOM = 6360;
const TOP = 6460;
const HAZE = 5.0;
const RAYLEIGH = new Vector3(5.802e-3, 13.558e-3, 33.1e-3);
const MIE_SCAT = 3.996e-3 * HAZE;
const MIE_EXT = 4.44e-3 * HAZE;
const OZONE = new Vector3(0.65e-3, 1.881e-3, 0.085e-3);
const RAYLEIGH_H = 8;
const MIE_H = 1.6;
const MIE_G = 0.78;
const GROUND_ALBEDO = 0.25;
/** Camera altitude over the city, km. */
const CAMERA_KM = 0.04;

const TRANS_W = 256;
const TRANS_H = 64;
const MS_SIZE = 32;
const VIEW_W = 192;
const VIEW_H = 108;

/** HDR scale of sunlight: the sun's illuminance in scene units. */
export const SUN_ILLUMINANCE = 9;

// ---------------------------------------------------------------------------------------------
// CPU side: the same atmosphere, used for the sun light's colour so it matches the sky exactly.

function extinctionCPU(h: number): [number, number, number] {
  const r = Math.exp(-h / RAYLEIGH_H);
  const m = Math.exp(-h / MIE_H);
  const o = Math.max(0, 1 - Math.abs(h - 25) / 15);
  return [
    RAYLEIGH.x * r + MIE_EXT * m + OZONE.x * o,
    RAYLEIGH.y * r + MIE_EXT * m + OZONE.y * o,
    RAYLEIGH.z * r + MIE_EXT * m + OZONE.z * o,
  ];
}

/** Transmittance from altitude h (km) toward a direction with vertical cosine mu, to space. */
export function transmittanceCPU(h: number, mu: number): [number, number, number] {
  const r = BOTTOM + h;
  // Below the horizon of the planet itself the sun is blocked.
  const disc = r * r * (mu * mu - 1) + BOTTOM * BOTTOM;
  if (mu < 0 && disc > 0) return [0, 0, 0];
  const tTop = -r * mu + Math.sqrt(Math.max(0, r * r * (mu * mu - 1) + TOP * TOP));
  const steps = 48;
  const dt = tTop / steps;
  const od = [0, 0, 0];
  const s = Math.sqrt(Math.max(0, 1 - mu * mu));
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const px = s * t;
    const py = r + mu * t;
    const hh = Math.sqrt(px * px + py * py) - BOTTOM;
    const e = extinctionCPU(hh);
    od[0] = (od[0] as number) + e[0] * dt;
    od[1] = (od[1] as number) + e[1] * dt;
    od[2] = (od[2] as number) + e[2] * dt;
  }
  return [Math.exp(-(od[0] as number)), Math.exp(-(od[1] as number)), Math.exp(-(od[2] as number))];
}

// ---------------------------------------------------------------------------------------------
// GPU side.

const rayleighScat = vec3(RAYLEIGH.x, RAYLEIGH.y, RAYLEIGH.z);
const ozoneAbs = vec3(OZONE.x, OZONE.y, OZONE.z);

const densities = Fn(([h]: [NodeLike]) => {
  const r = exp(h.negate().div(RAYLEIGH_H));
  const m = exp(h.negate().div(MIE_H));
  const o = max(0, float(1).sub(abs(h.sub(25)).div(15)));
  return vec3(r, m, o);
});

const extinctionAt = Fn(([d]: [Vec3Node]) => rayleighScat.mul(d.x).add(vec3(MIE_EXT).mul(d.y)).add(ozoneAbs.mul(d.z)));

/** Distance along a ray from inside the atmosphere to a sphere of radius `radius`; -1 when missed. */
const raySphere = Fn(([r, mu, radius]: [NodeLike, NodeLike, NodeLike]) => {
  const disc = r.mul(r).mul(mu.mul(mu).sub(1)).add(radius.mul(radius));
  const root = sqrt(max(disc, 0));
  const tFar = r.negate().mul(mu).add(root);
  const tNear = r.negate().mul(mu).sub(root);
  return select(disc.lessThan(0), float(-1), select(tNear.greaterThan(0), tNear, tFar));
});

const H_TOP = Math.sqrt(TOP * TOP - BOTTOM * BOTTOM);

/** Bruneton's transmittance parameterisation: (r, mu) → uv. */
const transmittanceUv = Fn(([r, mu]: [NodeLike, NodeLike]) => {
  const rho = sqrt(max(r.mul(r).sub(BOTTOM * BOTTOM), 0));
  const d = max(
    0,
    r
      .negate()
      .mul(mu)
      .add(
        sqrt(
          max(
            r
              .mul(r)
              .mul(mu.mul(mu).sub(1))
              .add(TOP * TOP),
            0,
          ),
        ),
      ),
  );
  const dMin = float(TOP).sub(r);
  const dMax = rho.add(H_TOP);
  const xMu = d.sub(dMin).div(max(dMax.sub(dMin), 1e-4));
  const xR = rho.div(H_TOP);
  return vec2(xMu, xR);
});

function phaseRayleigh(c: NodeLike): NodeLike {
  return float(3 / (16 * Math.PI)).mul(c.mul(c).add(1));
}

function phaseHG(c: NodeLike, g: number): NodeLike {
  const g2 = g * g;
  const denom = pow(max(float(1 + g2).sub(c.mul(2 * g)), 1e-4), 1.5);
  return float((1 - g2) / (4 * Math.PI)).div(denom);
}

function halfFloatTarget(w: number, h: number): RenderTarget {
  const rt = new RenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false });
  rt.texture.minFilter = LinearFilter;
  rt.texture.magFilter = LinearFilter;
  rt.texture.wrapS = ClampToEdgeWrapping;
  rt.texture.wrapT = ClampToEdgeWrapping;
  rt.texture.generateMipmaps = false;
  return rt;
}

export interface SkyState {
  sunDir: Vector3;
  moonDir: Vector3;
  night: number;
  coverage: number;
  time: number;
  /** Lift of the night sky so dark is still readable. */
  nightGlow: number;
}

export class Sky {
  readonly sunDirection = uniform(new Vector3(0, 0.5, -0.8));
  readonly moonDirection = uniform(new Vector3(0, 0.3, -1));
  readonly night = uniform(0);
  readonly coverage = uniform(0.35);
  readonly time = uniform(0);
  readonly sunScale = uniform(SUN_ILLUMINANCE);
  /** Haze multiplier for scene fog, by phase. */
  readonly fogDensity = uniform(1 / 1500);

  private readonly transmittanceRT = halfFloatTarget(TRANS_W, TRANS_H);
  private readonly msRT = halfFloatTarget(MS_SIZE, MS_SIZE);
  private readonly viewRT = halfFloatTarget(VIEW_W, VIEW_H);
  private readonly noise: DataTexture;
  private readonly viewQuad: QuadMesh;
  private readonly renderer: WebGPURenderer;
  private readonly envScene = new Scene();
  private readonly pmrem: PMREMGenerator;
  private envTarget: RenderTarget | null = null;
  private lastEnvTime = -Infinity;
  private lastEnvSun = new Vector3();
  /** The node the scene background and the environment both draw. */
  readonly backgroundNode: Vec3Node;
  readonly tier: Tier;

  constructor(renderer: WebGPURenderer, tier: Tier, seed: number) {
    this.renderer = renderer;
    this.tier = tier;
    this.noise = new DataTexture(noiseTexture(seed, 256), 256, 256, RGBAFormat);
    this.noise.wrapS = RepeatWrapping;
    this.noise.wrapT = RepeatWrapping;
    this.noise.minFilter = LinearMipmapLinearFilter;
    this.noise.magFilter = LinearFilter;
    this.noise.generateMipmaps = true;
    this.noise.needsUpdate = true;

    this.buildStaticTables();
    const viewMat = new NodeMaterial();
    viewMat.fragmentNode = this.skyViewNode();
    this.viewQuad = new QuadMesh(viewMat);

    this.backgroundNode = this.skyNode(positionWorldDirection);
    const envSphere = new Mesh(new SphereGeometry(50, 32, 16), new MeshBasicNodeMaterial({ side: BackSide }));
    (envSphere.material as MeshBasicNodeMaterial).colorNode = this.skyNode(positionWorldDirection, true);
    this.envScene.add(envSphere);
    this.pmrem = new PMREMGenerator(renderer);
  }

  get noiseTexture(): DataTexture {
    return this.noise;
  }

  private sampleTransmittance(r: NodeLike, mu: NodeLike): Vec3Node {
    // The planet's shadow: below the geometric horizon of this altitude the sun is hidden. At dusk
    // this is what draws the earth's shadow rising in the east.
    const muHorizon = sqrt(max(float(1).sub(float(BOTTOM * BOTTOM).div(r.mul(r))), 0)).negate();
    const visible = smoothstep(muHorizon.sub(0.004), muHorizon.add(0.004), mu);
    return texture(this.transmittanceRT.texture, transmittanceUv(r, mu)).rgb.mul(visible);
  }

  private sampleMS(r: NodeLike, mu: NodeLike): Vec3Node {
    const u = clamp(mu.mul(0.5).add(0.5), 0, 1);
    const v = clamp(r.sub(BOTTOM).div(TOP - BOTTOM), 0, 1);
    return texture(this.msRT.texture, vec2(u, v)).rgb;
  }

  private buildStaticTables(): void {
    // Transmittance table.
    const tMat = new NodeMaterial();
    tMat.fragmentNode = Fn(() => {
      const p = uv();
      const rho = p.y.mul(H_TOP);
      const r = sqrt(rho.mul(rho).add(BOTTOM * BOTTOM));
      const dMin = float(TOP).sub(r);
      const dMax = rho.add(H_TOP);
      const d = dMin.add(p.x.mul(dMax.sub(dMin)));
      const mu = clamp(
        select(
          d.lessThan(1e-4),
          float(1),
          float(H_TOP * H_TOP)
            .sub(rho.mul(rho))
            .sub(d.mul(d))
            .div(r.mul(d).mul(2)),
        ),
        -1,
        1,
      );
      const tMax = raySphere(r, mu, float(TOP));
      const od = vec3(0).toVar();
      const steps = 40;
      const dt = tMax.div(steps);
      const s = sqrt(max(float(1).sub(mu.mul(mu)), 0));
      Loop(steps, ({ i }: { i: IntNode }) => {
        const t = float(i).add(0.5).mul(dt);
        const px = s.mul(t);
        const py = r.add(mu.mul(t));
        const h = sqrt(px.mul(px).add(py.mul(py))).sub(BOTTOM);
        od.addAssign(extinctionAt(densities(h)).mul(dt));
      });
      return vec4(exp(od.negate()), 1);
    })();
    const q = new QuadMesh(tMat);
    this.renderer.setRenderTarget(this.transmittanceRT);
    q.render(this.renderer);

    // Multiple-scattering table (Hillaire 2020, section 5.5).
    const mMat = new NodeMaterial();
    mMat.fragmentNode = Fn(() => {
      const p = uv();
      const muS = p.x.mul(2).sub(1);
      const r = float(BOTTOM)
        .add(p.y.mul(TOP - BOTTOM))
        .add(0.01);
      const sun = vec3(0, muS, sqrt(max(float(1).sub(muS.mul(muS)), 0)));
      const lum = vec3(0).toVar();
      const fms = vec3(0).toVar();
      const N = 8;
      Loop(N * N, ({ i }: { i: IntNode }) => {
        const ii = int(i);
        const a = float(ii.mod(N)).add(0.5).div(N);
        const b = float(ii.div(N)).add(0.5).div(N);
        const phi = a.mul(Math.PI * 2);
        const cosT = float(1).sub(b.mul(2));
        const sinT = sqrt(max(float(1).sub(cosT.mul(cosT)), 0));
        const rd = vec3(sinT.mul(cos(phi)), cosT, sinT.mul(sin(phi)));
        const tGround = raySphere(r, cosT, float(BOTTOM));
        const tTop = raySphere(r, cosT, float(TOP));
        const hitsGround = tGround.greaterThan(0);
        const tMax = select(hitsGround, tGround, tTop);
        const steps = 20;
        const dt = tMax.div(steps);
        const thr = vec3(1).toVar();
        const L = vec3(0).toVar();
        const F = vec3(0).toVar();
        Loop(steps, ({ i: j }: { i: IntNode }) => {
          const t = float(j).add(0.5).mul(dt);
          const pos = vec3(0, r, 0).add(rd.mul(t));
          const pr = length(pos);
          const h = pr.sub(BOTTOM);
          const dens = densities(h);
          const scat = rayleighScat.mul(dens.x).add(vec3(MIE_SCAT).mul(dens.y));
          const ext = extinctionAt(dens);
          const sampleT = exp(ext.negate().mul(dt));
          const sunT = this.sampleTransmittance(pr, dot(pos.div(pr), sun));
          const S = scat.mul(sunT).mul(1 / (4 * Math.PI));
          L.addAssign(thr.mul(S.sub(S.mul(sampleT)).div(max(ext, 1e-6))));
          F.addAssign(thr.mul(scat.sub(scat.mul(sampleT)).div(max(ext, 1e-6))));
          thr.mulAssign(sampleT);
        });
        If(hitsGround, () => {
          const gp = vec3(0, r, 0).add(rd.mul(tMax));
          const n = normalize(gp);
          const sunT = this.sampleTransmittance(float(BOTTOM), dot(n, sun));
          L.addAssign(
            thr
              .mul(sunT)
              .mul(max(dot(n, sun), 0))
              .mul(GROUND_ALBEDO / Math.PI),
          );
        });
        lum.addAssign(L.div(N * N));
        fms.addAssign(F.div(N * N));
      });
      return vec4(lum.div(max(vec3(1).sub(fms), 1e-3)), 1);
    })();
    const q2 = new QuadMesh(mMat);
    this.renderer.setRenderTarget(this.msRT);
    q2.render(this.renderer);
    this.renderer.setRenderTarget(null);
  }

  /** Sky-view table: in-scattered light for every direction around the camera (192 × 108). */
  private skyViewNode(): ReturnType<typeof vec4> {
    return Fn(() => {
      const p = uv();
      const az = p.x.mul(Math.PI * 2);
      const c = p.y.mul(2).sub(1);
      const lat = c.mul(abs(c)).mul(Math.PI / 2);
      const rd = vec3(cos(lat).mul(sin(az)), sin(lat), cos(lat).mul(cos(az)));
      const r = float(BOTTOM + CAMERA_KM);
      const ro = vec3(0, r, 0);
      const sun = normalize(this.sunDirection);
      const tGround = raySphere(r, rd.y, float(BOTTOM));
      const tTop = raySphere(r, rd.y, float(TOP));
      const tMax = min(select(tGround.greaterThan(0), tGround, tTop), 400);
      const cosT = dot(rd, sun);
      const pR = phaseRayleigh(cosT);
      const pM = phaseHG(cosT, MIE_G);
      const L = vec3(0).toVar();
      const thr = vec3(1).toVar();
      const steps = 32;
      const tPrev = float(0).toVar();
      Loop(steps, ({ i }: { i: IntNode }) => {
        const f = float(i).add(1).div(steps);
        const t = tMax.mul(f.mul(f));
        // Evaluate the step before tPrev moves on: TSL expressions read variables lazily.
        const dt = t.sub(tPrev).toVar();
        const tm = tPrev.add(dt.mul(0.5)).toVar();
        tPrev.assign(t);
        const pos = ro.add(rd.mul(tm));
        const pr = length(pos);
        const h = pr.sub(BOTTOM);
        const dens = densities(h);
        const sR = rayleighScat.mul(dens.x);
        const sM = vec3(MIE_SCAT).mul(dens.y);
        const ext = extinctionAt(dens);
        const sampleT = exp(ext.negate().mul(dt));
        const up = pos.div(pr);
        const muS = dot(up, sun);
        const sunT = this.sampleTransmittance(pr, muS);
        const ms = this.sampleMS(pr, muS);
        const S = sR.mul(sunT.mul(pR).add(ms)).add(sM.mul(sunT.mul(pM).add(ms)));
        L.addAssign(thr.mul(S.sub(S.mul(sampleT)).div(max(ext, 1e-6))));
        thr.mulAssign(sampleT);
      });
      return vec4(L, 1);
    })();
  }

  /** Sky-view lookup for a world direction. */
  private skyView(dir: Vec3Node): Vec3Node {
    const u = fract(
      atan(dir.x, dir.z)
        .div(Math.PI * 2)
        .add(1),
    );
    const lat = asin(clamp(dir.y, -1, 1));
    const c = lat.div(Math.PI / 2);
    const v = sqrt(abs(c))
      .mul(select(c.lessThan(0), float(-1), float(1)))
      .mul(0.5)
      .add(0.5);
    return texture(this.viewRT.texture, vec2(u, v)).rgb;
  }

  /** Horizon-ward sky colour, the colour of distant haze in a direction (used by the scene fog). */
  hazeColor(dir: Vec3Node): Vec3Node {
    const d = normalize(vec3(dir.x, max(dir.y, 0.02).mul(0.6), dir.z));
    const base = this.skyView(d).mul(this.sunScale);
    const glow = vec3(1.0, 0.42, 0.16).mul(this.night.mul(0.03));
    return base.add(glow).add(vec3(0.004, 0.006, 0.016).mul(this.night));
  }

  private cloudLayer(dir: Vec3Node, color: Vec3Node, sun: Vec3Node, sunLight: Vec3Node): Vec3Node {
    // No branches here: texture lookups inside a non-uniform branch lose their derivatives and pick
    // the wrong mip level, which turns the cirrus blocky. Below the horizon the result fades out.
    const dy = max(dir.y, 0.012);
    const lo = float(6.5 - CAMERA_KM).div(dy);
    const hi = float(7.4 - CAMERA_KM).div(dy);
    const wind = vec2(this.time.mul(0.0011), this.time.mul(-0.0006));
    const cov = this.coverage;
    const samples = this.tier === 'high' ? 3 : 1;
    let dens: NodeLike = float(0);
    for (let i = 0; i < samples; i++) {
      const t = mix(lo, hi, (i + 0.5) / samples);
      const pxz = vec2(dir.x, dir.z).mul(t).div(52).add(wind);
      // Winter cirrus: long filaments (the streak channel) broken up by broad coverage.
      const broad = texture(this.noise, pxz.mul(0.6)).r;
      const streak = texture(this.noise, pxz.mul(vec2(0.9, 2.6)).add(vec2(0.31, 0.17))).b;
      const fine = texture(this.noise, pxz.mul(5.1)).g;
      const n = streak.mul(0.75).add(broad.mul(0.45)).add(fine.mul(0.18)).sub(0.12);
      dens = dens.add(smoothstep(float(0.95).sub(cov), float(1.25).sub(cov), n).div(samples));
    }
    const thickness = min(hi.sub(lo), 25);
    const od = dens.mul(thickness).mul(0.55);
    const alpha = float(1)
      .sub(exp(od.negate()))
      .mul(smoothstep(0.015, 0.1, dir.y));
    const cosT = dot(dir, sun);
    // Forward scattering gives the lit edge toward the sun.
    const phase = phaseHG(cosT, 0.62)
      .mul(4 * Math.PI)
      .mul(0.55)
      .add(0.5);
    const sunT = this.sampleTransmittance(float(BOTTOM + 7), sun.y);
    const ambient = this.skyView(vec3(0, 1, 0))
      .mul(this.sunScale)
      .mul(1.5);
    const lit = sunT
      .mul(sunLight)
      .mul(phase)
      .mul(0.3)
      .add(ambient)
      .add(vec3(0.015, 0.012, 0.025).mul(this.night));
    // Haze between the camera and a distant cloud.
    const far = exp(lo.negate().div(110));
    const cloud = mix(color, lit, far);
    return mix(color, cloud, alpha);
  }

  private stars(dir: Vec3Node): NodeLike {
    const p = dir.mul(220);
    const cell = floor(p);
    const h = hash(cell.x.add(cell.y.mul(157)).add(cell.z.mul(113)));
    const centre = cell.add(0.5);
    const d = length(p.sub(centre));
    const star = step(0.985, h).mul(smoothstep(0.35, 0.0, d));
    const twinkle = sin(this.time.mul(3).add(h.mul(90)))
      .mul(0.3)
      .add(0.7);
    return star.mul(twinkle).mul(smoothstep(0.02, 0.2, dir.y));
  }

  private moon(dir: Vec3Node, sun: Vec3Node): Vec3Node {
    const m = normalize(this.moonDirection);
    const r = 0.0105;
    const d = acos(clamp(dot(dir, m), -1, 1));
    const disc = smoothstep(r, r * 0.85, d);
    // Crescent: lit on the side facing the sun.
    const toSun = normalize(sun.sub(m.mul(dot(sun, m))));
    const local = dir.sub(m.mul(dot(dir, m)));
    const side = dot(local, toSun).div(r);
    const lit = smoothstep(0.35, 0.75, side);
    return vec3(1.0, 0.95, 0.85).mul(disc.mul(lit.mul(0.95).add(0.05)).mul(3.5));
  }

  /** Final sky radiance in a world direction. */
  skyNode(dirIn: Vec3Node, forEnvironment = false): Vec3Node {
    return Fn(() => {
      const dir = normalize(dirIn);
      const sun = normalize(this.sunDirection);
      const r = float(BOTTOM + CAMERA_KM);
      const sunLight = vec3(this.sunScale);
      const dirAbove = normalize(vec3(dir.x, max(dir.y, -0.03), dir.z));
      const sky = this.skyView(dirAbove).mul(this.sunScale).toVar();
      // Night: a faint indigo base and the city's sodium glow along the horizon.
      const horizon = exp(max(dir.y, 0).mul(-14));
      sky.addAssign(vec3(0.0035, 0.0055, 0.016).mul(this.night));
      sky.addAssign(vec3(1.0, 0.42, 0.16).mul(horizon.mul(this.night).mul(0.045)));
      if (!forEnvironment) {
        // Sun disc with limb darkening, dimmed by the air in front of it.
        const cosA = dot(dir, sun);
        const sunR = 0.0093;
        const ang = acos(clamp(cosA, -1, 1));
        const disc = smoothstep(sunR, sunR * 0.8, ang);
        const limb = sqrt(max(float(1).sub(ang.div(sunR).mul(ang.div(sunR))), 0))
          .mul(0.6)
          .add(0.4);
        const sunT = this.sampleTransmittance(r, sun.y);
        sky.addAssign(sunT.mul(disc).mul(limb).mul(this.sunScale).mul(260));
        sky.addAssign(vec3(0.9, 0.92, 1.0).mul(this.stars(dir).mul(this.night).mul(0.25)));
        sky.addAssign(
          this.moon(dir, sun)
            .mul(this.night.mul(0.8).add(0.2))
            .mul(smoothstep(-0.02, 0.02, dir.y)),
        );
      }
      const withClouds = this.cloudLayer(dir, sky, sun, sunLight);
      // Below the horizon the city hides the sky; give it the ground's dull colour for the environment.
      const ground = vec3(0.05, 0.045, 0.04)
        .mul(this.sunScale)
        .mul(max(sun.y, 0).mul(0.6).add(0.01))
        .add(vec3(0.01, 0.006, 0.004).mul(this.night));
      return mix(withClouds, ground, smoothstep(-0.0, -0.08, dir.y));
    })();
  }

  /** Per frame: rebuild the sky-view table; every few seconds, refresh the environment map. */
  update(state: SkyState, scene: Scene, force = false): void {
    this.sunDirection.value.copy(state.sunDir);
    this.moonDirection.value.copy(state.moonDir);
    this.night.value = state.night;
    this.coverage.value = state.coverage;
    this.time.value = state.time;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.viewRT);
    this.viewQuad.render(r);
    r.setRenderTarget(prev);
    const moved = this.lastEnvSun.angleTo(state.sunDir) > 0.01;
    if (force || (state.time - this.lastEnvTime > 2.5 && moved) || this.envTarget === null) {
      this.lastEnvTime = state.time;
      this.lastEnvSun.copy(state.sunDir);
      const target = this.pmrem.fromScene(this.envScene, 0, 0.1, 100, {
        size: 128,
        ...(this.envTarget ? { renderTarget: this.envTarget } : {}),
      });
      this.envTarget = target;
      if (scene.environment !== target.texture) scene.environment = target.texture;
    }
  }
}

/** Sun colour and intensity for the directional light at a sun direction. */
export function sunlight(sunDir: Vector3, out: Color): number {
  const t = transmittanceCPU(CAMERA_KM, sunDir.y);
  out.setRGB(t[0], t[1], t[2]);
  const m = Math.max(out.r, out.g, out.b, 1e-4);
  out.multiplyScalar(1 / m);
  const horizon = Math.min(1, Math.max(0, (sunDir.y + 0.01) / 0.05));
  return m * SUN_ILLUMINANCE * 0.42 * horizon;
}
