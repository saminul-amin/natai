// Strings (DESIGN.md 5.6): drawn as screen-space lines whose width is in pixels, so they never vanish
// on a phone, with a manja glint pass: the glass coating catches whatever is bright as tiny moving
// highlights. Every string in the scene goes through one batch and one draw call.
import {
  AdditiveBlending,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
  NormalBlending,
  Vector2,
} from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  cameraNear,
  cameraProjectionMatrix,
  cameraViewMatrix,
  float,
  fract,
  hash,
  floor,
  max,
  mix,
  normalize,
  positionGeometry,
  select,
  sin,
  smoothstep,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

export interface LineBatchOptions {
  maxSegments: number;
  additive?: boolean;
}

/**
 * A batch of line segments. Each frame, call begin(), add polylines, then end(). Width is in device
 * pixels; glint is 0..1 per polyline.
 */
export class LineBatch {
  readonly mesh: Mesh;
  readonly resolution = uniform(new Vector2(1280, 720));
  /** Brightness of whatever the glass catches: the sun by day, string lights and fireworks at dusk. */
  readonly glintLight = uniform(1);
  /** Overall light on the strings: 1 in daylight, low at night. */
  readonly brightness = uniform(1);
  readonly time = uniform(0);
  private readonly start: InstancedBufferAttribute;
  private readonly finish: InstancedBufferAttribute;
  private readonly color: InstancedBufferAttribute;
  private readonly arc: InstancedBufferAttribute;
  private readonly geometry: InstancedBufferGeometry;
  private count = 0;
  readonly max: number;

