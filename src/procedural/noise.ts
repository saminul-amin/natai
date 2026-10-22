// Tileable noise textures for clouds, flutter and wind (DESIGN.md 9), generated as raw pixels so they
// are testable without a GPU and cost nothing to ship.
import { hash01 } from '../sim/rng';

function tileValue(seed: number, x: number, y: number, period: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (a: number) => ((a % period) + period) % period;
  const v00 = hash01(seed, w(ix), w(iy));
  const v10 = hash01(seed, w(ix + 1), w(iy));
  const v01 = hash01(seed, w(ix), w(iy + 1));
  const v11 = hash01(seed, w(ix + 1), w(iy + 1));
  return v00 + (v10 - v00) * sx + (v01 - v00) * sy + (v00 - v10 - v01 + v11) * sx * sy;
}

/** Tileable fractal value noise in [0, 1], `octaves` doublings starting at `base` cells across. */
export function fbmTile(seed: number, u: number, v: number, base: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = base;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tileValue(seed + o * 101, u * freq, v * freq, freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * A square RGBA8 tile with four independent noise channels:
 * R: broad fbm (cloud coverage), G: fine fbm (cloud detail), B: streaky cirrus, A: high-frequency (flutter, glints).
 */
export function noiseTexture(seed: number, size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      const broad = fbmTile(seed, u, v, 4, 5);
      const fine = fbmTile(seed + 7, u, v, 16, 4);
      // Cirrus: noise stretched along one axis, sharpened into filaments.
      const streak = fbmTile(seed + 13, u, v * 0.25 + fbmTile(seed + 17, u, v, 3, 2) * 0.15, 8, 4);
      const hf = fbmTile(seed + 23, u, v, 64, 2);
      data[i] = Math.round(broad * 255);
      data[i + 1] = Math.round(fine * 255);
      data[i + 2] = Math.round(Math.pow(streak, 1.6) * 255);
      data[i + 3] = Math.round(hf * 255);
    }
  }
  return data;
}
