import { describe, expect, it } from 'vitest';
import type { Control } from '../src/types';
import { TICK_DT } from '../src/sim/day';
import { GIVE, kiteFrame, lineLength, newFrame, newKite, stepKite, wrapAngle, type KiteState } from '../src/sim/kite';
import { kiteById, nataiById } from '../src/sim/names';
import { defaultWind } from '../src/sim/wind';

const anchor = { x: 0, y: 19, z: 0 };
const wind = defaultWind(77);
const natai = nataiById('bansh');
const flat = () => 16;

function fly(k: KiteState, seconds: number, control: (t: number) => Control, t0 = 0): number {
  const n = Math.round(seconds / TICK_DT);
  const i0 = Math.round(t0 / TICK_DT);
  for (let i = i0; i < i0 + n; i++) {
    const t = i * TICK_DT;
    stepKite(k, anchor, control(t), natai, wind, t, TICK_DT, flat);
  }
  return (i0 + n) * TICK_DT;
}

const dist = (k: KiteState) => Math.hypot(k.pos.x - anchor.x, k.pos.y - anchor.y, k.pos.z - anchor.z);

describe('kite', () => {
  it('never leaves the sphere of its line', () => {
    const k = newKite(kiteById('chokhdar'), anchor, 60, 1, wind);
    fly(k, 30, (t) => ({ tan: Math.sin(t * 2) > 0, reel: 0 }));
    expect(dist(k)).toBeLessThanOrEqual(lineLength(k) + 1e-6);
  });

  it('is deterministic', () => {
    const a = newKite(kiteById('chokhdar'), anchor, 60, 3, wind);
    const b = newKite(kiteById('chokhdar'), anchor, 60, 3, wind);
    const ctl = (t: number) => ({ tan: Math.sin(t * 1.7) > 0.2, reel: 0 });
    fly(a, 20, ctl);
    fly(b, 20, ctl);
    expect(a.pos).toEqual(b.pos);
    expect(a.nose).toBe(b.nose);
  });

  it('flies at the same place regardless of frame rate, because the step is fixed', () => {
    // The loop always steps at TICK_DT; two runs with the same ticks agree exactly.
    const a = newKite(kiteById('pandar'), anchor, 50, 9, wind);
    const b = newKite(kiteById('pandar'), anchor, 50, 9, wind);
    fly(a, 10, () => ({ tan: true, reel: 0 }));
    for (let i = 0; i < 10 / TICK_DT; i++) stepKite(b, anchor, { tan: true, reel: 0 }, natai, wind, i * TICK_DT, TICK_DT, flat);
    expect(b.pos.y).toBe(a.pos.y);
  });

  it('spins on slack line and locks its nose on a tight one', () => {
    const k = newKite(kiteById('chokhdar'), anchor, 60, 2, wind);
    fly(k, 5, () => ({ tan: true, reel: 0 }));
    let turned = 0;
    let last = k.nose;
    fly(k, 3, () => ({ tan: false, reel: 0 }), 5);
    turned += Math.abs(wrapAngle(k.nose - last));
    expect(Math.abs(k.spin)).toBeGreaterThan(0.8);
    fly(k, 3, () => ({ tan: true, reel: 0 }), 8);
    expect(Math.abs(k.spin)).toBeLessThan(0.3);
    last = k.nose;
    fly(k, 1, () => ({ tan: true, reel: 0 }), 11);
    expect(Math.abs(wrapAngle(k.nose - last))).toBeLessThan(0.5);
    expect(turned).toBeGreaterThan(0);
  });

  it('tracks where its nose points when pulled', () => {
    for (const side of [1, -1]) {
      const k = newKite(kiteById('chokhdar'), anchor, 70, 4, wind);
      k.nose = (side * Math.PI) / 2; // nose to the right, then to the left
      const f = kiteFrame(k.pos, anchor, 0, newFrame());
      const x0 = k.pos.x * f.right.x + k.pos.y * f.right.y + k.pos.z * f.right.z;
      fly(k, 1.5, () => ({ tan: true, reel: 0 }));
      const x1 = k.pos.x * f.right.x + k.pos.y * f.right.y + k.pos.z * f.right.z;
      expect((x1 - x0) * side).toBeGreaterThan(3);
    }
  });

  it('holds its heading on a steady pull and climbs with the nose up', () => {
    const k = newKite(kiteById('chokhdar'), anchor, 40, 1, wind);
    const y0 = k.pos.y;
    fly(k, 10, () => ({ tan: true, reel: 0 }));
    expect(Math.abs(k.nose)).toBeLessThan(0.05);
    expect(k.pos.y).toBeGreaterThan(y0);
    expect(k.grounded).toBe(false);
  });

  it('keeps some load and sinks only slowly on dheel', () => {
    const k = newKite(kiteById('chokhdar'), anchor, 40, 1, wind);
    const y0 = k.pos.y;
    fly(k, 5, () => ({ tan: false, reel: 0 }));
    expect(k.tension).toBeGreaterThan(0.2);
    expect(y0 - k.pos.y).toBeLessThan(10);
  });

  it('climbs when pulled with the nose up and sinks when left slack', () => {
    const k = newKite(kiteById('lejdar'), anchor, 60, 5, wind);
    k.nose = 0;
    const y0 = k.pos.y;
    fly(k, 3, () => ({ tan: true, reel: 0 }));
    expect(k.pos.y).toBeGreaterThan(y0 - 2);
    const k2 = newKite(kiteById('lejdar'), anchor, 60, 5, wind);
    k2.vel.y = 0;
    fly(k2, 2, () => ({ tan: false, reel: 0 }));
    expect(k2.tension).toBeLessThan(k.tension);
  });

  it('takes line back on tan and gives it on dheel, within the hand range', () => {
    const k = newKite(kiteById('chokhdar'), anchor, 60, 6, wind);
    fly(k, 3, () => ({ tan: true, reel: 0 }));
    expect(k.give).toBeCloseTo(-GIVE, 5);
    fly(k, 5, () => ({ tan: false, reel: 0 }), 3);
    expect(k.give).toBeGreaterThan(0);
    expect(k.give).toBeLessThanOrEqual(GIVE);
    expect(k.natai).toBeCloseTo(60, 5);
  });

  it('unwinds only as fast as the kite takes line, and winds in at the natai speed', () => {
    const k = newKite(kiteById('chokhdar'), anchor, 60, 7, wind);
    fly(k, 5, () => ({ tan: false, reel: 1 }));
    expect(k.natai).toBeGreaterThan(62);
    expect(k.natai).toBeLessThanOrEqual(60 + 5 * natai.reelSpeed + 1e-6);
    const before = k.natai;
    fly(k, 2, () => ({ tan: true, reel: -1 }), 5);
    expect(k.natai).toBeCloseTo(before - 2 * natai.reelSpeed, 1);
  });
});
