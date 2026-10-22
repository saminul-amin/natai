// Rooftop crowds (DESIGN.md 5.8): one instanced draw per body type, animated from its vertex animation
// texture, dressed in generated lungi checks, sari borders and panjabi colours with South Asian skin
// tones. People react: they point when a pench starts, cheer a cut, flinch when the player's kite falls.
//
// The geometry is an InstancedBufferGeometry with each person's place and turn as an attribute, and the
// shader places the baked pose itself: in r186 an InstancedMesh applies its matrix before a custom
// position node, which would leave every baked pose at the origin.
import {
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshStandardNodeMaterial,
  NearestFilter,
  RGBAFormat,
  type Node,
} from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  cos,
  float,
  floor,
  fract,
  int,
  ivec2,
  mix,
  select,
  sin,
  step,
  textureLoad,
  vec3,
  vertexIndex,
} from 'three/tsl';
import { animIndex, ANIMS, bakeBody, BODY_COUNT, FRAMES, type Anim } from '../procedural/people';
import type { Person } from '../procedural/city';
import { rngFor } from '../sim/rng';
import { shared } from './uniforms';

const SKIN_TONES: [number, number, number][] = [
  [0.52, 0.34, 0.22],
  [0.45, 0.29, 0.19],
  [0.38, 0.24, 0.16],
  [0.6, 0.41, 0.28],
  [0.33, 0.21, 0.14],
];

const CLOTH: [number, number, number][] = [
  [0.85, 0.15, 0.35],
  [0.95, 0.65, 0.12],
  [0.12, 0.5, 0.55],
  [0.25, 0.55, 0.2],
  [0.92, 0.9, 0.84],
  [0.2, 0.25, 0.55],
  [0.6, 0.15, 0.15],
  [0.55, 0.35, 0.6],
];

/** Per person, interleaved: animation, phase, scale, upper rgb, lower rgb, skin rgb. */
const STRIDE = 12;

interface Body {
  data: InstancedInterleavedBuffer;
  people: Person[];
  /** Seconds left on a reaction, per person; 0 means the person's own animation. */
  timers: Float32Array;
}

export class CrowdView {
  readonly group = new Group();
  private readonly bodies: Body[] = [];

