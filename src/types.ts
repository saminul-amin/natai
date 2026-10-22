// Shared types for the simulation, the views and the interface (DESIGN.md 8.2).

export type DayPhase = 'afternoon' | 'golden' | 'dusk' | 'night';

export type Personality = 'kid' | 'boroBhai' | 'uncle' | 'champion';

export type Mode = 'shakrain' | 'pench' | 'freesky';

export type Lang = 'bn' | 'en';

export type Tier = 'high' | 'balanced';

export interface Named {
  id: string;
  bn: string;
  en: string;
}

export interface KiteStats extends Named {
  kind: 'fighter' | 'shaped';
  /** 0..1: higher spins slower on slack line and drifts less. */
  stability: number;
  /** 0..1: higher tracks faster on a tight line. */
  speed: number;
  /** Index into the generated print set (procedural/prints.ts). */
  print: number;
  shape: 'diamond' | 'butterfly' | 'rocket' | 'box';
}

export interface ManjaStats extends Named {
  /** Cutting power of the glass coating, multiplies damage dealt. */
  sharpness: number;
  /** Health of every half-metre cell of this string. */
  durability: number;
  /** How fast sharpness wears per unit of damage dealt. */
  wear: number;
  /** Display colour of the dyed string, as 0xRRGGBB. */
  color: number;
}

export interface NataiStats extends Named {
  /** Metres per second the natai dial winds or unwinds. */
  reelSpeed: number;
  /** Maximum metres of line on the spool. */
  capacity: number;
}

export interface Rooftop extends Named {
  x: number;
  z: number;
  /** Roof height in metres above the lanes. */
  height: number;
}

export interface RivalDef extends Named {
  personality: Personality;
  /** Neighbourhood name shown on the rival tag. */
  area: Named;
  kite: string;
  manja: string;
  /** Rooftop position relative to the player's roof, metres. */
  offset: { x: number; z: number };
  skill: number;
}

export type UnlockKind = 'kite' | 'natai' | 'manja' | 'rooftop';

export interface Unlock {
  kind: UnlockKind;
  id: string;
}

/** One tick's worth of player input, sampled by input.ts and consumed by the simulation. */
export interface Control {
  /** Tan: line held and pulled. False is dheel. */
  tan: boolean;
  /** Natai dial: -1 winds in, +1 unwinds, 0 holds. */
  reel: number;
}

export type GameEvent =
  | { type: 'penchStart'; rival: number }
  | { type: 'penchEnd'; rival: number }
  | { type: 'cut'; winner: 'player' | 'rival'; rival: number; x: number; y: number; z: number; penchSeconds: number }
  | { type: 'caught'; x: number; y: number; z: number }
  | { type: 'rivalArrives'; rival: number }
  | { type: 'phase'; phase: DayPhase }
  | { type: 'roundOver'; playerWins: number; rivalWins: number }
  | { type: 'matchOver'; won: boolean }
  | { type: 'unlock'; unlock: Unlock }
  | { type: 'landed' }
  | { type: 'dayOver' };
