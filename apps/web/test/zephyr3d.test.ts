// The zephyr in 3D (zephyr3d.ts), without WebGL: built from the 2D plan, in its budget; posed from the
// engine's frames: every ribbon drawn (61 wires, the sounding ones swinging as wide as the engine says), a
// key down and its slot lit while it blows; and standing in the Orchestra without moving anyone else.
import { describe, expect, it } from 'vitest';
import type { VisualFrame } from '@piano-model/engine';
import { Batch, type Mesh, xform } from '../src/ui/gl/gl3d.ts';
import { ZEPHYR_SEAT, buildZephyrModel, poseZephyr, type ZephyrModel } from '../src/ui/gl/zephyr3d.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';
import { MAST_Y1 } from '../src/ui/zephyr-plan.ts';

const t0 = performance.now();
const zm: ZephyrModel = buildZephyrModel();
const buildMs = performance.now() - t0;
const frame = (amps: Record<number, number>, winds: Record<number, number> = amps): VisualFrame => {
  const amp = new Float32Array(61);
  const wind = new Float32Array(61);
  for (const [i, a] of Object.entries(amps)) amp[+i] = a;
  for (const [i, w] of Object.entries(winds)) wind[+i] = w;
  return { focus: null, zephyr: { amp, swing: amp, wind, last: 24, ago: 0.1, vel: 80, chest: 1, shapes: Object.keys(amps).map((i) => ({ string: +i, shape: Float32Array.from({ length: 33 }, (_, k) => Math.sin((Math.PI * k) / 32)) })) } } as unknown as VisualFrame;
};
const state = () => (globalThis as unknown as { window?: { __zephyr3d?: { state: () => { swing: number[]; dip: number[]; ringing: number; lit: number } | null } } }).window?.__zephyr3d?.state() ?? null;

