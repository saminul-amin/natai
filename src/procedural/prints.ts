// The eight kite prints (DESIGN.md 9), drawn per pixel as signed-distance shapes on tissue paper, with
// the bamboo spine and bow showing through. Raw RGBA8, so they are generated at load and testable.
import { hash01 } from '../sim/rng';

export const PRINT_SIZE = 256;

/** Kite-paper palette (DESIGN.md 2): magenta, saffron, teal, leaf green, indigo, lantern gold, and more. */
export const PALETTE = {
  magenta: [214, 36, 120],
  saffron: [246, 146, 30],
  teal: [18, 150, 150],
  leaf: [72, 168, 52],
  indigo: [40, 34, 110],
  gold: [250, 196, 64],
  white: [246, 240, 226],
  red: [212, 34, 40],
  black: [24, 20, 22],
  sky: [70, 150, 220],
  pink: [242, 120, 160],
} as const;

type RGB = readonly [number, number, number] | readonly number[];

const smoothEdge = (d: number, w = 0.006): number => Math.min(1, Math.max(0, 0.5 - d / w));

/** Signed distance to a circle. */
const circle = (u: number, v: number, cx: number, cy: number, r: number): number => Math.hypot(u - cx, v - cy) - r;

/** Signed distance to the diamond that fills the uv square (Manhattan ball). */
const diamond = (u: number, v: number, cx: number, cy: number, r: number): number => Math.abs(u - cx) + Math.abs(v - cy) - r;

type Painter = (u: number, v: number) => RGB;

function mix(a: RGB, b: RGB, t: number): number[] {
  return [0, 1, 2].map((i) => (a[i] as number) + ((b[i] as number) - (a[i] as number)) * t);
}

const PAINTERS: readonly Painter[] = [
  // 0 Chokhdar: a great eye on magenta.
  (u, v) => {
    let c: RGB = PALETTE.magenta;
    c = mix(c, PALETTE.saffron, smoothEdge(circle(u, v, 0.5, 0.52, 0.22)));
    c = mix(c, PALETTE.white, smoothEdge(circle(u, v, 0.5, 0.52, 0.17)));
    c = mix(c, PALETTE.indigo, smoothEdge(circle(u, v, 0.5, 0.52, 0.09)));
    c = mix(c, PALETTE.white, smoothEdge(circle(u, v, 0.47, 0.56, 0.025)));
    return c;
  },
  // 1 Goyadar: split saffron over indigo, with a gold disc on the seam.
  (u, v) => {
    let c: RGB = mix(PALETTE.indigo, PALETTE.saffron, smoothEdge(0.5 - v, 0.01));
    c = mix(c, PALETTE.gold, smoothEdge(circle(u, v, 0.5, 0.5, 0.1)));
    c = mix(c, PALETTE.magenta, smoothEdge(circle(u, v, 0.5, 0.5, 0.05)));
    return c;
  },
  // 2 Pandar: a betel leaf on teal.
  (u, v) => {
    let c: RGB = PALETTE.teal;
    // Heart: two circles and a point.
    const x = (u - 0.5) * 1.3;
    const y = (v - 0.47) * 1.3;
    const lobes = Math.min(circle(x, y, -0.09, 0.07, 0.12), circle(x, y, 0.09, 0.07, 0.12));
    const point = Math.abs(x) * 1.15 + Math.max(0, -y) * 0.9 - 0.2 + Math.max(0, y) * 2;
    const heart = Math.min(lobes, point);
    c = mix(c, PALETTE.white, smoothEdge(heart - 0.018));
    c = mix(c, PALETTE.leaf, smoothEdge(heart));
    c = mix(c, PALETTE.gold, smoothEdge(Math.abs(x) - 0.006) * smoothEdge(heart + 0.01));
    return c;
  },
  // 3 Lejdar: white with bands of magenta and saffron.
  (u, v) => {
    const band = Math.floor(v * 7);
    const colors: RGB[] = [
      PALETTE.white,
      PALETTE.magenta,
      PALETTE.white,
      PALETTE.saffron,
      PALETTE.white,
      PALETTE.magenta,
      PALETTE.white,
    ];
    let c: RGB = colors[band] ?? PALETTE.white;
    c = mix(c, PALETTE.indigo, smoothEdge(diamond(u, v, 0.5, 0.5, 0.08)));
    return c;
  },
  // 4 Chapalish: quarters of indigo and gold with a red cross.
  (u, v) => {
    const q = (u < 0.5 ? 0 : 1) ^ (v < 0.5 ? 0 : 1);
    let c: RGB = q ? PALETTE.gold : PALETTE.indigo;
    c = mix(c, PALETTE.red, smoothEdge(Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5)) - 0.035));
    return c;
  },
  // 5 Prajapati: butterfly wings, orange with dark veins and white spots.
  (u, v) => {
    const x = Math.abs(u - 0.5) * 2;
    const y = v;
    let c: RGB = mix(PALETTE.saffron, PALETTE.red, smoothEdge(-x + 0.25, 0.3));
    const vein = Math.abs(Math.sin(Math.atan2(y - 0.5, x) * 5)) * Math.hypot(x, y - 0.5);
    c = mix(c, PALETTE.black, smoothEdge(vein - 0.02) * smoothEdge(x - 0.96, 0.2));
    const spots = Math.min(circle(x, y, 0.75, 0.75, 0.05), circle(x, y, 0.82, 0.3, 0.04), circle(x, y, 0.6, 0.85, 0.035));
    c = mix(c, PALETTE.white, smoothEdge(spots));
    c = mix(c, PALETTE.black, smoothEdge(x - 0.05));
    return c;
  },
  // 6 Rocket: red and white stripes with a porthole.
  (u, v) => {
    let c: RGB = Math.floor(v * 10) % 2 === 0 ? PALETTE.red : PALETTE.white;
    c = mix(c, PALETTE.sky, smoothEdge(circle(u, v, 0.5, 0.62, 0.09)));
    c = mix(c, PALETTE.indigo, smoothEdge(Math.abs(circle(u, v, 0.5, 0.62, 0.09)) - 0.012));
    return c;
  },
  // 7 Baksh: box panels in leaf green and pink checks.
  (u, v) => {
    const check = (Math.floor(u * 4) + Math.floor(v * 4)) % 2 === 0;
    return check ? PALETTE.leaf : PALETTE.pink;
  },
];

