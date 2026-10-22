// The city layout (DESIGN.md 3, 5.7): Puran Dhaka as dense four-to-six-storey blocks shoulder to
// shoulder, narrow lanes, a few wider roads, the odd courtyard with a tree, the Buriganga across the
// south-west with the far bank beyond. Pure and seeded: the same seed builds the same city, and the
// player's and rivals' rooftops are always real roofs.
import { ROOFTOPS } from '../sim/names';
import type { Rng } from '../sim/rng';
import { rngFor } from '../sim/rng';
import { FACADE_COUNT } from './facades';

export interface Building {
  x: number;
  z: number;
  /** Footprint, metres. */
  w: number;
  d: number;
  /** Roof height above the lane, metres. */
  h: number;
  floors: number;
  facade: number;
  /** Second façade module mixed into the upper floors. */
  facade2: number;
  shop: number;
  parapet: number;
  /** Stair-head room style, -1 for none. */
  stair: number;
  /** Corner the stair-head room sits in, 0..3. */
  stairCorner: number;
  tint: [number, number, number];
  seed: number;
  /** Detailed geometry near the player; boxes further out. */
  detail: boolean;
}

export type PropKind = 'tank' | 'antenna' | 'washing' | 'flag' | 'pots' | 'banner' | 'dish' | 'chair' | 'speaker' | 'dj';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  variant: number;
}

export type TreeKind = 'rain' | 'coconut' | 'banana';

export interface Tree {
  kind: TreeKind;
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
}

export interface Person {
  x: number;
  y: number;
  z: number;
  rot: number;
  body: number;
  anim: number;
  /** Index of the roof the person stands on, for reactions. */
  roof: number;
}

export interface LightRun {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
}

export interface CityLayout {
  buildings: Building[];
  props: Prop[];
  trees: Tree[];
  people: Person[];
  lamps: { x: number; y: number; z: number }[];
  lightRuns: LightRun[];
  fireBreathers: { x: number; y: number; z: number }[];
  djRoofs: { x: number; y: number; z: number }[];
  /** Rooftops distant kites are flown from. */
  kiteRoofs: { x: number; y: number; z: number }[];
  river: { north: number; south: number };
  heightAt(x: number, z: number): number;
  roofAt(x: number, z: number): { x: number; y: number; z: number };
}

export const CITY = {
  minX: -620,
  maxX: 620,
  minZ: -650,
  maxZ: 260,
  /** Near ring with detailed buildings, around the player's rooftops. */
  detailRadius: 300,
  riverNorth: -680,
  riverSouth: -1060,
  farBankEnd: -1400,
} as const;

/** Pastel Old Dhaka plaster: faded yellow, pink, sky, mint, whitewash, cement grey, terracotta. */
const TINTS: [number, number, number][] = [
  [1.0, 0.86, 0.62],
  [1.0, 0.78, 0.76],
  [0.72, 0.86, 1.0],
  [0.76, 0.94, 0.82],
  [1.0, 0.98, 0.94],
  [0.82, 0.82, 0.8],
  [0.96, 0.7, 0.56],
  [0.98, 0.92, 0.7],
  [0.9, 0.8, 0.95],
];

/** Landmarks and their footprints; no ordinary building is placed over them. */
export const LANDMARKS = {
  ahsanManzil: { x: -380, z: -640, w: 132, d: 46 },
  mosque: { x: -255, z: -420, w: 30, d: 20 },
  terminal: { x: 60, z: -662, w: 172, d: 36 },
  minarets: [
    { x: 125, z: -330 },
    { x: -95, z: -520 },
    { x: 310, z: -160 },
    { x: -430, z: -210 },
    { x: 220, z: -560 },
  ],
  bridgeX: -720,
} as const;

const CELL = 16;

class Grid {
  private readonly map = new Map<number, Building[]>();
  private key(cx: number, cz: number): number {
    return (cx + 1000) * 4096 + (cz + 1000);
  }
  add(b: Building): void {
    const x0 = Math.floor((b.x - b.w / 2) / CELL);
    const x1 = Math.floor((b.x + b.w / 2) / CELL);
    const z0 = Math.floor((b.z - b.d / 2) / CELL);
    const z1 = Math.floor((b.z + b.d / 2) / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        const list = this.map.get(k);
        if (list) list.push(b);
        else this.map.set(k, [b]);
      }
  }
  at(x: number, z: number): Building[] {
    return this.map.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
  }
  occupied(x0: number, z0: number, x1: number, z1: number): boolean {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++)
        for (const b of this.map.get(this.key(cx, cz)) ?? [])
          if (x1 > b.x - b.w / 2 && x0 < b.x + b.w / 2 && z1 > b.z - b.d / 2 && z0 < b.z + b.d / 2) return true;
    return false;
  }
}

