// The camera (DESIGN.md 5.1): first-person from the player's rooftop, looking out and up. It follows
// the kite gently so the kite sits in the upper half of the frame, leans in on a pench, racks focus
// onto a cut kite, and frees entirely in photo mode.
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import type { LookDelta } from '../input';

const tmp = new Vector3();

export class FollowCamera {
  readonly camera: PerspectiveCamera;
  yaw = 0;
  pitch = 0.35;
  private lookYaw = 0;
  private lookPitch = 0;
  private fov = 58;
  /** Photo mode position and angles. */
  photo = false;
  private photoPos = new Vector3();
  baseFov = 58;
  /** 0..1: how far the camera has leaned in toward a pench. */
  lean = 0;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(58, aspect, 0.05, 6000);
    this.camera.rotation.order = 'YXZ';
  }

  /** Points the camera at fixed yaw/pitch (radians) and field of view, as the URL `cam` parameter does. */
  setPose(yaw: number, pitch: number, fov: number): void {
    this.yaw = yaw;
    this.pitch = pitch;
    this.fov = fov;
    this.baseFov = fov;
  }

  enterPhoto(): void {
    this.photo = true;
    this.photoPos.copy(this.camera.position);
  }

  exitPhoto(): void {
    this.photo = false;
  }

  /**
   * One frame. `eye` is the head position on the roof; `target` the point to follow (the kite, or the
   * pench crossing while leaning in); `locked` disables following (URL camera poses).
   */
  update(
    dt: number,
    eye: Vector3,
    target: Vector3 | null,
    look: LookDelta,
    lookIdle: number,
    locked: boolean,
    move?: { forward: number; right: number; up: number },
  ): void {
    const c = this.camera;
    const k = 1 - Math.exp(-dt * 2.2);
    if (this.photo) {
      this.yaw -= look.x * 0.004;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - look.y * 0.004));
      if (move) {
        const speed = 18 * dt;
        tmp.set(Math.sin(this.yaw) * -1, 0, -Math.cos(this.yaw)).multiplyScalar(move.forward * speed);
        this.photoPos.add(tmp);
        tmp.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(move.right * speed);
        this.photoPos.add(tmp);
        this.photoPos.y = Math.max(2, this.photoPos.y + move.up * speed);
      }
      c.position.copy(this.photoPos);
      c.rotation.set(this.pitch, this.yaw, 0);
      this.setFov(this.baseFov);
      return;
    }
    c.position.copy(eye);
    if (!locked && target) {
      tmp.copy(target).sub(eye);
      const flat = Math.hypot(tmp.x, tmp.z);
      const wantYaw = Math.atan2(-tmp.x, -tmp.z);
      // Frame the kite in the upper half: look a little below it.
      const wantPitch = Math.atan2(tmp.y, flat) - 0.16 * (1 - this.lean);
      let dy = wantYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * k;
      this.pitch += (Math.max(-0.2, Math.min(1.25, wantPitch)) - this.pitch) * k;
    }
    // Free look adds an offset that drifts back once the player lets go.
    this.lookYaw -= look.x * 0.0035;
    this.lookPitch = Math.max(-0.9, Math.min(0.9, this.lookPitch - look.y * 0.0035));
    if (lookIdle > 1.5) {
      const back = 1 - Math.exp(-dt * 1.2);
      this.lookYaw -= this.lookYaw * back;
      this.lookPitch -= this.lookPitch * back;
    }
    c.rotation.set(Math.max(-1.3, Math.min(1.45, this.pitch + this.lookPitch)), this.yaw + this.lookYaw, 0);
    this.setFov(this.baseFov - 12 * this.lean);
  }

  private setFov(f: number): void {
    this.fov += (f - this.fov) * 0.08;
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
