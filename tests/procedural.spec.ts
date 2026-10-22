import { describe, expect, it } from 'vitest';
import { buildChunks } from '../src/procedural/buildings';
import { CITY, generateCity, LANDMARKS } from '../src/procedural/city';
import { ATLAS_SIZE, facadeAtlas, tileRect } from '../src/procedural/facades';
import { gradeColor, GRADES, gradingTable, LUT_SIZE } from '../src/procedural/grading';
import { geometryFor, tailLength } from '../src/procedural/kites';
import { noiseTexture } from '../src/procedural/noise';
import { ANIMS, bakeBody, BODY_COUNT, FRAMES } from '../src/procedural/people';
import { PRINT_COUNT, printTexture } from '../src/procedural/prints';
import {
  ahsanManzil,
  boat,
  bridge,
  launch,
  mosque,
  PROP_VARIANTS,
  propGeometry,
  terminal,
  treeGeometry,
} from '../src/procedural/props';
import { KITES, ROOFTOPS, RIVALS } from '../src/sim/names';
import type { PropKind } from '../src/procedural/city';

describe('procedural city', () => {
  const city = generateCity(1);

  it('is deterministic for a seed', () => {
    const again = generateCity(1);
    expect(again.buildings.length).toBe(city.buildings.length);
    expect(again.buildings[200]).toEqual(city.buildings[200]);
    expect(generateCity(2).buildings[200]).not.toEqual(city.buildings[200]);
  });

  it('is dense: thousands of buildings, four to six storeys mostly', () => {
    expect(city.buildings.length).toBeGreaterThan(2000);
    const floors = city.buildings.map((b) => b.floors);
    const mid = floors.filter((f) => f >= 3 && f <= 7).length / floors.length;
    expect(mid).toBeGreaterThan(0.8);
  });

  it('puts every player rooftop on a real roof at its height', () => {
    for (const r of ROOFTOPS) {
      expect(city.heightAt(r.x, r.z)).toBeCloseTo(r.height, 6);
    }
  });

  it('puts every rival on a roof near its offset from each player rooftop', () => {
    for (const r of ROOFTOPS)
      for (const rv of RIVALS) {
        const roof = city.roofAt(r.x + rv.offset.x, r.z + rv.offset.z);
        expect(roof.y).toBeGreaterThan(5);
        expect(Math.hypot(roof.x - (r.x + rv.offset.x), roof.z - (r.z + rv.offset.z))).toBeLessThan(30);
      }
  });

  it('keeps ordinary buildings off the landmarks and out of the river', () => {
    for (const b of city.buildings) {
      expect(b.z - b.d / 2).toBeGreaterThan(CITY.riverNorth);
      const a = LANDMARKS.ahsanManzil;
      expect(Math.abs(b.x - a.x) < a.w / 2 && Math.abs(b.z - a.z) < a.d / 2).toBe(false);
    }
  });

  it('dresses roofs with props, people, lights and kites', () => {
    expect(city.props.length).toBeGreaterThan(500);
    expect(city.people.length).toBeGreaterThan(300);
    expect(city.lightRuns.length).toBeGreaterThan(100);
    expect(city.kiteRoofs.length).toBeGreaterThan(200);
    expect(city.trees.length).toBeGreaterThan(50);
    expect(city.fireBreathers.length).toBeGreaterThanOrEqual(1);
  });

  it('merges buildings into a few chunks with valid geometry', () => {
    const chunks = buildChunks(city);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.length).toBeLessThan(80);
    let tris = 0;
    for (const c of chunks) {
      const pos = c.walls.getAttribute('position');
      tris += (c.walls.index?.count ?? 0) / 3;
      expect(c.walls.getAttribute('uv').count).toBe(pos.count);
      expect(c.walls.getAttribute('glow').count).toBe(pos.count);
      for (let i = 0; i < pos.count; i += 97) expect(Number.isFinite(pos.getY(i))).toBe(true);
    }
    expect(tris).toBeLessThan(1_400_000);
  });
});

