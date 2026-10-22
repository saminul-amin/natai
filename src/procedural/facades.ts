// The façade atlas (DESIGN.md 5.7, 9): twelve façade modules, two ground-floor shopfronts, a roof tile
// and a parapet tile, each one 3 m bay of one floor of an Old Dhaka building. Painted per pixel, so it
// ships as code. RGB is colour, A marks plaster (which takes the building's tint). A second texture
// marks window glass for the lights that come on at night.
import { hash01 } from '../sim/rng';

export const TILE = 256;
export const ATLAS_TILES = 4;
export const ATLAS_SIZE = TILE * ATLAS_TILES;

export const FACADE_COUNT = 12;
export const SHOP_TILES = [12, 13] as const;
export const ROOF_TILE = 14;
export const PARAPET_TILE = 15;

type RGB = [number, number, number];

interface Pixel {
  c: RGB;
  /** 1 where plaster shows (tinted by the building colour). */
  plaster: number;
  /** 1 where window glass is (lit at night). */
  glass: number;
}

const rect = (u: number, v: number, x0: number, y0: number, x1: number, y1: number): boolean =>
  u >= x0 && u <= x1 && v >= y0 && v <= y1;

const PLASTER: RGB = [222, 214, 198];
const SHUTTER_GREEN: RGB = [58, 112, 82];
const GRILLE_BLUE: RGB = [52, 92, 140];
const DARK: RGB = [34, 30, 32];
const GLASS: RGB = [58, 66, 74];

function windowFrame(
  u: number,
  v: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  inner: (u: number, v: number) => Pixel,
): Pixel | null {
  if (!rect(u, v, x0 - 0.025, y0 - 0.035, x1 + 0.025, y1 + 0.05)) return null;
  // Lintel and sill in raw concrete.
  if (v > y1 || v < y0) return { c: [176, 170, 160], plaster: 0, glass: 0 };
  if (u < x0 || u > x1) return { c: [150, 146, 140], plaster: 0, glass: 0 };
  return inner((u - x0) / (x1 - x0), (v - y0) / (y1 - y0));
}

const glassPane = (u: number, v: number, tint: RGB = GLASS): Pixel => {
  const sheen = 0.85 + 0.3 * Math.max(0, 1 - Math.abs(u - v) * 3);
  return { c: [tint[0] * sheen, tint[1] * sheen, tint[2] * sheen], plaster: 0, glass: 1 };
};

const grille = (u: number, v: number, color: RGB, pattern: number): boolean => {
  const bars = Math.abs(((u * 6) % 1) - 0.5) < 0.06;
  const rails = Math.abs(((v * 5) % 1) - 0.5) < 0.05;
  const diag = pattern > 0.5 && Math.abs(((u * 4 + v * 4) % 1) - 0.5) < 0.05;
  void color;
  return bars || rails || diag;
};

type Painter = (u: number, v: number, n: number) => Pixel;

const plain = (u: number, v: number, n: number): Pixel => {
  // Weathered plaster: stains run down from sills and the roof edge.
  const streak = Math.pow(hash01(7, Math.floor(u * 40)), 6) * (1 - v) * 0.35;
  const k = 1 - 0.12 * n - streak;
  return { c: [PLASTER[0] * k, PLASTER[1] * k, PLASTER[2] * k], plaster: 1, glass: 0 };
};

