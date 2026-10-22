// The player's own hands and natai in the foreground (DESIGN.md 5.8, 12): the left hand holds the
// spool by its handle, the right hand works the line. On tan the right hand pulls back and down; on
// dheel it reaches forward and the natai spins as line pays out.
import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshStandardNodeMaterial, Vector3, type Camera } from 'three/webgpu';
import { NATAIS } from '../sim/names';

const SKIN = new Color(0.62, 0.42, 0.3);

/** A little self-light keeps the foreground from going black against the low sun. */
function mat(c: Color | number, rough = 0.7, glow = 0.1): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: c, roughness: rough, metalness: 0 });
  m.emissive = new Color(c).multiplyScalar(glow);
  return m;
}

/** Spool colours per natai: bamboo, dark wood, the big painted one. */
const NATAI_WOOD: Record<string, number> = { bansh: 0xc9a46a, kath: 0x6e4126, boro: 0xb33a2e };

export class Hands {
  readonly group = new Group();
  private readonly natai = new Group();
  private readonly spool = new Group();
  private readonly right = new Group();
  private readonly left = new Group();
  private readonly woundLine: Mesh;
  private pull = 0;
  private spin = 0;
  private bob = 0;
  /** World position of the right hand's grip, where the line leaves the player. */
  readonly grip = new Vector3();
  /** World position of the natai drum, where the line comes off the spool. */
  readonly drum = new Vector3();

  constructor(camera: Camera, nataiId: string, sleeve: number, manjaColor: number) {
    const skin = mat(SKIN, 0.6, 0.16);
    const cloth = mat(sleeve, 0.85);
    const wood = mat(NATAI_WOOD[nataiId] ?? 0xc9a46a, 0.55);
    const big = nataiId === NATAIS[2]?.id ? 1.25 : 1;

    // The natai: a drum between two hexagonal flanges on a handle.
    const drum = new Mesh(new CylinderGeometry(0.05 * big, 0.05 * big, 0.2, 12).rotateZ(Math.PI / 2), wood);
    this.woundLine = new Mesh(
      new CylinderGeometry(0.075 * big, 0.075 * big, 0.17, 16).rotateZ(Math.PI / 2),
      mat(manjaColor, 0.4),
    );
    const flangeGeo = new CylinderGeometry(0.12 * big, 0.12 * big, 0.012, 6).rotateZ(Math.PI / 2);
    const f1 = new Mesh(flangeGeo, wood);
    const f2 = new Mesh(flangeGeo, wood);
    f1.position.x = -0.1;
    f2.position.x = 0.1;
    // Spokes on each flange.
    for (const f of [f1, f2]) {
      for (let i = 0; i < 3; i++) {
        const spoke = new Mesh(new BoxGeometry(0.014, 0.22 * big, 0.014), wood);
        spoke.rotation.x = (i * Math.PI) / 3;
        f.add(spoke);
      }
    }
    this.spool.add(drum, this.woundLine, f1, f2);
    const handle = new Mesh(new CylinderGeometry(0.014, 0.014, 0.5, 6).rotateZ(Math.PI / 2), wood);
    this.natai.add(this.spool, handle);

    // Left arm holds the handle; right arm works the line. A sleeve, a palm, four curled fingers, a thumb.
    const build = (g: Group, side: number) => {
      const forearm = new Mesh(new CylinderGeometry(0.042, 0.05, 0.36, 10), cloth);
      forearm.rotation.x = Math.PI / 2 - 0.35;
      forearm.position.set(0.02 * side, -0.07, 0.21);
      const cuff = new Mesh(new CylinderGeometry(0.046, 0.046, 0.03, 10), cloth);
      cuff.rotation.x = Math.PI / 2 - 0.35;
      cuff.position.set(0.012 * side, -0.012, 0.045);
      const palm = new Mesh(new BoxGeometry(0.075, 0.03, 0.085), skin);
      palm.rotation.x = -0.25;
      const fingers = new Group();
      for (let i = 0; i < 4; i++) {
        const f = new Mesh(new BoxGeometry(0.016, 0.018, 0.05), skin);
        f.position.set(-0.027 + i * 0.018, -0.018, -0.055);
        f.rotation.x = -0.9;
        fingers.add(f);
      }
      const thumb = new Mesh(new BoxGeometry(0.018, 0.018, 0.045), skin);
      thumb.position.set(-0.045 * side, -0.005, -0.02);
      thumb.rotation.set(-0.4, 0.6 * side, 0);
      g.add(forearm, cuff, palm, fingers, thumb);
    };
    build(this.left, -1);
    build(this.right, 1);
    this.left.add(this.natai);
    // Held with the spool's face half toward the player, so its hexagon and spokes read at a glance.
    this.natai.position.set(0.06, 0.02, -0.05);
    this.natai.rotation.set(0, -0.9, 0.15);
    this.natai.scale.setScalar(0.4);
    this.group.add(this.left, this.right);
    this.group.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
      o.renderOrder = 10;
    });
    camera.add(this.group);
  }

  /**
   * One frame: `pulling` is tan, `feed` the line's rate (m/s, + pays out), `tension` 0..1.
   */
  update(dt: number, pulling: boolean, feed: number, tension: number, visible: boolean): void {
    this.group.visible = visible;
    const target = pulling ? 1 : 0;
    this.pull += (target - this.pull) * (1 - Math.exp(-dt * 14));
    this.bob += dt;
    const shake = tension * 0.004 * Math.sin(this.bob * 31);
    // Left hand low on the left with the natai; right hand reaches up the line or pulls it home.
    this.left.position.set(-0.3, -0.33 + shake * 0.5, -0.6);
    this.left.rotation.set(0.25, 0.3, 0.1);
    this.right.position.set(0.24 - this.pull * 0.03, -0.31 - this.pull * 0.06 + shake, -0.66 + this.pull * 0.16);
    this.right.rotation.set(0.25 + this.pull * 0.35, -0.2, -0.15);
    // The spool turns as line goes out (and back as it comes in).
    this.spin += (feed / 0.47) * dt;
    this.spool.rotation.x = this.spin;
    this.group.updateMatrixWorld(true);
    this.right.getWorldPosition(this.grip);
    this.spool.getWorldPosition(this.drum);
  }
}