describe('procedural textures', () => {
  it('paints the façade atlas with plaster and glass masks', () => {
    const { color, glass } = facadeAtlas(1);
    expect(color.length).toBe(ATLAS_SIZE * ATLAS_SIZE * 4);
    let plaster = 0;
    let lit = 0;
    for (let i = 0; i < color.length; i += 4 * 61) {
      if ((color[i + 3] as number) > 128) plaster++;
      if ((glass[i] as number) > 128) lit++;
    }
    expect(plaster).toBeGreaterThan(0);
    expect(lit).toBeGreaterThan(0);
    const r = tileRect(5);
    expect(r[2]).toBeGreaterThan(r[0]);
  });

  it('draws eight kite prints with the bamboo frame in alpha', () => {
    expect(PRINT_COUNT).toBe(KITES.length);
    const p = printTexture(0, 64);
    expect(p.length).toBe(64 * 64 * 4);
    let frame = 0;
    for (let i = 3; i < p.length; i += 4) if ((p[i] as number) < 128) frame++;
    expect(frame).toBeGreaterThan(0);
  });

  it('makes tileable noise in every channel', () => {
    const n = noiseTexture(3, 32);
    expect(n.length).toBe(32 * 32 * 4);
    const ch = [0, 1, 2, 3].map((c) => new Set(Array.from({ length: 64 }, (_, i) => n[i * 16 + c])).size);
    for (const c of ch) expect(c).toBeGreaterThan(4);
  });

  it('grades each phase: more saturation and contrast than AgX gives, in range', () => {
    expect(gradingTable('golden').length).toBe(LUT_SIZE ** 3 * 4);
    for (const g of Object.values(GRADES)) {
      const out = gradeColor(g, 0.6, 0.4, 0.3);
      for (const c of out) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      // Saturation grows: the spread between channels widens.
      expect(out[0] - out[2]).toBeGreaterThan(0.3);
    }
    const black = gradeColor(GRADES.night, 0, 0, 0);
    expect(black[0]).toBeLessThan(0.06);
  });
});

describe('procedural models', () => {
  it('builds every prop variant with colours and sway', () => {
    for (const kind of Object.keys(PROP_VARIANTS) as PropKind[]) {
      for (let v = 0; v < PROP_VARIANTS[kind]; v++) {
        const g = propGeometry(kind, v);
        expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
        expect(g.getAttribute('sway').count).toBe(g.getAttribute('position').count);
      }
    }
    for (const t of ['rain', 'coconut', 'banana'] as const) expect(treeGeometry(t).getAttribute('sway')).toBeDefined();
    for (const g of [ahsanManzil(), mosque(), terminal(), launch(0), boat(), bridge(400)])
      expect(g.getAttribute('position').count).toBeGreaterThan(20);
  });

  it('builds every kite shape, and tails where they belong', () => {
    for (const k of KITES) {
      const g = geometryFor(k);
      expect(g.getAttribute('flex').count).toBe(g.getAttribute('position').count);
    }
    expect(tailLength(KITES.find((k) => k.id === 'lejdar')!)).toBeGreaterThan(0);
    expect(tailLength(KITES.find((k) => k.id === 'chokhdar')!)).toBe(0);
  });

  it('bakes five animations for each of four bodies', () => {
    for (let b = 0; b < BODY_COUNT; b++) {
      const baked = bakeBody(b);
      expect(baked.vat.length).toBe(baked.vertexCount * ANIMS.length * FRAMES * 4);
      expect(baked.geometry.getAttribute('bodyPart').count).toBe(baked.vertexCount);
      // The cheer lifts the arms above the head at some frame.
      const cheer = ANIMS.indexOf('cheer');
      let maxY = 0;
      for (let f = 0; f < FRAMES; f++)
        for (let i = 0; i < baked.vertexCount; i++)
          maxY = Math.max(maxY, baked.vat[((cheer * FRAMES + f) * baked.vertexCount + i) * 4 + 1] as number);
      expect(maxY).toBeGreaterThan(b === 2 ? 1.2 : 1.7);
    }
  });
});
