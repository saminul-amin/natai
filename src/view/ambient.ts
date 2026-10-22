// Ambient life (DESIGN.md 5.10): dust in the golden light, paper confetti from cut kites, and pigeons
// that scatter from a nearby roof when a kite falls.
import {
  AdditiveBlending,
  BufferGeometry,
  InstancedBufferAttribute,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  cameraPosition,
  cross,
  dot,
  float,
  fract,
  hash,
  instanceIndex,
  max,
  normalize,
  positionGeometry,
  positionLocal,
  pow,
  sin,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { shared } from './uniforms';

const dummy = new Object3D();

/** A low-poly pigeon: body, head and two wings that flap in the shader (wing tips carry the weight). */
function pigeonGeometry(): BufferGeometry {
  const p: number[] = [];
  const flap: number[] = [];
  const tri = (a: number[], b: number[], c: number[], w: [number, number, number]) => {
    p.push(...a, ...b, ...c);
    flap.push(...w);
  };
  // Body (a stretched double pyramid).
  const nose = [0, 0.02, -0.18];
  const tail = [0, 0.0, 0.2];
  const top = [0, 0.08, 0];
  const bot = [0, -0.05, 0];
  const l = [-0.06, 0.01, 0];
  const r = [0.06, 0.01, 0];
  for (const [a, b] of [
    [top, l],
    [r, top],
    [l, bot],
    [bot, r],
  ] as number[][][]) {
    tri(nose, a as number[], b as number[], [0, 0, 0]);
    tri(tail, b as number[], a as number[], [0, 0, 0]);
  }
  // Wings: tips flap (weight 1 left, -1 right).
  tri([-0.05, 0.04, -0.05], [-0.3, 0.05, 0.02], [-0.05, 0.04, 0.08], [0, 1, 0]);
  tri([0.05, 0.04, -0.05], [0.05, 0.04, 0.08], [0.3, 0.05, 0.02], [0, -1, 0]);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.setAttribute('flap', new Float32BufferAttribute(flap, 1));
  g.computeVertexNormals();
  return g;
}

interface Bird {
  home: Vector3;
  pos: Vector3;
  vel: Vector3;
  flying: number;
  phase: number;
}

export class AmbientView {
  readonly group = new Group();
  private readonly birds: Bird[] = [];
  private readonly flock: InstancedMesh;
  private readonly flapping: InstancedBufferAttribute;
  private readonly confetti: InstancedMesh;
  private readonly bits: { pos: Vector3; vel: Vector3; spin: number; life: number }[] = [];
  /** How much golden-hour dust shows: 0 at noon, 1 in a low sun. */
  readonly dustAmount = uniform(0);
  private readonly eye = uniform(new Vector3());

  constructor(roost: { x: number; y: number; z: number }, seed: number) {
    // Pigeons on a parapet of a nearby roof.
    const geo = pigeonGeometry();
    const n = 24;
    this.flapping = new InstancedBufferAttribute(new Float32Array(n), 1);
    this.flapping.setUsage(DynamicDrawUsage);
    geo.setAttribute('instanceFlap', this.flapping);
    const mat = new MeshStandardNodeMaterial({ color: 0x8a8d96, roughness: 0.8, side: DoubleSide });
    // Wing tips rise and fall with the bird's flap; the body stays put.
    // Instancing has already placed the bird; the wing tips rise and fall on top of that.
    mat.positionNode = positionLocal.add(
      vec3(0, attribute('flap', 'float').abs().mul(attribute('instanceFlap', 'float')).mul(0.14), 0),
    );
    this.flock = new InstancedMesh(geo, mat, n);
    this.flock.instanceMatrix.setUsage(DynamicDrawUsage);
    this.flock.frustumCulled = false;
    let s = seed >>> 0 || 3;
    const rnd = () => {
      s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < n; i++) {
      const home = new Vector3(roost.x + (rnd() - 0.5) * 9, roost.y + 1.05, roost.z + (rnd() - 0.5) * 9);
      this.birds.push({ home, pos: home.clone(), vel: new Vector3(), flying: 0, phase: rnd() * 6.28 });
    }
    this.group.add(this.flock);

    // Paper confetti from a cut kite.
    const cmat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.9 });
    cmat.colorNode = Fn(() => {
      const h = hash(instanceIndex);
      return vec3(fract(h.mul(3.1)), fract(h.mul(7.3)).mul(0.7), fract(h.mul(11.7)).mul(0.6))
        .mul(0.8)
        .add(0.15);
    })();
    this.confetti = new InstancedMesh(new PlaneGeometry(0.12, 0.08), cmat, 160);
    this.confetti.instanceMatrix.setUsage(DynamicDrawUsage);
    this.confetti.frustumCulled = false;
    for (let i = 0; i < 160; i++) this.bits.push({ pos: new Vector3(), vel: new Vector3(), spin: 0, life: 0 });
    this.group.add(this.confetti);

    // Dust motes floating in the light around the camera; they show when looking toward a low sun.
    const dust = new InstancedBufferGeometry();
    dust.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
    dust.setIndex([0, 1, 2, 2, 1, 3]);
    dust.instanceCount = 500;
    const dmat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    dmat.blending = AdditiveBlending;
    const idx = float(instanceIndex);
    const centre = Fn(() => {
      const t = shared.time;
      const box = vec3(16, 8, 16);
      const seedPos = vec3(hash(idx), hash(idx.add(17.1)), hash(idx.add(41.7)));
      const drift = vec3(
        sin(t.mul(0.13).add(idx)),
        sin(t.mul(0.09).add(idx.mul(1.3))).mul(0.5),
        sin(t.mul(0.11).add(idx.mul(0.7))),
      );
      const local = fract(seedPos.add(drift.mul(0.02)).add(vec3(t.mul(0.004), t.mul(0.001), 0)))
        .sub(0.5)
        .mul(box);
      return this.eye.add(local);
    })();
    dmat.positionNode = Fn(() => {
      const view = normalize(cameraPosition.sub(centre));
      const right = normalize(cross(vec3(0, 1, 0), view));
      const up = cross(view, right);
      const size = float(0.012);
      return centre.add(right.mul(positionGeometry.x.mul(size))).add(up.mul(positionGeometry.y.mul(size)));
    })();
    dmat.colorNode = Fn(() => {
      const view = normalize(centre.sub(cameraPosition));
      const toward = pow(max(dot(view, normalize(shared.sunDirection)), 0), 6);
      const r = max(float(1).sub(abs(positionGeometry.x).add(abs(positionGeometry.y))), 0);
      return vec4(vec3(1.0, 0.82, 0.55).mul(toward).mul(r).mul(this.dustAmount).mul(3), 1);
    })();
    const dustMesh = new Mesh(dust, dmat);
    dustMesh.frustumCulled = false;
    dustMesh.renderOrder = 7;
    this.group.add(dustMesh);
  }

  /** Pigeons take off from their roof. */
  scatter(): void {
    for (const b of this.birds) {
      if (b.flying > 0) continue;
      b.flying = 6 + Math.random() * 4;
      b.vel.set((Math.random() - 0.5) * 4, 3 + Math.random() * 2, (Math.random() - 0.5) * 4);
    }
  }

  /** Paper bits burst from a cut. */
  burst(at: Vector3): void {
    for (const bit of this.bits) {
      bit.pos.copy(at);
      bit.vel.set((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5);
      bit.spin = Math.random() * 6;
      bit.life = 3 + Math.random() * 3;
    }
  }

  update(dt: number, time: number, eye: Vector3, wind: Vector3): void {
    this.eye.value.copy(eye);
    this.birds.forEach((b, i) => {
      let flap = 0;
      if (b.flying > 0) {
        b.flying -= dt;
        // Circle over the roofs, then home.
        const t = time * 0.6 + b.phase;
        const target =
          b.flying > 2 ? new Vector3(b.home.x + Math.cos(t) * 25, b.home.y + 18, b.home.z + Math.sin(t) * 25) : b.home;
        b.vel.lerp(target.clone().sub(b.pos).multiplyScalar(0.6), 1 - Math.exp(-dt * 1.5));
        b.pos.addScaledVector(b.vel, dt);
        flap = Math.sin(time * 24 + b.phase);
        if (b.flying <= 0) b.pos.copy(b.home);
      } else if (Math.sin(time * 0.7 + b.phase * 3) > 0.97) {
        // Now and then one shifts on the parapet.
        flap = Math.sin(time * 20) * 0.4;
      }
      dummy.position.copy(b.pos);
      const heading = b.flying > 0 ? Math.atan2(-b.vel.x, -b.vel.z) : b.phase;
      dummy.rotation.set(0, heading, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.flock.setMatrixAt(i, dummy.matrix);
      this.flapping.setX(i, flap);
    });
    this.flock.instanceMatrix.needsUpdate = true;
    this.flapping.needsUpdate = true;

    this.bits.forEach((bit, i) => {
      if (bit.life > 0) {
        bit.life -= dt;
        bit.vel.x += (wind.x * 0.6 - bit.vel.x) * dt;
        bit.vel.z += (wind.z * 0.6 - bit.vel.z) * dt;
        bit.vel.y += (-0.9 - bit.vel.y) * dt * 2;
        bit.pos.addScaledVector(bit.vel, dt);
        bit.spin += dt * 7;
      }
      dummy.position.copy(bit.pos);
      dummy.rotation.set(bit.spin, bit.spin * 0.7, bit.spin * 0.3);
      dummy.scale.setScalar(bit.life > 0 ? 1 : 0);
      dummy.updateMatrix();
      this.confetti.setMatrixAt(i, dummy.matrix);
    });
    this.confetti.instanceMatrix.needsUpdate = true;
  }
}
