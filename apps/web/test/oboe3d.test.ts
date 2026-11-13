// The oboe in 3D (oboe3d.ts), without WebGL: built to the real instrument's measures (docs/
// 3d-reference.md, "Oboe": within 3 %), every key over its tone hole, posed from the engine's frames —
// its keys follow the conservatoire fingering for the note sounding (oboe-fingering.ts) and go back to
// rest after it, the reed's blades close with its opening, nothing on it is lit or tinted while it
// sounds (keys, pads, tone holes, the bell's rim) — and seated in the Orchestra beside the flute without
// moving anyone else.
import { describe, expect, it } from 'vitest';
import type { VisualFrame } from '@piano-model/engine';
import { Batch, type Mesh, xform } from '../src/ui/gl/gl3d.ts';
import { OBOE_LEN, OBOE_RIM, buildOboeModel, oboeKeyState, poseOboe, rOut, type OboeModel } from '../src/ui/gl/oboe3d.ts';
import { newWindPose } from '../src/ui/gl/winds3d.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';

const om: OboeModel = buildOboeModel();
const all = (): Mesh[] => [...om.statics, om.rim, ...om.keys.map((k) => k.mesh), ...om.blades.map((b) => b.mesh)];
/** a mesh set's extent in the model's own frame (x along the oboe from the reed's tip) */
function box(ms: Mesh[]): { lo: number[]; hi: number[]; bad: number } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let bad = 0;
  for (const m of ms)
    for (let i = 0; i < m.count; i++)
      for (let k = 0; k < 3; k++) {
        const v = m.data[i * 14 + k];
        if (!Number.isFinite(v)) bad++;
        lo[k] = Math.min(lo[k], v);
        hi[k] = Math.max(hi[k], v);
      }
  return { lo, hi, bad };
}
const near = (v: number, want: number, tol = 0.03) => expect(Math.abs(v / want - 1), `${v} vs ${want}`).toBeLessThan(tol);

/** a frame of the engine playing `midi` (its standing wave a quarter sine, reed to open end) */
const frame = (midi: number | null, open = 1): VisualFrame =>
  ({
    focus: midi === null ? null : { midi, lengthM: 343 / (2 * 440 * 2 ** ((midi - 69) / 12)), f1: 440 * 2 ** ((midi - 69) / 12), shapes: [Float32Array.from({ length: 64 }, (_, i) => Math.cos((Math.PI / 2) * (i / 63)))] },
    breath: { pressure: midi === null ? 0 : 0.7, vib: 0 },
    reed: { open, gamma: 0.5 },
  }) as unknown as VisualFrame;
/** pose `n` frames of 1/60 s; the springs' state (1 open or pressed, 0 seated or at rest) by key name */
function play(fr: VisualFrame, n = 45, pose = newWindPose(), b = new Batch()): { st: Record<string, number>; pose: ReturnType<typeof newWindPose>; b: Batch } {
  for (let k = 0; k < n; k++) {
    b.clear();
    poseOboe(b, om, fr, pose, 1 / 60, k * 16.7, 0.05);
  }
  const s = oboeKeyState(pose)!;
  return { st: Object.fromEntries(om.keys.map((k, i) => [k.name, s[i]])), pose, b };
}

