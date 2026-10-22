// The world: one fixed 120 Hz tick of everything that matters to the game (DESIGN.md 8.5). It owns
// the player's flyer, the rivals, falling kites, the pench, the clock and the mode rules. Views read
// it and never write it.
import type { Control, DayPhase, GameEvent, KiteStats, ManjaStats, Mode, NataiStats, RivalDef } from '../types';
import { campaignClock, DAY_END, duelClock, minuteAt, phaseAt, PHASE_STARTS, TICK_DT, type Clock } from './day';
import { freeKite, lineLength, MIN_LINE, newKite, stepKite, type Ground, type KiteState } from './kite';
import { Line, LINE_SEGMENTS } from './line';
import { kiteById, manjaById, RIVALS } from './names';
import { closestApproach, HOOK_DISTANCE, startContact, stepPench, type Contact } from './pench';
import { decide, newBrain, type RivalBrain } from './rivals';
import { hashString } from './rng';
import { defaultWind, type V3, type WindParams } from './wind';

/** Hand height above the roof, metres. */
const HAND = 1.3;
const LAUNCH_LENGTH = 40;
const CATCH_DISTANCE = 2.2;
const BOOST_SECONDS = 40;
const BOOST = 0.3;
/** Seconds between a cut and the next rival or round. */
const NEXT_DELAY = 6;

export interface Flyer {
  kite: KiteState;
  line: Line;
  anchor: V3;
  manja: ManjaStats;
  natai: NataiStats;
  /** Current sharpness: the manja's, worn by the day and boosted by caught kites. */
  sharpness: number;
  boost: number;
  /** Flying, cut (kite falling, line hanging), or reeled down for the night. */
  state: 'flying' | 'cut' | 'landed';
  /** After a cut, the piece still tied to the natai. */
  loose: Line | null;
}

export interface FallingKite {
  kite: KiteState;
  tail: Line;
  age: number;
  /** -1 for the player's own kite, otherwise the rival index. */
  owner: number;
}

export interface RivalSlot {
  index: number;
  def: RivalDef;
  flyer: Flyer;
  brain: RivalBrain;
  /** Seconds since this rival arrived. */
  age: number;
}

export interface WorldOptions {
  seed: number;
  mode: Mode;
  kite: KiteStats;
  manja: ManjaStats;
  natai: NataiStats;
  /** Player hand position. */
  anchor: V3;
  ground: Ground;
  /** Snaps a point to the nearest roof: rivals stand on buildings, not in the lanes. */
  roofAt: (x: number, z: number) => V3;
  /** Game minute to start at; defaults per mode. */
  startMinute?: number;
  /** Personality for the quick duel. */
  duelRival?: number;
}

export interface Score {
  cut: number;
  caught: number;
  /** Shortest winning pench, seconds; Infinity until one is won. */
  bestCut: number;
  longestPench: number;
  beaten: number[];
}

export class World {
  readonly seed: number;
  readonly mode: Mode;
  readonly clock: Clock;
  readonly wind: WindParams;
  readonly ground: Ground;
  readonly player: Flyer;
  readonly rivals: RivalSlot[] = [];
  readonly falling: FallingKite[] = [];
  readonly score: Score = { cut: 0, caught: 0, bestCut: Infinity, longestPench: 0, beaten: [] };
  events: GameEvent[] = [];
  tick = 0;
  contact: Contact | null = null;
  contactRival = -1;
  phase: DayPhase;
  /** Campaign: next rival index to send. Duel: the rival being fought. */
  nextRival = 0;
  championDone = false;
  over = false;
  duelWins = { player: 0, rival: 0 };
  private nextAt = 0;
  private readonly roofAt: (x: number, z: number) => V3;
  private readonly opts: WorldOptions;

  constructor(opts: WorldOptions) {
    this.opts = opts;
    this.seed = opts.seed;
    this.mode = opts.mode;
    this.ground = opts.ground;
    this.roofAt = opts.roofAt;

    this.wind = defaultWind(opts.seed);
    const start = opts.startMinute ?? (opts.mode === 'pench' ? 16 * 60 + 40 : 14 * 60);
    this.clock = opts.mode === 'pench' ? duelClock(start) : campaignClock(start);
    this.phase = phaseAt(start);
    this.player = this.makeFlyer(opts.kite, opts.manja, opts.natai, opts.anchor, hashString('player') ^ opts.seed);
    if (opts.mode === 'pench') this.nextRival = opts.duelRival ?? 0;
    this.nextAt = opts.mode === 'freesky' ? Infinity : 4;
  }

