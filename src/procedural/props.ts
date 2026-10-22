// Roof props, trees, lamps and lanterns (DESIGN.md 5.7, 9), generated in code. Every geometry carries
// vertex colours and a `sway` weight (0 rigid, 1 free) so one material can draw them all and the wind
// can move flags, washing, leaves and fronds.
import {
  BoxGeometry,
  BufferAttribute,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PropKind, TreeKind } from './city';

type RGB = [number, number, number];

/** Gives a geometry flat vertex colours and a sway weight, and drops attributes merging cannot match. */
export function paint(g: BufferGeometry, c: RGB, sway = 0, swayByHeight = false): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const sw = new Float32Array(n);
  const pos = geo.getAttribute('position');
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
  }
  for (let i = 0; i < n; i++) {
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
    sw[i] = swayByHeight ? sway * ((pos.getY(i) - minY) / Math.max(1e-3, maxY - minY)) : sway;
  }
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setAttribute('sway', new BufferAttribute(sw, 1));
  if (!geo.getAttribute('uv')) geo.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2));
  for (const name of Object.keys(geo.attributes))
    if (!['position', 'normal', 'uv', 'color', 'sway'].includes(name)) geo.deleteAttribute(name);
  return geo;
}

const at = (g: BufferGeometry, x: number, y: number, z: number): BufferGeometry => g.translate(x, y, z);

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const m = mergeGeometries(parts, false);
  if (!m) throw new Error('mergeGeometries failed');
  m.computeBoundingSphere();
  return m;
}

const CLOTH: RGB[] = [
  [0.82, 0.12, 0.3],
  [0.96, 0.66, 0.12],
  [0.1, 0.45, 0.7],
  [0.92, 0.9, 0.84],
  [0.2, 0.6, 0.3],
  [0.55, 0.2, 0.6],
];

function tank(variant: number): BufferGeometry {
  const body: RGB = variant === 0 ? [0.08, 0.08, 0.09] : [0.2, 0.42, 0.72];
  return merge([
    paint(at(new BoxGeometry(1.7, 0.5, 1.7), 0, 0.25, 0), [0.62, 0.6, 0.56]),
    paint(at(new CylinderGeometry(0.75, 0.75, 1.35, 9, 1, true), 0, 1.18, 0), body),
    paint(at(new CylinderGeometry(0.28, 0.32, 0.14, 10), 0, 1.92, 0), body.map((c) => c * 0.8) as RGB),
  ]);
}

function antenna(): BufferGeometry {
  const metal: RGB = [0.55, 0.56, 0.58];
  const parts = [paint(at(new CylinderGeometry(0.03, 0.04, 4, 5), 0, 2, 0), metal)];
  for (let i = 0; i < 5; i++) parts.push(paint(at(new BoxGeometry(1.6 - i * 0.22, 0.03, 0.03), 0, 3 + i * 0.22, 0), metal));
  return merge(parts);
}

function dish(): BufferGeometry {
  const d = new SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.35);
  d.rotateX(-Math.PI / 2 - 0.5);
  return merge([
    paint(at(new CylinderGeometry(0.04, 0.04, 1.2, 5), 0, 0.6, 0), [0.4, 0.4, 0.42]),
    paint(at(d, 0, 1.25, 0), [0.88, 0.88, 0.86]),
  ]);
}

function washing(variant: number): BufferGeometry {
  const pole: RGB = [0.45, 0.4, 0.34];
  const parts = [
    paint(at(new CylinderGeometry(0.03, 0.03, 2.1, 5), -2.2, 1.05, 0), pole),
    paint(at(new CylinderGeometry(0.03, 0.03, 2.1, 5), 2.2, 1.05, 0), pole),
    paint(at(new BoxGeometry(4.4, 0.015, 0.015), 0, 2.05, 0), [0.2, 0.2, 0.2]),
  ];
  for (let i = 0; i < 5; i++) {
    const w = 0.55 + ((i * 37 + variant * 11) % 5) * 0.08;
    const h = 0.7 + ((i * 13 + variant * 7) % 4) * 0.18;
    const cloth = paint(new PlaneGeometry(w, h, 2, 3), CLOTH[(i + variant * 2) % CLOTH.length] as RGB, 1, false);
    // Hanging cloth sways more at its hem: invert the height weighting.
    const pos = cloth.getAttribute('position');
    const sway = cloth.getAttribute('sway');
    for (let k = 0; k < pos.count; k++) sway.setX(k, 1 - (pos.getY(k) + h / 2) / h);
    parts.push(at(cloth, -1.7 + i * 0.85, 2.05 - h / 2, 0));
  }
  return merge(parts);
}

