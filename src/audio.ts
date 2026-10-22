// Audio (DESIGN.md 6), mixed with the Web Audio API. Wind, the string hum, the natai, the loudspeaker
// loops and the menu motif are synthesized here. Crowd beds, fireworks, flame, pigeons and paper use
// CC0 recordings when they are present in assets/audio/ and fall back to synthesis; the Bengali voices
// (bhokatta shouts, laughter, groans) are played from assets/audio/voices/ whenever they exist, layered
// two or three deep at random pitch and timing so no two shouts sound the same (4.4).
import type { DayPhase } from './types';

/** Every audio file shipped with the game, found at build time. */
const FILES = import.meta.glob('../assets/audio/**/*.{ogg,mp3,wav,m4a,webm}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function filesFor(prefix: string): string[] {
  return Object.entries(FILES)
    .filter(([path]) => path.split('/').pop()?.startsWith(prefix))
    .map(([, url]) => url);
}

export type VoiceKind = 'bhokatta' | 'laugh' | 'groan';

export interface AudioFrame {
  /** Kite altitude above the player's roof, metres. */
  altitude: number;
  windSpeed: number;
  tension: number;
  /** Line feed, m/s; positive pays out. */
  feed: number;
  pulling: boolean;
  phase: DayPhase;
  /** 0..1 how far into the night. */
  night: number;
  /** In a pench: the crowd quiets. */
  pench: boolean;
  playing: boolean;
  flying: boolean;
}