function makeBuilding(
  rng: Rng,
  x: number,
  z: number,
  w: number,
  d: number,
  floors: number,
  detail: boolean,
  seed: number,
): Building {
  const facade = rng.int(FACADE_COUNT);
  return {
    x,
    z,
    w,
    d,
    h: floors * 3 + 0.4,
    floors,
    facade,
    facade2: rng.chance(0.4) ? rng.int(FACADE_COUNT) : facade,
    shop: rng.chance(0.6) ? 12 + rng.int(2) : -1,
    parapet: rng.int(4),
    stair: rng.chance(0.65) ? rng.int(3) : -1,
    stairCorner: rng.int(4),
    tint: rng.pick(TINTS),
    seed,
    detail,
  };
}

function onLandmark(x: number, z: number, w: number, d: number): boolean {
  const boxes = [LANDMARKS.ahsanManzil, LANDMARKS.mosque, LANDMARKS.terminal];
  for (const b of boxes) if (Math.abs(x - b.x) < (b.w + w) / 2 + 4 && Math.abs(z - b.z) < (b.d + d) / 2 + 4) return true;
  for (const m of LANDMARKS.minarets) if (Math.abs(x - m.x) < w / 2 + 4 && Math.abs(z - m.z) < d / 2 + 4) return true;
  return false;
}

