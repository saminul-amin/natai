// Kites (DESIGN.md 5.5). The paper is translucent: when the sun is behind a kite, light shines through
// it and the print glows from the back, the single most beautiful thing in the game. The paper
// flutters in a vertex shader driven by wind and line tension: a tight line snaps it flat, a slack
// line lets the edges ripple.
import {
  BackSide,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  RepeatWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Node,
  type Texture,
} from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  floor,
  vec2,
  cameraPosition,
  dot,
  faceDirection,
  float,
  max,
  mix,
  normalLocal,
  normalWorld,
  normalize,
  positionGeometry,
  positionLocal,
  positionWorld,
  pow,
  sin,
  texture,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { kiteFrame, newFrame, type KiteState } from '../sim/kite';
import { shared } from './uniforms';
import type { V3 } from '../sim/wind';
import { geometryFor, tailLength } from '../procedural/kites';
import { PALETTE, PRINT_COUNT, printTexture } from '../procedural/prints';
import type { KiteStats } from '../types';

/** Light shared by every translucent material: the sun's direction and its colour times intensity. */
export const sunUniforms = { direction: shared.sunDirection, color: shared.sunColor };

let printCache: Texture[] | null = null;

export function printTextures(): Texture[] {
  if (printCache) return printCache;
  printCache = [];
  for (let i = 0; i < PRINT_COUNT; i++) {
    const t = new DataTexture(printTexture(i, 256), 256, 256, RGBAFormat);
    t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.flipY = false;
    t.needsUpdate = true;
    printCache.push(t);
  }
  return printCache;
}

const geometryCache = new Map<string, BufferGeometry>();

function geometry(stats: KiteStats): BufferGeometry {
  let g = geometryCache.get(stats.shape);
  if (!g) {
    g = geometryFor(stats);
    geometryCache.set(stats.shape, g);
  }
  return g;
}

export function kiteMaterial(
  print: Texture,
  slack: Node<'float'>,
  wind: Node<'float'>,
  time: Node<'float'>,
): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.82, metalness: 0 });
  const tex = texture(print, uv());
  const frame = tex.a;
  const paper = tex.rgb;
  // The bamboo frame is darker and does not transmit light.
  mat.colorNode = mix(paper.mul(0.3).add(vec3(0.12, 0.08, 0.04)), paper, frame);
  const flex = attribute('flex', 'float');
  mat.positionNode = Fn(() => {
    const amp = slack.mul(0.07).add(wind.mul(0.004)).mul(flex);
    const p = positionLocal;
    const wave = sin(time.mul(wind.mul(1.6).add(6)).add(p.x.mul(5)).add(p.y.mul(3.3))).add(
      sin(time.mul(13.1).add(p.y.mul(9)).add(p.x.mul(2))).mul(0.35),
    );
    return p.add(normalLocal.mul(amp.mul(wave)));
  })();
  mat.emissiveNode = Fn(() => {
    const L = normalize(sunUniforms.direction);
    const V = normalize(cameraPosition.sub(positionWorld));
    const N = normalize(normalWorld).mul(faceDirection);
    // Light arrives on the far side of the paper when the sun and the viewer are on opposite sides.
    const through = max(dot(N, L).negate(), 0);
    const forward = pow(max(dot(V.negate(), L), 0), 8);
    const glow = through.mul(float(0.16).add(forward.mul(0.9)));
    // Dye looks deeper and richer in transmitted light.
    const dyed = pow(paper, vec3(1.35));
    return dyed.mul(sunUniforms.color).mul(glow).mul(frame);
  })();
  return mat;
}

const frame = newFrame();
const basis = new Matrix4();
const xAxis = new Vector3();
const yAxis = new Vector3();
const zAxis = new Vector3();
const tmp = new Vector3();

export class KiteView {
  readonly mesh: Mesh;
  readonly slack = uniform(0);
  readonly windSpeed = uniform(6);
  readonly time = uniform(0);
  readonly stats: KiteStats;
  /** Visual-only streamer tail: a short rope chain trailing from the bottom tip. */
  readonly tail: Float32Array | null;
  private readonly tailPrev: Float32Array | null;
  readonly tailN = 9;
  private tumble = 0;
  /** Interpolated world position this frame. */
  readonly position = new Vector3();