function flag(variant: number): BufferGeometry {
  const pole = paint(at(new CylinderGeometry(0.035, 0.05, 5.5, 5), 0, 2.75, 0), [0.62, 0.52, 0.32]);
  const colors: RGB[] = [
    [0.84, 0.12, 0.16],
    [0.98, 0.72, 0.1],
    [0.0, 0.42, 0.25],
    [0.85, 0.18, 0.5],
  ];
  // The flag extends along -z, the direction the wind blows.
  const f = paint(
    new PlaneGeometry(1.4, 0.9, 6, 3).rotateY(Math.PI / 2).translate(0, 0, -0.7),
    colors[variant % colors.length] as RGB,
    1,
  );
  const pos = f.getAttribute('position');
  const sway = f.getAttribute('sway');
  for (let k = 0; k < pos.count; k++) sway.setX(k, Math.min(1, -pos.getZ(k) / 1.4));
  const parts = [pole, at(f, 0, 5.0, 0)];
  if (variant === 2) {
    // A red disc on green, the national colours flown on many roofs.
    const disc = paint(new CylinderGeometry(0.22, 0.22, 0.01, 12).rotateZ(Math.PI / 2), [0.85, 0.1, 0.15], 0.6);
    parts.push(at(disc, 0.01, 5.0, -0.62));
  }
  return merge(parts);
}

function pots(variant: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.55;
    parts.push(paint(at(new CylinderGeometry(0.2, 0.14, 0.32, 8), x, 0.16, 0), [0.62, 0.3, 0.18]));
    const plant = new IcosahedronGeometry(0.28 + ((i + variant) % 3) * 0.06, 0);
    parts.push(paint(at(plant, x, 0.55, 0), [0.18 + 0.05 * i, 0.45 + 0.05 * variant, 0.16], 0.3));
  }
  return merge(parts);
}

function chair(): BufferGeometry {
  const c: RGB = [0.75, 0.12, 0.12];
  return merge([
    paint(at(new BoxGeometry(0.46, 0.05, 0.44), 0, 0.45, 0), c),
    paint(at(new BoxGeometry(0.46, 0.45, 0.05), 0, 0.7, -0.2), c),
    paint(at(new BoxGeometry(0.05, 0.45, 0.05), -0.2, 0.22, -0.18), c),
    paint(at(new BoxGeometry(0.05, 0.45, 0.05), 0.2, 0.22, -0.18), c),
    paint(at(new BoxGeometry(0.05, 0.45, 0.05), -0.2, 0.22, 0.18), c),
    paint(at(new BoxGeometry(0.05, 0.45, 0.05), 0.2, 0.22, 0.18), c),
  ]);
}

function banner(variant: number): BufferGeometry {
  const pole: RGB = [0.5, 0.42, 0.3];
  const colors: RGB[] = [
    [0.85, 0.15, 0.4],
    [0.1, 0.5, 0.55],
    [0.95, 0.6, 0.1],
  ];
  const cloth = paint(new PlaneGeometry(3, 0.9, 6, 2), colors[variant % 3] as RGB, 0.5);
  return merge([
    paint(at(new CylinderGeometry(0.04, 0.04, 2.6, 5), -1.5, 1.3, 0), pole),
    paint(at(new CylinderGeometry(0.04, 0.04, 2.6, 5), 1.5, 1.3, 0), pole),
    at(cloth, 0, 2.1, 0),
  ]);
}

