// The fighter kite (DESIGN.md 4.2). Not a cloth simulation: an analytic model in which a tight line
// makes the kite track straight where its nose points and a slack line lets it spin and drift. The
// line constrains the kite to a sphere around the natai; tan pulls line in by hand, dheel gives it
// back, and the natai dial sets the long-term length.
import type { Control, KiteStats, NataiStats } from '../types';
import { noise1 } from './rng';
import { windAt, type V3, type WindParams } from './wind';

/** Metres of line the hand can take in or give out on top of the natai length. */
export const GIVE = 6;
const PULL_RATE = 7;
const GIVE_RATE = 9;
export const MIN_LINE = 12;

export interface KiteState {
  pos: V3;
  vel: V3;
  /** Position at the previous tick, for interpolated rendering. */
  last: V3;
  /** Nose angle in the kite's tangent frame; 0 points up the wind window, positive turns right. */
  nose: number;
  lastNose: number;
  spin: number;
  spinDir: 1 | -1;
  /** Smoothed line tension, 0 slack to about 1 hard pull. */
  tension: number;
  taut: boolean;
  /** Metres unwound by the natai dial. */
  natai: number;
  /** Hand slack on top of the natai length, -GIVE..GIVE. */
  give: number;
  /** Rate the line length changes, m/s; positive pays out. */
  feed: number;
  /** Cut free and tumbling. */
  free: boolean;
  grounded: boolean;
  stats: KiteStats;
  seed: number;
}

export interface Frame {
  radial: V3;
  up: V3;
  right: V3;
  nose: V3;
}

export const lineLength = (k: KiteState): number => k.natai + k.give;

export function newKite(stats: KiteStats, anchor: V3, length: number, seed: number, wind: WindParams): KiteState {
  const dir = Math.sin(wind.direction);
  const dz = -Math.cos(wind.direction);
  const elev = 0.8;
  const pos = {
    x: anchor.x + dir * Math.cos(elev) * length * 0.98,
    y: anchor.y + Math.sin(elev) * length * 0.98,
    z: anchor.z + dz * Math.cos(elev) * length * 0.98,
  };
  return {
    pos,
    vel: { x: 0, y: 0, z: 0 },
    last: { ...pos },
    nose: 0,
    lastNose: 0,
    spin: 0,
    spinDir: seed % 2 === 0 ? 1 : -1,
    tension: 0.5,
    taut: true,
    natai: length,
    give: 0,
    feed: 0,
    free: false,
    grounded: false,
    stats,
    seed,
  };
}

/** The kite's tangent frame on the sphere around the natai, as seen by the flyer. */
export function kiteFrame(pos: V3, anchor: V3, nose: number, out: Frame): Frame {
  let rx = pos.x - anchor.x;
  let ry = pos.y - anchor.y;
  let rz = pos.z - anchor.z;
  const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  // Up: world up with the radial part removed.
  let ux = -rx * ry;
  let uy = 1 - ry * ry;
  let uz = -rz * ry;
  let ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
  if (ul < 1e-4) {
    ux = 0;
    uy = 0;
    uz = -1;
    ul = 1;
  }
  ux /= ul;
  uy /= ul;
  uz /= ul;
  // Right = radial × up.
  const sx = ry * uz - rz * uy;
  const sy = rz * ux - rx * uz;
  const sz = rx * uy - ry * ux;
  const c = Math.cos(nose);
  const s = Math.sin(nose);
  out.radial.x = rx;
  out.radial.y = ry;
  out.radial.z = rz;
  out.up.x = ux;
  out.up.y = uy;
  out.up.z = uz;
  out.right.x = sx;
  out.right.y = sy;
  out.right.z = sz;
  out.nose.x = ux * c + sx * s;
  out.nose.y = uy * c + sy * s;
  out.nose.z = uz * c + sz * s;
  return out;
}

export const newFrame = (): Frame => ({
  radial: { x: 0, y: 0, z: -1 },
  up: { x: 0, y: 1, z: 0 },
  right: { x: 1, y: 0, z: 0 },
  nose: { x: 0, y: 1, z: 0 },
});

export function wrapAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
}

const frame = newFrame();
const w: V3 = { x: 0, y: 0, z: 0 };

export type Ground = (x: number, z: number) => number;

