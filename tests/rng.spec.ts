import { describe, expect, it } from 'vitest';
import { hash01, noise1, noise3, Rng, rngFor } from '../src/sim/rng';

describe('rng', () => {
  it('reproduces the same sequence from the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('gives different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next()).filter(Boolean).length;
    expect(same).toBeLessThan(2);
  });

  it('stays in [0, 1) and is roughly uniform', () => {
    const r = new Rng(7);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 10000).toBeCloseTo(0.5, 1);
  });

  it('derives independent labelled streams without advancing the parent', () => {
    const r = new Rng(9);
    const before = r.state;
    const city = r.fork('city');
    expect(r.state).toBe(before);
    expect(city.next()).not.toBe(rngFor(9, 'wind').next());
    expect(rngFor(9, 'city').next()).toBe(rngFor(9, 'city').next());
  });

  it('has smooth, bounded value noise', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.137;
      const v = noise1(3, x);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(noise1(3, x + 0.001) - v)).toBeLessThan(0.01);
      expect(Math.abs(noise3(3, x, x * 0.5, 2))).toBeLessThanOrEqual(1);
    }
    expect(noise1(3, 5)).toBe(noise1(3, 5));
    expect(hash01(1, 2, 3, 4)).toBe(hash01(1, 2, 3, 4));
  });
});
