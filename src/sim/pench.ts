// The pench (DESIGN.md 4.3). Crossing detection between two lines, the bow of the hooked strings, and
// damage: every tick the cell of each string at the crossing loses
//   slide_speed × manja_sharpness_of_other × angle_factor × position_factor_of_other.
import type { Line } from './line';
import type { V3 } from './wind';

/** Strings hook when their closest approach is under this distance, metres. */
export const HOOK_DISTANCE = 3.0;
/** Hooked strings separate past this distance. */
export const RELEASE_DISTANCE = 6;
/** Damage scale: health lost per (m/s of slide × sharpness) per second. */
export const DAMAGE_K = 0.2;
const MAX_SLIDE = 20;

export interface Closest {
  segA: number;
  fA: number;
  segB: number;
  fB: number;
  dist: number;
  pa: V3;
  pb: V3;
}

export interface Contact {
  closest: Closest;
  arcA: number;
  arcB: number;
  /** Relative slide speed at the crossing, m/s. */
  slide: number;
  angle: number;
  age: number;
}

export interface Duelist {
  line: Line;
  /** Height of the duelist's kite, for the position factor. */
  kiteY: number;
  sharpness: number;
}

/** Closest points of two segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9). */
function segmentClosest(
  p1x: number,
  p1y: number,
  p1z: number,
  q1x: number,
  q1y: number,
  q1z: number,
  p2x: number,
  p2y: number,
  p2z: number,
  q2x: number,
  q2y: number,
  q2z: number,
  out: { s: number; t: number; d2: number },
): void {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0;
  let t = 0;
  if (a <= 1e-9 && e <= 1e-9) {
    s = 0;
    t = 0;
  } else if (a <= 1e-9) {
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) {
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const cx = p1x + d1x * s - (p2x + d2x * t);
  const cy = p1y + d1y * s - (p2y + d2y * t);
  const cz = p1z + d1z * s - (p2z + d2z * t);
  out.s = s;
  out.t = t;
  out.d2 = cx * cx + cy * cy + cz * cz;
}

const sc = { s: 0, t: 0, d2: 0 };

/** Closest approach of two lines, or null when nowhere nearer than `maxDist`. */
export function closestApproach(a: Line, b: Line, maxDist: number): Closest | null {
  let best = maxDist * maxDist;
  let found: Omit<Closest, 'dist' | 'pa' | 'pb'> | null = null;
  // Skip the segment at each hand: strings never meet right at the natai.
  for (let i = 1; i < a.n - 1; i++) {
    const ax = a.px(i);
    const ay = a.py(i);
    const az = a.pz(i);
    const bx = a.px(i + 1);
    const by = a.py(i + 1);
    const bz = a.pz(i + 1);
    const minX = Math.min(ax, bx) - maxDist;
    const maxX = Math.max(ax, bx) + maxDist;
    const minY = Math.min(ay, by) - maxDist;
    const maxY = Math.max(ay, by) + maxDist;
    for (let j = 1; j < b.n - 1; j++) {
      const cx = b.px(j);
      const cy = b.py(j);
      const dx = b.px(j + 1);
      const dy = b.py(j + 1);
      if (Math.max(cx, dx) < minX || Math.min(cx, dx) > maxX || Math.max(cy, dy) < minY || Math.min(cy, dy) > maxY) continue;
      segmentClosest(ax, ay, az, bx, by, bz, cx, cy, b.pz(j), dx, dy, b.pz(j + 1), sc);
      if (sc.d2 < best) {
        best = sc.d2;
        found = { segA: i, fA: sc.s, segB: j, fB: sc.t };
      }
    }
  }
  if (!found) return null;
  const pa = lerpPoint(a, found.segA, found.fA);
  const pb = lerpPoint(b, found.segB, found.fB);
  return { ...found, dist: Math.sqrt(best), pa, pb };
}

function lerpPoint(l: Line, i: number, f: number): V3 {
  return {
    x: l.px(i) + (l.px(i + 1) - l.px(i)) * f,
    y: l.py(i) + (l.py(i + 1) - l.py(i)) * f,
    z: l.pz(i) + (l.pz(i + 1) - l.pz(i)) * f,
  };
}

function tangent(l: Line, i: number): V3 {
  const x = l.px(i + 1) - l.px(i);
  const y = l.py(i + 1) - l.py(i);
  const z = l.pz(i + 1) - l.pz(i);
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

export function startContact(a: Line, b: Line, c: Closest): Contact {
  return {
    closest: c,
    arcA: a.arcFromKite(c.segA, c.fA),
    arcB: b.arcFromKite(c.segB, c.fB),
    slide: 0,
    angle: 0,
    age: 0,
  };
}

export function angleFactor(sinAngle: number): number {
  return 0.35 + 0.65 * sinAngle;
}

/** Slight edge to the higher kite: above 1 when the cutter flies higher than the victim. */
export function positionFactor(cutterY: number, victimY: number): number {
  return 1 + 0.12 * Math.tanh((cutterY - victimY) / 8);
}

export interface PenchResult {
  /** Damage dealt to each string this tick. */
  damageA: number;
  damageB: number;
  snapped: 'a' | 'b' | null;
  /** False when the strings have come apart. */
  engaged: boolean;
}

/**
 * One tick of a hooked pench: re-finds the crossing, bows both strings toward it, and saws the cell of
 * each string that sits at the crossing.
 */
export function stepPench(contact: Contact, a: Duelist, b: Duelist, dt: number): PenchResult {
  const c = closestApproach(a.line, b.line, RELEASE_DISTANCE);
  if (!c) return { damageA: 0, damageB: 0, snapped: null, engaged: false };
  contact.closest = c;
  contact.age += dt;
  const arcA = a.line.arcFromKite(c.segA, c.fA);
  const arcB = b.line.arcFromKite(c.segB, c.fB);
  const rateA = clamp((arcA - contact.arcA) / dt, -MAX_SLIDE, MAX_SLIDE);
  const rateB = clamp((arcB - contact.arcB) / dt, -MAX_SLIDE, MAX_SLIDE);
  contact.arcA = arcA;
  contact.arcB = arcB;
  const tA = tangent(a.line, c.segA);
  const tB = tangent(b.line, c.segB);
  const sx = rateA * tA.x - rateB * tB.x;
  const sy = rateA * tA.y - rateB * tB.y;
  const sz = rateA * tA.z - rateB * tB.z;
  const slide = Math.min(MAX_SLIDE, Math.sqrt(sx * sx + sy * sy + sz * sz));
  const cx = tA.y * tB.z - tA.z * tB.y;
  const cy = tA.z * tB.x - tA.x * tB.z;
  const cz = tA.x * tB.y - tA.y * tB.x;
  const sinAngle = Math.min(1, Math.sqrt(cx * cx + cy * cy + cz * cz));
  contact.slide = contact.slide + (slide - contact.slide) * 0.2;
  contact.angle = sinAngle;

  // Bow: both strings are drawn toward the shared crossing.
  const mx = (c.pa.x + c.pb.x) / 2;
  const my = (c.pa.y + c.pb.y) / 2;
  const mz = (c.pa.z + c.pb.z) / 2;
  const nearA = c.fA < 0.5 ? c.segA : c.segA + 1;
  const nearB = c.fB < 0.5 ? c.segB : c.segB + 1;
  a.line.pull(nearA, mx, my, mz, 0.35);
  b.line.pull(nearB, mx, my, mz, 0.35);

  const af = angleFactor(sinAngle);
  const damageA = DAMAGE_K * slide * b.sharpness * af * positionFactor(b.kiteY, a.kiteY) * dt;
  const damageB = DAMAGE_K * slide * a.sharpness * af * positionFactor(a.kiteY, b.kiteY) * dt;
  const cellA = a.line.cellAt(arcA);
  const cellB = b.line.cellAt(arcB);
  a.line.health[cellA] = (a.line.health[cellA] as number) - damageA;
  b.line.health[cellB] = (b.line.health[cellB] as number) - damageB;
  let snapped: 'a' | 'b' | null = null;
  const ha = a.line.health[cellA] as number;
  const hb = b.line.health[cellB] as number;
  if (ha <= 0 || hb <= 0) snapped = ha <= hb ? 'a' : 'b';
  return { damageA, damageB, snapped, engaged: true };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
