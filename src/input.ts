// Input (DESIGN.md 4.2): one thumb flies. A hold anywhere is tan, letting go is dheel. The natai dial
// at the screen edge (or the mouse wheel, or W/S) winds and unwinds line. Free look is a right-mouse
// drag on desktop and a two-finger drag on touch. Input is sampled once per simulation tick.
import type { Control } from './types';

export interface LookDelta {
  x: number;
  y: number;
}

export class Input {
  private tanPointers = new Set<number>();
  private tanKey = false;
  private reelKey = 0;
  private dialReel = 0;
  private wheelSeconds = 0;
  private wheelDir = 0;
  private lookDx = 0;
  private lookDy = 0;
  private lookPointers = new Map<number, { x: number; y: number }>();
  private rightDrag: { x: number; y: number } | null = null;
  /** Seconds since the last free-look input, so the camera knows when to drift back. */
  lookIdle = 999;
  enabled = true;
  /** Photo mode: keys move a free camera instead of flying. */
  photo = false;
  readonly move = { forward: 0, right: 0, up: 0 };
  private readonly keys = new Set<string>();
  /** Called on any first interaction, so audio can start inside a user gesture. */
  onGesture: (() => void) | null = null;

  constructor(target: HTMLElement) {
    target.addEventListener('pointerdown', this.down);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('pointermove', this.moveHandler);
    target.addEventListener('wheel', this.wheel, { passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', () => this.release());
  }

  /** Binds the natai dial element: dragging it vertically winds (down) or unwinds (up) line. */
  bindDial(el: HTMLElement, onTurn: (amount: number) => void): void {
    let lastY = 0;
    let active = -1;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      active = e.pointerId;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
      this.onGesture?.();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== active) return;
      const dy = lastY - e.clientY;
      lastY = e.clientY;
      this.dialReel = Math.max(-1, Math.min(1, this.dialReel + dy * 0.05));
      onTurn(dy);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = -1;
      this.dialReel = 0;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private down = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.onGesture?.();
    if (e.pointerType === 'mouse' && e.button === 2) {
      this.rightDrag = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerType === 'touch') {
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // A second finger turns the gesture into free look; neither finger pulls.
      if (this.lookPointers.size >= 2) {
        this.tanPointers.clear();
        return;
      }
    }
    if (e.button === 0 || e.pointerType !== 'mouse') {
      if (this.photo) {
        this.rightDrag = { x: e.clientX, y: e.clientY };
        return;
      }
      this.tanPointers.add(e.pointerId);
    }
  };

  private up = (e: PointerEvent): void => {
    this.tanPointers.delete(e.pointerId);
    this.lookPointers.delete(e.pointerId);
    if (e.pointerType === 'mouse' && (e.button === 2 || this.photo)) this.rightDrag = null;
  };

  private moveHandler = (e: PointerEvent): void => {
    if (this.rightDrag) {
      this.lookDx += e.clientX - this.rightDrag.x;
      this.lookDy += e.clientY - this.rightDrag.y;
      this.rightDrag = { x: e.clientX, y: e.clientY };
      this.lookIdle = 0;
    }
    const p = this.lookPointers.get(e.pointerId);
    if (p) {
      if (this.lookPointers.size >= 2) {
        // Average two-finger motion: each finger contributes half.
        this.lookDx += (e.clientX - p.x) / 2;
        this.lookDy += (e.clientY - p.y) / 2;
        this.lookIdle = 0;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    }
  };

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.enabled) return;
    // Each notch turns the natai for a quarter second; up unwinds, down winds in.
    this.wheelDir = e.deltaY < 0 ? 1 : -1;
    this.wheelSeconds = Math.min(1.5, this.wheelSeconds + Math.min(0.5, Math.abs(e.deltaY) / 400));
  };

  private keydown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    this.keys.add(e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      this.onGesture?.();
      if (!this.photo) this.tanKey = true;
    }
    this.updateKeys();
  };

  private keyup = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === 'Space') this.tanKey = false;
    this.updateKeys();
  };

  private updateKeys(): void {
    const k = this.keys;
    const up = k.has('KeyW') || k.has('ArrowUp');
    const down = k.has('KeyS') || k.has('ArrowDown');
    this.reelKey = this.photo ? 0 : (up ? 1 : 0) - (down ? 1 : 0);
    this.move.forward = (up ? 1 : 0) - (down ? 1 : 0);
    this.move.right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.move.up = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
  }

  release(): void {
    this.tanPointers.clear();
    this.lookPointers.clear();
    this.tanKey = false;
    this.rightDrag = null;
    this.keys.clear();
    this.updateKeys();
  }

  /** The control for one simulation tick. */
  sample(dt: number): Control {
    if (!this.enabled) return { tan: false, reel: 0 };
    let reel = this.reelKey + this.dialReel;
    if (this.wheelSeconds > 0) {
      reel += this.wheelDir;
      this.wheelSeconds = Math.max(0, this.wheelSeconds - dt);
    }
    return { tan: this.tanPointers.size > 0 || this.tanKey, reel: Math.max(-1, Math.min(1, reel)) };
  }

  /** Free-look motion since the last call, in pixels. */
  takeLook(dt: number): LookDelta {
    const d = { x: this.lookDx, y: this.lookDy };
    this.lookDx = 0;
    this.lookDy = 0;
    if (d.x === 0 && d.y === 0) this.lookIdle += dt;
    return d;
  }

  get pulling(): boolean {
    return this.tanPointers.size > 0 || this.tanKey;
  }
}
