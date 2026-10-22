// The night spectacle (DESIGN.md 5.9): fireworks from every roof, fanush drifting up in clusters,
// fire-breathers, and string lights along the parapets.
//
// Fireworks are GPU particles whose state is a closed-form function of the burst parameters and time,
// evaluated in the vertex shader: no per-particle state, no compute pass. It behaves identically on
// the WebGPU and WebGL 2 paths, which is what M0's particle check had to settle (DESIGN.md 12).
import type { Vector3 } from 'three/webgpu';
import {
  AdditiveBlending,
  DoubleSide,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  OctahedronGeometry,
  PointLight,
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  type Node,
} from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  cos,
  cross,
  exp,
  float,
  fract,
  hash,
  instanceIndex,
  int,
  length,
  max,
  mix,
  normalize,
  positionGeometry,
  pow,
  sin,
  smoothstep,
  sqrt,
  step,
  uniform,
  textureLoad,
  ivec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { CityLayout } from '../procedural/city';
import { fanushGeometry } from '../procedural/props';
import { Rng } from '../sim/rng';
import type { Tier } from '../types';
import { shared } from './uniforms';

const SLOTS = 48;
/** Stars thrown by one shell. */
const STARS = 700;

const dummy = new Object3D();

/**
 * A small float texture of per-slot parameters, one RGBA texel per slot and row. Parameters that change
 * at run time live here rather than in uniform arrays, whose buffers r186 uploads only once.
 */