describe('the zephyr in 3D', () => {
  it('is the plan’s size: 2.1 m to the mast’s cap, a soundboard 0.32 m deep, 61 ribbons and 61 keys', () => {
    expect(zm.height).toBeGreaterThan(MAST_Y1);
    expect(zm.height).toBeLessThan(MAST_Y1 + 0.03);
    expect(zm.boardDepth).toBeCloseTo(0.32, 6);
    expect(zm.ribbons).toBe(61);
    expect(zm.keys).toBe(61);
  });

  it('builds in its budget: under 0.2 M vertices, quickly', () => {
    const verts = [...zm.statics, zm.white, zm.black, zm.light].reduce((s, m) => s + m.count, 0);
    expect(verts).toBeLessThan(200_000);
    expect(verts).toBeGreaterThan(2_000);
    expect(buildMs).toBeLessThan(1500);
  });

  it('draws every ribbon and every key; a sounding ribbon swings, its key goes down and its slot is lit', () => {
    const b = new Batch();
    (globalThis as unknown as { window: unknown }).window ??= globalThis;
    const m2 = buildZephyrModel();
    poseZephyr(b, m2, null, 1 / 60, 0);
    let s = state()!;
    expect(s.swing.length).toBe(61);
    expect(s.ringing).toBe(0);
    expect(s.lit).toBe(0);
    expect(Math.max(...s.dip)).toBe(0);
    // the naturals' key 36 times, the accidentals' 25, no slot's light
    expect(b.inst.get(m2.white)!.n).toBe(36 * 20);
    expect(b.inst.get(m2.black)!.n).toBe(25 * 20);
    expect(b.inst.get(m2.light)?.n ?? 0).toBe(0);
    b.clear();
    // (C4 loud and blowing, G2 softer; a third ribbon still swinging with its slot shut)
    for (let k = 1; k <= 12; k++) {
      b.clear();
      poseZephyr(b, m2, frame({ 24: 0.8, 7: 0.1, 40: 0.05 }, { 24: 1, 7: 0.5 }), 1 / 60, k * 16);
    }
    s = state()!;
    expect(s.ringing).toBe(3);
    expect(s.lit).toBe(2);
    expect(s.swing[24]).toBeGreaterThan(s.swing[7] * 0.5);
    expect(s.swing[24]).toBeGreaterThan(0.003);
    expect(s.swing[24]).toBeLessThan(0.017);
    expect(s.swing[0]).toBe(0);
    expect(s.dip[24]).toBeGreaterThan(0.006);
    expect(s.dip[7]).toBeGreaterThan(0.006);
    expect(s.dip[40]).toBeLessThan(0.001);
    expect(b.inst.get(m2.light)!.n).toBe(2 * 20);
    // let go: the keys come up, the lights go out
    for (let k = 13; k <= 40; k++) {
      b.clear();
      poseZephyr(b, m2, frame({}), 1 / 60, k * 16);
    }
    s = state()!;
    expect(s.lit).toBe(0);
    expect(Math.max(...s.dip)).toBeLessThan(0.001);
  });

  it('takes its own place among a few players, standing on the floor (whole under its top)', () => {
    const parts = (ps: ('wind' | 'reed' | 'bowed' | 'aeolian')[]) => ps.map((family) => ({ family, kind: 'grand' as const, bowed: null }));
    const withIt = ensembleSeats(parts(['reed', 'aeolian', 'wind']));
    expect(withIt[1].top).toBe(ZEPHYR_SEAT.top);
    expect(withIt[1].r).toBe(ZEPHYR_SEAT.r);
    let hi = -Infinity;
    let lo = Infinity;
    for (const m of zm.statics as Mesh[])
      for (let i = 0; i < m.count; i += 11) {
        const p = xform(withIt[1].T, xform(zm.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]));
        hi = Math.max(hi, p[1]);
        lo = Math.min(lo, p[1]);
      }
    expect(lo).toBeGreaterThanOrEqual(-1e-6);
    expect(hi).toBeLessThan(ZEPHYR_SEAT.top);
    expect(hi).toBeGreaterThan(2);
  });

  it('in an orchestra it stands where a harp does, on the first riser at the woodwinds’ left, and the strings and the brass have not moved for it', () => {
    const fam = (family: string, extra: object = {}) => ({ family, kind: 'grand', bowed: null, ...extra }) as never;
    const others = [fam('bowed', { bowed: { id: 'violin' } }), fam('bowed', { bowed: { id: 'violin' } }), fam('bowed', { bowed: { id: 'viola' } }), fam('bowed', { bowed: { id: 'cello' } }), fam('wind'), fam('reed', { reed: 'oboe' }), fam('reed', { reed: 'clarinet' }), fam('brass', { brass: 'horn' }), fam('brass', { brass: 'trumpet' }), fam('percussion')];
    const withIt = [...others.slice(0, 4), fam('aeolian'), ...others.slice(4)];
    const a = ensembleSeats(others);
    const b = ensembleSeats(withIt);
    const zephyr = b[4];
    const flute = b[5];
    expect(zephyr.c[1]).toBeCloseTo(flute.c[1], 6);
    expect(zephyr.c[1]).toBeGreaterThan(0.1);
    expect(zephyr.c[0]).toBeLessThan(flute.c[0] - 0.8);
    for (const [i, j] of [[0, 0], [1, 1], [2, 2], [3, 3], [7, 8], [8, 9], [9, 10]]) for (const k of [0, 1, 2]) expect(b[j].c[k], `seat ${i} axis ${k}`).toBeCloseTo(a[i].c[k], 6);
  });

  it('stands on the floor on its own, inside its bounds', () => {
    let lowY = Infinity;
    let far = 0;
    for (const m of zm.statics)
      for (let i = 0; i < m.count; i += 5) {
        const p = xform(zm.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]);
        lowY = Math.min(lowY, p[1]);
        far = Math.max(far, Math.hypot(p[0] - zm.bounds.c[0], p[1] - zm.bounds.c[1], p[2] - zm.bounds.c[2]));
      }
    expect(lowY).toBeGreaterThanOrEqual(-1e-6);
    expect(lowY).toBeLessThan(0.01);
    expect(far).toBeLessThan(zm.bounds.r);
  });
});
