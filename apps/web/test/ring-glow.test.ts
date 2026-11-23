// The struck instruments' ring glow in 3D (ui/gl/ring-glow.ts), on the engine's own frames: a glockenspiel's
// bar and a timpano's head light on the stroke and fade with that note's ring (a low bar's long one, a high
// bar's short one, a bar stopped by the hand at once; a single stroke on a drum dies, a roll keeps it up),
// at a strength kept with the app's other 3D light, and a seat in the Orchestra glows as the instrument
// alone does.
import { describe, expect, it } from 'vitest';
import type { VisualFrame } from '@piano-model/engine';
import { createCore } from '../../../packages/engine/src/core/index.ts';
import { Batch, type Mesh } from '../src/ui/gl/gl3d.ts';
import { buildGlockModel, poseGlock } from '../src/ui/gl/glock3d.ts';
import { buildTimpaniModel, newTimpaniPose, poseTimpani } from '../src/ui/gl/timpani3d.ts';
import { RING_MAX, RING_RANGE_DB, RING_TINT, TIMPANI_HARD, ringGlow, ringRGBA } from '../src/ui/gl/ring-glow.ts';

(globalThis as unknown as { window: unknown }).window ??= globalThis;
const FS = 44100;
const BLOCK = 441;

/** a core, the events at their times, and its visual frame read every 10 ms */
function play(instrument: 'glockenspiel' | 'timpani', seconds: number, events: { t: number; ev: Record<string, unknown> }[], params: Record<string, unknown> = {}): VisualFrame[] {
  const c = createCore({ sampleRate: FS, instrument, params: params as never }) as unknown as { schedule(e: unknown): void; process(l: Float32Array, r: Float32Array, n: number): void; getVisual(): VisualFrame };
  const L = new Float32Array(BLOCK);
  const R = new Float32Array(BLOCK);
  const out: VisualFrame[] = [];
  const todo = [...events].sort((a, b) => a.t - b.t);
  for (let k = 0; k * 0.01 < seconds; k++) {
    while (todo.length && todo[0].t <= k * 0.01 + 1e-9) c.schedule(todo.shift()!.ev);
    c.process(L, R, BLOCK);
    out.push(c.getVisual());
  }
  return out;
}
const at = (frames: VisualFrame[], s: number) => frames[Math.min(frames.length - 1, Math.round(s / 0.01) - 1)];
const barGlow = (fr: VisualFrame, i: number) => ringGlow(fr.glock!.amp[i] ?? 0);
const drumGlow = (fr: VisualFrame, k: number) => ringGlow(fr.timpani!.drums[k].level / TIMPANI_HARD);
/** what a batch was given for one mesh: its instances' glow alphas */
const alphas = (b: Batch, m: Mesh): number[] => {
  const x = b.inst.get(m);
  if (!x) return [];
  const a: number[] = [];
  for (let o = 0; o < x.n; o += 20) a.push(x.a[o + 19]);
  return a;
};

