// The one data file for names and stats (DESIGN.md 4.6, 4.7, 12). Kite names come from Shakrain
// reporting and are checked against written and photographic sources in M3; a correction is a
// one-line change here.
import type { KiteStats, ManjaStats, NataiStats, Named, RivalDef, Rooftop, Unlock } from '../types';

export const KITES: readonly KiteStats[] = [
  { id: 'chokhdar', bn: 'চোখদার', en: 'Chokhdar', kind: 'fighter', stability: 0.55, speed: 0.5, print: 0, shape: 'diamond' },
  { id: 'goyadar', bn: 'গয়াদার', en: 'Goyadar', kind: 'fighter', stability: 0.7, speed: 0.4, print: 1, shape: 'diamond' },
  { id: 'pandar', bn: 'পানদার', en: 'Pandar', kind: 'fighter', stability: 0.45, speed: 0.65, print: 2, shape: 'diamond' },
  { id: 'lejdar', bn: 'লেজদার', en: 'Lejdar', kind: 'fighter', stability: 0.8, speed: 0.45, print: 3, shape: 'diamond' },
  { id: 'chapalish', bn: 'চাপালিশ', en: 'Chapalish', kind: 'fighter', stability: 0.35, speed: 0.8, print: 4, shape: 'diamond' },
  {
    id: 'prajapati',
    bn: 'প্রজাপতি',
    en: 'Prajapati',
    kind: 'shaped',
    stability: 0.85,
    speed: 0.35,
    print: 5,
    shape: 'butterfly',
  },
  { id: 'rocket', bn: 'রকেট', en: 'Rocket', kind: 'shaped', stability: 0.75, speed: 0.6, print: 6, shape: 'rocket' },
  { id: 'baksh', bn: 'বাক্স', en: 'Baksh', kind: 'shaped', stability: 0.95, speed: 0.3, print: 7, shape: 'box' },
];

export const MANJAS: readonly ManjaStats[] = [
  { id: 'majhari', bn: 'মাঝারি মাঞ্জা', en: 'Majhari manja', sharpness: 1.0, durability: 1.0, wear: 0.01, color: 0xd4486e },
  { id: 'narom', bn: 'নরম মাঞ্জা', en: 'Narom manja', sharpness: 0.85, durability: 1.3, wear: 0.006, color: 0xe8b23a },
  { id: 'dhar', bn: 'ধারালো মাঞ্জা', en: 'Dharalo manja', sharpness: 1.25, durability: 0.8, wear: 0.016, color: 0x3fa7a0 },
];

export const NATAIS: readonly NataiStats[] = [
  { id: 'bansh', bn: 'বাঁশের নাটাই', en: 'Bamboo natai', reelSpeed: 4, capacity: 220 },
  { id: 'kath', bn: 'কাঠের নাটাই', en: 'Wooden natai', reelSpeed: 6, capacity: 240 },
  { id: 'boro', bn: 'বড় নাটাই', en: 'Big natai', reelSpeed: 4.5, capacity: 320 },
];

/** Player rooftops, metres from the Shankhari Bazar roof that the city is centred on. */
export const ROOFTOPS: readonly Rooftop[] = [
  { id: 'shankhari', bn: 'শাঁখারী বাজার', en: 'Shankhari Bazar', x: 0, z: 0, height: 18 },
  { id: 'tanti', bn: 'তাঁতী বাজার', en: 'Tanti Bazar', x: -130, z: -70, height: 21 },
  { id: 'laxmi', bn: 'লক্ষ্মীবাজার', en: 'Laxmi Bazar', x: 150, z: 30, height: 24 },
  { id: 'sutrapur', bn: 'সূত্রাপুর', en: 'Sutrapur', x: 60, z: -250, height: 15 },
];

const area = (id: string, bn: string, en: string): Named => ({ id, bn, en });
const AREAS = {
  shankhari: area('shankhari', 'শাঁখারী বাজার', 'Shankhari Bazar'),
  tanti: area('tanti', 'তাঁতী বাজার', 'Tanti Bazar'),
  laxmi: area('laxmi', 'লক্ষ্মীবাজার', 'Laxmi Bazar'),
  sutrapur: area('sutrapur', 'সূত্রাপুর', 'Sutrapur'),
  gendaria: area('gendaria', 'গেন্ডারিয়া', 'Gendaria'),
  farashganj: area('farashganj', 'ফরাশগঞ্জ', 'Farashganj'),
  islampur: area('islampur', 'ইসলামপুর', 'Islampur'),
  banglabazar: area('banglabazar', 'বাংলাবাজার', 'Bangla Bazar'),
  narinda: area('narinda', 'নারিন্দা', 'Narinda'),
  wari: area('wari', 'ওয়ারী', 'Wari'),
};

