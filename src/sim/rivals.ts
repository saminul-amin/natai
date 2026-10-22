// Rival flyers (DESIGN.md 4.7). Each rival flies the same kite model as the player and decides inside
// the simulation tick, from a steering target and a pench policy: when to pull, when to release.
// Personality sets the policy; skill sets how precisely it is carried out.
import type { Control, Personality, RivalDef } from '../types';
import { kiteFrame, lineLength, newFrame, wrapAngle, type KiteState } from './kite';
import type { Line } from './line';
import { Rng } from './rng';
import type { V3 } from './wind';

export interface RivalBrain {
  def: RivalDef;
  rng: Rng;
  tan: boolean;
  /** Seconds the current tan or dheel has been held. */
  held: number;
  /** Seconds the current choice must be kept before it may change. */
  minHold: number;
  /** Which side of the player's line the rival is sweeping toward, ±1. */
  side: number;
  sideTimer: number;
  /** Wandering offset for the kid's unpredictable target. */
  wander: V3;
  /** Pench rhythm phase, seconds. */
  rhythm: number;
}

export interface RivalView {
  self: KiteState;
  anchor: V3;
  player: KiteState | null;
  playerAnchor: V3;
  playerLine: Line | null;
  inPench: boolean;
  t: number;
}

interface Policy {
  aimTolerance: number;
  /** Preferred height above the player's kite while hunting. */
  above: number;
  /** Line length the rival likes to fly at. */
  length: number;
  /** In a pench: seconds of tan and of dheel per beat. */
  tanBeat: number;
  dheelBeat: number;
  /** In a pench: natai pays out during dheel. */
  reelInPench: number;
  /** Random flips per second, for the kid's unpredictability. */
  chaos: number;
}

const POLICIES: Readonly<Record<Personality, Policy>> = {
  kid: { aimTolerance: 0.7, above: 0, length: 70, tanBeat: 0.3, dheelBeat: 0.3, reelInPench: 0.2, chaos: 1.6 },
  boroBhai: { aimTolerance: 0.4, above: 14, length: 95, tanBeat: 0.35, dheelBeat: 1.2, reelInPench: 1, chaos: 0.15 },
  uncle: { aimTolerance: 0.45, above: 4, length: 80, tanBeat: 0.9, dheelBeat: 0.25, reelInPench: 0, chaos: 0.3 },
  champion: { aimTolerance: 0.22, above: 8, length: 100, tanBeat: 0.45, dheelBeat: 0.55, reelInPench: 0.8, chaos: 0 },
};

export function policyOf(p: Personality): Policy {
  return POLICIES[p];
}

export function newBrain(def: RivalDef, seed: number): RivalBrain {
  const rng = new Rng(seed);
  return {
    def,
    rng,
    tan: true,
    held: 0,
    minHold: 0.2,
    side: rng.chance(0.5) ? 1 : -1,
    sideTimer: rng.range(4, 8),
    wander: { x: 0, y: 0, z: 0 },
    rhythm: 0,
  };
}

const frame = newFrame();

/** The point the rival steers its kite toward: across the player's line, so its string sweeps through it. */
export function huntTarget(brain: RivalBrain, v: RivalView, out: V3): V3 {
  const pol = POLICIES[brain.def.personality];
  if (!v.player || !v.playerLine || v.player.free) {
    out.x = v.anchor.x;
    out.y = v.anchor.y + pol.length * 0.7;
    out.z = v.anchor.z - pol.length * 0.6;
    return out;
  }
  const line = v.playerLine;
  // A point most of the way up the player's string.
  const i = Math.floor((line.n - 1) * 0.72);
  const lx = line.px(i);
  const ly = line.py(i);
  const lz = line.pz(i);
  // Lateral axis across the player's string, in the horizontal plane.
  let ax = v.player.pos.x - v.playerAnchor.x;
  let az = v.player.pos.z - v.playerAnchor.z;
  const al = Math.sqrt(ax * ax + az * az) || 1;
  ax /= al;
  az /= al;
  const px = -az;
  const pz = ax;
  const sweep = 10 + 6 * brain.def.skill;
  out.x = lx + px * brain.side * sweep + brain.wander.x;
  out.y = ly + pol.above + brain.wander.y;
  out.z = lz + pz * brain.side * sweep + brain.wander.z;
  if (brain.def.personality === 'boroBhai') {
    // Patient: waits high until the player's kite comes within reach.
    const dx = v.player.pos.x - v.self.pos.x;
    const dz = v.player.pos.z - v.self.pos.z;
    if (Math.sqrt(dx * dx + dz * dz) > 32) {
      out.x = v.self.pos.x * 0.7 + lx * 0.3;
      out.y = Math.max(ly, v.player.pos.y) + pol.above + 10;
      out.z = v.self.pos.z * 0.7 + lz * 0.3;
    }
  }
  // Never hunt down among the roofs: a target below flying height drags the kite into the city.
  out.y = Math.max(out.y, v.anchor.y + 28);
  return out;
}