const PAINTERS: readonly Painter[] = [
  // 0: window with green wooden shutters, half open.
  (u, v, n) =>
    windowFrame(u, v, 0.28, 0.32, 0.72, 0.82, (x, y) => {
      if (x < 0.22 || x > 0.78)
        return { c: SHUTTER_GREEN.map((c) => c * (0.85 + 0.15 * Math.sin(y * 60))) as RGB, plaster: 0, glass: 0 };
      return glassPane(x, y);
    }) ?? plain(u, v, n),
  // 1: window behind a blue iron grille.
  (u, v, n) =>
    windowFrame(u, v, 0.25, 0.3, 0.75, 0.8, (x, y) =>
      grille(x, y, GRILLE_BLUE, 1) ? { c: GRILLE_BLUE, plaster: 0, glass: 0 } : glassPane(x, y),
    ) ?? plain(u, v, n),
  // 2: balcony: railing in front of a dark doorway.
  (u, v, n) => {
    if (rect(u, v, 0.08, 0.05, 0.92, 0.38)) {
      if (v > 0.34 || Math.abs(((u * 10) % 1) - 0.5) < 0.1) return { c: [70, 70, 76], plaster: 0, glass: 0 };
    }
    if (rect(u, v, 0.3, 0.05, 0.7, 0.85))
      return v > 0.05 && v < 0.82 ? { c: [44, 36, 34], plaster: 0, glass: 0.6 } : { c: [160, 150, 140], plaster: 0, glass: 0 };
    if (rect(u, v, 0.02, 0.0, 0.98, 0.06)) return { c: [180, 175, 168], plaster: 0, glass: 0 };
    return plain(u, v, n);
  },
  // 3: twin small windows and a window AC unit.
  (u, v, n) => {
    const w =
      windowFrame(u, v, 0.12, 0.42, 0.42, 0.8, (x, y) => glassPane(x, y)) ??
      windowFrame(u, v, 0.58, 0.42, 0.88, 0.8, (x, y) => glassPane(x, y));
    if (w) return w;
    if (rect(u, v, 0.6, 0.22, 0.86, 0.38)) return { c: [196, 196, 190], plaster: 0, glass: 0 };
    return plain(u, v, n);
  },
  // 4: colonial arched window with a coloured-glass fanlight.
  (u, v, n) => {
    const cx = 0.5;
    const archY = 0.68;
    const r = Math.hypot((u - cx) / 0.24, (v - archY) / 0.18);
    if (rect(u, v, 0.26, 0.25, 0.74, archY) || (v > archY && r < 1)) {
      if (v > archY) {
        const seg = Math.floor(((Math.atan2(v - archY, u - cx) / Math.PI) * 5) % 5);
        const fan: RGB[] = [
          [200, 60, 80],
          [230, 170, 50],
          [60, 140, 180],
          [80, 160, 90],
          [200, 60, 80],
        ];
        return { c: fan[seg] ?? fan[0]!, plaster: 0, glass: 1 };
      }
      return Math.abs(u - cx) < 0.015 ? { c: [90, 70, 60], plaster: 0, glass: 0 } : glassPane(u, v);
    }
    if (r < 1.18 && v > archY - 0.02) return { c: [200, 190, 175], plaster: 0, glass: 0 };
    return plain(u, v, n);
  },
  // 5: plain wall with a vent and heavy stains.
  (u, v, n) => {
    if (rect(u, v, 0.6, 0.62, 0.8, 0.74))
      return { c: Math.abs(((v * 24) % 1) - 0.5) < 0.2 ? DARK : [120, 116, 110], plaster: 0, glass: 0 };
    const p = plain(u, v, n + 0.6);
    return p;
  },
  // 6: window with laundry hanging in front.
  (u, v, n) => {
    const w = windowFrame(u, v, 0.3, 0.38, 0.7, 0.82, (x, y) => glassPane(x, y));
    const cloth: RGB[] = [
      [210, 50, 90],
      [240, 180, 40],
      [40, 120, 170],
      [230, 230, 220],
    ];
    if (Math.abs(v - 0.36) < 0.006 && u > 0.1 && u < 0.9) return { c: [60, 60, 60], plaster: 0, glass: 0 };
    for (let i = 0; i < 4; i++) {
      const x0 = 0.12 + i * 0.2;
      if (rect(u, v, x0, 0.12 + (i % 2) * 0.06, x0 + 0.14, 0.36)) return { c: cloth[i]!, plaster: 0, glass: 0 };
    }
    return w ?? plain(u, v, n);
  },
  // 7: yellow louvred shutters (jhilmil).
  (u, v, n) =>
    windowFrame(u, v, 0.27, 0.3, 0.73, 0.82, (x, y) => {
      const slat = 0.75 + 0.25 * Math.abs(Math.sin(y * 70));
      if (Math.abs(x - 0.5) < 0.012) return { c: [120, 90, 40], plaster: 0, glass: 0 };
      return { c: [228 * slat, 176 * slat, 60 * slat], plaster: 0, glass: y > 0.5 ? 0.4 : 0 };
    }) ?? plain(u, v, n),
  // 8: window with a painted signboard under it.
  (u, v, n) => {
    const w = windowFrame(u, v, 0.3, 0.5, 0.7, 0.85, (x, y) => glassPane(x, y));
    if (w) return w;
    if (rect(u, v, 0.08, 0.14, 0.92, 0.36)) {
      const stripe = Math.abs(v - 0.25) < 0.035 ? ([250, 240, 220] as RGB) : ([200, 40, 50] as RGB);
      return { c: stripe, plaster: 0, glass: 0 };
    }
    return plain(u, v, n);
  },
  // 9: glass window with a pink curtain.
  (u, v, n) =>
    windowFrame(u, v, 0.22, 0.32, 0.78, 0.8, (x, y) => {
      if (x < 0.4 + 0.05 * Math.sin(y * 20)) return { c: [226, 120, 150], plaster: 0, glass: 0.8 };
      return glassPane(x, y);
    }) ?? plain(u, v, n),
  // 10: unplastered brick wall with a small window.
  (u, v) => {
    const w = windowFrame(u, v, 0.36, 0.42, 0.64, 0.78, (x, y) =>
      grille(x, y, DARK, 0) ? { c: DARK, plaster: 0, glass: 0 } : glassPane(x, y),
    );
    if (w) return w;
    const row = Math.floor(v * 30);
    const col = Math.floor(u * 12 + (row % 2) * 0.5);
    const mortar = (v * 30) % 1 < 0.12 || (u * 12 + (row % 2) * 0.5) % 1 < 0.06;
    const k = 0.8 + 0.25 * hash01(11, col, row);
    return { c: mortar ? [160, 150, 140] : [150 * k, 70 * k, 52 * k], plaster: 0, glass: 0 };
  },
  // 11: balcony with potted plants.
  (u, v, n) => {
    if (rect(u, v, 0.08, 0.05, 0.92, 0.32)) {
      if (v > 0.28) return { c: [190, 184, 176], plaster: 0, glass: 0 };
      return { c: [200, 194, 186].map((c) => c * 0.9) as RGB, plaster: 1, glass: 0 };
    }
    for (let i = 0; i < 4; i++) {
      const cx = 0.18 + i * 0.21;
      if (Math.hypot(u - cx, (v - 0.4) * 1.3) < 0.09) return { c: [50 + i * 10, 120 + i * 8, 50], plaster: 0, glass: 0 };
    }
    if (rect(u, v, 0.3, 0.32, 0.7, 0.86)) return { c: [40, 34, 32], plaster: 0, glass: 0.5 };
    return plain(u, v, n);
  },
  // 12: ground-floor rolling shutter, half up, a lit shop behind.
  (u, v) => {
    if (rect(u, v, 0.06, 0.0, 0.94, 0.78)) {
      if (v > 0.4) {
        const rib = 0.75 + 0.25 * Math.abs(Math.sin(v * 160));
        return { c: [130 * rib, 134 * rib, 140 * rib], plaster: 0, glass: 0 };
      }
      return { c: [70, 52, 40], plaster: 0, glass: 1 };
    }
    if (rect(u, v, 0.0, 0.8, 1.0, 0.98)) return { c: [30, 110, 70], plaster: 0, glass: 0 };
    return { c: [170, 164, 156], plaster: 1, glass: 0 };
  },
  // 13: open shop with stacked colourful goods.
  (u, v) => {
    if (rect(u, v, 0.04, 0.0, 0.96, 0.76)) {
      const shelf = Math.floor(v * 6);
      const item = Math.floor(u * 9);
      const h = hash01(13, item, shelf);
      const goods: RGB = [120 + 120 * h, 60 + 150 * hash01(14, item, shelf), 40 + 160 * hash01(15, item, shelf)];
      return { c: (v * 6) % 1 < 0.12 ? [60, 40, 30] : goods, plaster: 0, glass: 0.7 };
    }
    if (rect(u, v, 0.0, 0.8, 1.0, 0.98)) return { c: [190, 40, 60], plaster: 0, glass: 0 };
    return { c: [170, 164, 156], plaster: 1, glass: 0 };
  },
  // 14: concrete roof with water stains.
  (u, v) => {
    const n =
      hash01(21, Math.floor(u * 64), Math.floor(v * 64)) * 0.08 + 0.12 * Math.max(0, Math.sin(u * 7 + v * 3) * Math.sin(v * 5));
    const k = 0.78 - n;
    return { c: [190 * k, 184 * k, 174 * k], plaster: 0, glass: 0 };
  },
  // 15: parapet with a pierced jaali pattern.
  (u, v, n) => {
    const holes = Math.abs(((u * 8) % 1) - 0.5) < 0.22 && Math.abs(((v * 3) % 1) - 0.5) < 0.25 && v > 0.15 && v < 0.85;
    if (holes) return { c: [40, 36, 36], plaster: 0, glass: 0 };
    return plain(u, v, n * 0.5);
  },
];