function speaker(): BufferGeometry {
  const black: RGB = [0.06, 0.06, 0.07];
  return merge([
    paint(at(new BoxGeometry(0.9, 1.0, 0.7), 0, 0.5, 0), black),
    paint(at(new BoxGeometry(0.8, 0.9, 0.65), 0, 1.45, 0), black),
    paint(at(new CylinderGeometry(0.28, 0.28, 0.05, 12).rotateX(Math.PI / 2), 0, 0.5, 0.36), [0.2, 0.2, 0.22]),
  ]);
}

function dj(): BufferGeometry {
  return merge([
    paint(at(new BoxGeometry(2, 0.9, 0.8), 0, 0.45, 0), [0.1, 0.1, 0.12]),
    paint(at(new BoxGeometry(1.6, 0.06, 0.5), 0, 0.93, 0), [0.25, 0.25, 0.3]),
  ]);
}

export function propGeometry(kind: PropKind, variant: number): BufferGeometry {
  switch (kind) {
    case 'tank':
      return tank(variant);
    case 'antenna':
      return antenna();
    case 'dish':
      return dish();
    case 'washing':
      return washing(variant);
    case 'flag':
      return flag(variant);
    case 'pots':
      return pots(variant);
    case 'chair':
      return chair();
    case 'banner':
      return banner(variant);
    case 'speaker':
      return speaker();
    case 'dj':
      return dj();
  }
}

/** Number of variants per prop kind (each variant is its own instanced mesh). */
export const PROP_VARIANTS: Readonly<Record<PropKind, number>> = {
  tank: 2,
  antenna: 1,
  dish: 1,
  washing: 3,
  flag: 4,
  pots: 3,
  chair: 1,
  banner: 3,
  speaker: 1,
  dj: 1,
};

export function treeGeometry(kind: TreeKind): BufferGeometry {
  const bark: RGB = [0.32, 0.25, 0.19];
  if (kind === 'rain') {
    // Rain tree: a short trunk and a wide, flat umbrella of canopy.
    const parts = [paint(at(new CylinderGeometry(0.35, 0.55, 6, 7), 0, 3, 0), bark)];
    const greens: RGB[] = [
      [0.2, 0.36, 0.14],
      [0.24, 0.42, 0.16],
      [0.17, 0.32, 0.12],
    ];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = i === 0 ? 0 : 3.2 + (i % 3);
      const blob = new IcosahedronGeometry(2.6 + (i % 2) * 0.8, 1);
      blob.scale(1, 0.55, 1);
      parts.push(paint(at(blob, Math.cos(a) * r, 7 + (i % 3) * 0.6, Math.sin(a) * r), greens[i % 3] as RGB, 0.35));
    }
    return merge(parts);
  }
  if (kind === 'coconut') {
    // A slightly leaning trunk and a crown of drooping fronds.
    const parts: BufferGeometry[] = [];
    const segs = 6;
    let x = 0;
    for (let i = 0; i < segs; i++) {
      const s = new CylinderGeometry(0.17, 0.2, 2.2, 6);
      x += 0.12 * i * 0.3;
      parts.push(paint(at(s, x, 1.1 + i * 2.1, 0), [0.42, 0.36, 0.28], (i / segs) * 0.15));
    }
    const top = 12.8;
    for (let i = 0; i < 9; i++) {
      const frond = new PlaneGeometry(0.9, 4.2, 1, 6);
      // Bend the frond down along its length.
      const pos = frond.getAttribute('position');
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k) + 2.1;
        pos.setXYZ(k, pos.getX(k) * (1 - y / 6), -0.12 * y * y, y);
      }
      frond.rotateY((i / 9) * Math.PI * 2);
      const painted = paint(frond, [0.22, 0.42 + (i % 3) * 0.04, 0.14], 1, false);
      const sway = painted.getAttribute('sway');
      const fp = painted.getAttribute('position');
      for (let k = 0; k < sway.count; k++) sway.setX(k, Math.min(1, Math.hypot(fp.getX(k), fp.getZ(k)) / 4));
      parts.push(at(painted, x, top, 0));
    }
    parts.push(paint(at(new SphereGeometry(0.45, 6, 4), x, top - 0.2, 0), [0.35, 0.3, 0.12]));
    return merge(parts);
  }
  // Banana: a soft trunk and a few huge paddle leaves.
  const parts = [paint(at(new CylinderGeometry(0.16, 0.22, 2.6, 6), 0, 1.3, 0), [0.4, 0.45, 0.22])];
  for (let i = 0; i < 6; i++) {
    const leaf = new PlaneGeometry(0.9, 2.6, 1, 4);
    const pos = leaf.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k) + 1.3;
      pos.setXYZ(k, pos.getX(k), y * 0.6 - 0.08 * y * y, y * 0.75);
    }
    leaf.rotateY((i / 6) * Math.PI * 2 + 0.3);
    parts.push(at(paint(leaf, [0.3, 0.55, 0.18], 0.9, true), 0, 2.5, 0));
  }
  return merge(parts);
}

