// Boot, the fixed-step loop, quality tiers and URL parameters (DESIGN.md 8.2, 8.5). The simulation
// advances in fixed 120 Hz ticks from an accumulator; every view interpolates between the last two
// ticks. URL parameters ?seed=&t=&cam=&tier=&backend=&mode=&hud=&dev= reach any frame reproducibly.
import './style.css';
import { Color, DirectionalLight, HemisphereLight, RenderTarget, Scene, Vector2, Vector3, WebGPURenderer } from 'three/webgpu';
import { cameraPosition, exp, float, fog, length, max, normalize, positionView, positionWorld, uniform } from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { GameAudio, type VoiceKind } from './audio';
import { Input } from './input';
import { generateCity, type CityLayout, type Person } from './procedural/city';
import { isUnlocked, loadProgress, saveProgress, unlockFor, type Progress, type Settings } from './save';
import {
  fireworksRate,
  formatClock,
  lightsFactor,
  moonAngles,
  nightFactor,
  parseClock,
  phaseAt,
  phaseBlend,
  PHASE_STARTS,
  skyDirection,
  smoothstep,
  sunAngles,
  TICK_DT,
} from './sim/day';
import { lineLength, type KiteState } from './sim/kite';
import type { Line } from './sim/line';
import { kiteById, manjaById, nataiById, RIVALS, rooftopById } from './sim/names';
import { decide, newBrain, type RivalBrain } from './sim/rivals';
import { windAt } from './sim/wind';
import { playerAnchor, World } from './sim/world';
import type { Control, GameEvent, Mode, Tier, Unlock } from './types';
import { DUEL_RIVALS, UI } from './ui';
import { AmbientView } from './view/ambient';
import { FollowCamera } from './view/camera';
import { CityView } from './view/city';
import { CrowdView } from './view/crowd';
import { Hands } from './view/hands';
import { DistantKites, KiteView } from './view/kiteView';
import { LineBatch } from './view/lineView';
import { NightView } from './view/night';
import { Post } from './view/post';
import { Sky, sunlight } from './view/sky';
import { shared } from './view/uniforms';

// ---------------------------------------------------------------------------------------------
// URL parameters

interface Params {
  seed: number;
  minute: number | null;
  cam: { yaw: number; pitch: number; fov: number } | null;
  tier: Tier | null;
  backend: 'webgl' | null;
  mode: Mode | null;
  hud: boolean;
  dev: boolean;
}

function readParams(): Params {
  const p = new URLSearchParams(location.search);
  const cam = p.get('cam');
  let camPose: Params['cam'] = null;
  if (cam) {
    const [yaw, pitch, fov] = cam.split(',').map(Number);
    if (Number.isFinite(yaw) && Number.isFinite(pitch)) {
      camPose = {
        yaw: ((yaw ?? 0) * Math.PI) / 180,
        pitch: ((pitch ?? 0) * Math.PI) / 180,
        fov: Number.isFinite(fov) ? (fov as number) : 58,
      };
    }
  }
  const mode = p.get('mode');
  const tier = p.get('tier');
  return {
    seed: Number(p.get('seed') ?? 1) >>> 0 || 1,
    minute: parseClock(p.get('t') ?? ''),
    cam: camPose,
    tier: tier === 'high' || tier === 'balanced' ? tier : null,
    backend: p.get('backend') === 'webgl' ? 'webgl' : null,
    mode: mode === 'shakrain' || mode === 'pench' || mode === 'freesky' ? mode : null,
    hud: p.get('hud') !== '0',
    dev: p.get('dev') === '1' || import.meta.env.DEV,
  };
}

/** High on desktops; the balanced tier on phones and small-memory devices. */
function detectTier(): Tier {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if ((coarse && small) || memory <= 4) return 'balanced';
  return 'high';
}

async function waitForSize(): Promise<void> {
  // Some hosts lay the page out after scripts run; passes sized at zero never recover.
  while (innerWidth < 2 || innerHeight < 2) await new Promise((r) => setTimeout(r, 50));
}

const nextFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------------------------

type State = 'menu' | 'playing' | 'results';

const PURPLE_SKY = new Color(0.22, 0.26, 0.52);
const CITY_GLOW = new Color(0.62, 0.36, 0.2);