  constructor(stats: KiteStats) {
    this.stats = stats;
    const prints = printTextures();
    const mat = kiteMaterial(prints[stats.print % prints.length] as Texture, this.slack, this.windSpeed, this.time);
    this.mesh = new Mesh(geometry(stats), mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.matrixAutoUpdate = false;
    const len = tailLength(stats);
    this.tail = len > 0 ? new Float32Array(this.tailN * 3) : null;
    this.tailPrev = len > 0 ? new Float32Array(this.tailN * 3) : null;
    this.tailLen = len;
  }

  private readonly tailLen: number;

  /** Places the kite from simulation state, interpolated by `alpha` between the last two ticks. */
  update(k: KiteState, anchor: V3, alpha: number, time: number, dt: number, windSpeed: number, windDir: V3): void {
    const px = k.last.x + (k.pos.x - k.last.x) * alpha;
    const py = k.last.y + (k.pos.y - k.last.y) * alpha;
    const pz = k.last.z + (k.pos.z - k.last.z) * alpha;
    let dn = k.nose - k.lastNose;
    if (dn > Math.PI) dn -= Math.PI * 2;
    if (dn < -Math.PI) dn += Math.PI * 2;
    const nose = k.lastNose + dn * alpha;
    this.position.set(px, py, pz);
    kiteFrame({ x: px, y: py, z: pz }, anchor, nose, frame);
    yAxis.set(frame.nose.x, frame.nose.y, frame.nose.z);
    zAxis.set(-frame.radial.x, -frame.radial.y, -frame.radial.z);
    xAxis.crossVectors(yAxis, zAxis).normalize();
    if (k.free) {
      // Tumbling: the cut kite rolls and pitches as it falls.
      this.tumble += dt * 4.2;
      tmp.copy(zAxis).applyAxisAngle(yAxis, Math.sin(this.tumble) * 1.2);
      zAxis.copy(tmp);
      xAxis.crossVectors(yAxis, zAxis).normalize();
    }
    basis.makeBasis(xAxis, yAxis, zAxis);
    basis.setPosition(px, py, pz);
    this.mesh.matrix.copy(basis);
    this.mesh.matrixWorldNeedsUpdate = true;
    this.slack.value = 1 - Math.min(1, k.tension);
    this.windSpeed.value = windSpeed;
    this.time.value = time;
    this.updateTail(dt, windDir);
  }

  private updateTail(dt: number, windDir: V3): void {
    const tail = this.tail;
    const prev = this.tailPrev;
    if (!tail || !prev) return;
    // Attach at the bottom tip in world space.
    tmp.set(0, -0.6, 0).applyMatrix4(this.mesh.matrix);
    const n = this.tailN;
    const seg = this.tailLen / (n - 1);
    if (tail[0] === 0 && tail[1] === 0) {
      for (let i = 0; i < n; i++) {
        tail[i * 3] = tmp.x;
        tail[i * 3 + 1] = tmp.y - i * seg;
        tail[i * 3 + 2] = tmp.z;
      }
      prev.set(tail);
    }
    const h = Math.min(dt, 1 / 30);
    for (let i = 1; i < n; i++) {
      const k = i * 3;
      const vx = (tail[k] as number) - (prev[k] as number);
      const vy = (tail[k + 1] as number) - (prev[k + 1] as number);
      const vz = (tail[k + 2] as number) - (prev[k + 2] as number);
      prev[k] = tail[k] as number;
      prev[k + 1] = tail[k + 1] as number;
      prev[k + 2] = tail[k + 2] as number;
      const flap = Math.sin(this.time.value * 9 + i) * 3;
      tail[k] = (tail[k] as number) + vx * 0.96 + (windDir.x * 8 + flap * xAxis.x) * h * h;
      tail[k + 1] = (tail[k + 1] as number) + vy * 0.96 + (-6 + windDir.y * 8) * h * h;
      tail[k + 2] = (tail[k + 2] as number) + vz * 0.96 + (windDir.z * 8 + flap * xAxis.z) * h * h;
    }
    tail[0] = tmp.x;
    tail[1] = tmp.y;
    tail[2] = tmp.z;
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < n - 1; i++) {
        const a = i * 3;
        const b = a + 3;
        const dx = (tail[b] as number) - (tail[a] as number);
        const dy = (tail[b + 1] as number) - (tail[a + 1] as number);
        const dz = (tail[b + 2] as number) - (tail[a + 2] as number);
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const c = (d - seg) / d;
        const wa = i === 0 ? 0 : 0.5;
        const wb = i === 0 ? 1 : 0.5;
        tail[a] = (tail[a] as number) + dx * c * wa;
        tail[a + 1] = (tail[a + 1] as number) + dy * c * wa;
        tail[a + 2] = (tail[a + 2] as number) + dz * c * wa;
        tail[b] = (tail[b] as number) - dx * c * wb;
        tail[b + 1] = (tail[b + 1] as number) - dy * c * wb;
        tail[b + 2] = (tail[b + 2] as number) - dz * c * wb;
      }
    }
  }

  dispose(): void {
    (this.mesh.material as MeshStandardNodeMaterial).dispose();
  }
}