export function lampGeometry(): BufferGeometry {
  return merge([
    paint(at(new CylinderGeometry(0.06, 0.08, 6, 6), 0, 3, 0), [0.3, 0.32, 0.3]),
    paint(at(new BoxGeometry(0.9, 0.08, 0.1), 0.4, 6, 0), [0.3, 0.32, 0.3]),
  ]);
}

/** A sky lantern: a paper bag, open at the bottom. */
export function fanushGeometry(): BufferGeometry {
  const bag = new CylinderGeometry(0.42, 0.3, 1.1, 10, 2, true);
  return paint(at(bag, 0, 0.55, 0), [1, 0.85, 0.6]);
}

export function bulbGeometry(): BufferGeometry {
  return paint(new SphereGeometry(0.06, 5, 3), [1, 1, 1]);
}

// ------------------------------------------------------------------------------------------------
// Landmarks, as silhouettes and low-detail models (DESIGN.md 5.7).

/** Ahsan Manzil: the pink palace on the river, with its arcades, grand stair and central dome. */
export function ahsanManzil(): BufferGeometry {
  const pink: RGB = [0.86, 0.5, 0.56];
  const light: RGB = [0.94, 0.78, 0.78];
  const parts: BufferGeometry[] = [];
  parts.push(paint(at(new BoxGeometry(124, 9, 22), 0, 4.5, 0), pink));
  parts.push(paint(at(new BoxGeometry(124, 8, 20), 0, 13, 0), pink));
  parts.push(paint(at(new BoxGeometry(126, 0.8, 24), 0, 9.2, 0), light));
  parts.push(paint(at(new BoxGeometry(126, 1.2, 24), 0, 17.4, 0), light));
  // Arcade columns along the front of both floors.
  for (let i = -15; i <= 15; i++) {
    for (const y of [4.5, 13]) parts.push(paint(at(new BoxGeometry(0.9, 8, 0.9), i * 4, y, 11.6), light));
  }
  // Central drum and dome.
  parts.push(paint(at(new CylinderGeometry(7, 7, 6, 16), 0, 21, 0), pink));
  const dome = new SphereGeometry(7.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  parts.push(paint(at(dome, 0, 24, 0), pink));
  parts.push(paint(at(new ConeGeometry(0.6, 3, 8), 0, 32.5, 0), [0.9, 0.75, 0.4]));
  // Grand stair down toward the river.
  for (let s = 0; s < 8; s++)
    parts.push(paint(at(new BoxGeometry(22 - s * 1.2, 1.1, 2), 0, 0.55 + s * 1.1, -12 - (8 - s) * 1.6), light));
  return merge(parts);
}

/** A mosque with white domes and four minarets, after the Star Mosque. */
export function mosque(): BufferGeometry {
  const white: RGB = [0.92, 0.92, 0.9];
  const parts: BufferGeometry[] = [paint(at(new BoxGeometry(24, 9, 14), 0, 4.5, 0), white)];
  for (const x of [-7, 0, 7]) {
    const d = new SphereGeometry(x === 0 ? 4.4 : 3.4, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    parts.push(paint(at(d, x, 9, 0), [0.9, 0.92, 0.95]));
    parts.push(paint(at(new ConeGeometry(0.3, 2, 6), x, x === 0 ? 14.4 : 13.4, 0), [0.85, 0.7, 0.3]));
  }
  for (const [x, z] of [
    [-12, -7],
    [12, -7],
    [-12, 7],
    [12, 7],
  ] as [number, number][]) {
    parts.push(minaret(x, z, 16));
  }
  return merge(parts);
}

export function minaret(x = 0, z = 0, h = 26): BufferGeometry {
  const c: RGB = [0.93, 0.92, 0.88];
  return merge([
    paint(at(new CylinderGeometry(1.1, 1.3, h, 8), x, h / 2, z), c),
    paint(at(new CylinderGeometry(1.6, 1.6, 0.5, 8), x, h * 0.7, z), c),
    paint(at(new CylinderGeometry(0.9, 1.1, 2.5, 8), x, h + 1.25, z), c),
    paint(at(new SphereGeometry(1.0, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), x, h + 2.5, z), [0.25, 0.6, 0.45]),
    paint(at(new ConeGeometry(0.15, 1.6, 5), x, h + 4.1, z), [0.85, 0.7, 0.3]),
  ]);
}

/** Sadarghat launch terminal: a long low hall with a canopy over the pontoons. */
export function terminal(): BufferGeometry {
  return merge([
    paint(at(new BoxGeometry(160, 9, 26), 0, 4.5, 0), [0.75, 0.78, 0.8]),
    paint(at(new BoxGeometry(170, 1, 34), 0, 9.5, -2), [0.25, 0.45, 0.65]),
    paint(at(new BoxGeometry(150, 1.5, 14), 0, 0.2, -24), [0.3, 0.3, 0.32]),
  ]);
}

/** A multi-deck river launch, the Sadarghat double- and triple-deckers. */
export function launch(variant: number): BufferGeometry {
  const stripe: RGB = variant === 0 ? [0.8, 0.15, 0.18] : [0.15, 0.35, 0.75];
  const white: RGB = [0.92, 0.92, 0.9];
  const parts: BufferGeometry[] = [paint(at(new BoxGeometry(14, 3, 70), 0, 1, 0), [0.2, 0.2, 0.22])];
  for (let d = 0; d < 3; d++) {
    parts.push(paint(at(new BoxGeometry(13 - d, 2.4, 60 - d * 8), 0, 3.8 + d * 2.6, 2), white));
    parts.push(paint(at(new BoxGeometry(13.1 - d, 0.35, 60.2 - d * 8), 0, 3.2 + d * 2.6, 2), stripe));
  }
  parts.push(paint(at(new BoxGeometry(4, 2, 5), 0, 12.4, -16), white));
  return merge(parts);
}

/** A wooden country boat (nouka) with its rounded hood. */
export function boat(): BufferGeometry {
  const hull = new CylinderGeometry(1.1, 1.1, 9, 8, 1, false, 0, Math.PI);
  hull.rotateZ(Math.PI / 2);
  hull.rotateX(Math.PI);
  hull.rotateY(Math.PI / 2);
  const hood = new CylinderGeometry(0.9, 0.9, 3, 8, 1, true, 0, Math.PI);
  hood.rotateX(Math.PI / 2);
  return merge([paint(at(hull, 0, 0.6, 0), [0.35, 0.22, 0.12]), paint(at(hood, 0, 1.2, 0), [0.3, 0.26, 0.2])]);
}

/** The Buriganga road bridge: deck on piers across the river. */
export function bridge(length: number): BufferGeometry {
  const concrete: RGB = [0.62, 0.6, 0.57];
  const parts: BufferGeometry[] = [paint(at(new BoxGeometry(18, 1.6, length), 0, 18, 0), concrete)];
  for (let z = -length / 2 + 20; z < length / 2; z += 45) parts.push(paint(at(new BoxGeometry(10, 18, 4), 0, 9, z), concrete));
  parts.push(paint(at(new BoxGeometry(0.3, 1.1, length), -8.8, 19.3, 0), [0.75, 0.72, 0.68]));
  parts.push(paint(at(new BoxGeometry(0.3, 1.1, length), 8.8, 19.3, 0), [0.75, 0.72, 0.68]));
  return merge(parts);
}