export function generateCity(seed: number): CityLayout {
  const rng = rngFor(seed, 'city');
  const buildings: Building[] = [];
  const grid = new Grid();
  let nextSeed = 1;

  // The player's rooftops come first, so nothing overlaps them.
  for (const r of ROOFTOPS) {
    const floors = Math.round((r.height - 0.4) / 3);
    const b = makeBuilding(rng, r.x, r.z + 1, 14, 14, floors, true, nextSeed++);
    b.h = r.height;
    b.stair = 0;
    b.stairCorner = 2;
    b.parapet = 1;
    buildings.push(b);
    grid.add(b);
  }

  // Blocks between roads. Lanes run between the plots; every few blocks a wider road.
  const roadsX = new Set<number>();
  const roadsZ = new Set<number>();
  for (let x = CITY.minX; x < CITY.maxX; x += 96 + rng.int(4) * 16) roadsX.add(Math.round(x / 4) * 4);
  for (let z = CITY.minZ; z < CITY.maxZ; z += 80 + rng.int(4) * 16) roadsZ.add(Math.round(z / 4) * 4);
  const nearRoad = (v: number, roads: Set<number>, half: number): boolean => {
    for (const r of roads) if (Math.abs(v - r) < half) return true;
    return false;
  };

  let z = CITY.minZ + 6;
  while (z < CITY.maxZ) {
    const depth = 9 + rng.int(6);
    let x = CITY.minX;
    while (x < CITY.maxX) {
      const width = 6 + rng.int(9);
      const cx = x + width / 2;
      const cz = z + depth / 2;
      x += width + (rng.chance(0.25) ? 2.5 + rng.next() * 2 : 0.4);
      if (nearRoad(cx, roadsX, 6 + width / 2) || nearRoad(cz, roadsZ, 5 + depth / 2)) continue;
      const dist = Math.hypot(cx, cz);
      // Thin out toward the river bank and at the edges.
      if (cz < CITY.riverNorth + 40 && rng.chance(0.5)) continue;
      if (grid.occupied(cx - width / 2, cz - depth / 2, cx + width / 2, cz + depth / 2)) continue;
      if (onLandmark(cx, cz, width, depth)) continue;
      // A few gaps become courtyards with trees.
      if (rng.chance(0.045)) continue;
      const tall = rng.chance(0.18) ? 2 : 0;
      const floors = 3 + rng.int(4) + tall - (dist > 450 ? 1 : 0);
      const detail = ROOFTOPS.some((r) => Math.hypot(cx - r.x, cz - r.z) < CITY.detailRadius) || dist < CITY.detailRadius;
      const b = makeBuilding(rng, cx, cz, width, depth, Math.max(2, floors), detail, nextSeed++);
      buildings.push(b);
      grid.add(b);
    }
    z += depth + (rng.chance(0.5) ? 3 + rng.next() * 2 : 0.4);
  }

  const heightAt = (x: number, zz: number): number => {
    for (const b of grid.at(x, zz)) {
      if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(zz - b.z) <= b.d / 2) return b.h;
    }
    return 0;
  };
  const roofAt = (x: number, zz: number): { x: number; y: number; z: number } => {
    let best: Building | null = null;
    let bd = Infinity;
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (const b of grid.at(x + dx * CELL, zz + dz * CELL)) {
          if (b.w < 7 || b.d < 7) continue;
          const d = Math.hypot(b.x - x, b.z - zz);
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
    return best ? { x: best.x, y: best.h, z: best.z } : { x, y: heightAt(x, zz), z: zz };
  };

  // Rooftop dressing, people, lights.
  const props: Prop[] = [];
  const people: Person[] = [];
  const lightRuns: LightRun[] = [];
  const kiteRoofs: { x: number; y: number; z: number }[] = [];
  const fireBreathers: { x: number; y: number; z: number }[] = [];
  const djRoofs: { x: number; y: number; z: number }[] = [];
  const prng = rngFor(seed, 'props');
  buildings.forEach((b, roofIndex) => {
    const isPlayerRoof = roofIndex < ROOFTOPS.length;
    const y = b.h;
    const hx = b.w / 2 - 0.8;
    const hz = b.d / 2 - 0.8;
    const spot = (): [number, number] => [b.x + prng.signed() * hx, b.z + prng.signed() * hz];
    if (!b.detail) {
      if (prng.chance(0.35)) {
        const [px, pz] = spot();
        props.push({ kind: 'tank', x: px, y, z: pz, rot: prng.next() * 6.28, scale: 1, variant: prng.int(2) });
      }
      if (prng.chance(0.12)) kiteRoofs.push({ x: b.x, y: y + 1.3, z: b.z });
      return;
    }
    const add = (kind: PropKind, p: number, variant = 0, scale = 1): void => {
      if (!prng.chance(p)) return;
      const [px, pz] = spot();
      props.push({ kind, x: px, y, z: pz, rot: prng.next() * Math.PI * 2, scale, variant });
    };
    // Small things (washing, pots, chairs) only where the camera sees them up close; tanks,
    // antennas and flags make the skyline everywhere.
    const nearest = Math.min(...ROOFTOPS.map((r) => Math.hypot(b.x - r.x, b.z - r.z)));
    const close = nearest < 150;
    if (!isPlayerRoof) {
      add('tank', 0.7, prng.int(2));
      add('tank', 0.2, prng.int(2));
      add('antenna', 0.4);
      add('dish', 0.22);
      add('washing', close ? 0.35 : 0.04, prng.int(3));
      add('flag', nearest < 60 ? 0.7 : 0.3, prng.int(4));
      add('pots', close ? 0.3 : 0, prng.int(3));
      add('chair', close ? 0.25 : 0);
      add('banner', 0.08, prng.int(3));
    } else {
      // The player's roof: a tank behind, pots and a chair. The flags that show the wind fly from
      // the neighbours' roofs, where they read at a glance.
      props.push({ kind: 'tank', x: b.x + 4.5, y, z: b.z + 4.5, rot: 0, scale: 1, variant: 0 });
      props.push({ kind: 'pots', x: b.x - 5, y, z: b.z - 4.5, rot: 0.3, scale: 1, variant: 1 });
      props.push({ kind: 'chair', x: b.x + 3, y, z: b.z + 2.5, rot: 2.4, scale: 1, variant: 0 });
    }
    // String lights along the parapet for the night.
    if (isPlayerRoof || prng.chance(0.38)) {
      const side = prng.int(4);
      const ex = b.w / 2 - 0.15;
      const ez = b.d / 2 - 0.15;
      const corners = [
        [b.x - ex, b.z - ez],
        [b.x + ex, b.z - ez],
        [b.x + ex, b.z + ez],
        [b.x - ex, b.z + ez],
      ];
      for (let s = 0; s < (isPlayerRoof ? 4 : 2); s++) {
        const a = corners[(side + s) % 4] as number[];
        const c = corners[(side + s + 1) % 4] as number[];
        lightRuns.push({
          ax: a[0] as number,
          ay: y + 1.15,
          az: a[1] as number,
          bx: c[0] as number,
          by: y + 1.15,
          bz: c[1] as number,
        });
      }
    }
    // People: families on most roofs.
    const seen = ROOFTOPS.some((r) => Math.hypot(b.x - r.x, b.z - r.z) < 190);
    if (!isPlayerRoof && prng.chance(seen ? 0.45 : 0.05)) {
      const count = 1 + prng.int(seen ? 4 : 1);
      for (let i = 0; i < count; i++) {
        const [px, pz] = spot();
        const flying = i === 0 && prng.chance(0.5);
        people.push({
          x: px,
          y,
          z: pz,
          rot: Math.PI + prng.signed() * 0.8,
          body: prng.int(4),
          anim: flying ? 1 : prng.chance(0.15) ? 2 : 0,
          roof: roofIndex,
        });
        if (flying) kiteRoofs.push({ x: px, y: y + 1.4, z: pz });
      }
    }
    if (!isPlayerRoof && b.z < -120 && b.z > -480 && Math.abs(b.x) < 260 && fireBreathers.length < 4 && prng.chance(0.03)) {
      fireBreathers.push({ x: b.x, y, z: b.z });
      people.push({ x: b.x, y, z: b.z, rot: Math.PI, body: 3, anim: 3, roof: roofIndex });
    }
    if (!isPlayerRoof && b.z < -60 && djRoofs.length < 3 && prng.chance(0.012)) {
      djRoofs.push({ x: b.x, y, z: b.z });
      props.push({ kind: 'speaker', x: b.x + 2, y, z: b.z, rot: Math.PI, scale: 1, variant: 0 });
      props.push({ kind: 'speaker', x: b.x - 2, y, z: b.z, rot: Math.PI, scale: 1, variant: 0 });
      props.push({ kind: 'dj', x: b.x, y, z: b.z + 1.5, rot: Math.PI, scale: 1, variant: 0 });
    }
  });

  // Trees: in courtyards and along the river bank.
  const trees: Tree[] = [];
  const trng = rngFor(seed, 'trees');
  for (let i = 0; i < 420; i++) {
    const tx = trng.range(CITY.minX, CITY.maxX);
    const tz = trng.range(CITY.minZ, CITY.maxZ);
    if (heightAt(tx, tz) > 0) continue;
    const nearRiver = tz < CITY.riverNorth + 80;
    const kind: TreeKind = nearRiver
      ? trng.chance(0.7)
        ? 'coconut'
        : 'banana'
      : trng.chance(0.55)
        ? 'rain'
        : trng.chance(0.6)
          ? 'coconut'
          : 'banana';
    trees.push({ kind, x: tx, y: 0, z: tz, scale: 0.8 + trng.next() * 0.5, rot: trng.next() * 6.28 });
    if (trees.length > 140) break;
  }
  // Bank of palms facing the river.
  for (let x = CITY.minX; x < CITY.maxX; x += 22 + trng.int(30)) {
    trees.push({
      kind: 'coconut',
      x,
      y: 0,
      z: CITY.riverNorth + 6 + trng.next() * 10,
      scale: 0.9 + trng.next() * 0.4,
      rot: trng.next() * 6.28,
    });
  }

  // Street lamps where lanes meet.
  const lamps: { x: number; y: number; z: number }[] = [];
  for (const rx of roadsX)
    for (const rz of roadsZ) {
      if (Math.hypot(rx, rz) > 700) continue;
      lamps.push({ x: rx + 3, y: 6.5, z: rz + 3 });
    }
  const lrng = rngFor(seed, 'lamps');
  for (let i = 0; i < 160; i++) {
    const lx = lrng.range(CITY.minX, CITY.maxX);
    const lz = lrng.range(CITY.minZ, CITY.maxZ);
    if (heightAt(lx, lz) === 0) lamps.push({ x: lx, y: 5.5, z: lz });
  }

  return {
    buildings,
    props,
    trees,
    people,
    lamps,
    lightRuns,
    fireBreathers,
    djRoofs,
    kiteRoofs,
    river: { north: CITY.riverNorth, south: CITY.riverSouth },
    heightAt,
    roofAt,
  };
}