  constructor(opts: LineBatchOptions) {
    this.max = opts.maxSegments;
    const g = new InstancedBufferGeometry();
    // A quad: x is the side (-1, 1), y is the position along the segment (0, 1).
    g.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    this.start = new InstancedBufferAttribute(new Float32Array(this.max * 4), 4);
    this.finish = new InstancedBufferAttribute(new Float32Array(this.max * 4), 4);
    this.color = new InstancedBufferAttribute(new Float32Array(this.max * 4), 4);
    this.arc = new InstancedBufferAttribute(new Float32Array(this.max * 2), 2);
    for (const a of [this.start, this.finish, this.color, this.arc]) a.setUsage(DynamicDrawUsage);
    g.setAttribute('instanceStart', this.start);
    g.setAttribute('instanceEnd', this.finish);
    g.setAttribute('instanceColor', this.color);
    g.setAttribute('instanceArc', this.arc);
    g.instanceCount = 0;
    this.geometry = g;

    // Double-sided: the screen-space quad's winding flips with the line's direction on screen.
    const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    mat.blending = opts.additive ? AdditiveBlending : NormalBlending;
    const s = attribute('instanceStart', 'vec4');
    const e = attribute('instanceEnd', 'vec4');
    const side = positionGeometry.x;
    const along = positionGeometry.y;
    const res = this.resolution;
    const vSide = varying(side, 'vSide');
    const vArc = varying(mix(attribute('instanceArc', 'vec2').x, attribute('instanceArc', 'vec2').y, along), 'vArc');

    mat.vertexNode = Fn(() => {
      const vs = cameraViewMatrix.mul(vec4(s.xyz, 1)).toVar();
      const ve = cameraViewMatrix.mul(vec4(e.xyz, 1)).toVar();
      // Clip the segment to the near plane in view space, so a string that starts at the player's
      // hands, right at the camera, still draws.
      const near = cameraNear.negate().sub(0.01);
      const sBehind = vs.z.greaterThan(near);
      const eBehind = ve.z.greaterThan(near);
      const tS = vs.z.sub(near).div(vs.z.sub(ve.z));
      vs.assign(select(sBehind.and(eBehind.not()), mix(vs, ve, tS), vs));
      const tE = ve.z.sub(near).div(ve.z.sub(vs.z));
      ve.assign(select(eBehind.and(sBehind.not()), mix(ve, vs, tE), ve));
      const cs = cameraProjectionMatrix.mul(vs);
      const ce = cameraProjectionMatrix.mul(ve);
      const ns = cs.xy.div(cs.w);
      const ne = ce.xy.div(ce.w);
      const dir = normalize(ne.sub(ns).mul(res).add(vec2(1e-6, 0)));
      const normal = vec2(dir.y.negate(), dir.x);
      const clip = mix(cs, ce, along).toVar();
      const width = max(s.w, 1);
      // Half a pixel of extension along the segment closes the joints between segments.
      const ext = dir.mul(width.mul(0.5)).mul(along.mul(2).sub(1));
      const offset = normal.mul(side).mul(width).add(ext).div(res);
      clip.assign(vec4(clip.xy.add(offset.mul(clip.w)), clip.z, clip.w));
      // Both ends behind the camera: collapse.
      return select(sBehind.and(eBehind), vec4(0, 0, 2, 1), clip);
    })();

    const col = attribute('instanceColor', 'vec4');
    const alphaEnd = attribute('instanceEnd', 'vec4').w;
    mat.colorNode = Fn(() => {
      const edge = float(1).sub(smoothstep(0.55, 1.0, abs(vSide)));
      const a = edge.mul(alphaEnd);
      // Glint: sparse highlights that slide along the string as it moves.
      const cell = floor(vArc.mul(1.6));
      const h = hash(cell);
      const ph = fract(h.mul(13.7).add(this.time.mul(h.mul(0.6).add(0.5))));
      const spark = smoothstep(0.93, 1.0, sin(ph.mul(6.2832)).mul(0.5).add(0.5)).mul(smoothstep(0.55, 0.95, h));
      const glint = spark.mul(col.w).mul(this.glintLight);
      return vec4(col.rgb.mul(this.brightness).add(vec3(1.0, 0.95, 0.85).mul(glint.mul(6))), a);
    })();
    mat.opacityNode = float(1);
    this.mesh = new Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  begin(): void {
    this.count = 0;
  }

  /**
   * Adds a polyline from a packed xyz array of `n` points. `arc0` is the arc-length coordinate of the
   * first point (it drives the glint), `step` the arc length per segment.
   */
  addPolyline(
    points: ArrayLike<number>,
    n: number,
    width: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
    glint: number,
    arc0 = 0,
    arcStep = 1,
    offset = 0,
  ): void {
    const sa = this.start.array as Float32Array;
    const ea = this.finish.array as Float32Array;
    const ca = this.color.array as Float32Array;
    const aa = this.arc.array as Float32Array;
    for (let i = 0; i < n - 1 && this.count < this.max; i++) {
      const k = this.count;
      const p = offset + i * 3;
      sa[k * 4] = points[p] as number;
      sa[k * 4 + 1] = points[p + 1] as number;
      sa[k * 4 + 2] = points[p + 2] as number;
      sa[k * 4 + 3] = width;
      ea[k * 4] = points[p + 3] as number;
      ea[k * 4 + 1] = points[p + 4] as number;
      ea[k * 4 + 2] = points[p + 5] as number;
      ea[k * 4 + 3] = alpha;
      ca[k * 4] = r;
      ca[k * 4 + 1] = g;
      ca[k * 4 + 2] = b;
      ca[k * 4 + 3] = glint;
      aa[k * 2] = arc0 + i * arcStep;
      aa[k * 2 + 1] = arc0 + (i + 1) * arcStep;
      this.count++;
    }
  }

  addSegment(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    width: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
  ): void {
    if (this.count >= this.max) return;
    const k = this.count++;
    const sa = this.start.array as Float32Array;
    const ea = this.finish.array as Float32Array;
    const ca = this.color.array as Float32Array;
    sa.set([ax, ay, az, width], k * 4);
    ea.set([bx, by, bz, alpha], k * 4);
    ca.set([r, g, b, 0], k * 4);
  }

  end(): void {
    this.geometry.instanceCount = this.count;
    for (const a of [this.start, this.finish, this.color, this.arc]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.count * a.itemSize);
      a.needsUpdate = true;
    }
  }

  setResolution(w: number, h: number): void {
    this.resolution.value.set(w, h);
  }
}