  constructor(people: Person[], seed: number, density = 1) {
    const rng = rngFor(seed, 'crowd');
    for (let b = 0; b < BODY_COUNT; b++) {
      const list = people.filter((p, i) => p.body === b && (density >= 1 || i % Math.round(1 / density) === 0));
      if (list.length === 0) continue;
      const baked = bakeBody(b);
      const vat = new DataTexture(baked.vat, baked.vertexCount, ANIMS.length * FRAMES, RGBAFormat, FloatType);
      vat.minFilter = NearestFilter;
      vat.magFilter = NearestFilter;
      vat.generateMipmaps = false;
      vat.needsUpdate = true;

      const n = list.length;
      const place = new Float32Array(n * 4);
      const data = new InstancedInterleavedBuffer(new Float32Array(n * STRIDE), STRIDE, 1);
      data.setUsage(DynamicDrawUsage);
      list.forEach((p, i) => {
        place.set([p.x, p.y, p.z, p.rot], i * 4);
        const u = rng.pick(CLOTH);
        const l = b === 1 ? u.map((c) => c * 0.9) : rng.pick(CLOTH);
        const s = rng.pick(SKIN_TONES);
        data.array.set([p.anim, rng.next(), 1, ...u, ...l, ...s], i * STRIDE);
      });

      const geo = new InstancedBufferGeometry();
      for (const name of ['position', 'normal', 'bodyPart']) geo.setAttribute(name, baked.geometry.getAttribute(name));
      geo.setAttribute('instancePlace', new InstancedBufferAttribute(place, 4));
      geo.setAttribute('instanceAnim', new InterleavedBufferAttribute(data, 1, 0));
      geo.setAttribute('instancePhase', new InterleavedBufferAttribute(data, 1, 1));
      geo.setAttribute('instanceScale', new InterleavedBufferAttribute(data, 1, 2));
      geo.setAttribute('instanceUpper', new InterleavedBufferAttribute(data, 3, 3));
      geo.setAttribute('instanceLower', new InterleavedBufferAttribute(data, 3, 6));
      geo.setAttribute('instanceSkin', new InterleavedBufferAttribute(data, 3, 9));
      geo.instanceCount = n;

      const mat = new MeshStandardNodeMaterial({ roughness: 0.85 });
      const aAnim = attribute('instanceAnim', 'float');
      const aPhase = attribute('instancePhase', 'float');
      const aScale = attribute('instanceScale', 'float');
      const aPlace = attribute('instancePlace', 'vec4');
      const count = baked.vertexCount;
      mat.positionNode = Fn(() => {
        // Each animation loops in about 1.6 s (the natai pull a little slower), offset per person.
        const speed = select(aAnim.equal(1), float(0.45), float(0.62));
        const t = fract(shared.time.mul(speed).add(aPhase)).mul(FRAMES);
        const f0 = floor(t);
        const f1 = f0.add(1).mod(FRAMES);
        const row0 = int(aAnim.mul(FRAMES).add(f0));
        const row1 = int(aAnim.mul(FRAMES).add(f1));
        const vi = int(vertexIndex).mod(count);
        const p = mix(textureLoad(vat, ivec2(vi, row0)).xyz, textureLoad(vat, ivec2(vi, row1)).xyz, fract(t)).mul(aScale);
        const c = cos(aPlace.w);
        const s = sin(aPlace.w);
        return vec3(p.x.mul(c).add(p.z.mul(s)), p.y, p.z.mul(c).sub(p.x.mul(s))).add(aPlace.xyz);
      })();
      const part = attribute('bodyPart', 'vec3');
      const slot = part.x;
      const pattern = part.yz;
      const cUpper = attribute('instanceUpper', 'vec3');
      const cLower = attribute('instanceLower', 'vec3');
      const cSkin = attribute('instanceSkin', 'vec3');
      mat.colorNode = Fn(() => {
        let lowerColor: Node<'vec3'> = cLower;
        if (b === 0) {
          // Lungi checks.
          const checks = abs(step(0.5, fract(pattern.x.mul(4))).sub(step(0.5, fract(pattern.y.mul(7)))));
          lowerColor = mix(cLower, cLower.mul(0.45).add(vec3(0.05, 0.05, 0.12)), checks);
        } else if (b === 1) {
          // Sari: a gold border at the hem and along the pallu.
          const border = step(pattern.y, 0.12).add(step(0.92, fract(pattern.x.mul(1.5).add(pattern.y.mul(0.4)))));
          lowerColor = mix(cLower, vec3(0.9, 0.7, 0.25), border.clamp(0, 1));
        } else if (b === 3) {
          // Panjabi: a fine embroidered band at the neck and hem.
          lowerColor = mix(cLower, cLower.mul(0.6), step(0.9, sin(pattern.y.mul(60)).mul(0.5).add(0.5)));
        }
        const hair = vec3(0.04, 0.035, 0.03);
        return select(
          slot.lessThan(0.5),
          cSkin,
          select(slot.lessThan(1.5), cUpper, select(slot.lessThan(2.5), lowerColor, hair)),
        );
      })();

      const mesh = new Mesh(geo, mat);
      // People are small: they take shadows but do not cast them, which would multiply the crowd per cascade.
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.bodies.push({ data, people: list, timers: new Float32Array(n) });
    }
  }

  private set(body: Body, i: number, offset: number, value: number): void {
    body.data.array[i * STRIDE + offset] = value;
    body.data.needsUpdate = true;
  }

  /** People within `radius` of a point take up an animation for a few seconds. */
  react(x: number, z: number, radius: number, anim: Anim, seconds: number, chance = 0.8): void {
    const a = animIndex(anim);
    for (const body of this.bodies) {
      body.people.forEach((p, i) => {
        if (Math.hypot(p.x - x, p.z - z) > radius) return;
        // Deterministic per person: the same people react every time.
        if (((i * 2654435761) >>> 0) / 4294967296 > chance) return;
        this.set(body, i, 0, a);
        body.timers[i] = seconds * (0.8 + 0.4 * (((i * 40503) % 100) / 100));
      });
    }
  }

  /** Shows or hides one person (a rival on their roof). */
  setVisible(person: Person, on: boolean): void {
    for (const body of this.bodies) {
      const i = body.people.indexOf(person);
      if (i >= 0) this.set(body, i, 2, on ? 1 : 0);
    }
  }

  /** Counts down reactions and returns people to what they were doing. */
  update(dt: number): void {
    for (const body of this.bodies) {
      for (let i = 0; i < body.timers.length; i++) {
        const t = body.timers[i] as number;
        if (t <= 0) continue;
        body.timers[i] = t - dt;
        if (t - dt <= 0) this.set(body, i, 0, (body.people[i] as Person).anim);
      }
    }
  }
}