/** RGBA8 colour atlas (A = plaster mask) and an R8-in-RGBA8 glass mask, both ATLAS_SIZE². */
export function facadeAtlas(seed: number): { color: Uint8Array; glass: Uint8Array } {
  const color = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  const glass = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (let t = 0; t < ATLAS_TILES * ATLAS_TILES; t++) {
    const painter = PAINTERS[t] as Painter;
    const tx = (t % ATLAS_TILES) * TILE;
    const ty = Math.floor(t / ATLAS_TILES) * TILE;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const u = (x + 0.5) / TILE;
        const v = (y + 0.5) / TILE;
        // Grime: a little noise everywhere, darker near the bottom of each floor.
        const n = hash01(seed + t, x >> 2, y >> 2) * 0.5 + (1 - v) * 0.15;
        const p = painter(u, v, n);
        const i = ((ty + y) * ATLAS_SIZE + tx + x) * 4;
        const dirt = 0.92 + 0.08 * hash01(seed, x, y);
        color[i] = Math.min(255, Math.round(p.c[0] * dirt));
        color[i + 1] = Math.min(255, Math.round(p.c[1] * dirt));
        color[i + 2] = Math.min(255, Math.round(p.c[2] * dirt));
        color[i + 3] = Math.round(p.plaster * 255);
        glass[i] = Math.round(p.glass * 255);
        glass[i + 1] = 0;
        glass[i + 2] = 0;
        glass[i + 3] = 255;
      }
    }
  }
  return { color, glass };
}

/** UV rectangle of an atlas tile: [u0, v0, u1, v1], with a small inset against bleeding. */
export function tileRect(tile: number): [number, number, number, number] {
  const inset = 1.5 / ATLAS_SIZE;
  const s = 1 / ATLAS_TILES;
  const u0 = (tile % ATLAS_TILES) * s;
  const v0 = Math.floor(tile / ATLAS_TILES) * s;
  return [u0 + inset, v0 + inset, u0 + s - inset, v0 + s - inset];
}