describe('the ring glow', () => {
  it('is 1 at a hard stroke and falls with the ring’s decibels to nothing, with no step on the way', () => {
    expect(ringGlow(1)).toBe(1);
    expect(ringGlow(4)).toBe(1);
    expect(ringGlow(0)).toBe(0);
    expect(ringGlow(Number.NaN)).toBe(0);
    expect(ringGlow(Math.pow(10, -RING_RANGE_DB / 20))).toBe(0);
    let last = 1;
    for (let db = 0; db >= -RING_RANGE_DB - 3; db -= 0.25) {
      const g = ringGlow(Math.pow(10, db / 20));
      expect(g).toBeLessThanOrEqual(last + 1e-12);
      // (the last of it is let go under a five-hundredth: no visible step)
      expect(last - g).toBeLessThan(0.02);
      last = g;
    }
  });

  it('is the blue that means sound, at a strength kept with the app’s others: under a third of the glockenspiel’s old one', () => {
    expect(RING_TINT[2]).toBeGreaterThan(RING_TINT[1]);
    expect(RING_TINT[1]).toBeGreaterThan(RING_TINT[0]);
    const out: [number, number, number, number] = [0, 0, 0, 0];
    expect(ringRGBA(0, out)).toBeNull();
    const full = ringRGBA(1, out)!;
    // (the shader's emission: rgb² · a · 0.55; the glockenspiel's bars had [1, 0.74, 0.36] at 1)
    const emit = (c: readonly number[], a: number) => c.slice(0, 3).reduce((s, v) => s + v * v, 0) * a * 0.55;
    expect(emit(full, -full[3])).toBeLessThan(emit([1, 0.74, 0.36], 1) / 3);
    // (and above a trumpet's pressed piston, [1, 0.62, 0.34] at 0.05: the ring is the louder light)
    expect(emit(full, -full[3])).toBeGreaterThan(emit([1, 0.62, 0.34], 0.05));
    // (negative: a light falling on the part, its colour cast on what it reflects: mats3)
    expect(full[3]).toBeCloseTo(-RING_MAX, 9);
  });

  it('a glockenspiel’s bar lights on the stroke and fades with its own ring: the low bar’s long, the top bar’s short, a stopped bar at once', () => {
    // G5 (bar 0) and C8 (bar 29) struck hard together; then C6 (bar 5) held and let go with the hand damping
    const fr = play('glockenspiel', 3, [
      { t: 0, ev: { type: 'noteOn', midi: 79, velocity: 120 } },
      { t: 0, ev: { type: 'noteOn', midi: 108, velocity: 120 } },
    ], { human: 0 });
    expect(barGlow(at(fr, 0.02), 0)).toBeGreaterThan(0.8);
    expect(barGlow(at(fr, 0.02), 29)).toBeGreaterThan(0.8);
    // a bar no one struck: dark
    expect(barGlow(at(fr, 0.02), 12)).toBe(0);
    // the low bar rings on, the top bar's light goes with its ring
    expect(barGlow(at(fr, 2), 0)).toBeGreaterThan(0.2);
    expect(barGlow(at(fr, 1), 29)).toBeLessThan(barGlow(at(fr, 1), 0) / 2);
    expect(barGlow(at(fr, 3), 29)).toBe(0);
    // past the stroke's first 0.1 s it comes up again only by the bar's own beating (its partials' level
    // wanders by a few per cent from frame to frame: under a hundredth of the light), and never steps down
    // more than the ring does in 10 ms
    for (let k = 11; k < fr.length; k++) {
      const a = barGlow(fr[k - 1], 0);
      const b = barGlow(fr[k], 0);
      expect(b - a).toBeLessThan(0.03);
      expect(a - b).toBeLessThan(0.05);
    }
    const damped = play('glockenspiel', 1, [
      { t: 0, ev: { type: 'noteOn', midi: 84, velocity: 110 } },
      { t: 0.3, ev: { type: 'noteOff', midi: 84 } },
    ], { human: 0, damp: 1 });
    expect(barGlow(at(damped, 0.28), 5)).toBeGreaterThan(0.5);
    expect(barGlow(at(damped, 0.55), 5)).toBe(0);
  });

  it('a soft stroke glows less than a hard one; the stage draws each bar at its share of the light', () => {
    const soft = play('glockenspiel', 0.1, [{ t: 0, ev: { type: 'noteOn', midi: 88, velocity: 40 } }], { human: 0 });
    const hard = play('glockenspiel', 0.1, [{ t: 0, ev: { type: 'noteOn', midi: 88, velocity: 120 } }], { human: 0 });
    const s = barGlow(at(soft, 0.05), 9);
    const h = barGlow(at(hard, 0.05), 9);
    expect(s).toBeGreaterThan(0.05);
    expect(s).toBeLessThan(h / 2);
    const gm = buildGlockModel();
    const b = new Batch();
    poseGlock(b, gm, at(hard, 0.05), 1 / 60, 0);
    expect(alphas(b, gm.bars[9])[0]).toBeCloseTo(-RING_MAX * h, 6);
    expect(alphas(b, gm.bars[8])[0]).toBe(0);
  });

  it('a timpano’s head lights on the stroke and dies with the drum; a roll keeps it up; a seat in the Orchestra glows as the drums alone do', () => {
    const one = play('timpani', 3, [{ t: 0, ev: { type: 'noteOn', midi: 48, velocity: 120 } }], { human: 0 });
    const k = one[2].timpani!.drums.findIndex((d) => d.level > 0);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(drumGlow(at(one, 0.05), k)).toBeGreaterThan(0.6);
    expect(drumGlow(at(one, 1), k)).toBeLessThan(drumGlow(at(one, 0.05), k) / 2);
    expect(drumGlow(at(one, 3), k)).toBe(0);
    // a roll held two seconds: lit all through its second half
    const roll = play('timpani', 2.6, [
      { t: 0, ev: { type: 'noteOn', midi: 43, velocity: 90 } },
      { t: 2, ev: { type: 'noteOff', midi: 43 } },
    ], { human: 0, roll: 0.6 });
    const rk = roll[2].timpani!.drums.findIndex((d) => d.level > 0);
    let low = 1;
    for (let s = 1; s <= 2; s += 0.05) low = Math.min(low, drumGlow(at(roll, s), rk));
    expect(low).toBeGreaterThan(0.25);
    expect(low).toBeGreaterThan(drumGlow(at(one, 1.5), k));
    // the stage: the head drawn at its share; the same frame posed in an orchestra's seat glows the same
    const tm = buildTimpaniModel();
    const fr = at(one, 0.1);
    const solo = newTimpaniPose();
    const seat = newTimpaniPose();
    const b1 = new Batch();
    const b2 = new Batch();
    poseTimpani(b1, tm, fr, solo, 1 / 60, 0);
    poseTimpani(b2, tm, fr, seat, 1 / 60, 0, null, false);
    expect(solo.shimmer[k]).toBeCloseTo(drumGlow(fr, k), 6);
    expect(seat.shimmer[k]).toBe(solo.shimmer[k]);
    const head = solo.heads[k].mesh;
    expect(alphas(b1, head)[0]).toBeCloseTo(-RING_MAX * solo.shimmer[k], 6);
    expect(alphas(b2, seat.heads[k].mesh)[0]).toBeCloseTo(-RING_MAX * solo.shimmer[k], 6);
    for (let j = 0; j < 4; j++) if (j !== k) expect(solo.shimmer[j]).toBe(0);
  });
});
