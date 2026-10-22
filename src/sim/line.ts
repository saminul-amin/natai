// The verlet line (DESIGN.md 4.2, 4.3): a chain of points between the natai and the kite, with sag and
// wind drag, and a health value for every half metre of string measured from the kite end. Health is
// tied to the string's material, not to the verlet points, so a line that keeps moving through a
// crossing spreads its wear while a still line takes it all on one cell.
import { windAt, type V3, type WindParams } from './wind';

export const LINE_SEGMENTS = 40;
/** Length of string one health cell covers, metres. */
export const CELL = 0.5;

const GRAVITY = -3.2;
const DRAG = 1.6;
const ITERATIONS = 18;

const tmpWind: V3 = { x: 0, y: 0, z: 0 };

export class Line {
  /** Point count; index 0 is the hand end, the last index is the kite end. */
  readonly n: number;
  readonly pos: Float64Array;
  readonly prev: Float64Array;
  /** Positions at the previous tick, for interpolated rendering. */
  readonly last: Float64Array;
  /** Health per cell of string, cell 0 at the kite. */
  readonly health: Float32Array;
  readonly durability: number;
  /** Total rest length of the chain, metres. */
  rest = 10;
  pinStart = true;
  pinEnd = true;

  constructor(segments: number, capacity: number, durability: number) {
    this.n = segments + 1;
    this.pos = new Float64Array(this.n * 3);
    this.prev = new Float64Array(this.n * 3);
    this.last = new Float64Array(this.n * 3);
    this.durability = durability;
    this.health = new Float32Array(Math.ceil(capacity / CELL) + 1).fill(durability);
  }

