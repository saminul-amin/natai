// Rooftop people (DESIGN.md 5.8): four low-poly body types (a man in a lungi, a woman in a sari, a
// child, a man in a panjabi) and five animations (idle, fly with natai, point, cheer, flinch), all
// five baked into one vertex animation texture per body type, so the whole crowd draws as one
// instanced mesh per body on either renderer. The bodies are built in code; their clothing patterns
// and skin tones are applied in the crowd shader.
import { BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, Euler, Matrix4, SphereGeometry, Vector3 } from 'three';

export const ANIMS = ['idle', 'fly', 'point', 'cheer', 'flinch'] as const;
export type Anim = (typeof ANIMS)[number];
export const FRAMES = 16;
export const BODY_COUNT = 4;

/** Part ids, also the colour slot in the shader: skin, upper cloth, lower cloth, hair. */
const SKIN = 0;
const UPPER = 1;
const LOWER = 2;
const HAIR = 3;

type Joint = 'root' | 'spine' | 'head' | 'shoulderL' | 'elbowL' | 'shoulderR' | 'elbowR' | 'hipL' | 'kneeL' | 'hipR' | 'kneeR';

interface Part {
  geo: BufferGeometry;
  joint: Joint;
  slot: number;
}

interface Pose {
  /** Euler angles (x, y, z) per joint, radians. */
  angles: Partial<Record<Joint, [number, number, number]>>;
  /** Root lift (jumping, crouching), metres. */
  lift: number;
}

/** Rest-pose pivot of each joint, metres from the feet, for a 1.65 m adult. */
const PIVOT: Record<Joint, [number, number, number]> = {
  root: [0, 0.95, 0],
  spine: [0, 1.0, 0],
  head: [0, 1.48, 0],
  shoulderL: [-0.21, 1.42, 0],
  elbowL: [-0.21, 1.14, 0],
  shoulderR: [0.21, 1.42, 0],
  elbowR: [0.21, 1.14, 0],
  hipL: [-0.1, 0.95, 0],
  kneeL: [-0.1, 0.5, 0],
  hipR: [0.1, 0.95, 0],
  kneeR: [0.1, 0.5, 0],
};

const PARENT: Record<Joint, Joint | null> = {
  root: null,
  spine: 'root',
  head: 'spine',
  shoulderL: 'spine',
  elbowL: 'shoulderL',
  shoulderR: 'spine',
  elbowR: 'shoulderR',
  hipL: 'root',
  kneeL: 'hipL',
  hipR: 'root',
  kneeR: 'hipR',
};

function box(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  return new BoxGeometry(w, h, d).translate(x, y, z);
}

function bodyParts(body: number): Part[] {
  const parts: Part[] = [];
  const add = (geo: BufferGeometry, joint: Joint, slot: number) => parts.push({ geo, joint, slot });
  // Head and hair on every body.
  add(new SphereGeometry(0.11, 6, 4).translate(0, 1.6, 0), 'head', SKIN);
  add(new SphereGeometry(0.115, 6, 2, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.62, -0.01), 'head', HAIR);
  // Arms: upper arm in the shirt's colour, forearm and hand in skin.
  for (const side of [-1, 1] as const) {
    const sh: Joint = side < 0 ? 'shoulderL' : 'shoulderR';
    const el: Joint = side < 0 ? 'elbowL' : 'elbowR';
    add(box(0.09, 0.3, 0.09, 0.21 * side, 1.28, 0), sh, body === 1 ? SKIN : UPPER);
    add(box(0.08, 0.28, 0.08, 0.21 * side, 1.0, 0), el, SKIN);
    add(box(0.07, 0.08, 0.05, 0.21 * side, 0.83, 0), el, SKIN);
  }
  // Torso.
  add(box(0.36, 0.5, 0.2, 0, 1.2, 0), 'spine', UPPER);
  if (body === 0) {
    // Lungi: a checked tube from waist to ankles; feet show below.
    add(new CylinderGeometry(0.2, 0.24, 0.85, 6, 1, true).translate(0, 0.52, 0), 'root', LOWER);
    for (const side of [-1, 1]) add(box(0.09, 0.08, 0.2, 0.1 * side, 0.04, 0.03), side < 0 ? 'kneeL' : 'kneeR', SKIN);
  } else if (body === 1) {
    // Sari: full length with the pallu over one shoulder.
    add(new CylinderGeometry(0.2, 0.3, 0.98, 7, 1, true).translate(0, 0.49, 0), 'root', LOWER);
    add(box(0.38, 0.5, 0.22, 0, 1.2, 0.01), 'spine', LOWER);
    add(box(0.12, 0.62, 0.24, -0.15, 1.12, -0.02), 'spine', LOWER);
  } else if (body === 2) {
    // Child: shorts and bare legs (scaled down as a whole below).
    add(box(0.3, 0.22, 0.2, 0, 0.86, 0), 'root', LOWER);
    for (const side of [-1, 1] as const) {
      add(box(0.1, 0.4, 0.1, 0.1 * side, 0.6, 0), side < 0 ? 'hipL' : 'hipR', SKIN);
      add(box(0.09, 0.44, 0.09, 0.1 * side, 0.24, 0), side < 0 ? 'kneeL' : 'kneeR', SKIN);
    }
  } else {
    // Panjabi to the knee over pyjama legs.
    add(box(0.38, 0.5, 0.22, 0, 0.82, 0), 'root', UPPER);
    for (const side of [-1, 1] as const) {
      add(box(0.11, 0.25, 0.11, 0.1 * side, 0.7, 0), side < 0 ? 'hipL' : 'hipR', LOWER);
      add(box(0.1, 0.48, 0.1, 0.1 * side, 0.25, 0), side < 0 ? 'kneeL' : 'kneeR', LOWER);
    }
  }
  return parts;
}

