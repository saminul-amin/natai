import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/sim/day';
import { newKite, stepKite } from '../src/sim/kite';
import { kiteById, nataiById, RIVALS } from '../src/sim/names';
import { decide, newBrain, policyOf } from '../src/sim/rivals';
import { defaultWind } from '../src/sim/wind';
import type { Personality } from '../src/types';

const wind = defaultWind(11);
const anchor = { x: 30, y: 19, z: -30 };
const natai = nataiById('bansh');
const flat = () => 16;

function flySolo(personality: Personality, seconds: number, seed: number): { airborne: number; controls: string } {
  const def = RIVALS.find((r) => r.personality === personality)!;
  const brain = newBrain(def, seed);
  const k = newKite(kiteById(def.kite), anchor, 60, seed, wind);
  let airborne = 0;
  let controls = '';
  for (let i = 0; i < seconds / TICK_DT; i++) {
    const t = i * TICK_DT;
    const c = decide(
      brain,
      { self: k, anchor, player: null, playerAnchor: { x: 0, y: 19, z: 0 }, playerLine: null, inPench: false, t },
      TICK_DT,
    );
    stepKite(k, anchor, c, natai, wind, t, TICK_DT, flat);
    if (k.pos.y > anchor.y + 10) airborne++;
    if (i % 120 === 0) controls += c.tan ? 'T' : 'd';
  }
  return { airborne: (airborne * TICK_DT) / seconds, controls };
}

describe('rivals', () => {
  it('keeps every personality in the air', () => {
    for (const p of ['kid', 'boroBhai', 'uncle', 'champion'] as Personality[]) {
      const r = flySolo(p, 60, 3);
      expect(r.airborne, p).toBeGreaterThan(0.8);
    }
  });

  it('is deterministic for a seed', () => {
    expect(flySolo('kid', 20, 8).controls).toBe(flySolo('kid', 20, 8).controls);
  });

  it('keeps its line moving in a pench', () => {
    for (const p of ['kid', 'boroBhai', 'uncle', 'champion'] as Personality[]) {
      const def = RIVALS.find((r) => r.personality === p)!;
      const brain = newBrain(def, 5);
      const k = newKite(kiteById(def.kite), anchor, 60, 5, wind);
      let switches = 0;
      let last = true;
      for (let i = 0; i < 6 / TICK_DT; i++) {
        const t = i * TICK_DT;
        const c = decide(
          brain,
          { self: k, anchor, player: null, playerAnchor: anchor, playerLine: null, inPench: true, t },
          TICK_DT,
        );
        stepKite(k, anchor, c, natai, wind, t, TICK_DT, flat);
        if (c.tan !== last) switches++;
        last = c.tan;
      }
      expect(switches, p).toBeGreaterThan(3);
    }
  });

  it('gives each personality its own policy', () => {
    expect(policyOf('boroBhai').above).toBeGreaterThan(policyOf('kid').above);
    expect(policyOf('uncle').tanBeat).toBeGreaterThan(policyOf('uncle').dheelBeat);
    expect(policyOf('champion').aimTolerance).toBeLessThan(policyOf('kid').aimTolerance);
  });
});