const target: V3 = { x: 0, y: 0, z: 0 };

/** One tick of the rival's decision. */
export function decide(brain: RivalBrain, v: RivalView, dt: number): Control {
  const pol = POLICIES[brain.def.personality];
  const skill = brain.def.skill;
  const rng = brain.rng;
  brain.held += dt;
  brain.sideTimer -= dt;
  if (brain.sideTimer <= 0) {
    brain.side = -brain.side;
    brain.sideTimer = rng.range(3.5, 8);
  }
  if (pol.chaos > 0 && rng.chance(pol.chaos * dt * 0.3)) {
    brain.wander.x = rng.signed() * 18;
    brain.wander.y = rng.signed() * 10;
    brain.wander.z = rng.signed() * 12;
  }

  let reel = 0;
  const len = lineLength(v.self);
  if (v.inPench) {
    brain.rhythm += dt;
    let tan = brain.tan;
    if (brain.def.personality === 'champion' && v.player) {
      // Reads the player's rhythm: moves his line opposite to theirs, and never holds still.
      const playerFeed = v.player.feed;
      if (Math.abs(playerFeed) < 1.5) tan = v.self.give > 0;
      else tan = playerFeed > 0;
      if (Math.abs(v.self.feed) < 0.5 && brain.held > 0.15) tan = !brain.tan;
      reel = tan ? 0 : pol.reelInPench;
    } else {
      const beat = brain.tan ? pol.tanBeat : pol.dheelBeat;
      const jitter = 1 + (1 - skill) * 0.6 * rng.signed();
      if (brain.held > beat * jitter) tan = !brain.tan;
      if (pol.chaos > 0 && rng.chance(pol.chaos * dt)) tan = !tan;
      reel = tan ? 0 : pol.reelInPench;
    }
    return commit(brain, tan, reel);
  }

  huntTarget(brain, v, target);
  kiteFrame(v.self.pos, v.anchor, v.self.nose, frame);
  const dx = target.x - v.self.pos.x;
  const dy = target.y - v.self.pos.y;
  const dz = target.z - v.self.pos.z;
  const across = dx * frame.right.x + dy * frame.right.y + dz * frame.right.z;
  const upward = dx * frame.up.x + dy * frame.up.y + dz * frame.up.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // Low over the roofs, the only goal is height: wait for the nose to come up, then pull.
  const height = v.self.pos.y - v.anchor.y;
  const low = height < 22;
  const want = low ? 0 : Math.atan2(across, upward);
  const err = Math.abs(wrapAngle(want - v.self.nose));
  // Precise near the target, generous when it is far away and any rough heading will do.
  const tol = low ? 0.55 : pol.aimTolerance * (1.4 - 0.6 * skill) + 0.45 * Math.min(1, dist / 60);
  let tan = err < tol;
  // Near the top of the wind window the kite has no power: release and let it drift back down into
  // the wind before steering again. Too steep and too low: the same, letting out line as it goes.
  const steep = frame.radial.y > 0.86;
  if (steep && (low || target.y < v.self.pos.y - 5)) tan = false;
  if (brain.held < brain.minHold) tan = brain.tan;
  // The natai: let line out to a kite whose target is out of reach (it only pays out as fast as the
  // kite takes it); wind in when the kite is far beyond where it needs to be.
  const tx = target.x - v.anchor.x;
  const ty = target.y - v.anchor.y;
  const tz = target.z - v.anchor.z;
  const reach = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if ((low && steep) || (reach > len * 0.9 && len < pol.length * 1.6)) reel = 1;
  else if (!low && reach < len * 0.55 && len > 30) reel = -1;
  return commit(brain, tan, reel);
}

function commit(brain: RivalBrain, tan: boolean, reel: number): Control {
  if (tan !== brain.tan) {
    brain.tan = tan;
    brain.held = 0;
    brain.minHold = tan ? 0.22 : 0.12;
  }
  return { tan, reel };
}