  get time(): number {
    return this.tick * TICK_DT;
  }

  get minute(): number {
    return minuteAt(this.clock, this.tick);
  }

  private makeFlyer(kite: KiteStats, manja: ManjaStats, natai: NataiStats, anchor: V3, seed: number): Flyer {
    const k = newKite(kite, anchor, LAUNCH_LENGTH, seed >>> 0, this.wind);
    const line = new Line(LINE_SEGMENTS, natai.capacity, manja.durability);
    line.reset(anchor, k.pos, LAUNCH_LENGTH);
    return {
      kite: k,
      line,
      anchor: { ...anchor },
      manja,
      natai,
      sharpness: manja.sharpness,
      boost: 0,
      state: 'flying',
      loose: null,
    };
  }

  private spawnRival(index: number): void {
    const def = RIVALS[index];
    if (!def) return;
    const p = this.player.anchor;
    const roof = this.roofAt(p.x + def.offset.x, p.z + def.offset.z);
    const anchor = { x: roof.x, y: roof.y + HAND, z: roof.z };
    const flyer = this.makeFlyer(
      kiteById(def.kite),
      manjaById(def.manja),
      this.player.natai,
      anchor,
      hashString(def.id) ^ this.seed,
    );
    // Rivals start a little higher so they arrive in the sky rather than on the roof.
    flyer.kite.natai = 70;
    const brain = newBrain(def, (hashString(def.id) ^ this.seed ^ this.tick) >>> 0);
    this.rivals.push({ index, def, flyer, brain, age: 0 });
    this.events.push({ type: 'rivalArrives', rival: index });
  }

  /** Advances the world by one tick with the player's control for that tick. */
  step(control: Control): void {
    const t = this.time;
    const dt = TICK_DT;
    this.events = [];
    const minute = this.minute;
    const phase = phaseAt(minute);
    if (phase !== this.phase) {
      this.phase = phase;
      this.events.push({ type: 'phase', phase });
    }

    this.runMode(minute);

    // Night: kites come down in the campaign; the player's natai winds itself in.
    let c = control;
    const nightFall = this.mode === 'shakrain' && minute >= PHASE_STARTS.night;
    if (nightFall && this.player.state === 'flying') c = { tan: true, reel: -1 };

    this.stepFlyer(this.player, c, t, dt);
    if (nightFall && this.player.state === 'flying' && this.player.kite.natai <= MIN_LINE + 0.01) {
      this.player.state = 'landed';
      this.events.push({ type: 'landed' });
    }

    for (const r of this.rivals) {
      r.age += dt;
      const rc = decide(
        r.brain,
        {
          self: r.flyer.kite,
          anchor: r.flyer.anchor,
          player: this.player.state === 'flying' ? this.player.kite : null,
          playerAnchor: this.player.anchor,
          playerLine: this.player.state === 'flying' ? this.player.line : null,
          inPench: this.contactRival === r.index,
          t,
        },
        dt,
      );
      this.stepFlyer(r.flyer, nightFall ? { tan: true, reel: -1 } : rc, t, dt);
    }

    this.stepPench(dt);
    this.stepFalling(t, dt);
    this.tick++;
  }

  private stepFlyer(f: Flyer, c: Control, t: number, dt: number): void {
    f.boost = Math.max(0, f.boost - dt);
    if (f.state === 'flying') {
      stepKite(f.kite, f.anchor, c, f.natai, this.wind, t, dt, this.ground);
      f.line.step(f.anchor, f.kite.pos, lineLength(f.kite), this.wind, t, dt);
    } else if (f.loose) {
      f.loose.step(f.anchor, null, f.loose.rest, this.wind, t, dt);
    }
  }

  private sharpness(f: Flyer): number {
    return f.sharpness + (f.boost > 0 ? BOOST : 0);
  }

