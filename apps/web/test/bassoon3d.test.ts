// The bassoon in 3D (bassoon3d.ts), without WebGL: built to the real instrument's measures (docs/
// 3d-reference.md, "Bassoon": within 3 %), its keywork in place, posed from the engine's frames — its keys
// and rings follow the Heckel fingering for the note sounding (bassoon-fingering.ts) and go back to rest
// after it, on springs; the reed's blades close with its opening; no key, ring, pad or tone hole, nor
// the bell, is lit or tinted while it sounds — and seated in the Orchestra without moving anyone
// else.
import { describe, expect, it } from 'vitest';
import type { VisualFrame } from '@piano-model/engine';
import { Batch, type Mesh, xform } from '../src/ui/gl/gl3d.ts';
import { BASSOON_MEASURES as BM, BASSOON_SEAT, REED_TIP, bassoonKeyState, boreAt, buildBassoonModel, poseBassoon, type BassoonModel } from '../src/ui/gl/bassoon3d.ts';
import { newWindPose } from '../src/ui/gl/winds3d.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';

const bm: BassoonModel = buildBassoonModel();
const all = (): Mesh[] => [...bm.statics, bm.bell, ...bm.keys.map((k) => k.mesh), ...bm.blades.map((b) => b.mesh)];
/** a mesh set's extent in the model's own frame (y up from the boot's foot) */
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
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** a frame of the engine playing `midi` (a conical bore's half wave, reed to open end) */
const frame = (midi: number | null, open = 1): VisualFrame =>
  ({
    focus: midi === null ? null : { midi, lengthM: 343 / (2 * hz(midi)), f1: hz(midi), shapes: [Float32Array.from({ length: 64 }, (_, i) => Math.cos(Math.PI * (i / 63)))] },
    breath: { pressure: midi === null ? 0 : 0.7, vib: 0 },
    reed: { open, gamma: 0.5 },
  }) as unknown as VisualFrame;
/** pose `n` frames of 1/60 s; the springs' state (1 open or pressed, 0 seated or at rest) by key name */
function play(fr: VisualFrame, n = 45, pose = newWindPose(), b = new Batch()): { st: Record<string, number>; pose: ReturnType<typeof newWindPose>; b: Batch } {
  for (let k = 0; k < n; k++) {
    b.clear();
    poseBassoon(b, bm, fr, pose, 1 / 60, k * 16.7, 0.05);
  }
  const s = bassoonKeyState(pose)!;
  return { st: Object.fromEntries(bm.keys.map((k, i) => [k.name, s[i]])), pose, b };
}
const hi1 = (st: Record<string, number>, names: string[]) => names.forEach((k) => expect(st[k], `${k} open / pressed`).toBeGreaterThan(0.92));
const lo0 = (st: Record<string, number>, names: string[]) => names.forEach((k) => expect(st[k], `${k} seated / at rest`).toBeLessThan(0.08));

describe('the bassoon in 3D', () => {
  it('is a bassoon’s size: 1340 mm tall, its joints’ lengths and diameters, the bocal’s curve, the reed', () => {
    const b = box(all());
    expect(b.bad).toBe(0);
    // the boot's foot to the bell's rim (Wikipedia 1.34 m; NMM Heckel-system maple bassoons 1334–1343)
    near(b.hi[1] - b.lo[1], 1.34);
    near(BM.height, 1340);
    // out of the boot: the wing joint 486 to its cap's top, the long joint 580 to the bell, the bell 307
    // over the long joint's 34 mm ring (Fox photograph; NMM: wing 480–484, long 568–580); the boot 419
    near(BM.wing[1] - BM.wing[0], 486);
    near(BM.long[1] - BM.long[0], 580);
    near(BM.bell[1] - BM.bell[0], 307);
    near(BM.boot[1] - BM.boot[0], 419);
    near(BM.bootCap, 57);
    // the outside: the long joint Ø 43, the wing's tube Ø 28.5, the bell's swell and neck and rim, the boot
    // 71 across under its ring
    near(BM.longD, 43);
    near(BM.wingD, 28.5);
    near(BM.bellSwellD, 52.5);
    near(BM.bellNeckD, 44.6);
    near(BM.rimD, 55);
    near(BM.bootW(419), 71.2);
    const bell = box([bm.bell]);
    near(bell.hi[2] - bell.lo[2], 0.0548);
    // the bocal: rises 57 over the wing's cap, reaches 206 sideways to the reed; Ø 10 → 5.2
    near(BM.bocalRise, 57.4);
    near(BM.bocalReach, 206);
    near(BM.bocalD[0], 10);
    near(BM.bocalD[1], 5.2);
    // the reed: 55 long (Wikipedia: "around 5.5 cm"), its blades 28 (27–30), 14.8 wide at the tip
    near(BM.reed.length, 55);
    near(BM.reed.blade, 28);
    near(BM.reed.tipWidth, 14.8);
    const reed = box(bm.blades.map((x) => x.mesh));
    expect(Math.max(reed.hi[1] - reed.lo[1], reed.hi[0] - reed.lo[0])).toBeGreaterThan(0.0145);
  });

  it('has its finger holes where the photograph has them and the keywork of a Heckel-system bassoon', () => {
    const at = (name: string) => bm.holes.find((h) => h.name === name)!.y;
    for (const [name, y] of Object.entries(BM.holes)) near(at(name), y, 0.01);
    for (const name of ['W', 'pCsT', 'tCsT', 'FA', 'FB', 'FD', 'tLD', 'tLC', 'tLB', 'tLBB', 'pD', 'pC', 'pB', 'pBb', 'tEb', 'pEb', 'L3', 'tLEb', 'pLEb', 'tLCs', 'pLCs', 'R2', 'tG', 'pG', 'tF', 'pF', 'tFsP', 'pFs', 'tGsP', 'pGs', 'E', 'Bb', 'tFsR', 'tGsR'])
      expect(bm.keys.some((k) => k.name === name), name).toBe(true);
    expect(bm.keys.filter((k) => k.kind === 'ring').length).toBe(2);
    // L1, L2 and R1 are plain holes: on the list of holes, no ring or key over them
    for (const name of ['L1', 'L2', 'R1']) expect(bm.keys.some((k) => k.name === name), name).toBe(false);
    // the bore folds: down the wing (deeper further down), up the long joint (deeper further up), and the
    // long joint is further along than the whole wing
    expect(boreAt('wing', 560)).toBeGreaterThan(boreAt('wing', 640));
    expect(boreAt('long', 900)).toBeGreaterThan(boreAt('long', 600));
    expect(boreAt('long', 450)).toBeGreaterThan(boreAt('wing', 450));
    near(boreAt('long', 1340), 2.54, 0.04);
  });

  it('stands where the stage can frame it, upright or leaned: above the floor, inside its bounds', () => {
    for (const [T, bd] of [[bm.T, bm.bounds], [bm.Tw, bm.boundsW]] as const) {
      let lowY = Infinity;
      let far = 0;
      for (const m of all())
        for (let i = 0; i < m.count; i += 7) {
          const p = xform(T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]);
          lowY = Math.min(lowY, p[1]);
          far = Math.max(far, Math.hypot(p[0] - bd.c[0], p[1] - bd.c[1], p[2] - bd.c[2]));
        }
      expect(lowY).toBeGreaterThan(0.03);
      expect(far).toBeLessThan(bd.r);
    }
  });

  it('presses the keys and rings of the fingering for the note it plays, and lets them go after', () => {
    const LOW = ['tLBB', 'tLB', 'tLC', 'tLD'];
    const PADS = ['pD', 'pC', 'pB', 'pBb'];
    // B♭1: every hole and key closed: the left thumb's four keys, the right thumb's E, the F key
    let s = play(frame(34)).st;
    hi1(s, [...LOW, 'L3', 'R2', 'tG', 'tF']);
    lo0(s, [...PADS, 'E', 'pG', 'pF']);
    hi1(s, ['W']);
    // F2: the whisper key closes the bocal's nipple; the low pads and the E plate stand open
    s = play(frame(41)).st;
    lo0(s, ['W', 'pF', ...LOW]);
    hi1(s, [...PADS, 'E', 'L3', 'R2', 'tF']);
    // D2: the low D key alone of the four: its pad shut, C, B and B♭ open
    s = play(frame(38)).st;
    hi1(s, ['tLD', 'pC', 'pB', 'pBb']);
    lo0(s, ['pD', 'tLC']);
    // the little fingers' and thumbs' vents: G♯2 (right little finger), F♯2 (right thumb), B♭2 (right
    // thumb), E♭2 and C♯2 (left little finger), C♯3 (the left thumb's C♯ key)
    hi1(play(frame(44)).st, ['tGsP', 'pGs']);
    hi1(play(frame(42)).st, ['tFsR', 'pFs']);
    hi1(play(frame(46)).st, ['Bb']);
    hi1(play(frame(39)).st, ['tLEb', 'pLEb']);
    hi1(play(frame(37)).st, ['tLCs', 'pLCs']);
    hi1(play(frame(49)).st, ['tCsT', 'pCsT', 'tLD']);
    // the third octave's flick keys (A4: A; B4: C; C♯5: D and C) and E♭5's E♭ key
    s = play(frame(69)).st;
    hi1(s, ['FA']);
    lo0(s, ['FB', 'FD']);
    hi1(play(frame(71)).st, ['FB']);
    hi1(play(frame(73)).st, ['FD', 'FB']);
    hi1(play(frame(75)).st, ['tEb', 'pEb']);
    // after the note: a moment's hold, then every key where it rests
    const held = play(frame(34));
    const after = play(frame(null), 90, held.pose).st;
    lo0(after, [...LOW, 'L3', 'R2', 'tG', 'tF', 'FA', 'FB', 'FD', 'Bb', 'pGs', 'pFs', 'tEb', 'pEb']);
    hi1(after, [...PADS, 'E', 'W', 'pG', 'pF']);
  });

  it('springs: a pad seats with a small bounce', () => {
    const pose = newWindPose();
    play(frame(null), 10, pose);
    const i = bm.keys.findIndex((k) => k.name === 'E');
    const path: number[] = [];
    const b = new Batch();
    for (let k = 0; k < 60; k++) {
      b.clear();
      poseBassoon(b, bm, frame(40), pose, 1 / 240, k * 4.2, 0.05);
      path.push(bassoonKeyState(pose)![i]);
    }
    const first = path.findIndex((v) => v < 0.005);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(8);
    expect(Math.max(...path.slice(first))).toBeGreaterThan(0.002);
    expect(path[path.length - 1]).toBeLessThan(0.005);
  });

  it('the reed’s blades close with its opening; the bell is not lit, loud or soft', () => {
    // the upper blade's tip (its middle, on its inner face) as posed: how far it has moved towards the
    // other blade (mm, along the reed frame's z)
    const tipMove = (b: Batch) => {
      const i = bm.blades.findIndex((x) => x.s === 1);
      const W4 = new Float32Array(b.inst.get(bm.blades[i].mesh)!.a.subarray(0, 16));
      const F = bm.reedF;
      const p = xform(F, [REED_TIP.length / 1000, 0, REED_TIP.halfOpen / 1000]);
      const now = xform(W4, p);
      const rest = xform(bm.T, p);
      const z = [F[8], F[9], F[10]];
      const Tz = xform(bm.T, z);
      const T0 = xform(bm.T, [0, 0, 0]);
      const dz = [Tz[0] - T0[0], Tz[1] - T0[1], Tz[2] - T0[2]];
      return -((now[0] - rest[0]) * dz[0] + (now[1] - rest[1]) * dz[1] + (now[2] - rest[2]) * dz[2]) * 1000;
    };
    const rest = play(frame(41, 1), 30).b;
    const shut = play(frame(41, 0), 30).b;
    expect(Math.abs(tipMove(rest))).toBeLessThan(0.06);
    expect(tipMove(shut)).toBeGreaterThan(0.85 * REED_TIP.halfOpen);
    expect(tipMove(shut)).toBeLessThan(1.15 * REED_TIP.halfOpen);
    // the bell, loud: drawn as it is (no glow: rgb and amount all 0)
    const b = new Batch();
    poseBassoon(b, bm, frame(41), newWindPose(), 1 / 60, 0, 0.2);
    expect(Array.from(b.inst.get(bm.bell)!.a.subarray(16, 20))).toEqual([0, 0, 0, 0]);
  });

  it('no key, ring, pad, tone hole or bell is lit or tinted while it sounds: plain silver, leather and wood', () => {
    // what a batch draws with a light on it (an instance's glow: rgb and amount, any of them not 0), by name
    const name = (m: Mesh) => (m === bm.bell ? 'bell' : bm.statics.includes(m) ? 'body' : (bm.keys.find((k) => k.mesh === m)?.name ?? 'blade'));
    const lit = (b: Batch) =>
      b.meshes().filter((m) => {
        const { a, n } = b.inst.get(m)!;
        for (let o = 0; o < n; o += 20) if (a[o + 16] !== 0 || a[o + 17] !== 0 || a[o + 18] !== 0 || a[o + 19] !== 0) return true;
        return false;
      }).map(name);
    // loud, the breath's vibrato on its upswing, pressure all along the bore: F2 (both hands down, both
    // rings pressed), B♭1 (every hole and key closed), C♯3 (the left thumb's C♯ key), A4 (a flick key)
    for (const midi of [41, 34, 49, 69]) {
      const fr = frame(midi);
      (fr.breath as { vib: number }).vib = 0.1;
      const pose = newWindPose();
      const b = new Batch();
      for (let k = 0; k < 45; k++) {
        b.clear();
        poseBassoon(b, bm, fr, pose, 1 / 60, k * 16.7, 0.2);
      }
      // the keys and rings are drawn, each once, the closed pads seated on their holes
      const st = bassoonKeyState(pose)!;
      for (const k of bm.keys) expect(b.inst.get(k.mesh)!.n, k.name).toBe(20);
      if (midi === 41 || midi === 34) expect(bm.keys.filter((k, i) => k.kind === 'ring' && st[i] > 0.92).length, `${midi}: rings down`).toBe(2);
      expect(bm.keys.filter((k, i) => k.kind === 'cup' && st[i] < 0.08).length, `${midi}: seated pads`).toBeGreaterThan(3);
      // nothing else is drawn (no disc in a covered hole), and nothing is lit, the bell included
      expect(b.meshes().length, `${midi}`).toBe(bm.statics.length + 1 + bm.keys.length + bm.blades.length);
      expect(lit(b), `${midi}`).toEqual([]);
    }
    // silent, nothing is
    const quiet = new Batch();
    poseBassoon(quiet, bm, frame(null), newWindPose(), 1 / 60, 0, 0);
    expect(lit(quiet)).toEqual([]);
  });

  it('takes its own seat among a few players, held diagonally (the others’ seats as they were), framed whole there', () => {
    const parts = (ps: [('wind' | 'reed' | 'brass' | 'bowed'), ('oboe' | 'clarinet' | 'bassoon')?][]) => ps.map(([family, reed]) => ({ family, reed, kind: 'grand' as const, bowed: null }));
    // (four players sit on one arc in the lineup's order; five or more as an orchestra: seats.test.ts)
    const withIt = ensembleSeats(parts([['reed', 'oboe'], ['reed', 'clarinet'], ['reed', 'bassoon'], ['brass']]));
    const without = ensembleSeats(parts([['reed', 'oboe'], ['reed', 'clarinet'], ['wind'], ['brass']]));
    for (const i of [0, 1, 3]) expect(Array.from(withIt[i].T)).toEqual(Array.from(without[i].T));
    const seat = withIt[2];
    expect(seat.top).toBe(BASSOON_SEAT.top);
    let hi = -Infinity;
    let lo = Infinity;
    let foot: number[] = [];
    let rim: number[] = [];
    for (const m of all())
      for (let i = 0; i < m.count; i += 11) {
        const p = xform(seat.T, xform(bm.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]));
        if (p[1] > hi) [hi, rim] = [p[1], p];
        if (p[1] < lo) [lo, foot] = [p[1], p];
      }
    expect(hi).toBeLessThan(seat.top);
    expect(hi).toBeGreaterThan(1.3);
    expect(lo).toBeGreaterThan(0.15);
    // held diagonally: the bell's rim well to one side of the boot's foot (30° or so off upright)
    const lean = Math.atan2(Math.hypot(rim[0] - foot[0], rim[2] - foot[2]), rim[1] - foot[1]);
    expect(lean).toBeGreaterThan(0.35);
    expect(lean).toBeLessThan(0.75);
  });
});