/** Advances a kite on its line by one tick. */
export function stepKite(
  k: KiteState,
  anchor: V3,
  control: Control,
  natai: NataiStats,
  wind: WindParams,
  t: number,
  dt: number,
  ground: Ground,
): void {
  k.last.x = k.pos.x;
  k.last.y = k.pos.y;
  k.last.z = k.pos.z;
  k.lastNose = k.nose;
  if (k.free) {
    stepFree(k, wind, t, dt, ground);
    return;
  }
  const before = lineLength(k);
  // Line only pays out as fast as the kite pulls it away from the hand (plus a little slack).
  const ox = k.pos.x - anchor.x;
  const oy = k.pos.y - anchor.y;
  const oz = k.pos.z - anchor.z;
  const od = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
  const outward = Math.max(0, (k.vel.x * ox + k.vel.y * oy + k.vel.z * oz) / od);
  const takes = outward + (control.tan ? 0.05 : 0.35);
  if (control.reel < 0) k.natai += control.reel * natai.reelSpeed * dt;
  else if (control.reel > 0) k.natai += Math.min(control.reel * natai.reelSpeed, takes) * dt;
  k.natai = Math.min(natai.capacity - GIVE, Math.max(MIN_LINE, k.natai));
  if (control.tan) {
    k.give = Math.max(-GIVE, k.give - PULL_RATE * dt);
  } else {
    // Dheel: the hand lets the line run, and the kite takes it.
    k.give = Math.min(GIVE, k.give + Math.min(GIVE_RATE, takes) * dt);
  }
  const L = lineLength(k);
  k.feed = (L - before) / dt;

  windAt(wind, k.pos.x, k.pos.y, k.pos.z, t, w);
  const ws = Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z) || 1e-3;
  kiteFrame(k.pos, anchor, k.nose, frame);
  const window = Math.max(0, (w.x * frame.radial.x + w.y * frame.radial.y + w.z * frame.radial.z) / ws);
  const power = Math.pow(window, 0.6);

  const hold = control.tan ? 1 : 0.4;
  // A line within a metre or so of full stretch still carries some load.
  const distance = Math.sqrt(ox * ox + oy * oy + oz * oz);
  const tautness = Math.min(1, Math.max(0, 1 - (L - distance) / 1.2));
  const target = tautness * hold * (0.3 + 0.7 * power);
  k.tension += (target - k.tension) * (1 - Math.exp(-dt / 0.06));
  const tf = Math.min(1, k.tension);
  const { stability, speed } = k.stats;

  const track = ws * (1.0 + 1.3 * speed) * tf * power;
  const drift = 1 - 0.85 * tf;
  const dvx = w.x * drift + frame.nose.x * track;
  let dvy = w.y * drift + frame.nose.y * track;
  const dvz = w.z * drift + frame.nose.z * track;
  dvy -= (1 - tf) * (0.9 - 0.5 * stability);
  const resp = 1 - Math.exp(-(2.2 + 2.5 * tf) * dt);
  k.vel.x += (dvx - k.vel.x) * resp;
  k.vel.y += (dvy - k.vel.y) * resp;
  k.vel.z += (dvz - k.vel.z) * resp;
  k.pos.x += k.vel.x * dt;
  k.pos.y += k.vel.y * dt;
  k.pos.z += k.vel.z * dt;

  // The line: an inextensible rope, so the kite never leaves the sphere of radius L.
  const rx = k.pos.x - anchor.x;
  const ry = k.pos.y - anchor.y;
  const rz = k.pos.z - anchor.z;
  const d = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1e-6;
  if (d >= L) {
    const ux = rx / d;
    const uy = ry / d;
    const uz = rz / d;
    k.pos.x = anchor.x + ux * L;
    k.pos.y = anchor.y + uy * L;
    k.pos.z = anchor.z + uz * L;
    const vr = k.vel.x * ux + k.vel.y * uy + k.vel.z * uz;
    if (vr > 0) {
      k.vel.x -= ux * vr;
      k.vel.y -= uy * vr;
      k.vel.z -= uz * vr;
    }
    k.taut = true;
  } else {
    k.taut = d > L - 0.05;
  }

  landOn(k, ground, dt);

  // Nose: a fighter kite spins on slack line and locks straight on a tight one.
  // A pull locks the nose once the line carries any real load; slack lets it turn.
  const lock = control.tan ? Math.min(1, tf * 2.5) : tf;
  const slack = 1 - lock;
  let spinTarget = k.spinDir * 3.4 * (1.25 - stability) * Math.pow(slack, 1.5);
  spinTarget += 0.7 * slack * noise1(k.seed + 5, t * 0.8);
  k.spin += (spinTarget - k.spin) * (1 - Math.exp(-(3 + 14 * lock) * dt));
  k.nose = wrapAngle(k.nose + k.spin * dt);
  // On long slack the kite sometimes flips its turning direction with a gust.
  if (slack > 0.7 && noise1(k.seed + 7, t * 0.35) > 0.93 && Math.sign(noise1(k.seed + 8, t * 3)) !== k.spinDir) {
    k.spinDir = k.spinDir === 1 ? -1 : 1;
  }
}

function landOn(k: KiteState, ground: Ground, dt: number): void {
  const gh = ground(k.pos.x, k.pos.z) + 0.6;
  if (k.pos.y < gh) {
    k.pos.y = gh;
    k.vel.y = Math.max(0, k.vel.y);
    const f = Math.exp(-6 * dt);
    k.vel.x *= f;
    k.vel.z *= f;
    k.grounded = true;
  } else {
    k.grounded = false;
  }
}

/** A cut kite: no line, tumbling and drifting downwind as it sinks. */
function stepFree(k: KiteState, wind: WindParams, t: number, dt: number, ground: Ground): void {
  windAt(wind, k.pos.x, k.pos.y, k.pos.z, t, w);
  const sway = Math.sin(t * 2.3 + k.seed) * 1.2;
  const resp = 1 - Math.exp(-1.6 * dt);
  k.vel.x += (w.x * 0.85 - k.vel.x) * resp;
  k.vel.y += (-1.5 + sway - k.vel.y) * resp;
  k.vel.z += (w.z * 0.85 - k.vel.z) * resp;
  if (!k.grounded) {
    k.pos.x += k.vel.x * dt;
    k.pos.y += k.vel.y * dt;
    k.pos.z += k.vel.z * dt;
  }
  k.tension = 0;
  k.taut = false;
  k.feed = 0;
  k.spin += (k.spinDir * 5.5 - k.spin) * (1 - Math.exp(-2 * dt));
  k.nose = wrapAngle(k.nose + k.spin * dt);
  landOn(k, ground, dt);
}

/** Cuts a kite loose. */
export function freeKite(k: KiteState): void {
  k.free = true;
  k.tension = 0;
  k.spin = k.spinDir * 2;
}