  private stepPench(dt: number): void {
    const p = this.player;
    if (p.state !== 'flying') {
      this.endContact();
      return;
    }
    if (!this.contact) {
      for (const r of this.rivals) {
        if (r.flyer.state !== 'flying' || r.age < 3) continue;
        const c = closestApproach(p.line, r.flyer.line, HOOK_DISTANCE);
        if (c) {
          this.contact = startContact(p.line, r.flyer.line, c);
          this.contactRival = r.index;
          this.events.push({ type: 'penchStart', rival: r.index });
          break;
        }
      }
      return;
    }
    const r = this.rivals.find((x) => x.index === this.contactRival);
    if (!r || r.flyer.state !== 'flying') {
      this.endContact();
      return;
    }
    const res = stepPench(
      this.contact,
      { line: p.line, kiteY: p.kite.pos.y, sharpness: this.sharpness(p) },
      { line: r.flyer.line, kiteY: r.flyer.kite.pos.y, sharpness: this.sharpness(r.flyer) },
      dt,
    );
    // Manja wears as it cuts; the uncle burns through his twice as fast.
    p.sharpness = Math.max(0.5, p.sharpness - res.damageB * p.manja.wear * 3);
    const burn = r.def.personality === 'uncle' ? 2 : 1;
    r.flyer.sharpness = Math.max(0.5, r.flyer.sharpness - res.damageA * r.flyer.manja.wear * 3 * burn);
    if (res.snapped) {
      const seconds = this.contact.age;
      const at = this.contact.closest.pa;
      this.score.longestPench = Math.max(this.score.longestPench, seconds);
      if (res.snapped === 'b') {
        this.cutFlyer(r.flyer, this.contact.arcB, r.index);
        this.score.cut++;
        this.score.bestCut = Math.min(this.score.bestCut, seconds);
        this.score.beaten.push(r.index);
        this.events.push({ type: 'cut', winner: 'player', rival: r.index, x: at.x, y: at.y, z: at.z, penchSeconds: seconds });
        this.onRivalBeaten(r);
      } else {
        this.cutFlyer(p, this.contact.arcA, -1);
        this.events.push({ type: 'cut', winner: 'rival', rival: r.index, x: at.x, y: at.y, z: at.z, penchSeconds: seconds });
        this.onPlayerCut();
      }
      this.endContact();
    } else if (!res.engaged) {
      this.score.longestPench = Math.max(this.score.longestPench, this.contact.age);
      this.endContact();
    }
  }

  private endContact(): void {
    if (this.contact) this.events.push({ type: 'penchEnd', rival: this.contactRival });
    this.contact = null;
    this.contactRival = -1;
  }

  private cutFlyer(f: Flyer, arc: number, owner: number): void {
    const { kiteSide, handSide } = f.line.split(arc);
    freeKite(f.kite);
    f.state = 'cut';
    f.loose = handSide;
    this.falling.push({ kite: f.kite, tail: kiteSide, age: 0, owner });
  }

  private onRivalBeaten(r: RivalSlot): void {
    this.removeRivalLater(r);
    if (this.mode === 'shakrain') {
      if (r.def.personality === 'champion') this.championDone = true;
      this.nextAt = this.time + NEXT_DELAY;
    } else if (this.mode === 'pench') {
      this.duelWins.player++;
      this.roundOver();
    }
  }

  private onPlayerCut(): void {
    if (this.mode === 'shakrain') {
      this.over = true;
      this.cutAt = this.time;
      this.nextAt = Infinity;
    } else if (this.mode === 'pench') {
      this.duelWins.rival++;
      this.roundOver();
    }
  }

  private roundOver(): void {
    this.events.push({ type: 'roundOver', playerWins: this.duelWins.player, rivalWins: this.duelWins.rival });
    if (this.duelWins.player >= 2 || this.duelWins.rival >= 2) {
      this.over = true;
      this.events.push({ type: 'matchOver', won: this.duelWins.player >= 2 });
      this.nextAt = Infinity;
    } else {
      this.nextAt = this.time + NEXT_DELAY;
    }
  }

  private pendingRemoval: RivalSlot[] = [];