  /** Lays the line straight between two points. */
  reset(a: V3, b: V3, rest: number): void {
    this.rest = rest;
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const sag = Math.sin(t * Math.PI) * 0.04 * rest;
      this.setPoint(i, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag, a.z + (b.z - a.z) * t);
    }
    this.prev.set(this.pos);
    this.last.set(this.pos);
  }

  setPoint(i: number, x: number, y: number, z: number): void {
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
  }

  get kiteIndex(): number {
    return this.n - 1;
  }

  px(i: number): number {
    return this.pos[i * 3] as number;
  }
  py(i: number): number {
    return this.pos[i * 3 + 1] as number;
  }
  pz(i: number): number {
    return this.pos[i * 3 + 2] as number;
  }

  /** Current length of segment i (between points i and i + 1). */
  segmentLength(i: number): number {
    const dx = this.px(i + 1) - this.px(i);
    const dy = this.py(i + 1) - this.py(i);
    const dz = this.pz(i + 1) - this.pz(i);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** Arc length from the kite end to a point on segment i at fraction f (0 at point i). */
  arcFromKite(i: number, f: number): number {
    let s = this.segmentLength(i) * (1 - f);
    for (let j = i + 1; j < this.n - 1; j++) s += this.segmentLength(j);
    return s;
  }

  cellAt(arcFromKite: number): number {
    return Math.min(this.health.length - 1, Math.max(0, Math.floor(arcFromKite / CELL)));
  }

  /** Lowest health anywhere on the deployed string, 0..durability. */
  weakest(): number {
    const cells = Math.min(this.health.length, Math.ceil(this.rest / CELL) + 1);
    let m = this.durability;
    for (let i = 0; i < cells; i++) m = Math.min(m, this.health[i] as number);
    return m;
  }

  /**
   * Advances one tick. `start` and `end` pin the ends when given (the natai and the kite); a cut piece
   * passes null for its free end.
   */
  step(start: V3 | null, end: V3 | null, rest: number, wind: WindParams, t: number, dt: number): void {
    this.last.set(this.pos);
    this.rest = rest;
    const n = this.n;
    const pos = this.pos;
    const prev = this.prev;
    const dt2 = dt * dt;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      const x = pos[k] as number;
      const y = pos[k + 1] as number;
      const z = pos[k + 2] as number;
      const vx = (x - (prev[k] as number)) / dt;
      const vy = (y - (prev[k + 1] as number)) / dt;
      const vz = (z - (prev[k + 2] as number)) / dt;
      windAt(wind, x, y, z, t, tmpWind);
      // Drag acts on the wind component across the string, not along it.
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      let tx = this.px(b) - this.px(a);
      let ty = this.py(b) - this.py(a);
      let tz = this.pz(b) - this.pz(a);
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      let rx = tmpWind.x - vx;
      let ry = tmpWind.y - vy;
      let rz = tmpWind.z - vz;
      const along = rx * tx + ry * ty + rz * tz;
      rx -= along * tx;
      ry -= along * ty;
      rz -= along * tz;
      const ax = rx * DRAG;
      const ay = ry * DRAG + GRAVITY;
      const az = rz * DRAG;
      prev[k] = x;
      prev[k + 1] = y;
      prev[k + 2] = z;
      pos[k] = x + vx * dt * 0.995 + ax * dt2;
      pos[k + 1] = y + vy * dt * 0.995 + ay * dt2;
      pos[k + 2] = z + vz * dt * 0.995 + az * dt2;
    }
    if (start) this.pin(0, start);
    if (end) this.pin(n - 1, end);
    const seg = rest / (n - 1);
    const w0 = start ? 0 : 1;
    const wn = end ? 0 : 1;
    for (let it = 0; it < ITERATIONS; it++) {
      const forward = (it & 1) === 0;
      for (let s = 0; s < n - 1; s++) {
        const i = forward ? s : n - 2 - s;
        const wa = i === 0 ? w0 : 1;
        const wb = i + 1 === n - 1 ? wn : 1;
        const sum = wa + wb;
        if (sum === 0) continue;
        const ka = i * 3;
        const kb = ka + 3;
        const dx = (pos[kb] as number) - (pos[ka] as number);
        const dy = (pos[kb + 1] as number) - (pos[ka + 1] as number);
        const dz = (pos[kb + 2] as number) - (pos[ka + 2] as number);
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const c = (d - seg) / d / sum;
        pos[ka] = (pos[ka] as number) + dx * c * wa;
        pos[ka + 1] = (pos[ka + 1] as number) + dy * c * wa;
        pos[ka + 2] = (pos[ka + 2] as number) + dz * c * wa;
        pos[kb] = (pos[kb] as number) - dx * c * wb;
        pos[kb + 1] = (pos[kb + 1] as number) - dy * c * wb;
        pos[kb + 2] = (pos[kb + 2] as number) - dz * c * wb;
      }
    }
  }

  private pin(i: number, p: V3): void {
    this.setPoint(i, p.x, p.y, p.z);
    this.prev[i * 3] = p.x;
    this.prev[i * 3 + 1] = p.y;
    this.prev[i * 3 + 2] = p.z;
  }

  /** Moves point i toward a target by a fraction, as a soft constraint (the bow of a pench). */
  pull(i: number, x: number, y: number, z: number, k: number): void {
    if ((i === 0 && this.pinStart) || (i === this.n - 1 && this.pinEnd)) return;
    const j = i * 3;
    this.pos[j] = (this.pos[j] as number) + (x - (this.pos[j] as number)) * k;
    this.pos[j + 1] = (this.pos[j + 1] as number) + (y - (this.pos[j + 1] as number)) * k;
    this.pos[j + 2] = (this.pos[j + 2] as number) + (z - (this.pos[j + 2] as number)) * k;
  }

  /**
   * Splits the line at an arc distance from the kite. Returns the kite-side piece (pinned at the
   * kite, free at the cut) and the hand-side piece (pinned at the hand, free at the cut).
   */
  split(arcFromKite: number): { kiteSide: Line; handSide: Line } {
    const total = this.arcFromKite(0, 0);
    const kiteLen = Math.max(0.5, Math.min(total - 0.5, arcFromKite));
    const handLen = Math.max(0.5, total - kiteLen);
    const kiteSegs = Math.max(4, Math.round((LINE_SEGMENTS * kiteLen) / Math.max(total, 1)));
    const handSegs = Math.max(4, Math.round((LINE_SEGMENTS * handLen) / Math.max(total, 1)));
    const kiteSide = new Line(kiteSegs, kiteLen, this.durability);
    const handSide = new Line(handSegs, handLen, this.durability);
    // Kite side runs from the cut (index 0, free) to the kite (last index, pinned).
    for (let i = 0; i < kiteSide.n; i++) {
      const s = kiteLen * (1 - i / (kiteSide.n - 1));
      const p = this.pointAtArc(s);
      kiteSide.setPoint(i, p.x, p.y, p.z);
    }
    for (let i = 0; i < handSide.n; i++) {
      const s = total - handLen * (i / (handSide.n - 1));
      const p = this.pointAtArc(Math.max(kiteLen, s));
      handSide.setPoint(i, p.x, p.y, p.z);
    }
    for (const piece of [kiteSide, handSide]) {
      piece.prev.set(piece.pos);
      piece.last.set(piece.pos);
    }
    kiteSide.rest = kiteLen;
    kiteSide.pinStart = false;
    handSide.rest = handLen;
    handSide.pinEnd = false;
    return { kiteSide, handSide };
  }

  /** Point at an arc distance from the kite end. */
  pointAtArc(arcFromKite: number): V3 {
    let s = arcFromKite;
    for (let i = this.n - 2; i >= 0; i--) {
      const l = this.segmentLength(i);
      if (s <= l || i === 0) {
        const f = l > 0 ? Math.min(1, s / l) : 0;
        // Walk from point i+1 toward point i.
        return {
          x: this.px(i + 1) + (this.px(i) - this.px(i + 1)) * f,
          y: this.py(i + 1) + (this.py(i) - this.py(i + 1)) * f,
          z: this.pz(i + 1) + (this.pz(i) - this.pz(i + 1)) * f,
        };
      }
      s -= l;
    }
    return { x: this.px(0), y: this.py(0), z: this.pz(0) };
  }
}