export const PRINT_COUNT = PAINTERS.length;

/**
 * One print as RGBA8. Alpha carries the spine-and-bow mask (0 where bamboo crosses the paper), so the
 * kite material can darken the frame and let it show as a silhouette when backlit.
 */
export function printTexture(index: number, size = PRINT_SIZE, withFrame = true): Uint8Array {
  const painter = PAINTERS[index % PAINTERS.length] as Painter;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = 1 - (y + 0.5) / size;
      const c = painter(u, v);
      // Tissue paper: fibres and slight unevenness in the dye.
      const fibre =
        0.92 + 0.08 * hash01(index + 3, x, y) + 0.05 * Math.sin((u * 37 + v * 11) * 6.28) * hash01(index, x >> 3, y >> 3);
      // Darker paper fold along the diamond's edge.
      const edge = Math.max(0, Math.min(1, (diamond(u, v, 0.5, 0.5, 0.5) + 0.03) / 0.03));
      const shade = fibre * (1 - 0.25 * edge);
      let frame = 1;
      if (withFrame) {
        const spine = Math.abs(u - 0.5) - 0.006;
        const bowY = 0.62 + 0.2 * (1 - Math.pow(2 * u - 1, 2));
        const bow = Math.abs(v - bowY) - 0.006;
        frame = 1 - Math.max(smoothEdge(spine, 0.004), smoothEdge(bow, 0.004));
      }
      const i = (y * size + x) * 4;
      data[i] = Math.round(Math.min(255, (c[0] as number) * shade));
      data[i + 1] = Math.round(Math.min(255, (c[1] as number) * shade));
      data[i + 2] = Math.round(Math.min(255, (c[2] as number) * shade));
      data[i + 3] = Math.round(frame * 255);
    }
  }
  return data;
}
