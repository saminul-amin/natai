// Colour-grading tables, one per phase of the day (DESIGN.md 5.4). They apply to the AgX-tone-mapped
// image, whose base look is deliberately flat, so each table adds back contrast and saturation and
// sets the phase's colour: a clear afternoon, an orange golden hour, a violet dusk, an indigo night
// with lantern-gold highlights.
import type { DayPhase } from '../types';

export const LUT_SIZE = 32;

export interface Grade {
  /** S-curve strength around mid grey. */
  contrast: number;
  saturation: number;
  /** Multiplier per channel on the whole image (white balance). */
  balance: [number, number, number];
  /** Colour added to shadows and to highlights (split toning). */
  shadows: [number, number, number];
  highlights: [number, number, number];
  /** Raises the black point. */
  lift: number;
  /** Overall brightness multiplier, applied last. */
  gain: number;
}

export const GRADES: Readonly<Record<DayPhase, Grade>> = {
  afternoon: {
    contrast: 1.18,
    saturation: 1.32,
    balance: [1.02, 1.0, 0.97],
    shadows: [-0.01, 0.0, 0.025],
    highlights: [0.025, 0.015, -0.01],
    lift: 0.012,
    gain: 1.03,
  },
  golden: {
    contrast: 1.24,
    saturation: 1.42,
    balance: [1.08, 0.99, 0.88],
    shadows: [0.0, -0.01, 0.035],
    highlights: [0.06, 0.025, -0.03],
    lift: 0.015,
    gain: 1.04,
  },
  dusk: {
    contrast: 1.2,
    saturation: 1.38,
    balance: [1.03, 0.95, 1.04],
    shadows: [0.03, -0.01, 0.06],
    highlights: [0.05, 0.01, 0.0],
    lift: 0.018,
    gain: 1.06,
  },
  night: {
    contrast: 1.26,
    saturation: 1.4,
    balance: [0.98, 0.97, 1.06],
    shadows: [0.0, 0.005, 0.05],
    highlights: [0.07, 0.035, -0.02],
    lift: 0.02,
    gain: 1.08,
  },
};

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Grades one display-referred colour. */
export function gradeColor(g: Grade, r: number, gr: number, b: number): [number, number, number] {
  let c: [number, number, number] = [r * g.balance[0], gr * g.balance[1], b * g.balance[2]];
  const luma = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  // Saturation around luma.
  c = c.map((x) => luma + (x - luma) * g.saturation) as [number, number, number];
  // Split toning weighted by luma.
  const sw = 1 - clamp01(luma * 2);
  const hw = clamp01(luma * 2 - 1);
  c = c.map((x, i) => x + (g.shadows[i] as number) * sw + (g.highlights[i] as number) * hw) as [number, number, number];
  // Contrast: a smooth S-curve that keeps 0 and 1 fixed.
  c = c.map((x) => {
    const v = clamp01(x);
    const k = g.contrast;
    return v < 0.5 ? 0.5 * Math.pow(2 * v, k) : 1 - 0.5 * Math.pow(2 - 2 * v, k);
  }) as [number, number, number];
  c = c.map((x) => clamp01((g.lift + x * (1 - g.lift)) * g.gain)) as [number, number, number];
  return c;
}

/** A LUT_SIZE³ RGBA8 table, red fastest, then green, then blue (the layout Data3DTexture expects). */
export function gradingTable(phase: DayPhase, size = LUT_SIZE): Uint8Array {
  const g = GRADES[phase];
  const data = new Uint8Array(size * size * size * 4);
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const out = gradeColor(g, ri / (size - 1), gi / (size - 1), bi / (size - 1));
        const i = ((bi * size + gi) * size + ri) * 4;
        data[i] = Math.round(out[0] * 255);
        data[i + 1] = Math.round(out[1] * 255);
        data[i + 2] = Math.round(out[2] * 255);
        data[i + 3] = 255;
      }
    }
  }
  return data;
}