function pose(anim: Anim, t: number, body: number): Pose {
  const s = Math.sin(t * Math.PI * 2);
  const c = Math.cos(t * Math.PI * 2);
  const breathe = Math.sin(t * Math.PI * 2) * 0.03;
  switch (anim) {
    case 'idle':
      return {
        angles: {
          spine: [breathe, 0.1 * Math.sin(t * Math.PI * 2), 0],
          head: [0.05 + 0.08 * Math.sin(t * Math.PI * 4), 0.3 * Math.sin(t * Math.PI * 2), 0],
          shoulderL: [0.05, 0, 0.08],
          shoulderR: [0.05, 0, -0.08],
          elbowL: [-0.2, 0, 0],
          elbowR: [-0.2, 0, 0],
        },
        lift: 0,
      };
    case 'fly': {
      // Holding the natai low in one hand, pulling line with the other, head up at the kite.
      const pull = Math.max(0, s);
      return {
        angles: {
          spine: [-0.08, 0, 0],
          head: [-0.6, 0, 0],
          shoulderL: [-0.9, 0, 0.15],
          elbowL: [-0.6, 0, 0],
          shoulderR: [-1.6 + pull * 0.9, 0, -0.25],
          elbowR: [-0.3 - pull * 0.8, 0, 0],
        },
        lift: 0,
      };
    }
    case 'point':
      return {
        angles: {
          head: [-0.4, 0.2, 0],
          shoulderR: [-2.4 + 0.08 * s, 0.2, -0.1],
          elbowR: [-0.05, 0, 0],
          shoulderL: [0.1, 0, 0.1],
          elbowL: [-0.3, 0, 0],
        },
        lift: 0,
      };
    case 'cheer': {
      const jump = Math.max(0, s) * (body === 2 ? 0.25 : 0.14);
      return {
        angles: {
          head: [-0.35, 0, 0],
          shoulderL: [-2.7 + 0.3 * c, 0, 0.35],
          shoulderR: [-2.7 - 0.3 * c, 0, -0.35],
          elbowL: [-0.4 - 0.3 * Math.max(0, c), 0, 0],
          elbowR: [-0.4 - 0.3 * Math.max(0, -c), 0, 0],
          hipL: [-0.2 * Math.max(0, -s), 0, 0],
          hipR: [-0.2 * Math.max(0, -s), 0, 0],
          kneeL: [0.4 * Math.max(0, -s), 0, 0],
          kneeR: [0.4 * Math.max(0, -s), 0, 0],
        },
        lift: jump,
      };
    }
    case 'flinch':
      return {
        angles: {
          spine: [0.45 + 0.05 * s, 0, 0],
          head: [0.3, 0, 0],
          shoulderL: [-2.2, 0, 0.6],
          shoulderR: [-2.2, 0, -0.6],
          elbowL: [-2.0, 0, 0],
          elbowR: [-2.0, 0, 0],
          hipL: [-0.5, 0, 0],
          hipR: [-0.5, 0, 0],
          kneeL: [0.9, 0, 0],
          kneeR: [0.9, 0, 0],
        },
        lift: -0.18,
      };
  }
}