  private removeRivalLater(r: RivalSlot): void {
    this.pendingRemoval.push(r);
  }

  private runMode(minute: number): void {
    // A beaten rival's empty natai stays a moment, then the rooftop clears.
    if (this.pendingRemoval.length > 0 && this.time > this.nextAt - 1) {
      for (const r of this.pendingRemoval) {
        const i = this.rivals.indexOf(r);
        if (i >= 0) this.rivals.splice(i, 1);
      }
      this.pendingRemoval = [];
    }
    if (this.mode === 'shakrain') {
      if (this.dayOverSent) return;
      // The day ends at 19:30, or a few seconds after the player's own string is cut.
      if (minute >= DAY_END || (this.over && this.time >= this.cutAt + NEXT_DELAY)) {
        this.dayOverSent = true;
        this.over = true;
        this.events.push({ type: 'dayOver' });
        return;
      }
      if (this.over) return;
      const champion = RIVALS.length - 1;
      if (minute >= PHASE_STARTS.night) {
        // Darkness: every rival winds in and leaves the sky; an undecided champion's duel is over.
        if (this.contactRival >= 0) this.endContact();
        for (let i = this.rivals.length - 1; i >= 0; i--) {
          const r = this.rivals[i] as RivalSlot;
          if (r.flyer.state !== 'flying' || r.flyer.kite.natai <= MIN_LINE + 0.01) this.rivals.splice(i, 1);
        }
        return;
      }
      if (minute >= PHASE_STARTS.dusk && !this.championDone && !this.rivals.some((r) => r.index === champion)) {
        // At dusk the champion comes, whoever else is still up.
        if (this.contactRival >= 0) this.endContact();
        for (let i = this.rivals.length - 1; i >= 0; i--)
          if ((this.rivals[i] as RivalSlot).flyer.state === 'flying') this.rivals.splice(i, 1);
        this.nextRival = champion;
        this.spawnRival(champion);
        this.nextAt = Infinity;
        return;
      }
      if (
        minute < PHASE_STARTS.dusk &&
        this.time >= this.nextAt &&
        this.nextRival < champion &&
        this.player.state === 'flying' &&
        !this.rivals.some((r) => r.flyer.state === 'flying')
      ) {
        this.spawnRival(this.nextRival);
        this.nextRival++;
        this.nextAt = Infinity;
      }
    } else if (this.mode === 'pench') {
      if (this.over) return;
      if (this.time >= this.nextAt) {
        this.nextAt = Infinity;
        this.resetRound();
      }
    }
  }

  private dayOverSent = false;
  private cutAt = Infinity;

  /** Quick duel: both flyers relaunch for the next round. */
  private resetRound(): void {
    const o = this.opts;
    const fresh = this.makeFlyer(o.kite, o.manja, o.natai, o.anchor, (hashString('player') ^ this.seed ^ this.tick) >>> 0);
    Object.assign(this.player, fresh);
    this.rivals.length = 0;
    this.falling.length = 0;
    this.spawnRival(this.nextRival);
  }

  private stepFalling(t: number, dt: number): void {
    const p = this.player;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i] as FallingKite;
      f.age += dt;
      stepKite(f.kite, f.kite.pos, { tan: false, reel: 0 }, p.natai, this.wind, t, dt, this.ground);
      f.tail.step(null, f.kite.pos, f.tail.rest, this.wind, t, dt);
      // Catch: the player's string sweeps under a falling rival kite's trailing string.
      if (f.owner >= 0 && p.state === 'flying' && !f.kite.grounded) {
        const c = closestApproach(p.line, f.tail, CATCH_DISTANCE);
        if (c) {
          this.score.caught++;
          p.boost = BOOST_SECONDS;
          this.events.push({ type: 'caught', x: f.kite.pos.x, y: f.kite.pos.y, z: f.kite.pos.z });
          this.falling.splice(i, 1);
          continue;
        }
      }
      if (f.age > 45 || (f.kite.grounded && f.age > 8)) this.falling.splice(i, 1);
    }
  }
}

export const playerAnchor = (roof: V3): V3 => ({ x: roof.x, y: roof.y + HAND, z: roof.z - 0.4 });
