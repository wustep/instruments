// The 3D instruments' geometry, without WebGL: every model builds, has finite vertices and the
// dimensions of the real instrument, and the pianos' parts line up (each key's hammer under its
// own strings, dampers behind the strike line). Posing a frame with a key down moves its key and
// hammer and lifts its damper.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, PRESETS, buildKeySpecs } from '../../../packages/engine/src/core/design.ts';
import { BOWED } from '../../../packages/engine/src/core/bowed.ts';
import type { KeySummary } from '@piano-model/engine';
import { Batch, type Mesh, xform } from '../src/ui/gl/gl3d.ts';
import { buildGrandModel, buildUprightModel, newPianoPose, posePiano, type PianoModel } from '../src/ui/gl/piano3d.ts';
import { buildBowedModel } from '../src/ui/gl/strings3d.ts';
import { buildFluteModel, buildTrumpetModel } from '../src/ui/gl/winds3d.ts';
import { newPianoState } from '../src/ui/piano-draw.ts';

const keysOf = (preset: string): KeySummary[] => {
  const d = PRESETS[preset];
  return buildKeySpecs(d, { ...DEFAULT_PARAMS, ...d.defaults }).map((s) => ({ midi: s.midi, f1: s.f1, B: s.B, nStrings: s.nStrings, lengthM: s.L, hasDamper: s.hasDamper, preparation: null }));
};
/** bounds of meshes placed by a transform */
function bounds(ms: Mesh[], T: Float32Array | null = null): { lo: number[]; hi: number[] } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of ms)
    for (let i = 0; i < m.count; i++) {
      const o = i * 14;
      let p: [number, number, number] = [m.data[o], m.data[o + 1], m.data[o + 2]];
      for (let k = 0; k < 14; k++) expect(Number.isFinite(m.data[o + k])).toBe(true);
      if (T) p = xform(T, p);
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], p[k]);
        hi[k] = Math.max(hi[k], p[k]);
      }
    }
  return { lo, hi };
}