const tmpM = new Matrix4();
const tmpR = new Matrix4();
const tmpT = new Matrix4();
const tmpI = new Matrix4();
const v = new Vector3();
const euler = new Euler();

function jointMatrices(p: Pose, scale: number): Record<Joint, Matrix4> {
  const out = {} as Record<Joint, Matrix4>;
  const order: Joint[] = [
    'root',
    'spine',
    'head',
    'shoulderL',
    'elbowL',
    'shoulderR',
    'elbowR',
    'hipL',
    'kneeL',
    'hipR',
    'kneeR',
  ];
  for (const j of order) {
    const [px, py, pz] = PIVOT[j];
    const a = p.angles[j] ?? [0, 0, 0];
    tmpR.makeRotationFromEuler(euler.set(a[0], a[1], a[2], 'XYZ'));
    // Local: translate to pivot, rotate, translate back.
    tmpT.makeTranslation(px, py, pz);
    tmpI.makeTranslation(-px, -py, -pz);
    const local = new Matrix4().multiplyMatrices(tmpT, tmpR).multiply(tmpI);
    const parent = PARENT[j];
    const m = parent ? new Matrix4().multiplyMatrices(out[parent], local) : local;
    if (j === 'root') {
      tmpM.makeTranslation(0, p.lift, 0);
      m.premultiply(tmpM);
    }
    out[j] = m;
  }
  if (scale !== 1) {
    const s = new Matrix4().makeScale(scale, scale, scale);
    for (const j of order) out[j].premultiply(s);
  }
  return out;
}

export interface BakedBody {
  geometry: BufferGeometry;
  /** RGBA32F positions: width = vertex count, height = ANIMS.length × FRAMES. */
  vat: Float32Array;
  vertexCount: number;
}

/** Builds one body type: a non-indexed geometry with a `slot` attribute, and its baked animations. */
export function bakeBody(body: number): BakedBody {
  const parts = bodyParts(body);
  const scale = body === 2 ? 0.72 : body === 1 ? 0.95 : 1;
  const geos = parts.map((p) => (p.geo.index ? p.geo.toNonIndexed() : p.geo));
  let count = 0;
  for (const g of geos) count += g.getAttribute('position').count;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const slot = new Float32Array(count);
  const local = new Float32Array(count * 2);
  const joints: Joint[] = [];
  let k = 0;
  geos.forEach((g, i) => {
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const part = parts[i] as Part;
    for (let n = 0; n < pos.count; n++) {
      position[k * 3] = pos.getX(n) * scale;
      position[k * 3 + 1] = pos.getY(n) * scale;
      position[k * 3 + 2] = pos.getZ(n) * scale;
      normal[k * 3] = nrm.getX(n);
      normal[k * 3 + 1] = nrm.getY(n);
      normal[k * 3 + 2] = nrm.getZ(n);
      slot[k] = part.slot;
      // Pattern coordinates for the cloth: around the body and up it.
      local[k * 2] = Math.atan2(pos.getX(n), pos.getZ(n)) / Math.PI;
      local[k * 2 + 1] = pos.getY(n);
      joints.push(part.joint);
      k++;
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));
  // Colour slot and cloth pattern coordinates share one attribute: WebGPU allows only eight vertex buffers.
  const meta = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    meta[i * 3] = slot[i] as number;
    meta[i * 3 + 1] = local[i * 2] as number;
    meta[i * 3 + 2] = local[i * 2 + 1] as number;
  }
  geometry.setAttribute('bodyPart', new BufferAttribute(meta, 3));
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius = 2;

  const rows = ANIMS.length * FRAMES;
  const vat = new Float32Array(count * rows * 4);
  ANIMS.forEach((anim, a) => {
    for (let f = 0; f < FRAMES; f++) {
      const mats = jointMatrices(pose(anim, f / FRAMES, body), 1);
      const row = a * FRAMES + f;
      for (let i = 0; i < count; i++) {
        v.set(position[i * 3] as number, position[i * 3 + 1] as number, position[i * 3 + 2] as number);
        // Joint pivots are for an adult; scale the vertex into adult space, pose, scale back.
        v.multiplyScalar(1 / scale)
          .applyMatrix4(mats[joints[i] as Joint])
          .multiplyScalar(scale);
        const o = (row * count + i) * 4;
        vat[o] = v.x;
        vat[o + 1] = v.y;
        vat[o + 2] = v.z;
        vat[o + 3] = 1;
      }
    }
  });
  return { geometry, vat, vertexCount: count };
}

export function animIndex(a: Anim): number {
  return ANIMS.indexOf(a);
}