/** A bhatiyali-flavoured pentatonic over D, the river boatmen's mode, as MIDI notes. */
const SCALE = [62, 64, 65, 69, 70, 74, 76, 77, 81];
const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambience!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private windLayers: { gain: GainNode; filter: BiquadFilterNode }[] = [];
  private hum!: { oscs: OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode; lfo: OscillatorNode; lfoGain: GainNode };
  private whir!: { gain: GainNode; osc: OscillatorNode };
  private crowd!: { gain: GainNode };
  private speakers!: GainNode;
  private flameBed!: GainNode;
  private ratchetClock = 0;
  private musicTimer: number | null = null;
  private speakerTimer: number | null = null;
  private volume = 0.8;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly voices: Record<VoiceKind, string[]> = {
    bhokatta: filesFor('bhokatta'),
    laugh: filesFor('laugh'),
    groan: filesFor('groan'),
  };
  /** CC0 recordings by kind, used in place of synthesis when present (assets/CREDITS.md). */
  private readonly library: Record<'crowd' | 'firework' | 'flame' | 'pigeon' | 'paper', string[]> = {
    crowd: filesFor('crowd-'),
    firework: filesFor('firework-'),
    flame: filesFor('flame-'),
    pigeon: filesFor('pigeon-'),
    paper: filesFor('paper-'),
  };
  /** True when at least one recorded bhokatta exists; otherwise the HUD shows the word alone. */
  readonly hasVoices = filesFor('bhokatta').length > 0;
  /** Called with the caption text whenever a shout plays. */
  onCaption: ((kind: VoiceKind) => void) | null = null;

  /** Must be called from a user gesture: creates or resumes the context. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.ambience = this.bus(0.9);
    this.sfx = this.bus(1);
    this.music = this.bus(0.55);
    this.noise = this.makeNoise(4);
    this.buildWind();
    this.buildHum();
    this.buildWhir();
    this.buildCrowd();
    this.speakers = ctx.createGain();
    this.speakers.gain.value = 0;
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 900;
    this.speakers.connect(muffle).connect(this.ambience);
    this.flameBed = this.loopNoise(this.ambience, 'bandpass', 500, 0.6);
    this.flameBed.gain.value = 0;
    document.addEventListener('visibilitychange', this.duck);
  }

  private duck = (): void => {
    if (!this.ctx) return;
    const hidden = document.visibilityState === 'hidden';
    this.master.gain.setTargetAtTime(hidden ? 0 : this.volume, this.ctx.currentTime, 0.15);
    if (hidden) window.setTimeout(() => document.visibilityState === 'hidden' && void this.ctx?.suspend(), 400);
    else void this.ctx.resume();
  };

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  private bus(level: number): GainNode {
    const g = (this.ctx as AudioContext).createGain();
    g.gain.value = level;
    g.connect(this.master);
    return g;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Pink-ish noise (Paul Kellet's economy filter): fuller than white for wind and crowds.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return buf;
  }

  private loopNoise(dest: AudioNode, type: BiquadFilterType, freq: number, q: number): GainNode {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(dest);
    src.start(0, Math.random() * 3);
    return g;
  }

  private buildWind(): void {
    const ctx = this.ctx as AudioContext;
    const specs: [BiquadFilterType, number, number][] = [
      ['lowpass', 260, 0.7],
      ['bandpass', 750, 0.6],
      ['highpass', 3200, 0.5],
    ];
    for (const [type, freq, q] of specs) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.ambience);
      src.start(0, Math.random() * 3);
      this.windLayers.push({ gain, filter });
    }
  }

  private buildHum(): void {
    const ctx = this.ctx as AudioContext;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 6;
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    lfo.connect(lfoGain).connect(gain.gain);
    const oscs: OscillatorNode[] = [];
    for (const [type, detune] of [
      ['sawtooth', -6],
      ['sawtooth', 7],
      ['sine', 0],
    ] as [OscillatorType, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      o.frequency.value = 140;
      o.connect(filter);
      o.start();
      oscs.push(o);
    }
    filter.connect(gain).connect(this.sfx);
    lfo.start();
    this.hum = { oscs, filter, gain, lfo, lfoGain };
  }

  private buildWhir(): void {
    const ctx = this.ctx as AudioContext;
    const g = this.loopNoise(this.sfx, 'bandpass', 900, 2.5);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 80;
    const og = ctx.createGain();
    og.gain.value = 0.25;
    osc.connect(og).connect(g);
    osc.start();
    this.whir = { gain: g, osc };
  }

  private buildCrowd(): void {
    const ctx = this.ctx as AudioContext;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.ambience);
    // Babble: formant-band noise, each band breathing at its own slow rate like many voices.
    for (const [freq, q] of [
      [420, 3],
      [900, 4],
      [1500, 5],
      [2400, 6],
    ]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq as number;
      f.Q.value = q as number;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.6 + Math.random() * 2.2;
      const lg = ctx.createGain();
      lg.gain.value = 0.22;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(gain);
      src.start(0, Math.random() * 3);
      lfo.start();
    }
    this.crowd = { gain };
  }

  /** Per frame: drives the continuous layers from the state of the game. */
  update(f: AudioFrame, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const tc = 0.08;
    const play = f.playing ? 1 : 0.35;
    const alt = Math.min(1, Math.max(0, f.altitude / 120));
    const w = Math.min(1.5, f.windSpeed / 7);
    const levels = [0.25 + 0.2 * w, 0.06 + 0.25 * w * (0.4 + alt), 0.02 + 0.08 * w * alt];
    this.windLayers.forEach((l, i) => l.gain.gain.setTargetAtTime((levels[i] as number) * play, now, 0.4));

    // The string hum: the most important sound. Pitch rises with tension; it sings in the wind.
    const flying = f.flying && f.playing ? 1 : 0;
    const t = Math.min(1.3, f.tension);
    const pitch = 95 + t * 230 + f.windSpeed * 9;
    for (const o of this.hum.oscs) o.frequency.setTargetAtTime(pitch, now, tc);
    this.hum.filter.frequency.setTargetAtTime(pitch * 2.2, now, tc);
    const humLevel = flying * (0.012 + 0.07 * t * Math.min(1, w + 0.3));
    this.hum.gain.gain.setTargetAtTime(humLevel, now, tc);
    this.hum.lfo.frequency.setTargetAtTime(6 + f.windSpeed * 0.8, now, 0.3);
    this.hum.lfoGain.gain.setTargetAtTime(humLevel * 0.4, now, 0.2);

    // The natai: a whir paying out, a ratchet winding in.
    const out = Math.max(0, f.feed);
    this.whir.gain.gain.setTargetAtTime(flying * Math.min(0.25, out * 0.03), now, 0.05);
    this.whir.osc.frequency.setTargetAtTime(60 + out * 22, now, 0.05);
    const inRate = Math.max(0, -f.feed);
    if (flying && inRate > 0.3) {
      this.ratchetClock += dt * inRate * 6;
      while (this.ratchetClock >= 1) {
        this.ratchetClock -= 1;
        this.click(0.02 + Math.random() * 0.02, 2600 + Math.random() * 800);
      }
    }

    // Crowd: louder through the day into the night, hushed in a pench.
    const base = { afternoon: 0.12, golden: 0.16, dusk: 0.2, night: 0.28 }[f.phase];
    this.crowd.gain.gain.setTargetAtTime(base * (f.pench ? 0.35 : 1) * play, now, 0.5);
    this.speakers.gain.setTargetAtTime((0.05 + 0.3 * f.night) * play, now, 1.5);
    this.flameBed.gain.setTargetAtTime(0.05 * f.night * play, now, 2);
    if (f.playing && this.speakerTimer === null) this.startSpeakers();
  }

  private click(level: number, freq: number): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 8;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 3, 0.04);
  }

  private async buffer(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => (this.ctx as AudioContext).decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  /** Plays recorded voices if present, layered and detuned. Returns false if there are none. */
  private voicesNow(kind: VoiceKind, layers: number, level: number): boolean {
    const list = this.voices[kind];
    if (!this.ctx || list.length === 0) return false;
    for (let i = 0; i < layers; i++) {
      const url = list[Math.floor(Math.random() * list.length)] as string;
      const delay = i * (0.08 + Math.random() * 0.25);
      void this.buffer(url).then((b) => {
        if (!b || !this.ctx) return;
        const src = this.ctx.createBufferSource();
        src.buffer = b;
        src.playbackRate.value = 0.88 + Math.random() * 0.26;
        const g = this.ctx.createGain();
        g.gain.value = level * (0.6 + Math.random() * 0.4);
        const pan = this.ctx.createStereoPanner();
        pan.pan.value = Math.random() * 1.6 - 0.8;
        src.connect(g).connect(pan).connect(this.sfx);
        src.start(this.ctx.currentTime + delay);
      });
    }
    this.onCaption?.(kind);
    return true;
  }

  /** Plays a library recording of a kind, if any exist; returns false to fall back to synthesis. */
  private recording(kind: keyof GameAudio['library'], level: number, delay = 0, rate = 1): boolean {
    const list = this.library[kind];
    if (!this.ctx || list.length === 0) return false;
    const url = list[Math.floor(Math.random() * list.length)] as string;
    void this.buffer(url).then((b) => {
      if (!b || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rate * (0.92 + Math.random() * 0.16);
      const g = this.ctx.createGain();
      g.gain.value = level;
      src.connect(g).connect(this.sfx);
      src.start(this.ctx.currentTime + delay);
    });
    return true;
  }

  /** A swelling crowd roar (the bed under the shouts). */
  private roar(level: number, seconds: number, rising = true): void {
    if (this.recording('crowd', level * 1.6)) return;
    const ctx = this.ctx as AudioContext;
    const t = ctx.currentTime;
    for (const [freq, q] of [
      [500, 1.5],
      [1100, 2],
      [2200, 3],
    ]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime((freq as number) * (rising ? 0.8 : 1.1), t);
      f.frequency.linearRampToValueAtTime((freq as number) * (rising ? 1.15 : 0.7), t + seconds * 0.5);
      f.Q.value = q as number;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      src.connect(f).connect(g).connect(this.sfx);
      src.start(t, Math.random() * 2, seconds + 0.2);
    }
  }

  /** The cut: ভোকাট্টা! from the roofs. `won` true when the player made the cut. */
  bhokatta(won: boolean): void {
    if (!this.ctx) return;
    this.roar(won ? 0.5 : 0.3, 2.8);
    this.voicesNow('bhokatta', 2 + Math.floor(Math.random() * 2), won ? 0.9 : 0.6);
    if (!won) this.voicesNow('groan', 1, 0.5);
    else if (Math.random() < 0.5) this.voicesNow('laugh', 1, 0.4);
  }

  groan(): void {
    if (!this.ctx) return;
    this.roar(0.2, 1.6, false);
    this.voicesNow('groan', 2, 0.6);
  }

  /** The pench starts: a hush, a sharp intake of the crowd. */
  penchStart(): void {
    if (!this.ctx) return;
    this.roar(0.08, 0.9);
  }

  /** Paper rustle and a short cheer on a caught kite. */
  caught(): void {
    if (!this.ctx) return;
    this.rustle();
    this.roar(0.18, 1.2);
    this.voicesNow('laugh', 1, 0.5);
  }

  rustle(): void {
    if (!this.ctx || this.recording('paper', 0.5)) return;
    for (let i = 0; i < 6; i++)
      window.setTimeout(() => this.click(0.05, 1800 + Math.random() * 2500), i * 35 + Math.random() * 30);
  }

  /** Pigeons scattering: wing-beats as amplitude-modulated noise. */
  pigeons(): void {
    const ctx = this.ctx;
    if (!ctx || this.recording('pigeon', 0.6)) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 14;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0.18, t);
    lg.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, 0, 1.8);
    lfo.start(t);
    lfo.stop(t + 1.8);
  }

  /** A shell climbing: a rising whistle. */
  rocket(distance: number): void {
    const ctx = this.ctx;
    if (!ctx || distance > 900) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(2600, t + 1.3);
    const g = ctx.createGain();
    const level = 0.04 / (1 + distance / 150);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 1.5);
  }

  /** A burst: the boom arrives late, at the speed of sound, and duller with distance. */
  boom(distance: number, crackle: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.recording('firework', 1.2 / (1 + distance / 120), distance / 343, 1 - Math.min(0.3, distance / 3000))) return;
    const t = ctx.currentTime + distance / 343;
    const level = 0.9 / (1 + distance / 120);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200 / (1 + distance / 300);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 2, 1.8);
    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(90, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(level * 0.8, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    thump.connect(tg).connect(this.sfx);
    thump.start(t);
    thump.stop(t + 0.6);
    if (crackle) {
      for (let i = 0; i < 18; i++) {
        const when = t + 0.9 + Math.random() * 1.2;
        window.setTimeout(() => this.click(level * 0.25, 3000 + Math.random() * 3000), (when - ctx.currentTime) * 1000);
      }
    }
  }

  /** The fire-breather's whoosh. */
  whoosh(distance: number): void {
    const ctx = this.ctx;
    if (!ctx || distance > 500) return;
    if (this.recording('flame', 0.5 / (1 + distance / 60))) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
    const g = ctx.createGain();
    const level = 0.3 / (1 + distance / 60);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 2, 1.4);
  }

  private note(dest: AudioNode, freq: number, start: number, dur: number, kind: 'flute' | 'reed', level: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = kind === 'flute' ? 'sine' : 'sawtooth';
    o.frequency.setValueAtTime(freq, start);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.value = freq * 0.006;
    vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(level, start + 0.06);
    g.gain.setTargetAtTime(level * 0.6, start + 0.1, 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    let out: AudioNode = o.connect(g);
    if (kind === 'reed') {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1800;
      out = out.connect(f);
    }
    out.connect(dest);
    o.start(start);
    vib.start(start);
    o.stop(start + dur + 0.05);
    vib.stop(start + dur + 0.05);
  }

  private drum(dest: AudioNode, start: number, low: boolean, level: number): void {
    const ctx = this.ctx as AudioContext;
    if (low) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(110, start);
      o.frequency.exponentialRampToValueAtTime(52, start + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(level, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      o.connect(g).connect(dest);
      o.start(start);
      o.stop(start + 0.35);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(level * 0.8, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
      src.connect(f).connect(g).connect(dest);
      src.start(start, Math.random() * 3, 0.12);
    }
  }

  /** The menu motif: a dhol keherwa and a bamboo flute, looping while the menu is up. */
  menuMusic(on: boolean): void {
    if (!this.ctx) return;
    if (!on) {
      if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
      this.musicTimer = null;
      this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
      return;
    }
    if (this.musicTimer !== null) return;
    this.music.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.4);
    const beat = 60 / 92;
    const phrase = [0, 2, 3, 4, 3, 2, 1, 0, 2, 4, 5, 4, 3, 2, 0, -1];
    let bar = 0;
    const schedule = () => {
      const ctx = this.ctx as AudioContext;
      const t0 = ctx.currentTime + 0.1;
      // Keherwa: dha ge na ti na ka dhi na.
      const pattern = [1, 0, 0, 1, 0, 1, 1, 0];
      pattern.forEach((low, i) => this.drum(this.music, t0 + (i * beat) / 2, low === 1, low === 1 ? 0.5 : 0.25));
      for (let i = 0; i < 4; i++) {
        const step = phrase[(bar * 4 + i) % phrase.length] as number;
        if (step < 0) continue;
        this.note(this.music, midi((SCALE[step] ?? 62) + 12), t0 + i * beat, beat * 0.95, 'flute', 0.08);
      }
      bar++;
    };
    schedule();
    this.musicTimer = window.setInterval(schedule, 4 * beat * 1000);
  }

  /** Distant loudspeakers: a muffled synthesized loop of dhol and harmonium, louder toward night. */
  private startSpeakers(): void {
    const beat = 60 / 104;
    const tunes = [
      [0, 2, 4, 2, 3, 2, 1, 0],
      [4, 5, 4, 3, 2, 3, 1, 0],
    ];
    let bar = 0;
    const schedule = () => {
      const ctx = this.ctx;
      if (!ctx) return;
      const t0 = ctx.currentTime + 0.1;
      for (let i = 0; i < 8; i++) this.drum(this.speakers, t0 + (i * beat) / 2, i % 4 === 0 || i === 5, i % 4 === 0 ? 0.7 : 0.35);
      const tune = tunes[Math.floor(bar / 4) % 2] as number[];
      for (let i = 0; i < 4; i++)
        this.note(this.speakers, midi(SCALE[tune[(bar % 2) * 4 + i] as number] ?? 62), t0 + i * beat, beat * 0.9, 'reed', 0.12);
      bar++;
    };
    schedule();
    this.speakerTimer = window.setInterval(schedule, 4 * beat * 1000);
  }
}