/** The fourteen campaign rivals in order of appearance: five kids, four boro bhais, four uncles, the champion. */
export const RIVALS: readonly RivalDef[] = [
  {
    id: 'rafi',
    bn: 'রাফি',
    en: 'Rafi',
    personality: 'kid',
    area: AREAS.shankhari,
    kite: 'chokhdar',
    manja: 'narom',
    offset: { x: 34, z: -26 },
    skill: 0.15,
  },
  {
    id: 'tutul',
    bn: 'টুটুল',
    en: 'Tutul',
    personality: 'kid',
    area: AREAS.tanti,
    kite: 'pandar',
    manja: 'narom',
    offset: { x: -40, z: -34 },
    skill: 0.2,
  },
  {
    id: 'mithu',
    bn: 'মিঠু',
    en: 'Mithu',
    personality: 'kid',
    area: AREAS.banglabazar,
    kite: 'goyadar',
    manja: 'majhari',
    offset: { x: 52, z: -48 },
    skill: 0.25,
  },
  {
    id: 'bappi',
    bn: 'বাপ্পি',
    en: 'Bappi',
    personality: 'kid',
    area: AREAS.islampur,
    kite: 'chapalish',
    manja: 'majhari',
    offset: { x: -58, z: -20 },
    skill: 0.3,
  },
  {
    id: 'shanto',
    bn: 'শান্ত',
    en: 'Shanto',
    personality: 'kid',
    area: AREAS.narinda,
    kite: 'lejdar',
    manja: 'majhari',
    offset: { x: 44, z: -62 },
    skill: 0.35,
  },
  {
    id: 'babu',
    bn: 'বাবু ভাই',
    en: 'Babu bhai',
    personality: 'boroBhai',
    area: AREAS.sutrapur,
    kite: 'goyadar',
    manja: 'majhari',
    offset: { x: -48, z: -56 },
    skill: 0.45,
  },
  {
    id: 'shahin',
    bn: 'শাহীন ভাই',
    en: 'Shahin bhai',
    personality: 'boroBhai',
    area: AREAS.gendaria,
    kite: 'lejdar',
    manja: 'majhari',
    offset: { x: 64, z: -40 },
    skill: 0.5,
  },
  {
    id: 'rony',
    bn: 'রনি ভাই',
    en: 'Rony bhai',
    personality: 'boroBhai',
    area: AREAS.wari,
    kite: 'chokhdar',
    manja: 'dhar',
    offset: { x: -66, z: -44 },
    skill: 0.55,
  },
  {
    id: 'polash',
    bn: 'পলাশ ভাই',
    en: 'Polash bhai',
    personality: 'boroBhai',
    area: AREAS.farashganj,
    kite: 'pandar',
    manja: 'dhar',
    offset: { x: 40, z: -78 },
    skill: 0.6,
  },
  {
    id: 'kamal',
    bn: 'কামাল চাচা',
    en: 'Kamal chacha',
    personality: 'uncle',
    area: AREAS.laxmi,
    kite: 'chapalish',
    manja: 'dhar',
    offset: { x: -36, z: -70 },
    skill: 0.6,
  },
  {
    id: 'jalal',
    bn: 'জালাল চাচা',
    en: 'Jalal chacha',
    personality: 'uncle',
    area: AREAS.tanti,
    kite: 'chokhdar',
    manja: 'dhar',
    offset: { x: 70, z: -58 },
    skill: 0.65,
  },
  {
    id: 'mannan',
    bn: 'মান্নান চাচা',
    en: 'Mannan chacha',
    personality: 'uncle',
    area: AREAS.islampur,
    kite: 'pandar',
    manja: 'dhar',
    offset: { x: -72, z: -30 },
    skill: 0.7,
  },
  {
    id: 'habib',
    bn: 'হাবিব চাচা',
    en: 'Habib chacha',
    personality: 'uncle',
    area: AREAS.sutrapur,
    kite: 'goyadar',
    manja: 'dhar',
    offset: { x: 56, z: -84 },
    skill: 0.75,
  },
  {
    id: 'nanna',
    bn: 'ওস্তাদ নান্না মিয়া',
    en: 'Ustad Nanna Mia',
    personality: 'champion',
    area: AREAS.shankhari,
    kite: 'chapalish',
    manja: 'dhar',
    offset: { x: -30, z: -60 },
    skill: 0.95,
  },
];

/** Beating rival i in the campaign unlocks item i (DESIGN.md 4.6): fourteen rivals, fourteen items. */
export const UNLOCKS: readonly Unlock[] = [
  { kind: 'kite', id: 'goyadar' },
  { kind: 'manja', id: 'narom' },
  { kind: 'rooftop', id: 'tanti' },
  { kind: 'kite', id: 'prajapati' },
  { kind: 'natai', id: 'kath' },
  { kind: 'kite', id: 'pandar' },
  { kind: 'rooftop', id: 'laxmi' },
  { kind: 'kite', id: 'rocket' },
  { kind: 'manja', id: 'dhar' },
  { kind: 'kite', id: 'lejdar' },
  { kind: 'natai', id: 'boro' },
  { kind: 'rooftop', id: 'sutrapur' },
  { kind: 'kite', id: 'baksh' },
  { kind: 'kite', id: 'chapalish' },
];

export const STARTER = { kite: 'chokhdar', manja: 'majhari', natai: 'bansh', rooftop: 'shankhari' } as const;

function byId<T extends Named>(list: readonly T[], id: string): T {
  const found = list.find((x) => x.id === id);
  if (!found) throw new Error(`Unknown id ${id}`);
  return found;
}

export const kiteById = (id: string): KiteStats => byId(KITES, id);
export const manjaById = (id: string): ManjaStats => byId(MANJAS, id);
export const nataiById = (id: string): NataiStats => byId(NATAIS, id);
export const rooftopById = (id: string): Rooftop => byId(ROOFTOPS, id);
