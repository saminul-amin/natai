import { describe, expect, it } from 'vitest';
import type { Control, GameEvent, Mode } from '../src/types';
import { CAMPAIGN_SECONDS, TICK_HZ } from '../src/sim/day';
import { kiteById, manjaById, nataiById, RIVALS } from '../src/sim/names';
import { decide, newBrain } from '../src/sim/rivals';
import { playerAnchor, World } from '../src/sim/world';

function makeWorld(mode: Mode, seed = 1, startMinute?: number): World {
  return new World({
    seed,
    mode,
    kite: kiteById('chokhdar'),
    manja: manjaById('majhari'),
    natai: nataiById('bansh'),
    anchor: playerAnchor({ x: 0, y: 18, z: 0 }),
    ground: () => 16,
    roofAt: (x, z) => ({ x, y: 18, z }),
    ...(startMinute !== undefined ? { startMinute } : {}),
  });
}

/** The player flown by the same AI a rival uses, so tests can play whole games. */
function autopilot(world: World, personality: 'kid' | 'uncle' | 'champion' = 'uncle'): () => Control {
  const def = { ...RIVALS.find((r) => r.personality === personality)!, skill: 0.6 };
  const brain = newBrain(def, 99);
  return () => {
    const rival = world.rivals.find((r) => r.flyer.state === 'flying');
    return decide(
      brain,
      {
        self: world.player.kite,
        anchor: world.player.anchor,
        player: rival ? rival.flyer.kite : null,
        playerAnchor: rival ? rival.flyer.anchor : world.player.anchor,
        playerLine: rival ? rival.flyer.line : null,
        inPench: world.contact !== null,
        t: world.time,
      },
      1 / TICK_HZ,
    );
  };
}

function run(world: World, seconds: number, control: () => Control): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    world.step(control());
    events.push(...world.events);
  }
  return events;
}

describe('world', () => {
  it('is deterministic for a seed and an input sequence', () => {
    const a = makeWorld('pench', 7);
    const b = makeWorld('pench', 7);
    const ctl = (w: World) => () => ({ tan: Math.sin(w.time * 2.1) > 0, reel: 0 });
    run(a, 30, ctl(a));
    run(b, 30, ctl(b));
    expect(a.player.kite.pos).toEqual(b.player.kite.pos);
    expect(a.rivals.map((r) => r.flyer.kite.pos)).toEqual(b.rivals.map((r) => r.flyer.kite.pos));
  });

  it('has no rivals in free sky', () => {
    const w = makeWorld('freesky');
    run(w, 20, () => ({ tan: true, reel: 0 }));
    expect(w.rivals.length).toBe(0);
    expect(w.player.state).toBe('flying');
  });

  it('brings a rival into the quick duel', () => {
    const w = makeWorld('pench');
    const ev = run(w, 6, () => ({ tan: true, reel: 0 }));
    expect(ev.some((e) => e.type === 'rivalArrives')).toBe(true);
    expect(w.rivals.length).toBe(1);
  });

  it('plays a quick duel through pench and cuts to a result', () => {
    const w = makeWorld('pench', 3);
    const ev = run(w, 240, autopilot(w));
    expect(ev.some((e) => e.type === 'penchStart')).toBe(true);
    expect(ev.some((e) => e.type === 'cut')).toBe(true);
  });

  it('sends the champion at dusk and ends the day at 19:30', () => {
    const w = makeWorld('shakrain', 4, 17 * 60 + 29);
    const ev = run(w, 5, () => ({ tan: true, reel: 0 }));
    expect(ev.some((e) => e.type === 'rivalArrives' && e.rival === RIVALS.length - 1)).toBe(true);
    const late = makeWorld('shakrain', 4, 19 * 60 + 29);
    const ev2 = run(late, (60 / ((19 * 60 + 30 - 14 * 60) / CAMPAIGN_SECONDS)) * 1.2, () => ({ tan: true, reel: 0 }));
    expect(ev2.some((e) => e.type === 'dayOver')).toBe(true);
  });

  it('winds the player down at nightfall in the campaign', () => {
    const w = makeWorld('shakrain', 5, 18 * 60 + 15);
    const ev = run(w, 40, () => ({ tan: true, reel: 1 }));
    expect(ev.some((e) => e.type === 'landed')).toBe(true);
    expect(w.player.state).toBe('landed');
  });
});

describe('duel pacing', () => {
  it('every personality engages a flying player within a minute and a half', () => {
    for (const rival of [0, 5, 9, 13]) {
      const w = new World({
        seed: 2,
        mode: 'pench',
        kite: kiteById('chokhdar'),
        manja: manjaById('majhari'),
        natai: nataiById('bansh'),
        anchor: playerAnchor({ x: 0, y: 18, z: 0 }),
        ground: () => 16,
        roofAt: (x, z) => ({ x, y: 18, z }),
        duelRival: rival,
      });
      const pilot = autopilot(w, 'uncle');
      let first = -1;
      for (let i = 0; i < 90 * TICK_HZ && first < 0; i++) {
        w.step(pilot());
        if (w.events.some((e) => e.type === 'penchStart')) first = w.time;
      }
      expect(first, RIVALS[rival]?.personality).toBeGreaterThan(0);
    }
  });
});
