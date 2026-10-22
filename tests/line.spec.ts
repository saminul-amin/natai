import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/sim/day';
import { CELL, Line } from '../src/sim/line';
import { defaultWind } from '../src/sim/wind';

const hand = { x: 0, y: 20, z: 0 };
const kite = { x: 0, y: 70, z: -80 };
const dist = Math.hypot(kite.x - hand.x, kite.y - hand.y, kite.z - hand.z);

function settle(line: Line, rest: number, seconds: number): void {
  const wind = defaultWind(5);
  for (let i = 0; i < seconds / TICK_DT; i++) line.step(hand, kite, rest, wind, i * TICK_DT, TICK_DT);
}

describe('verlet line', () => {
  it('stays pinned at the natai and the kite', () => {
    const line = new Line(40, 300, 1);
    line.reset(hand, kite, dist * 1.02);
    settle(line, dist * 1.02, 3);
    expect(line.px(0)).toBe(hand.x);
    expect(line.py(0)).toBe(hand.y);
    expect(line.py(line.kiteIndex)).toBe(kite.y);
  });

  it('stays stable and close to its rest length', () => {
    const line = new Line(40, 300, 1);
    const rest = dist * 1.05;
    line.reset(hand, kite, rest);
    settle(line, rest, 5);
    const total = line.arcFromKite(0, 0);
    expect(total).toBeGreaterThan(dist * 0.99);
    expect(total).toBeLessThan(rest * 1.08);
    for (let i = 0; i < line.n; i++) expect(Number.isFinite(line.py(i))).toBe(true);
  });

  it('sags below the straight chord when slack', () => {
    const line = new Line(40, 300, 1);
    const rest = dist * 1.06;
    line.reset(hand, kite, rest);
    settle(line, rest, 4);
    const mid = Math.floor(line.n / 2);
    const chordY = hand.y + (kite.y - hand.y) * (mid / (line.n - 1));
    expect(line.py(mid)).toBeLessThan(chordY);
  });

  it('measures arc length from the kite end', () => {
    const line = new Line(10, 100, 1);
    line.reset({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -10 }, 10);
    // Straight line laid by reset has a small arc; compare against segment sums.
    let sum = 0;
    for (let i = 0; i < line.n - 1; i++) sum += line.segmentLength(i);
    expect(line.arcFromKite(0, 0)).toBeCloseTo(sum, 6);
    expect(line.arcFromKite(line.n - 2, 1)).toBeCloseTo(0, 6);
  });

  it('keeps one health cell per half metre, starting at the kite', () => {
    const line = new Line(40, 200, 1.3);
    expect(line.health.length).toBe(Math.ceil(200 / CELL) + 1);
    expect(line.cellAt(0)).toBe(0);
    expect(line.cellAt(1.2)).toBe(2);
    expect(line.health[5]).toBeCloseTo(1.3, 6);
    line.health[3] = 0.2;
    line.rest = 100;
    expect(line.weakest()).toBeCloseTo(0.2, 6);
  });

  it('splits into a kite-side tail and a hand-side piece', () => {
    const line = new Line(40, 300, 1);
    line.reset(hand, kite, dist);
    const { kiteSide, handSide } = line.split(30);
    expect(kiteSide.rest).toBeCloseTo(30, 0);
    expect(handSide.rest).toBeGreaterThan(dist - 32);
    expect(kiteSide.py(kiteSide.kiteIndex)).toBeCloseTo(kite.y, 3);
    expect(handSide.py(0)).toBeCloseTo(hand.y, 3);
    expect(kiteSide.pinStart).toBe(false);
    expect(handSide.pinEnd).toBe(false);
  });
});
