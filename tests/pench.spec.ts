import { describe, expect, it } from 'vitest';
import { Line } from '../src/sim/line';
import { angleFactor, closestApproach, positionFactor, startContact, stepPench } from '../src/sim/pench';

const DT = 1 / 120;

/** Two crossing straight lines in the XY plane, A along x and B along y, crossing at the origin. */
function crossing(): { a: Line; b: Line } {
  const a = new Line(20, 200, 1);
  const b = new Line(20, 200, 1);
  a.reset({ x: -40, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }, 80);
  b.reset({ x: 0, y: -40, z: 0.5 }, { x: 0, y: 40, z: 0.5 }, 80);
  // Straighten (reset adds a small sag).
  for (let i = 0; i < a.n; i++) {
    a.setPoint(i, -40 + (80 * i) / (a.n - 1), 0, 0);
    b.setPoint(i, 0, -40 + (80 * i) / (b.n - 1), 0.5);
  }
  return { a, b };
}

/** Slides a line along its own direction by `d` metres, as if its material were moving. */
function slideAlong(l: Line, dx: number, dy: number): void {
  for (let i = 0; i < l.n; i++) l.setPoint(i, l.px(i) + dx, l.py(i) + dy, l.pz(i));
}

describe('pench', () => {
  it('finds where two strings cross', () => {
    const { a, b } = crossing();
    const c = closestApproach(a, b, 2);
    expect(c).not.toBeNull();
    expect(c?.dist).toBeCloseTo(0.5, 3);
    expect(c?.pa.x).toBeCloseTo(0, 3);
    expect(closestApproach(a, b, 0.2)).toBeNull();
  });

  it('does nothing when neither line moves', () => {
    const { a, b } = crossing();
    const c = startContact(a, b, closestApproach(a, b, 2)!);
    let total = 0;
    for (let i = 0; i < 240; i++) {
      const r = stepPench(c, { line: a, kiteY: 50, sharpness: 1 }, { line: b, kiteY: 50, sharpness: 1 }, DT);
      total += r.damageA + r.damageB;
    }
    // Only the first ticks of the bow move the strings at all.
    expect(total).toBeLessThan(0.02);
  });

  it('cuts the still string first when only one keeps moving', () => {
    const { a, b } = crossing();
    const c = startContact(a, b, closestApproach(a, b, 2)!);
    let snapped: 'a' | 'b' | null = null;
    for (let i = 0; i < 120 * 20 && !snapped; i++) {
      // A slides along itself at 6 m/s, back and forth over a wide stroke; B holds still.
      const dir = Math.floor(i / 400) % 2 === 0 ? 1 : -1;
      slideAlong(a, dir * 6 * DT, 0);
      // Keep B and A crossing (B fixed in space).
      const r = stepPench(c, { line: a, kiteY: 50, sharpness: 1 }, { line: b, kiteY: 50, sharpness: 1 }, DT);
      snapped = r.snapped;
    }
    expect(snapped).toBe('b');
  });

  it('cuts faster at a sharp crossing than at a shallow one', () => {
    expect(angleFactor(1)).toBeGreaterThan(angleFactor(0.2));
    expect(angleFactor(0)).toBeGreaterThan(0);
  });

  it('gives the higher kite a small edge', () => {
    expect(positionFactor(60, 40)).toBeGreaterThan(1);
    expect(positionFactor(40, 60)).toBeLessThan(1);
    expect(positionFactor(50, 50)).toBe(1);
    expect(positionFactor(500, 0)).toBeLessThan(1.13);
  });

  it('cuts faster with sharper manja', () => {
    const run = (sharpA: number): number => {
      const { a, b } = crossing();
      const c = startContact(a, b, closestApproach(a, b, 2)!);
      let total = 0;
      for (let i = 0; i < 60; i++) {
        slideAlong(a, 5 * DT, 0);
        total += stepPench(c, { line: a, kiteY: 50, sharpness: sharpA }, { line: b, kiteY: 50, sharpness: 1 }, DT).damageB;
      }
      return total;
    };
    expect(run(1.25)).toBeGreaterThan(run(0.85));
  });

  it('separates when the strings come apart', () => {
    const { a, b } = crossing();
    const c = startContact(a, b, closestApproach(a, b, 2)!);
    for (let i = 0; i < b.n; i++) b.setPoint(i, b.px(i), b.py(i), 30);
    const r = stepPench(c, { line: a, kiteY: 50, sharpness: 1 }, { line: b, kiteY: 50, sharpness: 1 }, DT);
    expect(r.engaged).toBe(false);
  });
});