function paramTexture(width: number, rows: number): DataTexture {
  const t = new DataTexture(new Float32Array(width * rows * 4), width, rows, RGBAFormat, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

function setTexel(t: DataTexture, x: number, row: number, a: number, b: number, c: number, d: number): void {
  const data = t.image.data as Float32Array;
  data.set([a, b, c, d], (row * t.image.width + x) * 4);
  t.needsUpdate = true;
}

const BURST_COLORS: [number, number, number][] = [
  [1.0, 0.25, 0.45],
  [1.0, 0.7, 0.2],
  [0.3, 0.9, 1.0],
  [0.5, 1.0, 0.4],
  [1.0, 0.95, 0.8],
  [0.85, 0.4, 1.0],
  [1.0, 0.45, 0.1],
];

export interface Burst {
  x: number;
  y: number;
  z: number;
  color: Color;
  age: number;
}

class Fireworks {
  readonly mesh: Mesh;
  /**
   * Per shell, three rows: the apex xyz and the time it bursts; the colour and style (0 peony,
   * 1 willow, 2 ring, 3 crackle); the launch height, burst speed, spark size and lifetime.
   */
  private readonly slots = paramTexture(SLOTS, 3);
  private readonly now = uniform(0);
  private next = 0;
  readonly perSlot: number;

  constructor(total: number) {
    this.perSlot = Math.floor(total / SLOTS);
    for (let i = 0; i < SLOTS; i++) {
      setTexel(this.slots, i, 0, 0, -1000, 0, -1000);
      setTexel(this.slots, i, 2, 100, 20, 0.3, 2.6);
    }
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    g.instanceCount = this.perSlot * SLOTS;
    const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    mat.blending = AdditiveBlending;
    const per = this.perSlot;
    const slot = int(instanceIndex).div(per);
    const k = float(int(instanceIndex).mod(per));
    const o = textureLoad(this.slots, ivec2(slot, 0));
    const st = textureLoad(this.slots, ivec2(slot, 1));
    const pr = textureLoad(this.slots, ivec2(slot, 2));
    // Seconds since the burst; negative while the rocket is still climbing.
    const tau = this.now.sub(o.w);
    const rise = float(1.4);
    const life = pr.w;
    const isRocket = step(k, 24);
    const h1 = hash(k.add(float(slot).mul(7919)));
    const h2 = hash(k.mul(1.37).add(float(slot).mul(104729)).add(11.3));
    const h3 = hash(k.mul(2.11).add(float(slot).mul(1299709)).add(5.7));

    const position = (t: Node<'float'>) =>
      Fn(() => {
        // Direction: a uniform sphere, flattened to a ring for style 2.
        const z = h1.mul(2).sub(1);
        const phi = h2.mul(Math.PI * 2);
        const r = sqrt(max(float(1).sub(z.mul(z)), 0));
        const sphere = vec3(r.mul(cos(phi)), z, r.mul(sin(phi)));
        const ring = vec3(cos(phi), sin(phi).mul(0.25), sin(phi));
        const dir = mix(sphere, ring, step(1.5, st.w).mul(step(st.w, 2.5)));
        const speed = pr.y.mul(h3.mul(0.25).add(0.85));
        const drag = mix(float(1.3), float(2.4), step(0.5, st.w).mul(step(st.w, 1.5)));
        const tt = max(t, 0);
        const spread = dir
          .mul(speed)
          .mul(float(1).sub(exp(tt.mul(drag).negate())))
          .div(drag);
        const gravity = mix(float(2.2), float(5.0), step(0.5, st.w).mul(step(st.w, 1.5)));
        const fall = vec3(0, tt.mul(tt).mul(gravity).mul(-0.5), 0);
        const burst = o.xyz.add(spread).add(fall);
        // The rocket: climbs from the roof to the apex before the burst, wobbling a little.
        const climb = smoothstep(rise.negate(), 0, t);
        const base = o.xyz.sub(vec3(0, pr.x, 0));
        const trailBack = h1.mul(0.25);
        const rocket = mix(base, o.xyz, smoothstep(rise.negate(), 0, t.sub(trailBack))).add(
          vec3(sin(t.mul(9).add(h2)).mul(0.6), 0, 0).mul(climb),
        );
        return mix(burst, rocket, isRocket.mul(step(t, 0)));
      })();

    const pNow = position(tau);
    const pPrev = position(tau.sub(0.07));
    // A shell throws a few hundred stars; the rest of the slot's budget stays unused and collapsed.
    const stars = float(STARS);
    const alive = step(k, stars).mul(step(rise.negate(), tau)).mul(step(tau, life));
    mat.positionNode = Fn(() => {
      const along = positionGeometry.y;
      const side = positionGeometry.x;
      const p = mix(pPrev, pNow, along);
      const vel = pNow.sub(pPrev).add(vec3(0, 1e-4, 0));
      const toCam = cameraPosition.sub(p);
      const view = normalize(toCam);
      const right = normalize(cross(vel, view));
      // At least a couple of pixels wide at any distance, so far bursts still read as sparks.
      const width = max(pr.z, length(toCam).mul(0.0022));
      // Dead or unused sparks collapse to a point far below the city: no raster cost.
      return mix(vec3(0, -1e5, 0), p.add(right.mul(side).mul(width)), alive);
    })();
    mat.colorNode = Fn(() => {
      const visibleBurst = step(0, tau).mul(step(tau, life));
      const visibleRocket = isRocket.mul(step(rise.negate(), tau)).mul(step(tau, 0));
      const fade = pow(max(float(1).sub(tau.div(life)), 0), 1.6);
      // Crackle: particles flicker on and off near the end.
      const crackle = mix(
        float(1),
        step(0.5, fract(tau.mul(14).add(h1.mul(9)))),
        step(2.5, st.w).mul(smoothstep(0.4, 0.7, tau.div(life))),
      );
      const flash = exp(tau.mul(-7)).mul(2).add(1);
      const burst = st.rgb.mul(fade).mul(crackle).mul(flash).mul(visibleBurst).mul(3.2);
      const rocket = vec3(1.0, 0.75, 0.4).mul(visibleRocket).mul(4);
      const hide = float(1).sub(shared.fireOff);
      return vec4(burst.add(rocket).mul(hide), 1);
    })();
    this.mesh = new Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
  }

  launch(time: number, x: number, y: number, z: number, height: number, rng: Rng): Burst {
    const i = this.next;
    this.next = (this.next + 1) % SLOTS;
    const c = rng.pick(BURST_COLORS);
    const styleId = rng.int(4);
    const apexY = y + height;
    setTexel(this.slots, i, 0, x, apexY, z, time + 1.4);
    setTexel(this.slots, i, 1, c[0], c[1], c[2], styleId);
    setTexel(this.slots, i, 2, height, 16 + rng.next() * 14, 0.22 + rng.next() * 0.2, styleId === 1 ? 3.6 : 2.4);
    return { x, y: apexY, z, color: new Color(c[0], c[1], c[2]), age: -1.4 };
  }

  set time(t: number) {
    this.now.value = t;
  }
}

interface Lantern {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vy: number;
  phase: number;
}

class Fanush {
  readonly mesh: InstancedMesh;
  private readonly lanterns: Lantern[] = [];

  constructor(count: number) {
    const mat = new MeshStandardNodeMaterial({ roughness: 0.9, transparent: false });
    mat.colorNode = vec3(0.9, 0.75, 0.55);
    mat.emissiveNode = Fn(() => {
      const flicker = sin(shared.time.mul(13).add(hash(instanceIndex).mul(40)))
        .mul(0.15)
        .add(0.85);
      // Brighter toward the open bottom where the flame burns.
      const bottom = float(1)
        .sub(smoothstep(0.0, 1.1, positionGeometry.y))
        .mul(0.6)
        .add(0.4);
      return vec3(1.0, 0.5, 0.16).mul(flicker).mul(bottom).mul(7).mul(shared.lights);
    })();
    this.mesh = new InstancedMesh(fanushGeometry(), mat, count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) this.lanterns.push({ active: false, x: 0, y: 0, z: 0, vy: 0, phase: i * 1.7 });
    this.flush();
  }

  /** Releases a cluster from a roof. */
  release(x: number, y: number, z: number, n: number, rng: Rng): void {
    for (const l of this.lanterns) {
      if (n <= 0) break;
      if (l.active) continue;
      l.active = true;
      l.x = x + rng.signed() * 3;
      l.y = y + 1 + rng.next() * 2;
      l.z = z + rng.signed() * 3;
      l.vy = 0.9 + rng.next() * 0.7;
      n--;
    }
  }

  /** Fills the sky with lanterns already drifting up, as if released over the last minutes. */
  seed(roofs: readonly { x: number; y: number; z: number }[], n: number, rng: Rng): void {
    for (const l of this.lanterns) {
      if (n <= 0 || roofs.length === 0) break;
      if (l.active) continue;
      const r = rng.pick(roofs);
      l.active = true;
      l.x = r.x + rng.signed() * 30;
      l.y = r.y + 20 + rng.next() * 260;
      l.z = r.z + rng.signed() * 30;
      l.vy = 0.9 + rng.next() * 0.7;
      n--;
    }
  }

  update(dt: number, wind: Vector3, time: number): void {
    for (const l of this.lanterns) {
      if (!l.active) continue;
      l.y += l.vy * dt;
      l.x += (wind.x * 0.35 + Math.sin(time * 0.5 + l.phase) * 0.3) * dt;
      l.z += (wind.z * 0.35 + Math.cos(time * 0.4 + l.phase) * 0.3) * dt;
      if (l.y > 450) l.active = false;
    }
    this.flush();
  }

  private flush(): void {
    this.lanterns.forEach((l, i) => {
      dummy.position.set(l.x, l.y, l.z);
      dummy.rotation.set(Math.sin(l.phase) * 0.1, l.phase, 0);
      dummy.scale.setScalar(l.active ? 1.6 : 0);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Fire-breathers: a cone of flame particles and a flickering light on a few roofs. */
class FireBreathers {
  readonly group = new Group();
  private readonly flames: Mesh;
  private readonly lights: PointLight[] = [];
  private readonly spots: { x: number; y: number; z: number; next: number; until: number }[];
  /** Per breather: mouth position xyz and flame power w. */
  private readonly state = paramTexture(4, 1);
  private readonly power = [0, 0, 0, 0];
  private readonly now = uniform(0);

  onBreath: ((x: number, y: number, z: number) => void) | null = null;

  constructor(spots: readonly { x: number; y: number; z: number }[], lightCount: number) {
    this.spots = spots.slice(0, 4).map((s, i) => ({ ...s, next: 3 + i * 1.7, until: 0 }));
    this.spots.forEach((s, i) => setTexel(this.state, i, 0, s.x, s.y + 1.75, s.z - 0.3, 0));
    const per = 90;
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    g.instanceCount = per * Math.max(1, this.spots.length);
    const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    mat.blending = AdditiveBlending;
    const who = int(instanceIndex).div(per);
    const k = float(int(instanceIndex).mod(per));
    const life = float(0.9);
    const t = fract(this.now.div(life).add(hash(k).mul(1.0)));
    const flame = textureLoad(this.state, ivec2(who, 0));
    const origin = flame.xyz;
    const power = flame.w;
    mat.positionNode = Fn(() => {
      // A cone thrown forward and up, widening and rising as it burns.
      const ang = hash(k.mul(3.1)).mul(6.28);
      const spread = t.mul(1.6).mul(hash(k.mul(7.7)).add(0.3));
      const fwd = vec3(cos(ang).mul(spread), t.mul(t).mul(2.5).add(sin(ang).mul(spread).mul(0.6)), t.mul(-6));
      const p = origin.add(fwd);
      const view = normalize(cameraPosition.sub(p));
      const right = normalize(cross(vec3(0, 1, 0), view));
      const up = cross(view, right);
      const size = t.mul(1.1).add(0.15);
      return p.add(right.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size)));
    })();
    mat.colorNode = Fn(() => {
      const heat = float(1).sub(t);
      const c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.85, 0.45), heat.mul(heat));
      const r = max(float(1).sub(positionGeometry.xy.length()), 0);
      return vec4(c.mul(r.mul(r)).mul(heat).mul(power).mul(6).mul(float(1).sub(shared.fireOff)), 1);
    })();
    this.flames = new Mesh(g, mat);
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 9;
    this.group.add(this.flames);
    for (let i = 0; i < Math.min(lightCount, this.spots.length); i++) {
      const l = new PointLight(0xff8a3a, 0, 60, 1.6);
      const s = this.spots[i] as { x: number; y: number; z: number };
      l.position.set(s.x, s.y + 2.5, s.z - 1.5);
      this.lights.push(l);
      this.group.add(l);
    }
  }

  update(time: number, active: boolean, rng: Rng): void {
    this.now.value = time;
    this.spots.forEach((s, i) => {
      if (active && time > s.next) {
        s.until = time + 1.0 + rng.next() * 0.8;
        s.next = s.until + 2 + rng.next() * 4;
      }
      const on = active && time < s.until ? 1 : 0;
      const before = this.power[i] as number;
      const p = before + (on - before) * 0.25;
      this.power[i] = p;
      if (Math.abs(p - before) > 1e-3 || (p > 0 && p < 1e-3)) setTexel(this.state, i, 0, s.x, s.y + 1.75, s.z - 0.3, p);
      if (on && before < 0.05) this.onBreath?.(s.x, s.y, s.z);
      const light = this.lights[i];
      if (light) light.intensity = p * (900 + 400 * Math.sin(time * 37 + i));
    });
  }
}

/** Fairy lights along the parapets: a chase of colours that comes on through dusk. */
function stringLights(layout: CityLayout, max: number, spacing: number): InstancedMesh {
  const bulbs: { x: number; y: number; z: number }[] = [];
  for (const r of layout.lightRuns) {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
    const n = Math.max(2, Math.floor(len / spacing));
    for (let i = 0; i < n && bulbs.length < max; i++) {
      const t = i / (n - 1);
      // A gentle droop between fixings every few metres.
      const droop = Math.sin(((t * len) / 3) * Math.PI) * 0.12;
      bulbs.push({ x: r.ax + (r.bx - r.ax) * t, y: r.ay - Math.abs(droop), z: r.az + (r.bz - r.az) * t });
    }
  }
  const mat = new MeshBasicNodeMaterial();
  const idx = float(instanceIndex);
  mat.colorNode = Fn(() => {
    const k = idx.mod(4);
    const palette = mix(
      mix(vec3(1.0, 0.2, 0.35), vec3(1.0, 0.75, 0.2), step(0.5, k)),
      mix(vec3(0.2, 0.9, 0.5), vec3(0.3, 0.6, 1.0), step(2.5, k)),
      step(1.5, k),
    );
    const chase = sin(idx.mul(0.9).sub(shared.time.mul(5)))
      .mul(0.4)
      .add(0.8);
    return palette.mul(chase).mul(shared.lights).mul(14);
  })();
  const mesh = new InstancedMesh(new OctahedronGeometry(0.075, 0), mat, Math.max(1, bulbs.length));
  bulbs.forEach((b, i) => {
    dummy.position.set(b.x, b.y, b.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.computeBoundingSphere();
  return mesh;
}

export class NightView {
  readonly group = new Group();
  private readonly fireworks: Fireworks;
  private readonly fanush: Fanush;
  private readonly breathers: FireBreathers;
  private readonly rng: Rng;
  private readonly launchRoofs: { x: number; y: number; z: number }[];
  private readonly flashLights: PointLight[] = [];
  readonly bursts: Burst[] = [];
  private launchClock = 0;
  private readonly bulbs: InstancedMesh;
  private lanternClock = 0;
  private seeded = false;
  /** Fired when a shell bursts, for the audio. */
  onBurst: ((b: Burst) => void) | null = null;
  onLaunch: ((x: number, y: number, z: number) => void) | null = null;
  /** Fired when a fire-breather blows a flame. */
  onBreath: ((x: number, y: number, z: number) => void) | null = null;

  constructor(layout: CityLayout, tier: Tier, seed: number, roofDrawn: (x: number, z: number) => boolean = () => true) {
    this.rng = new Rng(seed ^ 0x51f15e);
    // The shells' budget (DESIGN.md 8.4); unused sparks cost almost nothing, see Fireworks.
    this.fireworks = new Fireworks(tier === 'high' ? 200_000 : 50_000);
    this.fanush = new Fanush(tier === 'high' ? 320 : 120);
    this.breathers = new FireBreathers(layout.fireBreathers, tier === 'high' ? 4 : 2);
    this.breathers.onBreath = (x, y, z) => this.onBreath?.(x, y, z);
    this.bulbs = stringLights(layout, tier === 'high' ? 14000 : 2500, tier === 'high' ? 0.6 : 1.2);
    this.group.add(this.fireworks.mesh, this.fanush.mesh, this.breathers.group, this.bulbs);
    // Fireworks go up from roofs in front of the player, out toward the river.
    this.launchRoofs = layout.buildings
      .filter((b) => b.z < -60 && b.z > -650 && Math.abs(b.x) < 520 && b.w > 6 && roofDrawn(b.x, b.z))
      .map((b) => ({ x: b.x, y: b.h, z: b.z }));
    for (let i = 0; i < (tier === 'high' ? 3 : 1); i++) {
      const l = new PointLight(0xffffff, 0, 420, 1.4);
      this.flashLights.push(l);
      this.group.add(l);
    }
  }

  /**
   * One frame. `rate` is fireworks per second at full night (from the day clock), `lights` the
   * lantern factor, `fireOn` false when the toggle hides fire.
   */
  update(dt: number, time: number, rate: number, lights: number, fireOn: boolean, wind: Vector3): void {
    this.fireworks.time = time;
    if (fireOn && rate > 0 && this.launchRoofs.length > 0) {
      this.launchClock += dt * rate * 1.6;
      while (this.launchClock >= 1) {
        this.launchClock -= 1;
        const r = this.rng.pick(this.launchRoofs);
        const b = this.fireworks.launch(time, r.x, r.y, r.z, 70 + this.rng.next() * 110, this.rng);
        this.bursts.push(b);
        this.onLaunch?.(r.x, r.y, r.z);
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i] as Burst;
      const before = b.age;
      b.age += dt;
      if (before < 0 && b.age >= 0) this.onBurst?.(b);
      // The longest-lived sparks (willow) last 3.6 s after the burst.
      if (b.age > 4) this.bursts.splice(i, 1);
    }
    // Hundreds of thousands of spark quads cost vertex work even when collapsed, so the whole
    // system is skipped while no shell is in the air.
    this.fireworks.mesh.visible = this.bursts.length > 0;
    // The newest bursts light up the smoke and the roofs around them.
    const lit = this.bursts.filter((b) => b.age >= 0).slice(-this.flashLights.length);
    this.flashLights.forEach((l, i) => {
      const b = lit[i];
      if (!b) {
        l.intensity = 0;
        return;
      }
      l.position.set(b.x, b.y, b.z);
      l.color.copy(b.color);
      l.intensity = 9e4 * Math.exp(-b.age * 3.5);
    });
    if (lights > 0.3) {
      if (!this.seeded) {
        this.seeded = true;
        this.fanush.seed(this.launchRoofs, 70, this.rng);
      }
      this.lanternClock += dt * lights * 0.35;
      while (this.lanternClock >= 1) {
        this.lanternClock -= 1;
        const r = this.rng.pick(this.launchRoofs);
        this.fanush.release(r.x, r.y, r.z, 3 + this.rng.int(6), this.rng);
      }
    }
    this.bulbs.visible = lights > 0.01;
    this.fanush.mesh.visible = lights > 0.01;
    this.fanush.update(dt, wind, time);
    this.breathers.update(time, fireOn && lights > 0.6, this.rng);
  }
}
