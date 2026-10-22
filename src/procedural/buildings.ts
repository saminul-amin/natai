// Building geometry (DESIGN.md 5.7): every building is assembled from façade modules (one 3 m bay of
// one floor, an atlas tile each), a roof, one of four parapet styles and an optional stair-head room,
// then merged into a few large chunks so the whole city costs a handful of draw calls. Walls hidden
// against a neighbour are skipped.
import { BufferAttribute, BufferGeometry } from 'three';
import { hash01 } from '../sim/rng';
import type { Building, CityLayout } from './city';
import { PARAPET_TILE, ROOF_TILE, tileRect } from './facades';

export interface Chunk {
  /** Plaster, concrete and brick: the atlas material. */
  walls: BufferGeometry;
  /** Corrugated tin roofs of stair-head rooms and sheds: the metallic material. */
  tin: BufferGeometry;
  cx: number;
  cz: number;
}

class Mesher {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  glow: number[] = [];
  idx: number[] = [];

  /**
   * A quad from corner `o` spanned by edges `a` (along u) and `b` (along v), with uvs in atlas tile
   * `tile` from (u0, v0) to (u1, v1) of the tile.
   */
  quad(
    ox: number,
    oy: number,
    oz: number,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    tile: number,
    tint: readonly number[],
    glow: number,
    u0 = 0,
    v0 = 0,
    u1 = 1,
    v1 = 1,
  ): void {
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const base = this.pos.length / 3;
    const r = tile >= 0 ? tileRect(tile) : [0, 0, 1, 1];
    const tu = (f: number) => (r[0] as number) + ((r[2] as number) - (r[0] as number)) * f;
    const tv = (f: number) => (r[1] as number) + ((r[3] as number) - (r[1] as number)) * f;
    const corners: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const [s, t] of corners) {
      this.pos.push(ox + ax * s + bx * t, oy + ay * s + by * t, oz + az * s + bz * t);
      this.nrm.push(nx, ny, nz);
      this.uv.push(tu(u0 + (u1 - u0) * s), tv(v0 + (v1 - v0) * t));
      this.col.push(tint[0] as number, tint[1] as number, tint[2] as number);
      this.glow.push(glow);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** An axis-aligned box from (x0,y0,z0) to (x1,y1,z1), all six faces unless skipped. */
  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    tile: number,
    tint: readonly number[],
    skipBottom = true,
  ): void {
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    this.quad(x0, y0, z1, w, 0, 0, 0, h, 0, tile, tint, 0); // +z
    this.quad(x1, y0, z0, -w, 0, 0, 0, h, 0, tile, tint, 0); // -z
    this.quad(x1, y0, z1, 0, 0, -d, 0, h, 0, tile, tint, 0); // +x
    this.quad(x0, y0, z0, 0, 0, d, 0, h, 0, tile, tint, 0); // -x
    this.quad(x0, y1, z1, w, 0, 0, 0, 0, -d, tile, tint, 0); // top
    if (!skipBottom) this.quad(x0, y0, z0, w, 0, 0, 0, 0, d, tile, tint, 0);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('glow', new BufferAttribute(new Float32Array(this.glow), 1));
    const count = this.pos.length / 3;
    g.setIndex(new BufferAttribute(count > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }
}

const GREY = [1, 1, 1];

/** Walls of one side of a building, floor by floor and bay by bay. */
function side(m: Mesher, b: Building, ox: number, oz: number, dx: number, dz: number, length: number, bayWidth: number): void {
  const bays = Math.max(1, Math.round(length / bayWidth));
  const bw = length / bays;
  for (let f = 0; f < b.floors; f++) {
    const y = f * 3;
    const h = f === b.floors - 1 ? b.h - y : 3;
    for (let i = 0; i < bays; i++) {
      const s = b.seed * 131 + f * 17 + i * 7 + Math.round(ox * 3 + oz * 5);
      let tile = hash01(b.seed, f, i) < 0.6 ? b.facade : b.facade2;
      if (f === 0 && b.shop >= 0) tile = hash01(b.seed + 3, i) < 0.75 ? b.shop : b.shop === 12 ? 13 : 12;
      m.quad(
        ox + dx * bw * i,
        y,
        oz + dz * bw * i,
        dx * bw,
        0,
        dz * bw,
        0,
        h,
        0,
        tile,
        b.tint,
        hash01(9, s),
        0,
        0,
        1,
        Math.min(1, h / 3),
      );
    }
  }
}

/** A vertical wall strip along (dx, dz), split into segments of about 3 m. */
function strip(
  m: Mesher,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dz: number,
  length: number,
  height: number,
  tile: number,
  tint: readonly number[],
  vMax: number,
): void {
  const n = Math.max(1, Math.round(length / 3));
  const l = length / n;
  for (let i = 0; i < n; i++)
    m.quad(ox + dx * l * i, oy, oz + dz * l * i, dx * l, 0, dz * l, 0, height, 0, tile, tint, 0, 0, 0, 1, vMax);
}

function parapet(m: Mesher, b: Building): void {
  const style = b.parapet;
  const height = style === 2 ? 0.55 : style === 3 ? 1.2 : 1.0;
  const t = 0.18;
  const y0 = b.h;
  const y1 = b.h + height;
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const z0 = b.z - b.d / 2;
  const z1 = b.z + b.d / 2;
  const tile = style === 1 ? PARAPET_TILE : 5;
  const tint = style === 1 ? GREY.map((c, i) => c * (b.tint[i] as number)) : b.tint;
  const vh = height / 3;
  // Outer faces, then inner faces, each split into 3 m segments so the atlas tile never repeats.
  strip(m, x0, y0, z1, 1, 0, b.w, height, tile, tint, vh);
  strip(m, x1, y0, z0, -1, 0, b.w, height, tile, tint, vh);
  strip(m, x1, y0, z1, 0, -1, b.d, height, tile, tint, vh);
  strip(m, x0, y0, z0, 0, 1, b.d, height, tile, tint, vh);
  strip(m, x1, y0, z1 - t, -1, 0, b.w, height, tile, tint, vh);
  strip(m, x0, y0, z0 + t, 1, 0, b.w, height, tile, tint, vh);
  strip(m, x1 - t, y0, z0, 0, 1, b.d, height, tile, tint, vh);
  strip(m, x0 + t, y0, z1, 0, -1, b.d, height, tile, tint, vh);
  // Coping on top.
  const cop = [0.86, 0.84, 0.8];
  m.quad(x0, y1, z1, b.w, 0, 0, 0, 0, -t, ROOF_TILE, cop, 0);
  m.quad(x0, y1, z0 + t, b.w, 0, 0, 0, 0, -t, ROOF_TILE, cop, 0);
  m.quad(x1 - t, y1, z1, t, 0, 0, 0, 0, -b.d, ROOF_TILE, cop, 0);
  m.quad(x0, y1, z1, t, 0, 0, 0, 0, -b.d, ROOF_TILE, cop, 0);
}

function stairHead(walls: Mesher, tin: Mesher, b: Building): void {
  if (b.stair < 0 || b.w < 7 || b.d < 7) return;
  const sw = 3.2;
  const sd = 3.0;
  const sh = 2.6;
  const cx = b.x + (b.stairCorner & 1 ? 1 : -1) * (b.w / 2 - sw / 2 - 0.25);
  const cz = b.z + (b.stairCorner & 2 ? 1 : -1) * (b.d / 2 - sd / 2 - 0.25);
  const x0 = cx - sw / 2;
  const x1 = cx + sw / 2;
  const z0 = cz - sd / 2;
  const z1 = cz + sd / 2;
  const y0 = b.h;
  const y1 = b.h + sh;
  const v = sh / 3;
  walls.quad(x0, y0, z1, sw, 0, 0, 0, sh, 0, 2, b.tint, 0.2, 0, 0, 1, v); // door side
  walls.quad(x1, y0, z0, -sw, 0, 0, 0, sh, 0, 5, b.tint, 0, 0, 0, 1, v);
  walls.quad(x1, y0, z1, 0, 0, -sd, 0, sh, 0, 5, b.tint, 0, 0, 0, 1, v);
  walls.quad(x0, y0, z0, 0, 0, sd, 0, sh, 0, b.stair === 1 ? 1 : 5, b.tint, 0.5, 0, 0, 1, v);
  if (b.stair === 2) {
    // A tin roof with a slight slope and overhang.
    tin.quad(x0 - 0.3, y1 + 0.35, z1 + 0.3, sw + 0.6, 0, 0, 0, -0.35, -(sd + 0.6), -1, [0.62, 0.5, 0.42], 0, 0, 0, 4, 1);
  } else {
    walls.box(x0 - 0.1, y1, z0 - 0.1, x1 + 0.1, y1 + 0.18, z1 + 0.1, ROOF_TILE, [0.9, 0.88, 0.84]);
  }
}

type HeightAt = (x: number, z: number) => number;

/** True when a neighbour stands against this face tall enough to hide most of it. */
function hidden(heightAt: HeightAt, x: number, z: number, h: number): boolean {
  return heightAt(x, z) >= h - 3.5;
}

/** Roof height over only the given buildings, so a thinned city never culls a face against a building it left out. */
export function heightOver(buildings: readonly Building[]): HeightAt {
  const CELL = 24;
  const grid = new Map<string, Building[]>();
  for (const b of buildings) {
    for (let cx = Math.floor((b.x - b.w / 2) / CELL); cx <= Math.floor((b.x + b.w / 2) / CELL); cx++)
      for (let cz = Math.floor((b.z - b.d / 2) / CELL); cz <= Math.floor((b.z + b.d / 2) / CELL); cz++) {
        const key = `${cx},${cz}`;
        const list = grid.get(key);
        if (list) list.push(b);
        else grid.set(key, [b]);
      }
  }
  return (x, z) => {
    for (const b of grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
      if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2) return b.h;
    }
    return 0;
  };
}

export function buildBuilding(walls: Mesher, tin: Mesher, heightAt: HeightAt, b: Building, fine = b.detail): void {
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const z0 = b.z - b.d / 2;
  const z1 = b.z + b.d / 2;
  const bay = fine ? 3 : 6;
  const probe = 0.9;
  if (!hidden(heightAt, b.x, z1 + probe, b.h)) side(walls, b, x0, z1, 1, 0, b.w, bay);
  if (!hidden(heightAt, b.x, z0 - probe, b.h)) side(walls, b, x1, z0, -1, 0, b.w, bay);
  if (!hidden(heightAt, x1 + probe, b.z, b.h)) side(walls, b, x1, z1, 0, -1, b.d, bay);
  if (!hidden(heightAt, x0 - probe, b.z, b.h)) side(walls, b, x0, z0, 0, 1, b.d, bay);
  // Roof.
  walls.quad(
    x0,
    b.h,
    z1,
    b.w,
    0,
    0,
    0,
    0,
    -b.d,
    ROOF_TILE,
    [0.95, 0.93, 0.9],
    0,
    0,
    0,
    Math.min(1, b.w / 8),
    Math.min(1, b.d / 8),
  );
  if (fine) {
    parapet(walls, b);
    stairHead(walls, tin, b);
  } else {
    // A low parapet line keeps distant roofs from looking like bare boxes.
    walls.box(x0, b.h, z1 - 0.2, x1, b.h + 0.8, z1, 5, b.tint);
  }
}

export const CHUNK_SIZE = 280;

/**
 * Merges the whole city into chunks of CHUNK_SIZE metres. `keep` can thin distant buildings and
 * `fine` narrows which ones get 3 m bays, parapets and stair-head rooms.
 */
export function buildChunks(
  layout: CityLayout,
  keep: (b: Building) => boolean = () => true,
  fine: (b: Building) => boolean = (b) => b.detail,
): Chunk[] {
  const map = new Map<string, { walls: Mesher; tin: Mesher; cx: number; cz: number }>();
  const kept = layout.buildings.filter(keep);
  const heightAt = kept.length === layout.buildings.length ? layout.heightAt : heightOver(kept);
  for (const b of kept) {
    const cx = Math.floor(b.x / CHUNK_SIZE);
    const cz = Math.floor(b.z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { walls: new Mesher(), tin: new Mesher(), cx, cz };
      map.set(key, entry);
    }
    buildBuilding(entry.walls, entry.tin, heightAt, b, fine(b));
  }
  const chunks: Chunk[] = [];
  for (const e of map.values()) {
    chunks.push({ walls: e.walls.build(), tin: e.tin.build(), cx: e.cx, cz: e.cz });
  }
  return chunks;
}

export { Mesher };
