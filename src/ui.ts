// The interface (DESIGN.md 7): HTML and CSS over the canvas. Nothing in the 3D scene is interface.
// Menu, HUD, rival tag, shout, results and photo mode, in Bengali and English.
import { DAY_END, DAY_START, formatClock } from './sim/day';
import { KITES, MANJAS, NATAIS, RIVALS, ROOFTOPS } from './sim/names';
import { isUnlocked, type Progress, type Settings } from './save';
import type { Lang, Mode, Named, Unlock, UnlockKind } from './types';

type Key =
  | 'setting'
  | 'shakrain'
  | 'shakrainDesc'
  | 'pench'
  | 'penchDesc'
  | 'freesky'
  | 'freeskyDesc'
  | 'kite'
  | 'manja'
  | 'natai'
  | 'rooftop'
  | 'rival'
  | 'quality'
  | 'auto'
  | 'high'
  | 'balanced'
  | 'sound'
  | 'language'
  | 'fire'
  | 'motion'
  | 'captions'
  | 'on'
  | 'off'
  | 'fly'
  | 'hint'
  | 'cut'
  | 'caught'
  | 'bhokatta'
  | 'arrives'
  | 'penchToast'
  | 'caughtToast'
  | 'unlocked'
  | 'nightfall'
  | 'champion'
  | 'dayEnd'
  | 'won'
  | 'lost'
  | 'bestCut'
  | 'longest'
  | 'again'
  | 'menu'
  | 'photo'
  | 'save'
  | 'back'
  | 'pullHint'
  | 'round'
  | 'loading'
  | 'webgpuFail'
  | 'beaten'
  | 'yourCut'
  | 'captionBhokatta'
  | 'captionLaugh'
  | 'captionGroan'
  | 'seconds';

