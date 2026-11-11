// The harp in 3D (harp3d.ts), without WebGL: built from the 2D plan to a concert grand harp's measures, in
// its budget; posed from the engine's frames: every string drawn (47 wires, the ringing ones swinging as
// wide as the engine says, the pedals' strings stopped shorter), the seven pedals each at its notch; and
// standing in the Orchestra without moving anyone else.
import { describe, expect, it } from 'vitest';
import type { VisualFrame } from '@piano-model/engine';
import { Batch, type Mesh, xform } from '../src/ui/gl/gl3d.ts';
import { HARP_SEAT, buildHarpModel, poseHarp, type HarpModel } from '../src/ui/gl/harp3d.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';
import { PEDAL_STEP } from '../src/ui/harp-plan.ts';

const t0 = performance.now();
const hm: HarpModel = buildHarpModel();
const buildMs = performance.now() - t0;
const frame = (amps: Record<number, number>, pedals = [0, 0, 0, 0, 0, 0, 0]): VisualFrame => {
  const amp = new Float32Array(47);
  for (const [i, a] of Object.entries(amps)) amp[+i] = a;
  return { focus: null, harp: { pedals, set: pedals, amp, last: 21, ago: 0.1, vel: 80, plucked: [], shapes: Object.keys(amps).map((i) => ({ string: +i, shape: Float32Array.from({ length: 32 }, (_, k) => Math.sin((Math.PI * k) / 31)) })) } } as unknown as VisualFrame;
};
const state = () => (globalThis as unknown as { window?: { __harp3d?: { state: () => { swing: number[]; pedals: number[]; ringing: number } | null } } }).window?.__harp3d?.state() ?? null;

describe('the harp in 3D', () => {
  it('is a concert grand harp’s size: 1.9 m tall, a soundboard 0.42 m wide at its foot, 47 strings', () => {
    expect(hm.height).toBeGreaterThan(1.85);
    expect(hm.height).toBeLessThan(1.95);
    expect(hm.boardWidth).toBeCloseTo(0.42, 2);
    expect(hm.strings).toBe(47);
    expect(hm.pedalAt.length).toBe(7);
  });

  it('builds in its budget: under 0.2 M vertices, quickly', () => {
    const verts = [...hm.statics, hm.pedal].reduce((s, m) => s + m.count, 0);
    expect(verts).toBeLessThan(200_000);
    expect(verts).toBeGreaterThan(2_000);
    expect(buildMs).toBeLessThan(1500);
  });

  it('draws every string, the ringing ones swinging; each pedal at its notch', () => {
    const b = new Batch();
    (globalThis as unknown as { window: unknown }).window ??= globalThis;
    const m2 = buildHarpModel();
    poseHarp(b, m2, null, 1 / 60, 0);
    let s = state()!;
    expect(s.swing.length).toBe(47);
    expect(s.ringing).toBe(0);
    expect(s.pedals).toEqual([0, 0, 0, 0, 0, 0, 0]);
    // the statics once, the pedal's mesh seven times
    expect(b.inst.get(m2.pedal)!.n).toBe(7 * 20);
    b.clear();
    poseHarp(b, m2, frame({ 21: 0.8, 5: 0.1 }, [0, 1, -1, 0, 0, 0, 0]), 1 / 60, 16);
    s = state()!;
    expect(s.ringing).toBe(2);
    expect(s.swing[21]).toBeGreaterThan(s.swing[5] * 0.5);
    expect(s.swing[21]).toBeGreaterThan(0.004);
    expect(s.swing[21]).toBeLessThan(0.015);
    expect(s.swing[0]).toBe(0);
    expect(s.pedals).toEqual([0, 1, -1, 0, 0, 0, 0]);
    // a pedal down is drawn a notch lower, one up a notch higher (its instance's translation)
    const a = b.inst.get(m2.pedal)!.a;
    const y = (k: number) => a[k * 20 + 13];
    expect(y(0) - y(1)).toBeCloseTo(PEDAL_STEP, 4);
    expect(y(2) - y(0)).toBeCloseTo(PEDAL_STEP, 4);
  });

  it('takes its own place among a few players, standing on the floor (the others’ seats as they were)', () => {
    const parts = (ps: [('wind' | 'reed' | 'brass' | 'bowed' | 'plucked'), ('oboe' | 'clarinet' | 'bassoon')?][]) => ps.map(([family, reed]) => ({ family, reed, kind: 'grand' as const, bowed: null }));
    const withIt = ensembleSeats(parts([['reed', 'oboe'], ['plucked'], ['wind']]));
    expect(withIt[1].top).toBe(HARP_SEAT.top);
    expect(withIt[1].r).toBe(HARP_SEAT.r);
    // it stands on the floor there, whole under its top
    let hi = -Infinity;
    let lo = Infinity;
    for (const m of hm.statics as Mesh[])
      for (let i = 0; i < m.count; i += 11) {
        const p = xform(withIt[1].T, xform(hm.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]));
        hi = Math.max(hi, p[1]);
        lo = Math.min(lo, p[1]);
      }
    expect(lo).toBeGreaterThanOrEqual(-1e-6);
    expect(hi).toBeLessThan(HARP_SEAT.top);
    expect(hi).toBeGreaterThan(1.8);
  });

  it('stands on the floor on its own, inside its bounds', () => {
    let lowY = Infinity;
    let far = 0;
    for (const m of hm.statics)
      for (let i = 0; i < m.count; i += 5) {
        const p = xform(hm.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]);
        lowY = Math.min(lowY, p[1]);
        far = Math.max(far, Math.hypot(p[0] - hm.bounds.c[0], p[1] - hm.bounds.c[1], p[2] - hm.bounds.c[2]));
      }
    expect(lowY).toBeGreaterThanOrEqual(-1e-6);
    expect(lowY).toBeLessThan(0.01);
    expect(far).toBeLessThan(hm.bounds.r);
  });
});