class Game {
  private readonly params: Params;
  private readonly progress: Progress;
  private readonly ui: UI;
  private readonly audio = new GameAudio();
  private renderer!: WebGPURenderer;
  private readonly scene = new Scene();
  private view!: FollowCamera;
  private sky!: Sky;
  private post!: Post;
  private layout!: CityLayout;
  private city!: CityView;
  private crowd!: CrowdView;
  private rivalCrowd: CrowdView | null = null;
  private readonly rivalPeople = new Map<number, Person>();
  private night!: NightView;
  private flock!: DistantKites;
  private lines!: LineBatch;
  private hands: Hands | null = null;
  private ambient: AmbientView | null = null;
  private input!: Input;
  private sun!: DirectionalLight;
  private moon!: DirectionalLight;
  private hemi!: HemisphereLight;
  private tier: Tier = 'high';
  world!: World;
  private state: State = 'menu';
  private photo = false;
  private photoMinute = 16 * 60 + 50;
  private readonly kiteViews = new Map<KiteState, KiteView>();
  private autopilot: RivalBrain | null = null;
  private readonly eye = new Vector3();
  private acc = 0;
  private last = 0;
  private manual = false;
  private timeScale = 1;
  private slowUntil = 0;
  private lean = 0;
  private rackUntil = -1;
  private rackTarget: KiteState | null = null;
  private watchKite: KiteState | null = null;
  private unlocks: Unlock[] = [];
  private pulls = 0;
  private wasPulling = false;
  private devTimer = 0;
  private readonly frameTimes: number[] = [];
  private perfChecked = false;
  private readonly fogDensity = uniform(1 / 1300);
  private readonly laneFog = uniform(0.25);
  private readonly sunDir = new Vector3();
  private readonly moonDir = new Vector3();
  private readonly sunColor = new Color();
  private readonly wind = { x: 0, y: 0, z: 0 };
  private exposure = 1;
  /** Set when the clock jumps (a new world, the photo-mode slider), so exposure starts where it belongs. */
  private snapExposure = true;

  constructor(params: Params) {
    this.params = params;
    this.progress = loadProgress();
    if (params.mode) this.progress.choice.mode = params.mode;
    const root = document.getElementById('ui') as HTMLElement;
    this.ui = new UI(root, this.progress, {
      start: () => this.start(),
      settingsChanged: (s) => this.applySettings(s),
      photo: (on) => this.setPhoto(on),
      saveFrame: () => this.saveFrame(),
      toMenu: () => this.toMenu(),
      timeChanged: (m) => {
        this.photoMinute = m;
        this.snapExposure = true;
      },
      again: () => this.start(),
    });
    this.ui.showMenu(false);
  }

  async boot(): Promise<void> {
    await waitForSize();
    const p = this.params;
    const q = this.progress.settings.quality;
    this.tier = p.tier ?? (q === 'auto' ? detectTier() : q);
    const canvas = document.getElementById('scene') as HTMLCanvasElement;
    this.renderer = new WebGPURenderer({
      canvas,
      antialias: false,
      forceWebGL: p.backend === 'webgl',
      powerPreference: 'high-performance',
    });
    await this.renderer.init();
    this.renderer.shadowMap.enabled = true;
    this.applyPixelRatio();
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.ui.setLoading(0.1);
    await nextFrame();

    this.view = new FollowCamera(innerWidth / innerHeight);
    this.scene.add(this.view.camera);
    this.sky = new Sky(this.renderer, this.tier, p.seed);
    this.scene.backgroundNode = this.sky.backgroundNode;
    this.setupFog();
    this.setupLights();
    this.ui.setLoading(0.25);
    await nextFrame();

    this.layout = generateCity(p.seed);
    this.ui.setLoading(0.4);
    await nextFrame();
    this.city = new CityView(this.layout, this.renderer, this.sky.noiseTexture, this.tier, p.seed);
    this.scene.add(this.city.group);
    this.ui.setLoading(0.6);
    await nextFrame();
    const drawn = this.city.roofDrawn;
    this.crowd = new CrowdView(
      this.layout.people.filter((q) => drawn(q.x, q.z)),
      p.seed,
      this.tier === 'high' ? 1 : 0.25,
    );
    this.scene.add(this.crowd.group);
    this.night = new NightView(this.layout, this.tier, p.seed, drawn);
    this.night.onBurst = (b) => {
      this.audio.boom(this.eye.distanceTo(new Vector3(b.x, b.y, b.z)), Math.random() < 0.3);
      if (Math.random() < 0.25) this.crowd.react(b.x, b.z, 140, 'point', 2.5, 0.25);
    };
    this.night.onLaunch = (x, y, z) => this.audio.rocket(this.eye.distanceTo(new Vector3(x, y, z)));
    this.night.onBreath = (x, y, z) => this.audio.whoosh(this.eye.distanceTo(new Vector3(x, y, z)));
    this.scene.add(this.night.group);
    this.flock = new DistantKites(
      this.layout.kiteRoofs.filter((r) => drawn(r.x, r.z)),
      this.tier === 'high' ? 600 : 200,
      p.seed,
    );
    this.scene.add(this.flock.mesh, this.flock.shell);
    this.lines = new LineBatch({ maxSegments: 3000 });
    this.scene.add(this.lines.mesh);
    this.ui.setLoading(0.75);
    await nextFrame();

    this.post = new Post(this.renderer, this.scene, this.view.camera, this.tier);
    this.input = new Input(canvas);
    this.input.onGesture = () => this.audio.start();
    this.input.bindDial(this.ui.dial, () => undefined);
    addEventListener('resize', () => this.resize());
    this.resize();
    this.audio.onCaption = (k: VoiceKind) => this.ui.caption(k);
    this.applySettings(this.progress.settings);

    // Behind the menu, the sky is already alive: a free flight at golden hour on autopilot.
    this.newWorld('freesky', true);
    this.ui.setLoading(1);
    this.ui.loaded();
    if (p.mode) this.start();
    else {
      this.ui.showMenu(true);
      this.ui.setHudVisible(false);
    }
    this.last = performance.now();
    // three's animation loop also advances its node frame, which once-per-frame passes depend on.
    this.renderer.setAnimationLoop(this.loop);
    Object.assign(window, {
      __natai: {
        ready: true,
        game: this,
        renderer: this.renderer,
        advance: (n: number) => this.advance(n),
        simulate: (s: number) => this.simulate(s),
        capture: () => this.capture(),
      },
    });
  }

