import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_SECONDS,
  campaignClock,
  DAY_END,
  DAY_START,
  duelClock,
  formatClock,
  minuteAt,
  nightFactor,
  parseClock,
  phaseAt,
  phaseBlend,
  skyDirection,
  sunAngles,
  TICK_HZ,
  tickAt,
} from '../src/sim/day';

describe('day clock', () => {
  it('runs the campaign from 14:00 to 19:30 in fifteen real minutes', () => {
    const c = campaignClock();
    expect(minuteAt(c, 0)).toBe(DAY_START);
    expect(minuteAt(c, CAMPAIGN_SECONDS * TICK_HZ)).toBeCloseTo(DAY_END, 6);
    expect(minuteAt(c, CAMPAIGN_SECONDS * TICK_HZ * 2)).toBe(DAY_END);
  });

  it('is a pure function of ticks', () => {
    const c = campaignClock();
    expect(minuteAt(c, 12345)).toBe(minuteAt(c, 12345));
    expect(minuteAt(c, tickAt(c, 17 * 60))).toBeGreaterThanOrEqual(17 * 60);
  });

  it('runs the duel four times slower', () => {
    const a = campaignClock(16 * 60);
    const b = duelClock(16 * 60);
    expect(b.minutesPerTick * 4).toBeCloseTo(a.minutesPerTick, 10);
  });

  it('names the phases at their boundaries', () => {
    expect(phaseAt(14 * 60)).toBe('afternoon');
    expect(phaseAt(16 * 60 + 29)).toBe('afternoon');
    expect(phaseAt(16 * 60 + 30)).toBe('golden');
    expect(phaseAt(17 * 60 + 30)).toBe('dusk');
    expect(phaseAt(18 * 60 + 15)).toBe('night');
    expect(phaseAt(19 * 60 + 30)).toBe('night');
  });

  it('crossfades phases smoothly around each boundary', () => {
    expect(phaseBlend(15 * 60)).toEqual({ from: 'afternoon', to: 'afternoon', t: 0 });
    const mid = phaseBlend(16 * 60 + 30);
    expect(mid.from).toBe('afternoon');
    expect(mid.to).toBe('golden');
    expect(mid.t).toBeCloseTo(0.5, 5);
    expect(phaseBlend(19 * 60).from).toBe('night');
  });

  it('puts the sun where it is over Dhaka on 14 January', () => {
    const noon = sunAngles(12 * 60 + 7);
    expect((noon.altitude * 180) / Math.PI).toBeCloseTo(45, 0);
    // Sunset close to 17:28 local time.
    expect(sunAngles(17 * 60 + 20).altitude).toBeGreaterThan(0);
    expect(sunAngles(17 * 60 + 36).altitude).toBeLessThan(0);
    const set = sunAngles(17 * 60 + 28);
    expect((set.azimuth * 180) / Math.PI).toBeGreaterThan(240);
    expect((set.azimuth * 180) / Math.PI).toBeLessThan(255);
  });

  it('places the low sun ahead of the player, who faces south-west', () => {
    const d = skyDirection(sunAngles(17 * 60), { x: 0, y: 0, z: 0 });
    expect(d.z).toBeLessThan(-0.8);
    expect(d.y).toBeGreaterThan(0);
  });

  it('brings the night in through dusk', () => {
    expect(nightFactor(16 * 60)).toBe(0);
    expect(nightFactor(19 * 60)).toBe(1);
    expect(nightFactor(17 * 60 + 55)).toBeGreaterThan(0.3);
  });

  it('formats and parses clock text', () => {
    expect(formatClock(17 * 60 + 5)).toBe('17:05');
    expect(parseClock('17:05')).toBe(17 * 60 + 5);
    expect(parseClock('900')).toBe(900);
    expect(parseClock('dusk')).toBeNull();
    expect(parseClock('25:00')).toBeNull();
  });
});