// ------------------------------------------------------------------------------------------------
// The sky full of other people's kites (DESIGN.md 5.5): hundreds of instanced kites with the same
// translucent paper and flutter, each wandering on its own string to a rooftop, and beyond them a
// far-sky shell of tiny kites that costs one draw call.

/** The eight prints side by side in a 4 × 2 atlas, without frames, for the distant kites. */
function printAtlas(): DataTexture {
  const s = 128;
  const data = new Uint8Array(s * 4 * s * 2 * 4);
  for (let i = 0; i < PRINT_COUNT; i++) {
    const p = printTexture(i, s, false);
    const ox = (i % 4) * s;
    const oy = Math.floor(i / 4) * s;
    for (let y = 0; y < s; y++) data.set(p.subarray(y * s * 4, (y + 1) * s * 4), ((oy + y) * s * 4 + ox) * 4);
  }
  const t = new DataTexture(data, s * 4, s * 2, RGBAFormat);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** A long band of tiny kites far away, as RGBA8: transparent everywhere else. */
function shellTexture(seed: number, w: number, h: number): DataTexture {
  const data = new Uint8Array(w * h * 4);
  const colors = [
    PALETTE.magenta,
    PALETTE.saffron,
    PALETTE.teal,
    PALETTE.leaf,
    PALETTE.red,
    PALETTE.white,
    PALETTE.gold,
    PALETTE.indigo,
  ];
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
  for (let k = 0; k < 2600; k++) {
    // Denser low over the city, thinning toward the top of the band.
    const cx = rnd() * w;
    const cy = Math.pow(rnd(), 1.6) * h;
    const r = 1.2 + rnd() * 1.6;
    const c = colors[Math.floor(rnd() * colors.length)] ?? PALETTE.white;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (y < 0 || y >= h) continue;
        const xx = ((x % w) + w) % w;
        if (Math.abs(x - cx) + Math.abs(y - cy) > r) continue;
        const i = (y * w + xx) * 4;
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        data[i + 3] = 255;
      }
  }
  const t = new DataTexture(data, w, h, RGBAFormat);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

interface SkyFlyer {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  fa: number;
  fb: number;
  pa: number;
  pb: number;
  amp: number;
}

export interface SegmentSink {
  addSegment(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    width: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
  ): void;
}

export class DistantKites {
  readonly mesh: InstancedMesh;
  readonly shell: Mesh;
  private readonly flyers: SkyFlyer[] = [];
  /** 1 by day; falls to 0 as kites come down at nightfall (except in Free sky). */
  presence = 1;
  readonly shellPresence = uniform(1);
  private readonly matrix = new Matrix4();

  constructor(roofs: readonly { x: number; y: number; z: number }[], count: number, seed: number) {
    let s = seed >>> 0 || 7;
    const rnd = () => {
      s = (Math.imul(s ^ (s >>> 13), 0x5bd1e995) + 0x6d2b79f5) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < count && roofs.length > 0; i++) {
      const r = roofs[i % roofs.length] as { x: number; y: number; z: number };
      const dist = 35 + rnd() * 120;
      const h = 22 + rnd() * 95;
      this.flyers.push({
        ax: r.x,
        ay: r.y,
        az: r.z,
        bx: r.x + (rnd() - 0.5) * 50,
        by: r.y + h,
        bz: r.z - dist,
        fa: 0.08 + rnd() * 0.25,
        fb: 0.1 + rnd() * 0.3,
        pa: rnd() * 6.28,
        pb: rnd() * 6.28,
        amp: 4 + rnd() * 12,
      });
    }
    const n = this.flyers.length;
    const geo = new PlaneGeometry(1.5, 1.5).rotateZ(Math.PI / 4);
    const prints = new Float32Array(n);
    for (let i = 0; i < n; i++) prints[i] = Math.floor(rnd() * 5);
    geo.setAttribute('printIndex', new InstancedBufferAttribute(prints, 1));
    const atlas = printAtlas();
    const mat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.85 });
    const idx = attribute('printIndex', 'float');
    const cellUv = uv()
      .add(vec2(idx.mod(4), floor(idx.div(4))))
      .div(vec2(4, 2));
    const tex = texture(atlas, cellUv);
    mat.colorNode = tex.rgb;
    mat.emissiveNode = Fn(() => {
      const L = normalize(sunUniforms.direction);
      const V = normalize(cameraPosition.sub(positionWorld));
      const N = normalize(normalWorld).mul(faceDirection);
      const through = max(dot(N, L).negate(), 0);
      const forward = pow(max(dot(V.negate(), L), 0), 8);
      return pow(tex.rgb, vec3(1.35))
        .mul(sunUniforms.color)
        .mul(through.mul(float(0.16).add(forward.mul(0.9))));
    })();
    // Instancing has already placed the vertex (positionLocal); the flutter weight comes from the
    // untransformed geometry so it stays small.
    mat.positionNode = Fn(() => {
      const g = positionGeometry;
      const wave = sin(shared.time.mul(9).add(g.x.mul(4)).add(idx.mul(1.7)));
      return positionLocal.add(vec3(0, wave.mul(0.05).mul(abs(g.x).add(abs(g.y))), 0));
    })();
    this.mesh = new InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;

    // Far-sky shell: a cylinder band from about 2° to 16° above the horizon, 1.6 km out.
    const band = new CylinderGeometry(1600, 1600, 420, 64, 1, true);
    band.translate(0, 270, 0);
    const shellMat = new MeshBasicNodeMaterial({ side: BackSide, transparent: true, depthWrite: false });
    const shellTex = shellTexture(seed, 4096, 256);
    const jitter = vec2(sin(shared.time.mul(0.7).add(uv().x.mul(400))).mul(0.0004), 0);
    const shellSample = texture(shellTex, uv().add(jitter));
    // Lit by the sky: dim against the light, brighter where the sun shines through.
    shellMat.colorNode = shellSample.rgb.mul(sunUniforms.color.mul(0.1).add(vec3(0.05)));
    shellMat.opacityNode = shellSample.a.mul(0.75).mul(this.shellPresence);
    this.shell = new Mesh(band, shellMat);
    this.shell.renderOrder = -1;
    this.shell.frustumCulled = false;
  }

  /** Moves every kite along its wander, and draws its string into the line batch. */
  update(time: number, eye: Vector3, lines: SegmentSink): void {
    const p = this.presence;
    this.shellPresence.value = p;
    const m = this.matrix;
    this.flyers.forEach((f, i) => {
      const wx = Math.sin(time * f.fa + f.pa) * f.amp;
      const wy = Math.sin(time * f.fb + f.pb) * f.amp * 0.5;
      // At nightfall the kites come down toward their roofs.
      const x = f.ax + (f.bx + wx - f.ax) * p;
      const y = f.ay + (f.by + wy - f.ay) * p;
      const z = f.az + (f.bz - f.az) * p;
      const roll = Math.cos(time * f.fa + f.pa) * 0.6;
      // Billboards: mostly facing the viewer so they read as kites, turned a little toward their flyer.
      tmp.set(eye.x - x, eye.y - y, eye.z - z).normalize();
      zAxis
        .set(f.ax - x, f.ay - y, f.az - z)
        .normalize()
        .lerp(tmp, 0.75)
        .normalize();
      yAxis.set(Math.sin(roll), Math.cos(roll), 0);
      xAxis.crossVectors(yAxis, zAxis).normalize();
      yAxis.crossVectors(zAxis, xAxis);
      const scale = p < 0.02 ? 0 : 1;
      m.makeBasis(xAxis.multiplyScalar(scale), yAxis.multiplyScalar(scale), zAxis.multiplyScalar(scale));
      m.setPosition(x, y, z);
      this.mesh.setMatrixAt(i, m);
      if (scale > 0 && Math.abs(x - eye.x) + Math.abs(z - eye.z) < 700)
        lines.addSegment(x, y, z, f.ax, f.ay, f.az, 1, 0.5, 0.42, 0.4, 0.22);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