const TEXT: Record<Lang, Record<Key, string>> = {
  bn: {
    setting: 'পুরান ঢাকা · সাকরাইন',
    shakrain: 'সাকরাইন',
    shakrainDesc: 'পুরো একটা দিন, চোদ্দজন প্রতিদ্বন্দ্বী',
    pench: 'প্যাঁচ',
    penchDesc: 'একজনের সাথে, তিনে দুই',
    freesky: 'খোলা আকাশ',
    freeskyDesc: 'শুধু ওড়ানো, দিন দেখা, ছবি তোলা',
    kite: 'ঘুড়ি',
    manja: 'মাঞ্জা',
    natai: 'নাটাই',
    rooftop: 'ছাদ',
    rival: 'প্রতিদ্বন্দ্বী',
    quality: 'মান',
    auto: 'নিজে থেকে',
    high: 'উঁচু',
    balanced: 'ফোন',
    sound: 'শব্দ',
    language: 'ভাষা',
    fire: 'আগুন ও আতশবাজি',
    motion: 'কম নড়াচড়া',
    captions: 'ক্যাপশন',
    on: 'চালু',
    off: 'বন্ধ',
    fly: 'ওড়াও!',
    hint: 'ধরে রাখো — টান। ছেড়ে দাও — ঢিল। নাক যেদিকে, টানে ঘুড়ি সেদিকে যায়। চাকা বা W/S দিয়ে নাটাই ঘোরাও।',
    cut: 'কাটা',
    caught: 'ধরা',
    bhokatta: 'ভোকাট্টা!',
    arrives: '{name}, {area} থেকে, ঘুড়ি ওড়াচ্ছে',
    penchToast: 'প্যাঁচ!',
    caughtToast: 'ঘুড়ি ধরা! মাঞ্জা আরও ধারালো',
    unlocked: 'খুলেছে: {item}',
    nightfall: 'রাত নামছে — ঘুড়ি নামছে, আকাশে আতশবাজি',
    champion: 'শাঁখারী বাজারের ওস্তাদ এসেছেন',
    dayEnd: 'দিন শেষ',
    won: 'জিতেছ!',
    lost: 'কেটে গেছে',
    bestCut: 'দ্রুততম কাটা',
    longest: 'দীর্ঘতম প্যাঁচ',
    again: 'আবার',
    menu: 'মেনু',
    photo: 'ছবি',
    save: 'ছবি রাখো',
    back: 'ফিরে যাও',
    pullHint: 'আঙুল চেপে ধরো — টান। ছাড়ো — ঢিল। ঢিলে ঘুড়ি ঘোরে, টানে সোজা যায়।',
    round: 'রাউন্ড',
    loading: 'আকাশ সাজানো হচ্ছে…',
    webgpuFail: 'এই ব্রাউজারে 3D চালু করা গেল না। নতুন Chrome, Edge বা Safari চেষ্টা করো।',
    beaten: 'হারিয়েছ',
    yourCut: 'তোমার ঘুড়ি কেটে গেছে!',
    captionBhokatta: '[ছাদ থেকে চিৎকার: ভোকাট্টা!]',
    captionLaugh: '[হাসি]',
    captionGroan: '[হতাশার শব্দ]',
    seconds: 'সে.',
  },
  en: {
    setting: 'Puran Dhaka · Shakrain',
    shakrain: 'Shakrain',
    shakrainDesc: 'One full day, fourteen rivals',
    pench: 'Pench',
    penchDesc: 'One rival, best of three cuts',
    freesky: 'Free sky',
    freeskyDesc: 'Fly, watch the day, take photos',
    kite: 'Kite',
    manja: 'Manja',
    natai: 'Natai',
    rooftop: 'Rooftop',
    rival: 'Rival',
    quality: 'Quality',
    auto: 'Auto',
    high: 'High',
    balanced: 'Phone',
    sound: 'Sound',
    language: 'Language',
    fire: 'Fire & fireworks',
    motion: 'Reduced motion',
    captions: 'Captions',
    on: 'On',
    off: 'Off',
    fly: 'Fly!',
    hint: 'Hold to pull (tan), let go to release (dheel). A pulled kite flies where its nose points. Wheel or W/S turns the natai.',
    cut: 'cut',
    caught: 'caught',
    bhokatta: 'ভোকাট্টা!',
    arrives: '{name} of {area} is flying',
    penchToast: 'Pench!',
    caughtToast: 'Kite caught! Your manja is sharper',
    unlocked: 'Unlocked: {item}',
    nightfall: 'Night falls — the kites come down, the sky fills with fireworks',
    champion: 'The champion of Shankhari Bazar has come',
    dayEnd: "Day's end",
    won: 'You won!',
    lost: 'Your string was cut',
    bestCut: 'Fastest cut',
    longest: 'Longest pench',
    again: 'Again',
    menu: 'Menu',
    photo: 'Photo',
    save: 'Save frame',
    back: 'Back',
    pullHint: 'Press and hold — tan. Let go — dheel. Slack line spins the kite; a pull sends it straight.',
    round: 'Round',
    loading: 'Dressing the sky…',
    webgpuFail: 'Could not start 3D in this browser. Try a recent Chrome, Edge or Safari.',
    beaten: 'Beaten',
    yourCut: 'Your kite is cut!',
    captionBhokatta: '[Shouts from the roofs: bhokatta!]',
    captionLaugh: '[Laughter]',
    captionGroan: '[Groans]',
    seconds: 's',
  },
};

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

export function digits(text: string, lang: Lang): string {
  return lang === 'bn' ? text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d) : text;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export interface UICallbacks {
  start(): void;
  settingsChanged(s: Settings): void;
  photo(on: boolean): void;
  saveFrame(): void;
  toMenu(): void;
  timeChanged(minute: number): void;
  again(): void;
}

export interface HudState {
  minute: number;
  lineLength: number;
  capacity: number;
  /** Lowest health anywhere on the string, 0..1. */
  health: number;
  sharpness: number;
  boost: boolean;
  /** Wind direction relative to the camera's facing, radians. */
  windAngle: number;
  windSpeed: number;
  cut: number;
  caught: number;
  spin: number;
}

/** The four rivals offered in the quick duel: one of each personality. */
export const DUEL_RIVALS = [0, 5, 9, 13];