describe('the oboe in 3D', () => {
  it('is an oboe’s size: 653.5 mm reed tip to bell rim (600 of body, 53.5 of reed), a Ø 50 rim, the joints’ diameters', () => {
    const b = box(all());
    expect(b.bad).toBe(0);
    near(b.hi[0] - b.lo[0], 0.6535);
    near(OBOE_LEN, 0.65, 0.03);
    // the rim, and the body's outside down its length (Yamaha's photograph, docs/3d-reference.md)
    const rim = box([om.rim]);
    near(2 * Math.max(rim.hi[1], -rim.lo[1]), 0.05);
    near(2 * OBOE_RIM, 0.05);
    near(2 * rOut(13.5), 23.7);
    near(2 * rOut(30), 20.1, 0.02);
    near(2 * rOut(230), 23.1, 0.02);
    near(2 * rOut(300), 27.4, 0.02);
    near(2 * rOut(470), 28.0, 0.02);
    near(2 * rOut(560), 36.2, 0.03);
    // the reed: 53.5 mm out of the top joint, its tip 6.9 mm wide
    const reed = box(om.blades.map((bl) => bl.mesh));
    near(reed.hi[2] - reed.lo[2], 0.0069, 0.03);
  });

  it('has a cup over every tone hole, and the keywork of a conservatoire oboe', () => {
    expect(om.holes.length).toBeGreaterThanOrEqual(22);
    for (const name of ['oct1', 'oct2', 'thumb', 'L1', 'half', 'L2', 'L3', 'gs', 'R1', 'R2', 'R3', 'tF', 'eb', 'fres', 'cs', 'c', 'b', 'bb', 'tGS', 'tEB', 'tB', 'tBB', 'tC', 'tCS', 'tEB2'])
      expect(om.keys.some((k) => k.name === name), name).toBe(true);
    // the holes run down the body in order of the notes: none above the top joint, none past the rim
    for (const h of om.holes) {
      expect(h.x).toBeGreaterThan(0.06);
      expect(h.x).toBeLessThan(OBOE_LEN - 0.07);
    }
  });

  it('stands where the stage can frame it: above the floor, inside its bounds', () => {
    const r = om.bounds.r;
    let lowY = Infinity;
    let far = 0;
    for (const m of all())
      for (let i = 0; i < m.count; i += 7) {
        const p = xform(om.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]);
        lowY = Math.min(lowY, p[1]);
        far = Math.max(far, Math.hypot(p[0] - om.bounds.c[0], p[1] - om.bounds.c[1], p[2] - om.bounds.c[2]));
      }
    expect(lowY).toBeGreaterThan(0.05);
    expect(far).toBeLessThan(r);
  });

  it('closes the keys of the fingering for the note it plays, and opens them again after', () => {
    // D4: all six fingers down; the low keys open; nothing else pressed
    let s = play(frame(62)).st;
    for (const k of ['L1', 'L2', 'L3', 'R1', 'R2', 'R3']) expect(s[k], k).toBeLessThan(0.08);
    for (const k of ['cs', 'c', 'b', 'bb']) expect(s[k], k).toBeGreaterThan(0.92);
    for (const k of ['oct1', 'oct2', 'gs', 'eb', 'fres', 'tC', 'tGS', 'thumb']) expect(s[k], k).toBeLessThan(0.08);
    // C4: the C key (with its clutch, the C♯ key) closed by the right little finger
    s = play(frame(60)).st;
    expect(s.c).toBeLessThan(0.08);
    expect(s.cs).toBeLessThan(0.08);
    expect(s.tC).toBeGreaterThan(0.92);
    // B♭3: the bell's B and B♭ keys closed too, from the left little finger's touch
    s = play(frame(58)).st;
    for (const k of ['b', 'bb', 'c', 'cs']) expect(s[k], k).toBeLessThan(0.08);
    expect(s.tBB).toBeGreaterThan(0.92);
    // A4: L1 and L2; L3 and the right hand open
    s = play(frame(69)).st;
    expect(s.L1).toBeLessThan(0.08);
    expect(s.L2).toBeLessThan(0.08);
    for (const k of ['L3', 'R1', 'R2', 'R3']) expect(s[k], k).toBeGreaterThan(0.92);
    // E♭4 opens the E♭ key; G♯4 the G♯ key; F4 the F resonance key, its touch pressed
    expect(play(frame(63)).st.eb).toBeGreaterThan(0.92);
    expect(play(frame(68)).st.gs).toBeGreaterThan(0.92);
    s = play(frame(65)).st;
    expect(s.fres).toBeGreaterThan(0.92);
    expect(s.tF).toBeGreaterThan(0.92);
    // the octave keys: the thumb's for E5 (its plate pressed), the side key for A5; D5 half-holed
    s = play(frame(76)).st;
    expect(s.oct1).toBeGreaterThan(0.92);
    expect(s.thumb).toBeGreaterThan(0.92);
    expect(play(frame(81)).st.oct2).toBeGreaterThan(0.92);
    s = play(frame(74)).st;
    expect(s.L1).toBeLessThan(0.08);
    expect(s.half).toBeGreaterThan(0.92);
    // after the note: a moment's hold, then every key back where it rests
    const held = play(frame(62));
    const after = play(frame(null), 90, held.pose).st;
    for (const k of ['L1', 'L2', 'L3', 'R1', 'R2', 'R3', 'cs', 'c', 'b', 'bb']) expect(after[k], k).toBeGreaterThan(0.92);
    for (const k of ['oct1', 'oct2', 'gs', 'eb', 'thumb', 'tC']) expect(after[k], k).toBeLessThan(0.08);
  });

  it('springs: a pad seats with a small bounce, an opening key overshoots a little off its stop', () => {
    const pose = newWindPose();
    play(frame(null), 10, pose);
    const i = om.keys.findIndex((k) => k.name === 'L2');
    const path: number[] = [];
    const b = new Batch();
    // (at a 240 Hz display: the pad's whole flight takes a few frames)
    for (let k = 0; k < 60; k++) {
      b.clear();
      poseOboe(b, om, frame(62), pose, 1 / 240, k * 4.2, 0.05);
      path.push(oboeKeyState(pose)![i]);
    }
    // it reaches the hole within ~15 ms and comes off it again before settling (a bounce)
    const first = path.findIndex((v) => v < 0.005);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(5);
    expect(Math.max(...path.slice(first))).toBeGreaterThan(0.002);
    expect(path[path.length - 1]).toBeLessThan(0.005);
  });

  it('the reed’s blades close with its opening; the rim is not lit, loud or soft', () => {
    // the middle of each blade's tip, as posed (world)
    const tip = (b: Batch, s: number) => {
      const bl = om.blades.find((x) => x.s === s)!;
      return xform(new Float32Array(b.inst.get(bl.mesh)!.a.subarray(0, 16)), [0, s * 0.0006, 0]);
    };
    const rest = play(frame(62, 1), 30).b;
    const shut = play(frame(62, 0), 30).b;
    const gap = (b: Batch) => {
      const u = tip(b, 1);
      const d = tip(b, -1);
      return Math.hypot(u[0] - d[0], u[1] - d[1], u[2] - d[2]);
    };
    expect(gap(shut)).toBeLessThan(gap(rest) - 0.0005);
    // the rim, loud: drawn as it is (no glow: rgb and amount all 0)
    const b = new Batch();
    poseOboe(b, om, frame(62), newWindPose(), 1 / 60, 0, 0.2);
    expect(Array.from(b.inst.get(om.rim)!.a.subarray(16, 20))).toEqual([0, 0, 0, 0]);
  });

  it('no key, pad, tone hole or bell is lit or tinted while it sounds: plain silver, cork, leather and wood', () => {
    // what a batch draws with a light on it (an instance's glow: rgb and amount, any of them not 0), by name
    const name = (m: Mesh) => (m === om.rim ? 'rim' : om.statics.includes(m) ? 'body' : (om.keys.find((k) => k.mesh === m)?.name ?? 'blade'));
    const lit = (b: Batch) =>
      b.meshes().filter((m) => {
        const { a, n } = b.inst.get(m)!;
        for (let o = 0; o < n; o += 20) if (a[o + 16] !== 0 || a[o + 17] !== 0 || a[o + 18] !== 0 || a[o + 19] !== 0) return true;
        return false;
      }).map(name);
    // loud, the breath's vibrato on its upswing, pressure all along the bore: D4 (all six fingers down),
    // B♭3 (the bell's keys closed too), E5 (the thumb's octave key), A4 (L1 and L2 alone)
    for (const midi of [62, 58, 76, 69]) {
      const fr = frame(midi);
      (fr.breath as { vib: number }).vib = 0.1;
      const pose = newWindPose();
      const b = new Batch();
      for (let k = 0; k < 45; k++) {
        b.clear();
        poseOboe(b, om, fr, pose, 1 / 60, k * 16.7, 0.2);
      }
      // the keys are drawn, each once, the closed ones seated on their holes
      const st = oboeKeyState(pose)!;
      for (const k of om.keys) expect(b.inst.get(k.mesh)!.n, k.name).toBe(20);
      expect(om.keys.filter((k, i) => k.kind === 'cup' && st[i] < 0.08).length, `${midi}: seated pads`).toBeGreaterThan(midi === 69 ? 3 : 8);
      // and nothing is lit, the bell's rim included
      expect(lit(b), `${midi}`).toEqual([]);
    }
    // silent, nothing is
    const quiet = new Batch();
    poseOboe(quiet, om, frame(null), newWindPose(), 1 / 60, 0, 0);
    expect(lit(quiet)).toEqual([]);
  });

  it('takes a seat in the Orchestra beside the flute (the others’ seats as they were), and is framed whole there', () => {
    const parts = (fams: ('wind' | 'reed' | 'brass' | 'bowed')[]) => fams.map((family) => ({ family, kind: 'grand' as const, bowed: null }));
    const withOboe = ensembleSeats(parts(['wind', 'reed', 'brass']));
    const without = ensembleSeats(parts(['wind', 'wind', 'brass']));
    // the flute and the trumpet seated as before (their transforms depend only on their own places)
    expect(Array.from(withOboe[0].T)).toEqual(Array.from(without[0].T));
    expect(Array.from(withOboe[2].T)).toEqual(Array.from(without[2].T));
    // the oboe: its highest point (the reed's tip) under its seat's framing top, its lowest above the floor
    const seat = withOboe[1];
    let hi = -Infinity;
    let lo = Infinity;
    for (const m of all())
      for (let i = 0; i < m.count; i += 11) {
        const p = xform(seat.T, xform(om.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]));
        hi = Math.max(hi, p[1]);
        lo = Math.min(lo, p[1]);
      }
    expect(hi).toBeLessThan(seat.top);
    expect(lo).toBeGreaterThan(0.5);
  });
});