describe('3D instruments', () => {
  const grand = buildGrandModel(keysOf('grand'));
  const upright = buildUprightModel(keysOf('upright'));

  it('the grand is a grand: about 2 m long, 1.5 m wide, a 1 m tall case on legs, 88 keys at 725 mm', () => {
    const b = bounds([...grand.statics, grand.board]);
    expect(b.hi[2] - b.lo[2]).toBeGreaterThan(1.8);
    expect(b.hi[2] - b.lo[2]).toBeLessThan(2.5);
    expect(b.hi[0] - b.lo[0]).toBeGreaterThan(1.3);
    expect(b.hi[0] - b.lo[0]).toBeLessThan(1.7);
    expect(b.lo[1]).toBeLessThan(0.01); // legs to the floor
    expect(b.hi[1]).toBeGreaterThan(0.9);
    expect(b.hi[1]).toBeLessThan(1.05);
    expect(grand.keys).toHaveLength(88);
    // the key top (its front 15 cm; behind it rise the capstan and backcheck)
    const k = grand.keys[39].key;
    let top = 0;
    for (let i = 0; i < k.count; i++) if (k.data[i * 14 + 2] < 0.15) top = Math.max(top, k.data[i * 14 + 1]);
    expect(top).toBeCloseTo(0.725, 3);
  });

  it('each hammer strikes its own strings; dampers sit behind the strike line, none above the top octaves', () => {
    for (const m of [grand, upright] as PianoModel[]) {
      for (const g of m.keys) {
        const s = g.strings[Math.floor(g.strings.length / 2)];
        // the strike point lies on the speaking length, at the key's strike ratio
        const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]);
        const d = Math.hypot(g.strike[0] - s.a[0], g.strike[1] - s.a[1], g.strike[2] - s.a[2]);
        expect(d / L).toBeGreaterThan(0.05);
        expect(d / L).toBeLessThan(0.14);
        expect(!!g.damper).toBe(g.k.hasDamper);
      }
      expect(m.keys.filter((g) => g.damper).length).toBeGreaterThan(60);
    }
    for (const g of grand.keys) if (g.damper) expect(g.damper[2]).toBeGreaterThan(g.strike[2]);
    for (const g of upright.keys) if (g.damper) expect(g.damper[1]).toBeGreaterThan(g.strike[1]);
  });

  it('a key held: its key dips, its hammer rises to the string and its damper lifts; the pedal lifts all', () => {
    const ps = newPianoState();
    const pose = newPianoPose();
    const b = new Batch();
    const keys = keysOf('grand');
    const run = (down: Set<number>, sustain: number, frames: number) => {
      ps.down = down;
      ps.sustain = sustain;
      for (let f = 0; f < frames; f++) {
        b.clear();
        posePiano(b, grand, { piano: ps, keys, dt: 1 / 60, lid: 1, down: (m) => down.has(m), sounding: (m) => down.has(m), lite: false }, pose);
      }
    };
    ps.strikes.set(60, 1);
    run(new Set([60]), 0, 3);
    expect(pose.keyPos[39]).toBeGreaterThan(0.5);
    expect(ps.hammer[39]).toBeGreaterThan(0.5);
    run(new Set([60]), 0, 30);
    expect(ps.damper[39]).toBeGreaterThan(0.9);
    expect(ps.damper[20]).toBeLessThan(0.05);
    run(new Set(), 1, 30);
    expect(pose.keyPos[39]).toBeLessThan(0.05);
    expect(ps.damper[20]).toBeGreaterThan(0.9);
    expect(b.vertices).toBeGreaterThan(50_000);
  });

  it('the upright stands about 1.25 m tall, its strings vertical behind the action', () => {
    const b = bounds(upright.statics);
    expect(b.hi[1]).toBeGreaterThan(1.15);
    expect(b.hi[1]).toBeLessThan(1.35);
    const s = upright.keys[60].strings[0];
    expect(Math.abs(s.a[2] - s.b[2])).toBeLessThan(1e-9);
    expect(s.a[1] - s.b[1]).toBeGreaterThan(0.1);
  });

  it('violin < viola < cello, with the real body lengths; the cello stands on its endpin', () => {
    const len: Record<string, number> = {};
    for (const id of ['violin', 'viola', 'cello'] as const) {
      const d = BOWED[id];
      const m = buildBowedModel({ id, L: d.L, bowLength: d.bowLength, strings: d.strings.map((s) => ({ name: s.name, open: s.open })) });
      const b = bounds([m.top]);
      len[id] = b.hi[0] - b.lo[0];
      expect(m.xb - m.xn).toBeCloseTo(d.L, 6);
      if (id === 'cello') {
        const w = bounds(m.meshes, m.T);
        expect(w.lo[1]).toBeLessThan(0.01);
        expect(w.hi[1]).toBeGreaterThan(1.1);
      }
    }
    expect(len.violin).toBeCloseTo(0.356, 2);
    expect(len.viola).toBeCloseTo(0.406, 2);
    expect(len.cello).toBeCloseTo(0.755, 2);
  });

  it('flute about 0.67 m with its tone holes; trumpet about 0.6 m with a 123 mm bell', () => {
    const f = buildFluteModel();
    const fb = bounds(f.statics);
    expect(fb.hi[0] - fb.lo[0]).toBeGreaterThan(0.64);
    expect(fb.hi[0] - fb.lo[0]).toBeLessThan(0.7);
    expect(f.holes.length).toBeGreaterThanOrEqual(12);
    const t = buildTrumpetModel();
    const tb = bounds(t.statics);
    expect(tb.hi[0] - tb.lo[0]).toBeGreaterThan(0.5);
    expect(tb.hi[0] - tb.lo[0]).toBeLessThan(0.7);
    expect(2 * t.rim).toBeCloseTo(0.123, 2);
  });
});
