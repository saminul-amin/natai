// Local progress (DESIGN.md 4.6): unlocks, the player's choices and settings, and best results. Stored
// in localStorage, read defensively: a private window or blocked storage just starts fresh.
import { STARTER, UNLOCKS } from './sim/names';
import type { Lang, Mode, Tier, UnlockKind } from './types';

export interface Settings {
  lang: Lang;
  /** 'auto' picks the tier from the device. */
  quality: Tier | 'auto';
  volume: number;
  fire: boolean;
  reducedMotion: boolean;
  captions: boolean;
}

export interface Progress {
  /** Ids of unlocked items, by kind. */
  unlocked: Record<UnlockKind, string[]>;
  choice: { mode: Mode; kite: string; manja: string; natai: string; rooftop: string; duelRival: number };
  best: { cut: number; caught: number; championBeaten: boolean };
  settings: Settings;
  /** Seen the first-flight hint. */
  tutorial: boolean;
}

const KEY = 'natai.save.v1';

function prefersReducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function defaultLang(): Lang {
  try {
    return navigator.language.toLowerCase().startsWith('bn') ? 'bn' : 'en';
  } catch {
    return 'en';
  }
}

export function freshProgress(): Progress {
  return {
    unlocked: { kite: [STARTER.kite], manja: [STARTER.manja], natai: [STARTER.natai], rooftop: [STARTER.rooftop] },
    choice: {
      mode: 'shakrain',
      kite: STARTER.kite,
      manja: STARTER.manja,
      natai: STARTER.natai,
      rooftop: STARTER.rooftop,
      duelRival: 0,
    },
    best: { cut: 0, caught: 0, championBeaten: false },
    settings: {
      lang: defaultLang(),
      quality: 'auto',
      volume: 0.8,
      fire: true,
      reducedMotion: prefersReducedMotion(),
      captions: true,
    },
    tutorial: false,
  };
}

export function loadProgress(): Progress {
  const base = freshProgress();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return base;
    const p = parsed as Partial<Progress>;
    return {
      unlocked: { ...base.unlocked, ...(p.unlocked ?? {}) },
      choice: { ...base.choice, ...(p.choice ?? {}) },
      best: { ...base.best, ...(p.best ?? {}) },
      settings: { ...base.settings, ...(p.settings ?? {}) },
      tutorial: p.tutorial ?? false,
    };
  } catch {
    return base;
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage blocked: progress lives for this session only.
  }
}

export function isUnlocked(p: Progress, kind: UnlockKind, id: string): boolean {
  return p.unlocked[kind].includes(id);
}

/** Beating campaign rival `index` unlocks item `index` (DESIGN.md 4.6). Returns the new unlock, if any. */
export function unlockFor(p: Progress, rivalIndex: number): { kind: UnlockKind; id: string } | null {
  const u = UNLOCKS[rivalIndex];
  if (!u || isUnlocked(p, u.kind, u.id)) return null;
  p.unlocked[u.kind].push(u.id);
  return u;
}
