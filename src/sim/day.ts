// The game clock and the phases of the day (DESIGN.md 3). The clock is a pure function of simulation
// ticks, so a given tick is always the same minute and the sun is always in the same place.
import type { DayPhase } from '../types';

export const TICK_HZ = 120;
export const TICK_DT = 1 / TICK_HZ;

/** 14:00, the start of the campaign day, in minutes after midnight. */
export const DAY_START = 14 * 60;
/** 19:30, the end of the night celebration. */
export const DAY_END = 19 * 60 + 30;
/** Real seconds the campaign day takes. */
export const CAMPAIGN_SECONDS = 15 * 60;

export const PHASE_STARTS: Readonly<Record<DayPhase, number>> = {
  afternoon: DAY_START,
  golden: 16 * 60 + 30,
  dusk: 17 * 60 + 30,
  night: 18 * 60 + 15,
};

export interface Clock {
  /** Game minute at tick 0. */
  startMinute: number;
  /** Game minutes that pass per simulation tick. */
  minutesPerTick: number;
}

export const campaignClock = (startMinute = DAY_START): Clock => ({
  startMinute,
  minutesPerTick: (DAY_END - DAY_START) / (CAMPAIGN_SECONDS * TICK_HZ),
});

/** The quick duel runs the light four times slower, so a match stays in its hour. */
export const duelClock = (startMinute: number): Clock => ({
  startMinute,
  minutesPerTick: (DAY_END - DAY_START) / (CAMPAIGN_SECONDS * TICK_HZ) / 4,
});

export function minuteAt(clock: Clock, tick: number): number {
  return Math.min(DAY_END, clock.startMinute + tick * clock.minutesPerTick);
}

/** First tick at which the clock reads the given minute (or later). */
export function tickAt(clock: Clock, minute: number): number {
  return Math.max(0, Math.ceil((minute - clock.startMinute) / clock.minutesPerTick));
}

export function phaseAt(minute: number): DayPhase {
  if (minute >= PHASE_STARTS.night) return 'night';
  if (minute >= PHASE_STARTS.dusk) return 'dusk';
  if (minute >= PHASE_STARTS.golden) return 'golden';
  return 'afternoon';
}

const PHASE_ORDER: readonly DayPhase[] = ['afternoon', 'golden', 'dusk', 'night'];

/**
 * The two phases to blend for grading at a minute, and the weight of the second. Each boundary is a
 * twenty-minute crossfade centred on the phase start, so a phase change never pops.
 */
export function phaseBlend(minute: number): { from: DayPhase; to: DayPhase; t: number } {
  const half = 10;
  for (let i = 1; i < PHASE_ORDER.length; i++) {
    const to = PHASE_ORDER[i] as DayPhase;
    const from = PHASE_ORDER[i - 1] as DayPhase;
    const start = PHASE_STARTS[to];
    if (minute < start - half) return { from, to: from, t: 0 };
    if (minute <= start + half) return { from, to, t: smoothstep(start - half, start + half, minute) };
  }
  return { from: 'night', to: 'night', t: 0 };
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 0 by day, 1 at full night: drives window lights, stars, exposure. */
export function nightFactor(minute: number): number {
  return smoothstep(17 * 60 + 25, 18 * 60 + 25, minute);
}

/** String lights and lanterns come on through dusk. */
export function lightsFactor(minute: number): number {
  return smoothstep(17 * 60 + 15, 17 * 60 + 50, minute);
}

/** Fireworks start with the first rockets at dusk and fill the night. */
export function fireworksRate(minute: number): number {
  if (minute < 17 * 60 + 40) return 0;
  return 0.15 + 0.85 * smoothstep(17 * 60 + 40, 18 * 60 + 30, minute);
}

// Dhaka, 14 January.
const LAT = (23.81 * Math.PI) / 180;
const DECLINATION = (-21.2 * Math.PI) / 180;
/** Local solar noon at 90.41° E in UTC+6, with the mid-January equation of time (about -9 min). */
const SOLAR_NOON = 12 * 60 + 7.4;

/** Compass azimuth the player faces at rest: south-west, toward the Buriganga and the low sun. */
export const VIEW_AZIMUTH = (225 * Math.PI) / 180;

export interface SkyAngles {
  /** Radians above the horizon. */
  altitude: number;
  /** Compass radians, clockwise from north. */
  azimuth: number;
}

export function sunAngles(minute: number): SkyAngles {
  const h = ((minute - SOLAR_NOON) / 4) * (Math.PI / 180);
  const sinAlt = Math.sin(LAT) * Math.sin(DECLINATION) + Math.cos(LAT) * Math.cos(DECLINATION) * Math.cos(h);
  const altitude = Math.asin(sinAlt);
  const cosAz = (Math.sin(DECLINATION) - Math.sin(altitude) * Math.sin(LAT)) / (Math.cos(altitude) * Math.cos(LAT));
  let azimuth = Math.acos(Math.min(1, Math.max(-1, cosAz)));
  if (h > 0) azimuth = 2 * Math.PI - azimuth;
  return { altitude, azimuth };
}

/** A waxing crescent about forty degrees east of the sun along its path: in the south-west at dusk. */
export function moonAngles(minute: number): SkyAngles {
  const a = sunAngles(minute - 160);
  return { altitude: a.altitude, azimuth: a.azimuth - 0.12 };
}

/** World direction (x east-of-view, y up, z toward the viewer) for compass angles. */
export function skyDirection(angles: SkyAngles, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const rel = angles.azimuth - VIEW_AZIMUTH;
  const c = Math.cos(angles.altitude);
  out.x = Math.sin(rel) * c;
  out.y = Math.sin(angles.altitude);
  out.z = -Math.cos(rel) * c;
  return out;
}

export function formatClock(minute: number): string {
  const m = Math.floor(minute);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

/** Parses "17:05" or a plain minute count; returns null for anything else. */
export function parseClock(text: string): number | null {
  const hm = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (hm) {
    const minute = Number(hm[1]) * 60 + Number(hm[2]);
    return minute >= 0 && minute < 24 * 60 ? minute : null;
  }
  const n = Number(text);
  return Number.isFinite(n) && text.trim() !== '' ? n : null;
}
