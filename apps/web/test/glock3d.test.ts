// The glockenspiel in 3D (glock3d.ts), without WebGL: built from the 2D plan (thirty bars at the engine's
// lengths, the far row a step higher, on a stand at a standing player's height), in its budget; posed from
// the engine's frames: a ringing bar glows as far as the engine says it swings, each mallet is over its
// hand's bar, down on it at the stroke and up again; and it stands in the Orchestra with the timpani.
import { describe, expect, it } from 'vitest';
import type { VisualFrame } from '@piano-model/engine';
import { Batch, xform } from '../src/ui/gl/gl3d.ts';
import { buildGlockModel, poseGlock, type GlockModel } from '../src/ui/gl/glock3d.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';
import { BARS, barCentre } from '../src/ui/glock-plan.ts';

(globalThis as unknown as { window: unknown }).window ??= globalThis;
const t0 = performance.now();
const gm: GlockModel = buildGlockModel();
const buildMs = performance.now() - t0;
const frame = (amps: Record<number, number>, hands: [number, number], hits: { bar: number; ago: number; vel: number; hand: number }[]): VisualFrame => {
  const amp = new Float32Array(30);
  for (const [i, a] of Object.entries(amps)) amp[+i] = a;
  return { focus: null, glock: { amp, last: 5, ago: 0.1, vel: 80, hits, hands } } as unknown as VisualFrame;
};
const state = () => (globalThis as unknown as { __glock3d?: { state: () => { glow: number[]; heads: number[][]; lift: number[]; ringing: number } | null } }).__glock3d?.state() ?? null;

describe('the glockenspiel in 3D', () => {
  it('thirty bars at the engine’s lengths, 0.86 m above the floor; in its budget', () => {
    expect(gm.count).toBe(30);
    expect(gm.longest).toBeCloseTo(BARS[0].length, 9);
    expect(gm.shortest).toBeCloseTo(BARS[29].length, 9);
    expect(gm.top).toBeCloseTo(0.86, 6);
    expect(gm.bars.length).toBe(30);
    const verts = [...gm.statics, ...gm.bars, gm.mallet].reduce((s, m) => s + m.count, 0);
    expect(verts).toBeLessThan(60_000);
    expect(verts).toBeGreaterThan(1_500);
    expect(buildMs).toBeLessThan(800);
    // it stands on the floor, inside its bounds
    let lowY = Infinity;
    let far = 0;
    for (const m of [...gm.statics, ...gm.bars])
      for (let i = 0; i < m.count; i += 3) {
        const p = xform(gm.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]);
        lowY = Math.min(lowY, p[1]);
        far = Math.max(far, Math.hypot(p[0] - gm.bounds.c[0], p[1] - gm.bounds.c[1], p[2] - gm.bounds.c[2]));
      }
    expect(lowY).toBeGreaterThanOrEqual(-1e-6);
    expect(lowY).toBeLessThan(0.01);
    expect(far).toBeLessThan(gm.bounds.r);
  });

  it('a ringing bar glows, the loudest most; each mallet over its hand’s bar, down at the stroke and up after', () => {
    const b = new Batch();
    poseGlock(b, gm, null, 1 / 60, 0);
    let s = state()!;
    expect(s.ringing).toBe(0);
    expect(s.glow.length).toBe(30);
    expect(b.inst.get(gm.mallet)!.n).toBe(2 * 20);
    // C6 just struck by the left hand, A7 ringing softly under the right
    for (let k = 1; k <= 30; k++) {
      b.clear();
      poseGlock(b, gm, frame({ 5: 0.8, 26: 0.1 }, [5, 26], [{ bar: 5, ago: 0.01, vel: 100, hand: 0 }, { bar: 26, ago: 0.5, vel: 60, hand: 1 }]), 1 / 60, k * 16);
    }
    s = state()!;
    expect(s.ringing).toBe(2);
    expect(s.glow[5]).toBeGreaterThan(s.glow[26]);
    expect(s.glow[0]).toBe(0);
    expect(s.lift[0]).toBeLessThan(0.05);
    expect(s.lift[1]).toBeGreaterThan(0.9);
    // the heads over their bars (the model's frame: plan x, plan y away from the player → −z), the left one
    // on the bar, the right one lifted
    const at = (i: number) => xform(gm.T, [barCentre(i)[0], 0, -barCentre(i)[1]]);
    expect(s.heads[0][0]).toBeCloseTo(at(5)[0], 2);
    expect(s.heads[0][2]).toBeCloseTo(at(5)[2], 2);
    expect(s.heads[1][0]).toBeCloseTo(at(26)[0], 2);
    expect(s.heads[0][1]).toBeGreaterThan(0.86);
    expect(s.heads[0][1]).toBeLessThan(0.89);
    expect(s.heads[1][1]).toBeGreaterThan(s.heads[0][1] + 0.05);
  });

  it('in an orchestra it stands in the back row beside the timpani, and nobody else has moved for it but along that row', () => {
    const fam = (family: string, extra: object = {}) => ({ family, kind: 'grand', bowed: null, ...extra }) as never;
    const others = [fam('bowed', { bowed: { id: 'violin' } }), fam('bowed', { bowed: { id: 'violin' } }), fam('bowed', { bowed: { id: 'viola' } }), fam('bowed', { bowed: { id: 'cello' } }), fam('wind'), fam('reed', { reed: 'oboe' }), fam('brass', { brass: 'horn' }), fam('brass', { brass: 'trumpet' }), fam('percussion')];
    const a = ensembleSeats(others);
    const b = ensembleSeats([...others, fam('mallet')]);
    const glock = b[9];
    const drums = b[8];
    const horn = b[6];
    // on the back row's riser, between the timpani (at its left end) and the horn
    expect(glock.c[1]).toBeCloseTo(horn.c[1], 6);
    expect(glock.c[0]).toBeGreaterThan(drums.c[0]);
    expect(glock.c[0]).toBeLessThan(horn.c[0]);
    // the strings and the woodwinds are where they were; the brass too (the percussion hangs off their row's end)
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) for (const k of [0, 1, 2]) expect(b[i].c[k], `seat ${i} axis ${k}`).toBeCloseTo(a[i].c[k], 6);
  });
});