  private applyPixelRatio(): void {
    const cap = this.tier === 'high' ? 1.5 : 1.25;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, cap));
  }

  private setupFog(): void {
    // Distance haze tinted by the sky, plus fog pooling low in the lanes, thicker at dusk.
    const viewDir = normalize(positionWorld.sub(cameraPosition));
    const dist = length(positionView);
    const haze = float(1).sub(exp(dist.mul(this.fogDensity).negate()));
    const lanes = float(1)
      .sub(exp(dist.mul(0.006).negate()))
      .mul(exp(max(positionWorld.y, 0).div(-7)))
      .mul(this.laneFog);
    this.scene.fogNode = fog(this.sky.hazeColor(viewDir), max(haze, lanes));
  }

  private setupLights(): void {
    const sun = new DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    const size = this.tier === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.5;
    sun.shadow.shadowNode = new CSMShadowNode(sun, {
      cascades: this.tier === 'high' ? 3 : 2,
      maxFar: this.tier === 'high' ? 520 : 300,
      mode: 'practical',
      lightMargin: 150,
    });
    this.sun = sun;
    this.moon = new DirectionalLight(0x9fb6ff, 0);
    this.hemi = new HemisphereLight(PURPLE_SKY, CITY_GLOW, 0);
    this.scene.add(sun, sun.target, this.moon, this.moon.target, this.hemi);
  }

  private resize(): void {
    if (innerWidth < 2 || innerHeight < 2) return;
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.view.resize(innerWidth / innerHeight);
    const pr = this.renderer.getPixelRatio();
    this.lines.setResolution(innerWidth * pr, innerHeight * pr);
  }

  private applySettings(s: Settings): void {
    this.audio.setVolume(s.volume);
    shared.fireOff.value = s.fire ? 0 : 1;
    this.post.reducedMotion.value = s.reducedMotion ? 1 : 0;
    saveProgress(this.progress);
    if (s.quality !== 'auto' && s.quality !== this.tier && !this.params.tier) this.setTier(s.quality);
  }

  /** A tier change rebuilds the post chain and resolution; the city keeps its geometry. */
  private setTier(t: Tier): void {
    this.tier = t;
    this.applyPixelRatio();
    this.post.dispose();
    this.post = new Post(this.renderer, this.scene, this.view.camera, t);
    this.post.reducedMotion.value = this.progress.settings.reducedMotion ? 1 : 0;
    this.resize();
  }

  // ---------------------------------------------------------------------------------------------
  // Sessions

  private newWorld(mode: Mode, background: boolean): void {
    this.snapExposure = true;
    const c = this.progress.choice;
    const roof = rooftopById(isUnlocked(this.progress, 'rooftop', c.rooftop) ? c.rooftop : 'shankhari');
    const kite = kiteById(c.kite);
    const usable =
      isUnlocked(this.progress, 'kite', kite.id) && (kite.kind === 'fighter' || mode === 'freesky') ? kite : kiteById('chokhdar');
    const manja = manjaById(isUnlocked(this.progress, 'manja', c.manja) ? c.manja : 'majhari');
    const natai = nataiById(isUnlocked(this.progress, 'natai', c.natai) ? c.natai : 'bansh');
    const startMinute =
      this.params.minute ??
      (background ? 16 * 60 + 50 : mode === 'pench' ? 16 * 60 + 40 : mode === 'freesky' ? 15 * 60 + 30 : undefined);
    this.world = new World({
      seed: this.params.seed,
      mode,
      kite: usable,
      manja,
      natai,
      anchor: playerAnchor({ x: roof.x, y: roof.height, z: roof.z }),
      ground: this.layout.heightAt,
      roofAt: this.layout.roofAt,
      ...(startMinute !== undefined ? { startMinute } : {}),
      duelRival: DUEL_RIVALS.includes(c.duelRival) ? c.duelRival : 0,
    });
    this.eye.set(roof.x, roof.height + 1.62, roof.z + 0.35);
    for (const v of this.kiteViews.values()) {
      this.scene.remove(v.mesh);
      v.dispose();
    }
    this.kiteViews.clear();
    this.hands?.group.removeFromParent();
    this.hands = new Hands(this.view.camera, natai.id, 0xe9e2d0, manja.color);
    const pilot = RIVALS[0];
    this.autopilot = background && pilot ? newBrain({ ...pilot, skill: 0.7 }, this.params.seed) : null;
    this.buildRivalCrowd();
    this.buildAmbient();
    this.acc = 0;
    this.timeScale = 1;
    this.slowUntil = 0;
    this.watchKite = null;
    this.rackTarget = null;
    this.unlocks = [];
    this.lean = 0;
    if (this.params.cam) this.view.setPose(this.params.cam.yaw, this.params.cam.pitch, this.params.cam.fov);
  }

  /** People on the rivals' roofs, flying their kites; each appears when that rival arrives. */
  private buildRivalCrowd(): void {
    if (this.rivalCrowd) this.scene.remove(this.rivalCrowd.group);
    const a = this.world.player.anchor;
    const people: Person[] = [];
    this.rivalPeople.clear();
    RIVALS.forEach((r, i) => {
      const roof = this.layout.roofAt(a.x + r.offset.x, a.z + r.offset.z);
      const body = r.personality === 'kid' ? 2 : r.personality === 'uncle' ? 0 : 3;
      const person: Person = { x: roof.x, y: roof.y, z: roof.z, rot: Math.PI, body, anim: 1, roof: -1 };
      people.push(person);
      this.rivalPeople.set(i, person);
    });
    this.rivalCrowd = new CrowdView(people, this.params.seed + 99);
    for (const p of people) this.rivalCrowd.setVisible(p, false);
    this.scene.add(this.rivalCrowd.group);
  }

  private buildAmbient(): void {
    if (this.ambient) this.scene.remove(this.ambient.group);
    const a = this.world.player.anchor;
    const roost = this.layout.roofAt(a.x + 22, a.z - 18);
    this.ambient = new AmbientView(roost, this.params.seed);
    this.scene.add(this.ambient.group);
  }

  private start(): void {
    this.audio.start();
    this.audio.menuMusic(false);
    const mode = this.progress.choice.mode;
    saveProgress(this.progress);
    this.newWorld(mode, false);
    this.state = 'playing';
    this.ui.showMenu(false);
    this.ui.setHudVisible(this.params.hud);
    this.ui.duelScore(mode === 'pench', 0, 0);
    this.input.enabled = true;
    this.input.release();
    this.pulls = 0;
    this.ui.pullHint(!this.progress.tutorial && this.params.hud && !this.params.cam);
  }

  private toMenu(): void {
    this.setPhoto(false);
    this.state = 'menu';
    this.newWorld('freesky', true);
    this.ui.showMenu(true);
    this.ui.setHudVisible(false);
    this.ui.rivalTag(false);
    this.ui.pullHint(false);
    this.audio.menuMusic(true);
  }

  private setPhoto(on: boolean): void {
    if (on === this.photo) return;
    this.photo = on;
    this.input.photo = on;
    if (on) {
      this.photoMinute = this.world.minute;
      this.view.enterPhoto();
    } else this.view.exitPhoto();
    this.ui.photoMode(on, this.photoMinute);
    if (!on) this.ui.setHudVisible(this.state === 'playing' && this.params.hud);
  }

  /**
   * Renders the current frame into an offscreen target and reads it back as PNG. Reading the canvas
   * itself is unreliable for WebGPU: a canvas that has not been presented can hand back an old frame.
   */
  async capture(): Promise<Blob | null> {
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    const w = size.x;
    const h = size.y;
    const rt = new RenderTarget(w, h, { depthBuffer: false });
    this.renderer.setRenderTarget(rt);
    this.post.render();
    this.renderer.setRenderTarget(null);
    const pixels = (await this.renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h)) as Uint8Array;
    rt.dispose();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const image = ctx.createImageData(w, h);
    // Rows come back top-first on WebGPU and bottom-first on WebGL.
    const flip = !(this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
    for (let y = 0; y < h; y++) {
      const src = (flip ? h - 1 - y : y) * w * 4;
      image.data.set(pixels.subarray(src, src + w * 4), y * w * 4);
    }
    ctx.putImageData(image, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  private saveFrame(): void {
    void this.capture().then((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `natai-${formatClock(this.photoMinute).replace(':', '')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // The loop

  private readonly loop = (now: number): void => {
    if (!this.manual) this.frame(now);
  };

  /**
   * Steps frames by hand at 60 fps, for tests and hidden previews where animation frames never fire.
   * Each step also advances three's node frame, as its own animation loop would.
   */
  advance(frames: number): void {
    this.manual = true;
    const nodes = (this.renderer as unknown as { _nodes: { nodeFrame: { update(): void; frameId: number } } })._nodes;
    for (let i = 0; i < frames; i++) {
      nodes.nodeFrame.update();
      (this.renderer.info as { frame: number }).frame = nodes.nodeFrame.frameId;
      this.frame(this.last + 1000 / 60);
    }
  }

  /** Runs the simulation forward without drawing, for tests that need the game minutes ahead. */
  simulate(seconds: number): void {
    const ticks = Math.round(seconds / TICK_DT);
    for (let i = 0; i < ticks; i++) {
      this.world.step(this.control());
      this.handle(this.world.events);
    }
  }

  private control(): Control {
    if (this.autopilot) {
      const p = this.world.player;
      return decide(
        this.autopilot,
        {
          self: p.kite,
          anchor: p.anchor,
          player: null,
          playerAnchor: p.anchor,
          playerLine: null,
          inPench: false,
          t: this.world.time,
        },
        TICK_DT,
      );
    }
    // A locked URL camera pose is for screenshots: the kite holds a steady pull.
    if (this.params.cam && this.state === 'playing') return { tan: true, reel: 0 };
    return this.input.sample(TICK_DT);
  }

  private frame(now: number): void {
    const real = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.slowUntil > 0 && now > this.slowUntil) {
      this.slowUntil = 0;
      this.timeScale = 1;
    }
    const w = this.world;
    if (!this.photo && this.state !== 'results') {
      this.acc += real * this.timeScale;
      let ticks = 0;
      while (this.acc >= TICK_DT && ticks < 24) {
        w.step(this.control());
        this.handle(w.events);
        this.acc -= TICK_DT;
        ticks++;
      }
      if (ticks === 24) this.acc = 0;
    }
    const alpha = Math.min(1, this.acc / TICK_DT);
    const minute = this.photo ? this.photoMinute : w.minute;
    this.environment(minute, real);
    this.updateViews(real, alpha, minute);
    this.post.render();
    this.trackPerformance(real);
  }

  // ---------------------------------------------------------------------------------------------
  // Events

  private handle(events: GameEvent[]): void {
    const w = this.world;
    const ui = this.ui;
    const live = this.state === 'playing';
    for (const e of events) {
      switch (e.type) {
        case 'rivalArrives': {
          const r = RIVALS[e.rival];
          const person = this.rivalPeople.get(e.rival);
          if (person) this.rivalCrowd?.setVisible(person, true);
          if (r && live)
            ui.toast(
              r.personality === 'champion' ? ui.t('champion') : ui.t('arrives', { name: ui.name(r), area: ui.name(r.area) }),
            );
          break;
        }
        case 'penchStart': {
          if (!live) break;
          ui.toast(ui.t('penchToast'), 1.5);
          this.audio.penchStart();
          const a = w.player.anchor;
          this.crowd.react(a.x, a.z, 90, 'point', 4, 0.6);
          break;
        }
        case 'cut':
          this.onCut(e, live);
          break;
        case 'caught':
          if (!live) break;
          ui.toast(ui.t('caughtToast'));
          this.audio.caught();
          break;
        case 'phase':
          if (live && e.phase === 'night' && w.mode === 'shakrain') ui.toast(ui.t('nightfall'), 4);
          break;
        case 'roundOver':
          if (live) ui.duelScore(true, e.playerWins, e.rivalWins);
          break;
        case 'matchOver':
          if (live) window.setTimeout(() => this.finish(e.won), 3500);
          break;
        case 'dayOver':
          if (live) this.finish(null);
          break;
        default:
          break;
      }
    }
  }

  private onCut(e: Extract<GameEvent, { type: 'cut' }>, live: boolean): void {
    const w = this.world;
    const ui = this.ui;
    const won = e.winner === 'player';
    const rival = w.rivals.find((r) => r.index === e.rival);
    // The cut kite tumbles away: half a second of slow motion, focus racked onto it.
    const falling = won ? rival?.flyer.kite : w.player.kite;
    if (falling) {
      this.rackTarget = falling;
      this.rackUntil = w.time + 2.5;
      this.watchKite = won ? null : falling;
    }
    if (!this.progress.settings.reducedMotion) {
      this.timeScale = 0.25;
      this.slowUntil = performance.now() + 500;
    }
    if (!live) return;
    ui.shout();
    this.audio.bhokatta(won);
    if (!this.audio.hasVoices) ui.caption('bhokatta');
    this.ambient?.burst(new Vector3(e.x, e.y, e.z));
    this.ambient?.scatter();
    this.audio.pigeons();
    const a = w.player.anchor;
    const person = this.rivalPeople.get(e.rival);
    if (won) {
      this.crowd.react(a.x, a.z, 110, 'cheer', 4, 0.85);
      if (person) this.rivalCrowd?.react(person.x, person.z, 5, 'flinch', 3, 1);
      if (w.mode === 'shakrain') {
        const u = unlockFor(this.progress, e.rival);
        if (u) {
          this.unlocks.push(u);
          window.setTimeout(() => ui.toast(ui.unlockText(u), 3.5), 1800);
        }
        if (RIVALS[e.rival]?.personality === 'champion') this.progress.best.championBeaten = true;
        saveProgress(this.progress);
      }
    } else {
      ui.toast(ui.t('yourCut'), 2.5);
      this.crowd.react(a.x, a.z, 110, 'flinch', 3, 0.7);
      if (person) this.rivalCrowd?.react(person.x, person.z, 5, 'cheer', 4, 1);
    }
  }

  private finish(won: boolean | null): void {
    if (this.state !== 'playing') return;
    const s = this.world.score;
    const b = this.progress.best;
    b.cut = Math.max(b.cut, s.cut);
    b.caught = Math.max(b.caught, s.caught);
    this.progress.tutorial = true;
    saveProgress(this.progress);
    this.state = 'results';
    this.ui.setHudVisible(false);
    this.ui.rivalTag(false);
    this.ui.showResults({
      won,
      cut: s.cut,
      caught: s.caught,
      bestCut: s.bestCut,
      longest: s.longestPench,
      unlocks: this.unlocks,
      beaten: s.beaten,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // The light of the day

  private environment(minute: number, dt: number): void {
    const w = this.world;
    skyDirection(sunAngles(minute), this.sunDir);
    skyDirection(moonAngles(minute), this.moonDir);
    const night = nightFactor(minute);
    const lights = lightsFactor(minute);
    const phase = phaseAt(minute);
    const coverage = { afternoon: 0.38, golden: 0.33, dusk: 0.26, night: 0.12 }[phase];
    this.sky.update({ sunDir: this.sunDir, moonDir: this.moonDir, night, coverage, time: w.time, nightGlow: night }, this.scene);

    const intensity = sunlight(this.sunDir, this.sunColor);
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = intensity;
    this.sun.castShadow = intensity > 0.05;
    this.sun.position.copy(this.eye).addScaledVector(this.sunDir, 500);
    this.sun.target.position.copy(this.eye);
    this.moon.position.copy(this.eye).addScaledVector(this.moonDir.y > 0 ? this.moonDir : new Vector3(0, 1, 0), 500);
    this.moon.target.position.copy(this.eye);
    this.moon.intensity = 0.35 * night;
    // At night the city lights itself: indigo from above, sodium and lantern glow from below.
    this.hemi.intensity = 0.2 * smoothstep(17 * 60 + 15, 17 * 60 + 45, minute) + 0.22 * night;

    shared.time.value = w.time;
    shared.night.value = night;
    shared.lights.value = lights;
    shared.sunDirection.value.copy(this.sunDir);
    shared.sunColor.value.set(this.sunColor.r * intensity, this.sunColor.g * intensity, this.sunColor.b * intensity);
    const a = w.player.anchor;
    windAt(w.wind, a.x, a.y + 60, a.z, w.time, this.wind);
    shared.wind.value.set(this.wind.x, this.wind.y, this.wind.z);

    // Exposure follows the day and gently adapts: the night is dark but readable.
    const low = smoothstep(0.35, 0.02, Math.max(0, this.sunDir.y));
    // Twilight: with the sun a few degrees below the horizon the scattered sky is two orders of magnitude
    // dimmer than at sunset, and an eye or camera opens right up; without this, dusk reads as night.
    const twilight = smoothstep(0.01, -0.05, this.sunDir.y) * smoothstep(-0.17, -0.09, this.sunDir.y);
    const target =
      (1.0 + 0.15 * low + 0.6 * smoothstep(17 * 60 + 25, 18 * 60 + 10, minute) + 0.15 * night) * (1 + 2.2 * twilight);
    this.exposure = this.snapExposure ? target : this.exposure + (target - this.exposure) * (1 - Math.exp(-dt * 0.8));
    this.snapExposure = false;
    this.renderer.toneMappingExposure = this.exposure;

    const fogTarget = { afternoon: 1 / 1500, golden: 1 / 1250, dusk: 1 / 950, night: 1 / 1100 }[phase];
    this.fogDensity.value += (fogTarget - this.fogDensity.value) * 0.02;
    this.laneFog.value = 0.18 + 0.5 * smoothstep(17 * 60, 18 * 60, minute) - 0.2 * night;

    const g = phaseBlend(minute);
    this.post.setGrade(g.from, g.to, g.t);
    this.post.godRayStrength.value = 0.18 + 0.45 * low * (1 - night);
    this.post.bloomStrength.value = 0.2 + 0.25 * night;
    if (this.ambient) this.ambient.dustAmount.value = low * (1 - night) * (this.sunDir.y > -0.01 ? 1 : 0);
  }

  // ---------------------------------------------------------------------------------------------
  // Views

  private kiteView(k: KiteState): KiteView {
    let v = this.kiteViews.get(k);
    if (!v) {
      v = new KiteView(k.stats);
      this.kiteViews.set(k, v);
      this.scene.add(v.mesh);
    }
    return v;
  }

  private updateViews(dt: number, alpha: number, minute: number): void {
    const w = this.world;
    const p = w.player;
    const ws = Math.hypot(this.wind.x, this.wind.y, this.wind.z) || 1;
    const windDir = { x: this.wind.x / ws, y: this.wind.y / ws, z: this.wind.z / ws };
    const live = new Set<KiteState>();
    const place = (k: KiteState, anchor: { x: number; y: number; z: number }) => {
      live.add(k);
      this.kiteView(k).update(k, anchor, alpha, w.time, dt, ws, windDir);
    };
    if (p.state === 'flying') place(p.kite, p.anchor);
    for (const r of w.rivals) if (r.flyer.state === 'flying') place(r.flyer.kite, r.flyer.anchor);
    for (const f of w.falling) place(f.kite, f.kite.pos);
    for (const [k, v] of this.kiteViews) {
      if (live.has(k)) continue;
      this.scene.remove(v.mesh);
      v.dispose();
      this.kiteViews.delete(k);
    }

    // Camera: follow the kite, lean in on a pench, watch the player's own falling kite, or the fireworks.
    const target = new Vector3();
    const playerView = this.kiteViews.get(p.kite);
    const engaged = w.contact !== null;
    this.lean += ((engaged ? 1 : 0) - this.lean) * (1 - Math.exp(-dt * 2.5));
    const watched = this.watchKite ? this.kiteViews.get(this.watchKite) : undefined;
    if (watched) target.copy(watched.position);
    else if (p.state === 'flying' && playerView) {
      target.copy(playerView.position);
      if (engaged && w.contact) {
        const c = w.contact.closest.pa;
        target.lerp(new Vector3(c.x, c.y, c.z), 0.45 * this.lean);
      }
    } else target.set(this.eye.x, this.eye.y + 150, this.eye.z - 420);
    this.view.lean = this.lean;
    this.view.update(
      dt,
      this.eye,
      target,
      this.input.takeLook(dt),
      this.input.lookIdle,
      this.params.cam !== null,
      this.input.move,
    );
    this.view.camera.updateMatrixWorld();

    // Hands and natai.
    const pulling = this.autopilot ? false : this.input.pulling || (this.params.cam !== null && this.state === 'playing');
    this.hands?.update(dt, pulling && this.state === 'playing', p.kite.feed, p.kite.tension, !this.photo && p.state !== 'landed');
    if (this.state === 'playing' && this.input.pulling && !this.wasPulling) {
      this.pulls++;
      if (this.pulls === 3) {
        this.ui.pullHint(false);
        this.progress.tutorial = true;
        saveProgress(this.progress);
      }
    }
    this.wasPulling = this.input.pulling;

    // Strings.
    const L = this.lines;
    L.begin();
    const grip = this.hands?.grip ?? this.eye;
    const drum = this.hands?.drum ?? this.eye;
    const manja = new Color(p.manja.color);
    const pr = this.renderer.getPixelRatio();
    if (p.state === 'flying') {
      this.drawLine(p.line, alpha, grip, playerView?.position ?? null, 2.6, manja, 0.95, 1);
      L.addSegment(drum.x, drum.y, drum.z, grip.x, grip.y, grip.z, 1.8 * pr, manja.r, manja.g, manja.b, 0.95);
    } else if (p.loose) this.drawLine(p.loose, alpha, grip, null, 1.6, manja, 0.85, 0.5);
    for (const r of w.rivals) {
      const c = new Color(r.flyer.manja.color);
      if (r.flyer.state === 'flying')
        this.drawLine(r.flyer.line, alpha, null, this.kiteViews.get(r.flyer.kite)?.position ?? null, 1.9, c, 0.85, 0.8);
      else if (r.flyer.loose) this.drawLine(r.flyer.loose, alpha, null, null, 1.2, c, 0.6, 0.3);
    }
    for (const f of w.falling)
      this.drawLine(f.tail, alpha, null, this.kiteViews.get(f.kite)?.position ?? null, 1.3, new Color(0.85, 0.75, 0.7), 0.8, 0.4);
    for (const v of this.kiteViews.values())
      if (v.tail) L.addPolyline(v.tail, v.tailN, 3.2 * pr, 0.95, 0.2, 0.45, 0.95, 0, 0, 0.5);
    this.flock.presence = w.mode === 'freesky' ? 1 : 1 - smoothstep(PHASE_STARTS.night - 25, PHASE_STARTS.night + 5, minute);
    this.flock.update(w.time, this.eye, L);
    L.time.value = w.time;
    // The glass catches whatever is bright: the sun by day, string lights and fireworks at dusk.
    const recentBurst = this.night.bursts.some((b) => b.age >= 0 && b.age < 0.6) ? 1 : 0;
    L.glintLight.value = Math.min(1.2, this.sun.intensity / 2.5) + shared.lights.value * 0.55 + recentBurst * 0.6;
    // Strings are unlit lines: dim them with the light of the hour so they never glow on their own.
    L.brightness.value = Math.min(1, 0.12 + this.sun.intensity / 2.5 + 0.25 * shared.lights.value);
    L.end();

    this.city.update(dt);
    this.crowd.update(dt);
    this.rivalCrowd?.update(dt);
    const fire = this.progress.settings.fire;
    this.night.update(dt, w.time, fire ? fireworksRate(minute) : 0, shared.lights.value, fire, shared.wind.value);
    this.ambient?.update(dt, w.time, this.eye, shared.wind.value);

    // Post: the sun's place on screen for the god rays; focus on the kite or the rack target.
    const cam = this.view.camera;
    const fwd = new Vector3();
    cam.getWorldDirection(fwd);
    const sp = this.sunDir.clone().multiplyScalar(2000).add(cam.position).project(cam);
    // Screen UVs run top-down on both backends, so NDC y is flipped.
    this.post.sunScreen.value.set(sp.x * 0.5 + 0.5, 0.5 - sp.y * 0.5);
    const facing = fwd.dot(this.sunDir);
    this.post.sunVisible.value = facing > 0 ? Math.min(1, facing * 1.5) * Math.min(1, Math.max(0, this.sunDir.y * 12 + 0.4)) : 0;
    const racking = this.rackTarget && w.time < this.rackUntil ? this.kiteViews.get(this.rackTarget) : undefined;
    const focusAt = racking ? racking.position : target;
    const fd = focusAt.distanceTo(cam.position);
    this.post.focusDistance.value += (fd - this.post.focusDistance.value) * (racking ? 0.25 : 0.08);
    this.post.focalRange.value = racking ? 40 : 320;
    this.post.bokeh.value = racking ? 2.5 : 1;
    this.post.grainTime.value = w.time;

    if (this.state === 'playing' && !this.photo) this.updateHud(minute);
    this.audio.update(
      {
        altitude: p.kite.pos.y - p.anchor.y,
        windSpeed: ws,
        tension: p.state === 'flying' ? p.kite.tension : 0,
        feed: p.state === 'flying' ? p.kite.feed : 0,
        pulling,
        phase: phaseAt(minute),
        night: shared.night.value,
        pench: engaged,
        playing: this.state === 'playing',
        flying: p.state === 'flying',
      },
      dt,
    );
  }

  private drawLine(
    line: Line,
    alpha: number,
    start: Vector3 | null,
    end: Vector3 | null,
    width: number,
    c: Color,
    a: number,
    glint: number,
  ): void {
    const n = line.n;
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++)
      pts[i] = (line.last[i] as number) + ((line.pos[i] as number) - (line.last[i] as number)) * alpha;
    if (start) pts.set([start.x, start.y, start.z], 0);
    if (end) pts.set([end.x, end.y, end.z], (n - 1) * 3);
    this.lines.addPolyline(pts, n, width * this.renderer.getPixelRatio(), c.r, c.g, c.b, a, glint, 0, line.rest / (n - 1));
  }

  private updateHud(minute: number): void {
    const w = this.world;
    const p = w.player;
    const cam = this.view.camera;
    this.ui.updateHud({
      minute,
      lineLength: p.state === 'flying' ? lineLength(p.kite) : 0,
      capacity: p.natai.capacity,
      health: p.state === 'flying' ? p.line.weakest() / p.line.durability : 0,
      sharpness: p.sharpness,
      boost: p.boost > 0,
      windAngle: Math.atan2(this.wind.x, -this.wind.z) + cam.rotation.y,
      windSpeed: Math.hypot(this.wind.x, this.wind.z),
      cut: w.score.cut,
      caught: w.score.caught,
      spin: p.kite.natai / 0.47,
    });
    // The rival tag: over the rival you are engaged with, or the one currently flying.
    const r = w.rivals.find((x) => x.index === w.contactRival) ?? w.rivals.find((x) => x.flyer.state === 'flying');
    const rv = r ? this.kiteViews.get(r.flyer.kite) : undefined;
    if (r && rv) {
      const s = rv.position.clone().project(cam);
      const inFront = s.z < 1 && Math.abs(s.x) < 1.1 && Math.abs(s.y) < 1.1;
      this.ui.rivalTag(
        inFront,
        (s.x * 0.5 + 0.5) * innerWidth,
        (-s.y * 0.5 + 0.5) * innerHeight,
        r.index,
        w.contactRival === r.index,
      );
    } else this.ui.rivalTag(false);
  }

  private trackPerformance(dt: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.devTimer += dt;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    // Auto quality: a device that cannot hold 25 fps on the high tier after a few seconds steps down.
    if (
      !this.perfChecked &&
      this.state === 'playing' &&
      this.world.time > 6 &&
      this.progress.settings.quality === 'auto' &&
      !this.params.tier &&
      !this.manual
    ) {
      this.perfChecked = true;
      if (avg > 0.04 && this.tier === 'high') this.setTier('balanced');
    }
    if (this.params.dev && this.devTimer > 0.5) {
      this.devTimer = 0;
      const info = this.renderer.info.render;
      const backend = (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
      const budget = this.tier === 'high' ? { ms: 16.7, calls: 300, tris: 1.5e6 } : { ms: 33.3, calls: 150, tris: 5e5 };
      const over = avg * 1000 > budget.ms * 1.1 || info.drawCalls > budget.calls || info.triangles > budget.tris;
      this.ui.dev(
        `${(1 / avg).toFixed(0)} fps  ${(avg * 1000).toFixed(1)} ms\ncalls ${info.drawCalls}  tris ${(info.triangles / 1000).toFixed(0)}k\ntier ${this.tier}  ${backend}\n${formatClock(this.world.minute)}  tick ${this.world.tick}`,
        over,
      );
    }
  }
}

const game = new Game(readParams());
game.boot().catch((e: unknown) => {
  console.error(e);
  const ui = document.getElementById('ui');
  if (ui) {
    const p = document.createElement('p');
    p.className = 'error';
    p.style.cssText = 'position:fixed;inset:auto 16px 24px 16px;text-align:center;color:#ffd2d2;font:14px system-ui;z-index:60';
    p.textContent = `Natai could not start: ${String(e)}`;
    ui.append(p);
  }
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