export class UI {
  private readonly root: HTMLElement;
  private readonly progress: Progress;
  private readonly cb: UICallbacks;
  private loading!: HTMLDivElement;
  private menu!: HTMLDivElement;
  private hud!: HTMLDivElement;
  private results: HTMLDivElement | null = null;
  private photoBar: HTMLDivElement | null = null;
  private devBox!: HTMLDivElement;
  private shoutEl!: HTMLDivElement;
  private toastEl!: HTMLDivElement;
  private captionEl!: HTMLDivElement;
  private tagEl!: HTMLDivElement;
  private duelEl!: HTMLDivElement;
  private pullEl!: HTMLDivElement;
  readonly dial: HTMLDivElement;
  private clockText!: HTMLSpanElement;
  private sunDot!: SVGCircleElement;
  private lineMeter!: HTMLSpanElement;
  private manjaMeter!: HTMLSpanElement;
  private manjaWrap!: HTMLDivElement;
  private lineLabel!: HTMLSpanElement;
  private compassArrow!: SVGGElement;
  private nataiSpokes!: SVGGElement;
  private scoreCut!: HTMLElement;
  private scoreCaught!: HTMLElement;
  private toastTimer = 0;
  private captionTimer = 0;

  constructor(root: HTMLElement, progress: Progress, cb: UICallbacks) {
    this.root = root;
    this.progress = progress;
    this.cb = cb;
    this.dial = el('div', 'dial interactive', '<span>natai</span>');
    this.buildLoading();
    this.buildHud();
    this.buildMenu();
    this.devBox = el('div', 'dev');
    this.devBox.hidden = true;
    root.append(this.hud, this.dial, this.devBox, this.menu, this.loading);
    this.setHudVisible(false);
  }

  get lang(): Lang {
    return this.progress.settings.lang;
  }

  t(key: Key, vars: Record<string, string> = {}): string {
    let s = TEXT[this.lang][key];
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  }

  name(n: Named): string {
    return this.lang === 'bn' ? n.bn : n.en;
  }

  private buildLoading(): void {
    this.loading = el('div', 'loading');
    this.loading.innerHTML = `<div class="title"><div class="bn">নাটাই</div><div class="latin">Natai</div><div class="setting">${TEXT.en.setting}</div><div class="bar"><span></span></div></div>`;
  }

  setLoading(fraction: number): void {
    const bar = this.loading.querySelector<HTMLSpanElement>('.bar span');
    if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
  }

  loaded(): void {
    this.loading.classList.add('done');
    window.setTimeout(() => this.loading.remove(), 900);
  }

  fail(message: string): void {
    const p = el('p', 'error');
    p.textContent = `${this.t('webgpuFail')} (${message})`;
    this.loading.querySelector('.title')?.append(p);
  }

  // ---------------- menu ----------------

  private buildMenu(): void {
    this.menu = el('div', 'menu');
    this.renderMenu();
  }

  private chips<T extends Named>(
    items: readonly T[],
    selected: string,
    kind: UnlockKind | null,
    enabled: (x: T) => boolean,
    pick: (x: T) => void,
  ): HTMLDivElement {
    const wrap = el('div', 'choices');
    for (const item of items) {
      const b = el('button', 'chip');
      const locked = kind !== null && !isUnlocked(this.progress, kind, item.id);
      b.textContent = this.name(item);
      if (locked) b.append(el('span', 'lock', '🔒'));
      b.disabled = locked || !enabled(item);
      b.setAttribute('aria-pressed', String(item.id === selected));
      b.addEventListener('click', () => {
        pick(item);
        this.renderMenu();
      });
      wrap.append(b);
    }
    return wrap;
  }

  private row(label: string, content: HTMLElement): HTMLDivElement {
    const r = el('div', 'row');
    const l = el('span');
    l.textContent = label;
    r.append(l, content);
    return r;
  }

  private toggle(value: boolean, set: (v: boolean) => void): HTMLDivElement {
    const wrap = el('div', 'choices');
    for (const v of [true, false]) {
      const b = el('button', 'chip');
      b.textContent = this.t(v ? 'on' : 'off');
      b.setAttribute('aria-pressed', String(v === value));
      b.addEventListener('click', () => {
        set(v);
        this.cb.settingsChanged(this.progress.settings);
        this.renderMenu();
      });
      wrap.append(b);
    }
    return wrap;
  }

