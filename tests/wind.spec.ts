import { describe, expect, it } from 'vitest';
import { defaultWind, gustFactor, heightProfile, windAt, windDirection } from '../src/sim/wind';

const v = () => ({ x: 0, y: 0, z: 0 });
const speed = (w: { x: number; y: number; z: number }) => Math.hypot(w.x, w.y, w.z);

describe('wind field', () => {
  const p = defaultWind(1234);

  it('is deterministic for a seed, position and time', () => {
    const a = windAt(p, 10, 50, -40, 12.5, v());
    const b = windAt(p, 10, 50, -40, 12.5, v());
    expect(a).toEqual(b);
  });

  it('is weak at the roofs and strong aloft', () => {
    expect(heightProfile(p, p.roof)).toBeCloseTo(0.15, 5);
    expect(heightProfile(p, p.roof + 60)).toBeCloseTo(1, 5);
    let low = 0;
    let high = 0;
    for (let t = 0; t < 60; t += 0.5) {
      low += speed(windAt(p, 0, p.roof + 2, 0, t, v()));
      high += speed(windAt(p, 0, p.roof + 70, 0, t, v()));
    }
    expect(high).toBeGreaterThan(low * 2);
  });

  it('blows on average toward -Z, the player facing downwind', () => {
    let z = 0;
    for (let t = 0; t < 300; t += 1) z += windAt(p, 0, 80, -50, t, v()).z;
    expect(z / 300).toBeLessThan(-3);
  });

  it('turns slowly and gusts within bounds', () => {
    for (let t = 0; t < 600; t += 3) {
      expect(Math.abs(windDirection(p, t) - p.direction)).toBeLessThan(0.5);
      const g = gustFactor(p, t);
      expect(g).toBeGreaterThanOrEqual(0.35);
      expect(g).toBeLessThan(1.7);
    }
  });

  it('is more turbulent just above the roofs than high up', () => {
    const spread = (y: number) => {
      const xs: number[] = [];
      for (let i = 0; i < 80; i++) xs.push(windAt(p, i * 3.1, y, -i * 2.3, 30, v()).x);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    };
    expect(spread(p.roof + 3)).toBeGreaterThan(spread(p.roof + 120));
  });
});
