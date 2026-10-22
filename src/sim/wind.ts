// The wind field (DESIGN.md 4.2): a slowly turning base wind, gusts, a height profile that is weak at
// the roofs and strong aloft, and turbulence that is strongest just above the buildings. A pure
// function of seed, position and time.
import { noise1, noise3 } from './rng';

export interface WindParams {
  seed: number;
  /** Mean speed in m/s at 60 m above the roofs. */
  speed: number;
  /** Mean direction the wind blows toward, radians in the world XZ plane; 0 blows toward -Z. */
  direction: number;
  /** Mean roof height of the city, metres. */
  roof: number;
}

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const defaultWind = (seed: number): WindParams => ({ seed, speed: 6.5, direction: 0, roof: 16 });

const Z0 = 1.5;
const REF = Math.log(60 / Z0 + 1);

/** Direction (radians) the base wind blows toward at a time, without gusts or turbulence. */
export function windDirection(p: WindParams, t: number): number {
  return p.direction + 0.32 * noise1(p.seed + 11, t / 95) + 0.12 * noise1(p.seed + 12, t / 23);
}

/** Speed multiplier of the base wind from slow variation and gusts. */
export function gustFactor(p: WindParams, t: number): number {
  const slow = 0.18 * noise1(p.seed + 21, t / 47);
  const g = Math.max(0, noise1(p.seed + 22, t / 5.5));
  return Math.max(0.35, 1 + slow + 0.45 * g * g);
}

/** Height profile: 0.15 at the roofs, 1 at 60 m above them, slowly rising past that. */
export function heightProfile(p: WindParams, y: number): number {
  const h = Math.max(0, y - p.roof);
  return Math.min(1.35, Math.max(0.15, Math.log(h / Z0 + 1) / REF));
}

/** Wind velocity at a point and time, written into `out`. */
export function windAt(p: WindParams, x: number, y: number, z: number, t: number, out: V3): V3 {
  const dir = windDirection(p, t);
  const speed = p.speed * gustFactor(p, t) * heightProfile(p, y);
  const dx = Math.sin(dir);
  const dz = -Math.cos(dir);
  // Turbulence is advected with the mean wind so eddies travel downwind instead of flickering.
  const h = Math.max(0, y - p.roof);
  const amp = (0.55 * Math.exp(-h / 14) + 0.07) * p.speed;
  const s = 1 / 16;
  const ax = (x - dx * p.speed * t) * s;
  const ay = y * s;
  const az = (z - dz * p.speed * t) * s;
  out.x = dx * speed + amp * noise3(p.seed + 31, ax, ay, az + t * 0.05);
  out.y = amp * 0.6 * noise3(p.seed + 32, ax + 17.3, ay, az);
  out.z = dz * speed + amp * noise3(p.seed + 33, ax, ay + 9.1, az);
  return out;
}