  renderMenu(): void {
    const p = this.progress;
    const c = p.choice;
    const s = p.settings;
    this.menu.innerHTML = '';
    document.documentElement.lang = s.lang;
    const title = el('div', 'title');
    title.innerHTML = `<div class="bn">নাটাই</div><div class="latin">Natai</div><div class="setting">${this.t('setting')}</div>`;
    const panel = el('div', 'panel');
    const modes = el('div', 'modes');
    for (const m of ['shakrain', 'pench', 'freesky'] as Mode[]) {
      const b = el('button', 'mode');
      b.innerHTML = `<strong>${this.t(m)}</strong><small>${this.t(`${m}Desc` as Key)}</small>`;
      b.setAttribute('aria-pressed', String(c.mode === m));
      b.addEventListener('click', () => {
        c.mode = m;
        // Shaped kites fly only in free sky; fall back to a fighter elsewhere.
        if (m !== 'freesky' && KITES.find((k) => k.id === c.kite)?.kind === 'shaped') c.kite = 'chokhdar';
        this.renderMenu();
      });
      modes.append(b);
    }
    panel.append(modes);
    panel.append(
      this.row(
        this.t('kite'),
        this.chips(
          KITES,
          c.kite,
          'kite',
          (k) => k.kind === 'fighter' || c.mode === 'freesky',
          (k) => (c.kite = k.id),
        ),
      ),
    );
    panel.append(
      this.row(
        this.t('manja'),
        this.chips(
          MANJAS,
          c.manja,
          'manja',
          () => true,
          (m) => (c.manja = m.id),
        ),
      ),
    );
    panel.append(
      this.row(
        this.t('natai'),
        this.chips(
          NATAIS,
          c.natai,
          'natai',
          () => true,
          (n) => (c.natai = n.id),
        ),
      ),
    );
    panel.append(
      this.row(
        this.t('rooftop'),
        this.chips(
          ROOFTOPS,
          c.rooftop,
          'rooftop',
          () => true,
          (r) => (c.rooftop = r.id),
        ),
      ),
    );
    if (c.mode === 'pench') {
      const rivals = DUEL_RIVALS.map((i) => RIVALS[i]).filter((r): r is NonNullable<typeof r> => r !== undefined);
      const current = RIVALS[c.duelRival]?.id ?? 'rafi';
      panel.append(
        this.row(
          this.t('rival'),
          this.chips(
            rivals,
            current,
            null,
            () => true,
            (r) => (c.duelRival = RIVALS.indexOf(r)),
          ),
        ),
      );
    }
    const quality = el('div', 'choices');
    for (const q of ['auto', 'high', 'balanced'] as const) {
      const b = el('button', 'chip');
      b.textContent = this.t(q);
      b.setAttribute('aria-pressed', String(s.quality === q));
      b.addEventListener('click', () => {
        s.quality = q;
        this.cb.settingsChanged(s);
        this.renderMenu();
      });
      quality.append(b);
    }
    panel.append(this.row(this.t('quality'), quality));
    const lang = el('div', 'choices');
    for (const l of ['bn', 'en'] as Lang[]) {
      const b = el('button', 'chip');
      b.textContent = l === 'bn' ? 'বাংলা' : 'English';
      b.setAttribute('aria-pressed', String(s.lang === l));
      b.addEventListener('click', () => {
        s.lang = l;
        this.cb.settingsChanged(s);
        this.renderMenu();
        this.relabelHud();
      });
      lang.append(b);
    }
    panel.append(this.row(this.t('language'), lang));
    const vol = el('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '1';
    vol.step = '0.05';
    vol.value = String(s.volume);
    vol.className = 'interactive';
    vol.addEventListener('input', () => {
      s.volume = Number(vol.value);
      this.cb.settingsChanged(s);
    });
    panel.append(this.row(this.t('sound'), vol));
    panel.append(
      this.row(
        this.t('fire'),
        this.toggle(s.fire, (v) => (s.fire = v)),
      ),
    );
    panel.append(
      this.row(
        this.t('motion'),
        this.toggle(s.reducedMotion, (v) => (s.reducedMotion = v)),
      ),
    );
    panel.append(
      this.row(
        this.t('captions'),
        this.toggle(s.captions, (v) => (s.captions = v)),
      ),
    );
    const start = el('button', 'start');
    start.textContent = this.t('fly');
    start.addEventListener('click', () => this.cb.start());
    panel.append(start);
    const hint = el('div', 'hint');
    hint.textContent = this.t('hint');
    panel.append(hint);
    this.menu.append(title, panel);
  }

  showMenu(on: boolean): void {
    this.menu.classList.toggle('hidden', !on);
    if (on) this.renderMenu();
  }

  // ---------------- HUD ----------------

  private buildHud(): void {
    this.hud = el('div', 'hud');
    const top = el('div', 'top');
    const clock = el('div', 'clock');
    clock.innerHTML = `<svg viewBox="0 0 54 30" aria-hidden="true"><path d="M3 27 A24 24 0 0 1 51 27" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/><line x1="0" y1="27.5" x2="54" y2="27.5" stroke="rgba(255,255,255,.25)"/><circle r="3.4" fill="#fac440"/></svg><span></span>`;
    this.sunDot = clock.querySelector('circle') as SVGCircleElement;
    this.clockText = clock.querySelector('span') as HTMLSpanElement;
    const score = el('div', 'score');
    score.innerHTML = `<span><b>0</b><i class="l-cut"></i></span><span><b>0</b><i class="l-caught"></i></span>`;
    const bs = score.querySelectorAll('b');
    this.scoreCut = bs[0] as HTMLElement;
    this.scoreCaught = bs[1] as HTMLElement;
    const icons = el('div', 'icons');
    const photo = el('button', 'iconbtn interactive', '📷');
    photo.setAttribute('aria-label', 'Photo mode');
    photo.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.photo(true);
    });
    const menu = el('button', 'iconbtn interactive', '☰');
    menu.setAttribute('aria-label', 'Menu');
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.toMenu();
    });
    for (const b of [photo, menu]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    icons.append(photo, menu);
    top.append(clock, score, icons);

    const bottom = el('div', 'bottom');
    bottom.innerHTML = `<svg class="natai-icon" viewBox="-26 -26 52 52" aria-hidden="true"><circle r="22" fill="rgba(22,18,52,.5)" stroke="rgba(250,196,64,.6)"/><g class="spokes" stroke="#fac440" stroke-width="2.4" stroke-linecap="round"><line x1="-17" y1="0" x2="17" y2="0"/><line x1="-8.5" y1="-14.7" x2="8.5" y2="14.7"/><line x1="-8.5" y1="14.7" x2="8.5" y2="-14.7"/></g><circle r="7" fill="#d62478"/></svg>
      <div class="meters"><span class="l-line"></span><div class="meter"><span class="m-line"></span></div><span class="l-manja"></span><div class="meter manja"><span class="m-manja"></span></div></div>
      <svg class="compass" viewBox="-23 -23 46 46" aria-hidden="true"><circle r="21" fill="rgba(22,18,52,.5)" stroke="rgba(255,255,255,.3)"/><g class="arrow"><path d="M0 -15 L6 8 L0 4 L-6 8 Z" fill="#9fe3e3"/></g></svg>`;
    this.nataiSpokes = bottom.querySelector('.spokes') as SVGGElement;
    this.lineMeter = bottom.querySelector('.m-line') as HTMLSpanElement;
    this.manjaMeter = bottom.querySelector('.m-manja') as HTMLSpanElement;
    this.manjaWrap = bottom.querySelector('.meter.manja') as HTMLDivElement;
    this.lineLabel = bottom.querySelector('.l-line') as HTMLSpanElement;
    this.compassArrow = bottom.querySelector('.arrow') as SVGGElement;

    this.tagEl = el('div', 'rival-tag');
    this.tagEl.style.opacity = '0';
    this.shoutEl = el('div', 'shout');
    this.toastEl = el('div', 'toast');
    this.captionEl = el('div', 'caption');
    this.duelEl = el('div', 'duel-score');
    this.pullEl = el('div', 'pull-hint');
    this.hud.append(top, bottom, this.tagEl, this.shoutEl, this.toastEl, this.captionEl, this.duelEl, this.pullEl);
    this.relabelHud();
  }

  private relabelHud(): void {
    const q = (s: string) => this.hud.querySelector(s);
    const cut = q('.l-cut');
    const caught = q('.l-caught');
    if (cut) cut.textContent = this.t('cut');
    if (caught) caught.textContent = this.t('caught');
    const lm = q('.l-manja');
    if (lm) lm.textContent = this.t('manja');
  }

  setHudVisible(on: boolean): void {
    this.hud.classList.toggle('hidden', !on);
    this.dial.style.display = on ? '' : 'none';
  }

  updateHud(h: HudState): void {
    const f = (Math.min(DAY_END, Math.max(DAY_START, h.minute)) - DAY_START) / (DAY_END - DAY_START);
    // The sun arc: rises from the left at 14:00... the afternoon sun sinks along the arc to the right.
    const a = Math.PI * (0.25 + f * 0.85);
    this.sunDot.setAttribute('cx', String(27 - Math.cos(a) * 24));
    this.sunDot.setAttribute('cy', String(27 - Math.sin(a) * 24));
    this.sunDot.setAttribute('fill', f > 0.78 ? '#9fb4ff' : f > 0.5 ? '#ff9a3c' : '#fac440');
    this.clockText.textContent = digits(formatClock(h.minute), this.lang);
    this.lineMeter.style.width = `${Math.round((h.lineLength / h.capacity) * 100)}%`;
    this.lineLabel.textContent = digits(`${this.t('natai')} ${Math.round(h.lineLength)} m`, this.lang);
    this.manjaMeter.style.width = `${Math.round(Math.max(0, Math.min(1, h.health)) * 100)}%`;
    this.manjaWrap.classList.toggle('boost', h.boost);
    this.compassArrow.setAttribute('transform', `rotate(${(h.windAngle * 180) / Math.PI})`);
    this.nataiSpokes.setAttribute('transform', `rotate(${(h.spin * 180) / Math.PI})`);
    this.scoreCut.textContent = digits(String(h.cut), this.lang);
    this.scoreCaught.textContent = digits(String(h.caught), this.lang);
  }

  /** Name and rooftop above the rival you are engaged with; `x`, `y` in CSS pixels. */
  rivalTag(visible: boolean, x = 0, y = 0, rivalIndex = 0, engaged = false): void {
    if (!visible) {
      this.tagEl.style.opacity = '0';
      return;
    }
    const r = RIVALS[rivalIndex];
    if (!r) return;
    const html = `${this.name(r)}<small>${this.name(r.area)}</small>`;
    if (this.tagEl.innerHTML !== html) this.tagEl.innerHTML = html;
    this.tagEl.style.opacity = '1';
    this.tagEl.style.left = `${x}px`;
    this.tagEl.style.top = `${y}px`;
    this.tagEl.classList.toggle('engaged', engaged);
  }

  shout(text = this.t('bhokatta')): void {
    this.shoutEl.textContent = text;
    this.shoutEl.classList.remove('show');
    void this.shoutEl.offsetWidth;
    this.shoutEl.classList.add('show');
  }

  toast(text: string, seconds = 3): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), seconds * 1000);
  }

  caption(kind: 'bhokatta' | 'laugh' | 'groan'): void {
    if (!this.progress.settings.captions) return;
    const key: Key = kind === 'bhokatta' ? 'captionBhokatta' : kind === 'laugh' ? 'captionLaugh' : 'captionGroan';
    this.captionEl.textContent = this.t(key);
    this.captionEl.classList.add('show');
    window.clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => this.captionEl.classList.remove('show'), 2200);
  }

  duelScore(visible: boolean, player = 0, rival = 0): void {
    this.duelEl.textContent = visible ? digits(`${player} – ${rival}`, this.lang) : '';
  }

  pullHint(show: boolean): void {
    if (show) this.pullEl.textContent = this.t('pullHint');
    this.pullEl.classList.toggle('show', show);
  }

  unlockText(u: Unlock): string {
    const list: readonly Named[] =
      u.kind === 'kite' ? KITES : u.kind === 'manja' ? MANJAS : u.kind === 'natai' ? NATAIS : ROOFTOPS;
    const item = list.find((x) => x.id === u.id);
    return this.t('unlocked', { item: item ? this.name(item) : u.id });
  }

  // ---------------- results ----------------

  showResults(r: {
    won: boolean | null;
    cut: number;
    caught: number;
    bestCut: number;
    longest: number;
    unlocks: Unlock[];
    beaten: number[];
  }): void {
    this.results?.remove();
    const wrap = el('div', 'menu results');
    const panel = el('div', 'panel');
    const head = r.won === null ? this.t('dayEnd') : r.won ? this.t('won') : this.t('lost');
    const sec = (s: number) => (Number.isFinite(s) ? digits(`${s.toFixed(1)} ${this.t('seconds')}`, this.lang) : '—');
    panel.innerHTML = `<h2>${this.t('dayEnd')}</h2><div class="big">${head}</div>
      <div class="stats">
        <div class="stat"><b>${digits(String(r.cut), this.lang)}</b><small>${this.t('cut')}</small></div>
        <div class="stat"><b>${digits(String(r.caught), this.lang)}</b><small>${this.t('caught')}</small></div>
        <div class="stat"><b>${sec(r.bestCut)}</b><small>${this.t('bestCut')}</small></div>
        <div class="stat"><b>${sec(r.longest)}</b><small>${this.t('longest')}</small></div>
      </div>`;
    if (r.beaten.length > 0) {
      const b = el('div', 'unlocks');
      b.textContent = `${this.t('beaten')}: ${r.beaten.map((i) => (RIVALS[i] ? this.name(RIVALS[i]) : '')).join(', ')}`;
      panel.append(b);
    }
    for (const u of r.unlocks) {
      const d = el('div', 'unlocks');
      d.textContent = this.unlockText(u);
      panel.append(d);
    }
    const again = el('button', 'start');
    again.textContent = this.t('again');
    again.addEventListener('click', () => {
      wrap.remove();
      this.results = null;
      this.cb.again();
    });
    const menu = el('button', 'start');
    menu.style.background = 'rgba(255,255,255,.12)';
    menu.style.boxShadow = 'none';
    menu.textContent = this.t('menu');
    menu.addEventListener('click', () => {
      wrap.remove();
      this.results = null;
      this.cb.toMenu();
    });
    panel.append(again, menu);
    wrap.append(panel);
    this.results = wrap;
    this.root.append(wrap);
  }

  // ---------------- photo mode ----------------

  photoMode(on: boolean, minute = DAY_START): void {
    this.photoBar?.remove();
    this.photoBar = null;
    this.setHudVisible(!on);
    if (!on) return;
    const bar = el('div', 'photo-bar');
    const slider = el('input');
    slider.type = 'range';
    slider.min = String(DAY_START);
    slider.max = String(DAY_END);
    slider.step = '1';
    slider.value = String(Math.round(minute));
    const label = el('span');
    label.textContent = digits(formatClock(minute), this.lang);
    slider.addEventListener('input', () => {
      label.textContent = digits(formatClock(Number(slider.value)), this.lang);
      this.cb.timeChanged(Number(slider.value));
    });
    const save = el('button', 'chip');
    save.textContent = this.t('save');
    save.addEventListener('click', () => this.cb.saveFrame());
    const back = el('button', 'chip');
    back.textContent = this.t('back');
    back.addEventListener('click', () => this.cb.photo(false));
    for (const b of [slider, save, back]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.append(slider, label, save, back);
    this.photoBar = bar;
    this.root.append(bar);
  }

  dev(text: string | null, over = false): void {
    this.devBox.hidden = text === null;
    if (text !== null) {
      this.devBox.textContent = text;
      this.devBox.classList.toggle('over', over);
    }
  }
}
