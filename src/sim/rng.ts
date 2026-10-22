// The one seeded random generator (DESIGN.md 8.5). Every random choice in the simulation and in the
// procedural generators goes through here, so a seed reproduces the same city, wind and rivals.

/** 32-bit string hash (FNV-1a), used to derive independent streams from labels. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Integer hash of up to four integers, for stateless noise lattices. */
export function hash4(seed: number, x: number, y = 0, z = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (y | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ (z | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Stateless hash to [0, 1). */
export function hash01(seed: number, x: number, y = 0, z = 0): number {
  return hash4(seed, x, y, z) / 4294967296;
}

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x6d2b79f5;
  }

  /** Mulberry32: fast, 32-bit state, good enough statistics for games. */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) throw new Error('Rng.pick on empty list');
    return item;
  }

  /** Signed value in [-1, 1). */
  signed(): number {
    return this.next() * 2 - 1;
  }

  /** An independent stream derived from this seed and a label; does not advance this stream. */
  fork(label: string): Rng {
    return new Rng(hash4(this.s, hashString(label)));
  }

  get state(): number {
    return this.s;
  }
}

/** Root generator for a seed and a named purpose, e.g. rngFor(seed, 'city'). */
export function rngFor(seed: number, label: string): Rng {
  return new Rng(hash4(seed >>> 0, hashString(label)));
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(seed, i) * 2 - 1;
  const b = hash01(seed, i + 1) * 2 - 1;
  return a + (b - a) * smooth(f);
}

/** Smooth 3D value noise in [-1, 1]. */
export function noise3(seed: number, x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  const v = (dx: number, dy: number, dz: number): number => hash01(seed, ix + dx, iy + dy, iz + dz) * 2 - 1;
  const x00 = v(0, 0, 0) + (v(1, 0, 0) - v(0, 0, 0)) * fx;
  const x10 = v(0, 1, 0) + (v(1, 1, 0) - v(0, 1, 0)) * fx;
  const x01 = v(0, 0, 1) + (v(1, 0, 1) - v(0, 0, 1)) * fx;
  const x11 = v(0, 1, 1) + (v(1, 1, 1) - v(0, 1, 1)) * fx;
  const y0 = x00 + (x10 - x00) * fy;
  const y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}
