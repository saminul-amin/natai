// Kite meshes (DESIGN.md 9): five fighter designs share one diamond mesh with a small tukkal (tail
// triangle), and the three shaped kites have their own. Local frame: +Y is the nose, +Z faces the
// flyer, the bridle point is the origin. Every mesh is subdivided so the flutter shader can ripple it.
import { BufferAttribute, BufferGeometry } from 'three';
import type { KiteStats } from '../types';

/** Fighter width in metres, scaled up from life so a kite at 100 m reads on a phone. */
export const KITE_SIZE = 1.5;

interface Builder {
  pos: number[];
  uv: number[];
  idx: number[];
  /** Per-vertex flutter weight: 0 at the bamboo frame, 1 at free paper edges. */
  flex: number[];
}

const newBuilder = (): Builder => ({ pos: [], uv: [], idx: [], flex: [] });

/** A grid over the unit uv square, keeping only cells whose centre passes `inside`. */
function grid(
  b: Builder,
  n: number,
  map: (u: number, v: number) => [number, number, number],
  inside: (u: number, v: number) => boolean,
  flex: (u: number, v: number) => number,
): void {
  const base = b.pos.length / 3;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const v = j / n;
      const [x, y, z] = map(u, v);
      b.pos.push(x, y, z);
      b.uv.push(u, v);
      b.flex.push(flex(u, v));
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (!inside((i + 0.5) / n, (j + 0.5) / n)) continue;
      const a = base + j * (n + 1) + i;
      const c = a + n + 1;
      b.idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
}

function finish(b: Builder): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(b.uv), 2));
  g.setAttribute('flex', new BufferAttribute(new Float32Array(b.flex), 1));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** The fighter (patang): a diamond bowed back along the bow, with the tukkal below. */
export function fighterGeometry(): BufferGeometry {
  const b = newBuilder();
  const s = KITE_SIZE;
  const bow = (u: number) => -0.12 * s * Math.pow(Math.abs(2 * u - 1), 1.6);
  grid(
    b,
    18,
    (u, v) => [(u - 0.5) * s, (v - 0.5) * s * 1.02, bow(u)],
    (u, v) => Math.abs(u - 0.5) + Math.abs(v - 0.5) <= 0.5,
    (u, v) => {
      const toSpine = Math.abs(u - 0.5) * 2;
      const bowY = 0.62 + 0.2 * (1 - Math.pow(2 * u - 1, 2));
      const toBow = Math.min(1, Math.abs(v - bowY) * 4);
      return Math.min(toSpine, toBow) * (Math.abs(u - 0.5) + Math.abs(v - 0.5)) * 2;
    },
  );
  // Tukkal: a small triangle under the bottom tip.
  const base = b.pos.length / 3;
  const y0 = -0.5 * s * 1.02;
  b.pos.push(0, y0 + 0.02, 0, -0.12 * s, y0 - 0.16 * s, 0, 0.12 * s, y0 - 0.16 * s, 0);
  b.uv.push(0.5, 0.0, 0.42, 0.0, 0.58, 0.0);
  b.flex.push(0, 1, 1);
  b.idx.push(base, base + 1, base + 2);
  return finish(b);
}

export function butterflyGeometry(): BufferGeometry {
  const b = newBuilder();
  const s = KITE_SIZE * 1.3;
  grid(
    b,
    24,
    (u, v) => [(u - 0.5) * s, (v - 0.5) * s * 0.8, -0.18 * s * Math.pow(Math.abs(2 * u - 1), 2)],
    (u, v) => {
      const x = Math.abs(u - 0.5) * 2;
      const y = (v - 0.5) * 2;
      const upper = Math.hypot((x - 0.5) / 0.55, (y - 0.32) / 0.62) < 1;
      const lower = Math.hypot((x - 0.38) / 0.4, (y + 0.42) / 0.5) < 1;
      const body = x < 0.06 && Math.abs(y) < 0.85;
      return upper || lower || body;
    },
    (u) => Math.abs(u - 0.5) * 2,
  );
  return finish(b);
}

export function rocketGeometry(): BufferGeometry {
  const b = newBuilder();
  const s = KITE_SIZE;
  grid(
    b,
    16,
    (u, v) => [(u - 0.5) * s * 0.7, (v - 0.5) * s * 1.6, -0.05 * s * Math.cos((u - 0.5) * Math.PI)],
    (u, v) => {
      const x = Math.abs(u - 0.5) * 2;
      const nose = v > 0.75 ? x < (1 - v) / 0.25 : true;
      const fins = v < 0.2 ? true : x < 0.55;
      return nose && fins;
    },
    (u, v) => Math.abs(u - 0.5) * 2 * (1 - v),
  );
  return finish(b);
}

/** Box kite: two open square cells on four sticks. */
export function boxGeometry(): BufferGeometry {
  const b = newBuilder();
  const w = KITE_SIZE * 0.45;
  const h = KITE_SIZE * 0.45;
  for (const cy of [-0.55, 0.55]) {
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2 + Math.PI / 4;
      const nA = a + Math.PI / 2;
      const x0 = Math.cos(a) * w * 0.7;
      const z0 = Math.sin(a) * w * 0.7;
      const x1 = Math.cos(nA) * w * 0.7;
      const z1 = Math.sin(nA) * w * 0.7;
      grid(
        b,
        4,
        (u, v) => [x0 + (x1 - x0) * u, cy * h + (v - 0.5) * h, z0 + (z1 - z0) * u],
        () => true,
        () => 0.2,
      );
    }
  }
  // Remap uvs so each panel shows a part of the print.
  return finish(b);
}

export function geometryFor(stats: KiteStats): BufferGeometry {
  switch (stats.shape) {
    case 'butterfly':
      return butterflyGeometry();
    case 'rocket':
      return rocketGeometry();
    case 'box':
      return boxGeometry();
    default:
      return fighterGeometry();
  }
}

/** Fighters with a streamer tail (the lejdar's name) and the shaped kites trail tails. */
export function tailLength(stats: KiteStats): number {
  if (stats.id === 'lejdar') return 4.5;
  if (stats.kind === 'shaped') return stats.shape === 'box' ? 0 : 3;
  return 0;
}
