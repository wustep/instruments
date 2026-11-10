// The clarinet in 3D (clarinet3d.ts), without WebGL: built to the real instrument's measures (docs/
// 3d-reference.md, "Clarinet": within 3 %), a key or ring over every tone hole, posed from the engine's
// frames — its rings and keys follow the Boehm fingering for the note sounding (clarinet-fingering.ts) and
// go back to rest after it, the reed's tip closes onto the lay with its opening, the closed holes glow
// with the bore's standing wave — and seated in the Orchestra beside the oboe without moving anyone else.
import { describe, expect, it } from 'vitest';
import type { VisualFrame } from '@piano-model/engine';
import { Batch, type Mesh, xform } from '../src/ui/gl/gl3d.ts';
import { CLARINET_LEN, CLARINET_MEASURES as CM, CLARINET_RIM, buildClarinetModel, clarinetKeyState, poseClarinet, rOut, type ClarinetModel } from '../src/ui/gl/clarinet3d.ts';
import { newWindPose } from '../src/ui/gl/winds3d.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';

const cm: ClarinetModel = buildClarinetModel();
const all = (): Mesh[] => [...cm.statics, cm.bell, ...cm.keys.map((k) => k.mesh), ...cm.reed.map((r) => r.mesh)];
/** a mesh set's extent in the model's own frame (x along the clarinet from the mouthpiece's tip) */
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
/** concert pitch of a written note (the B♭ clarinet sounds a tone lower) */
const W = (written: number) => written - 2;

/** a frame of the engine playing `midi` (its standing wave a quarter sine, reed to open end) */
const frame = (midi: number | null, open = 1): VisualFrame =>
  ({
    focus: midi === null ? null : { midi, lengthM: 343 / (4 * 440 * 2 ** ((midi - 69) / 12)), f1: 440 * 2 ** ((midi - 69) / 12), shapes: [Float32Array.from({ length: 64 }, (_, i) => Math.cos((Math.PI / 2) * (i / 63)))] },
    breath: { pressure: midi === null ? 0 : 0.7, vib: 0 },
    reed: { open, gamma: 0.5 },
  }) as unknown as VisualFrame;
/** pose `n` frames of 1/60 s; the springs' state (1 open or pressed, 0 seated or at rest) by key name */
function play(fr: VisualFrame, n = 45, pose = newWindPose(), b = new Batch()): { st: Record<string, number>; pose: ReturnType<typeof newWindPose>; b: Batch } {
  for (let k = 0; k < n; k++) {
    b.clear();
    poseClarinet(b, cm, fr, pose, 1 / 60, k * 16.7, 0.05);
  }
  const s = clarinetKeyState(pose)!;
  return { st: Object.fromEntries(cm.keys.map((k, i) => [k.name, s[i]])), pose, b };
}
const down = (st: Record<string, number>, names: string[]) => names.forEach((k) => expect(st[k], `${k} down`).toBeGreaterThan(0.92));
const up = (st: Record<string, number>, names: string[]) => names.forEach((k) => expect(st[k], `${k} at rest`).toBeLessThan(0.08));
const RINGS = ['T', 'L1', 'L2', 'R1', 'R2', 'R3'];

describe('the clarinet in 3D', () => {
  it('is a B♭ clarinet’s size: 664 mm tip to bell, the joints’ lengths and diameters, a Ø 73.6 rim', () => {
    const b = box(all());
    expect(b.bad).toBe(0);
    near(b.hi[0] - b.lo[0], 0.664);
    near(CLARINET_LEN, 0.664);
    // the pieces (Yamaha's YCL-CSG III, its photograph at 8.71 px/mm; the 54 mm barrel is Yamaha's own)
    near(CM.mouthpiece, 67.9);
    near(CM.barrel[1] - CM.barrel[0], 54);
    near(CM.upper[1] - CM.upper[0], 196);
    near(CM.lower[1] - CM.lower[0], 234);
    near(CM.bell[1] - CM.bell[0], 112);
    // the outside: the barrel's swell, the joints, the bell under its ring and its rim
    near(2 * rOut((CM.barrel[0] + CM.barrel[1]) / 2 + 10), 31.6, 0.03);
    near(2 * rOut(200), 28.5, 0.02);
    near(2 * rOut(450), 28.7, 0.02);
    near(2 * rOut(565), 32.6, 0.03);
    const rim = box([cm.bell]);
    near(2 * Math.max(rim.hi[1], -rim.lo[1]), 0.0736);
    near(2 * CLARINET_RIM, 0.0736);
    // the mouthpiece Ø 27 at its shank, the reed 68 long and 13 wide at its tip, the ligature 24.5 wide
    const mp = box([cm.statics[0]]);
    expect(mp.hi[2]).toBeGreaterThan(0.0133);
    near(CM.reed.length, 68);
    near(CM.reed.tipWidth, 13);
    near(CM.ligature[1] - CM.ligature[0], 24.5);
    const reed = box(cm.reed.map((r) => r.mesh));
    near(reed.hi[2] - reed.lo[2], 0.013, 0.03);
  });

  it('has a ring, key or plain hole at each finger’s place, and the keywork of a Boehm clarinet', () => {
    const at = (name: string) => cm.holes.find((h) => h.name === name)!.x * 1000;
    // the six finger holes where the photograph has them (mm from the tip)
    for (const [name, mmFromTip] of [['L1', 245], ['L2', 278], ['L3', 300], ['R1', 357], ['R2', 382], ['R3', 404]] as const) near(at(name), mmFromTip, 0.03);
    for (const name of ['reg', 'A', 'gs', 'T', 'L1', 'rpad', 'L2', 'bridgeU', 'seb', 'csgs', 'bridge', 'R1', 'R2', 'R3', 'tE_L', 'tFs_L', 'tAb', 'tF_R', 'tE_R', 'gsd', 'fs', 'f', 'e'])
      expect(cm.keys.some((k) => k.name === name), name).toBe(true);
    expect(cm.keys.filter((k) => k.kind === 'ring').length).toBe(6);
    expect(cm.plain.length).toBe(1);
    for (const h of cm.holes) {
      expect(h.x).toBeGreaterThan(CM.barrel[1] / 1000);
      expect(h.x).toBeLessThan(CM.lower[1] / 1000);
    }
  });

  it('stands where the stage can frame it: above the floor, inside its bounds', () => {
    const r = cm.bounds.r;
    let lowY = Infinity;
    let far = 0;
    for (const m of all())
      for (let i = 0; i < m.count; i += 7) {
        const p = xform(cm.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]);
        lowY = Math.min(lowY, p[1]);
        far = Math.max(far, Math.hypot(p[0] - cm.bounds.c[0], p[1] - cm.bounds.c[1], p[2] - cm.bounds.c[2]));
      }
    expect(lowY).toBeGreaterThan(0.05);
    expect(far).toBeLessThan(r);
  });

  it('presses the rings and keys of the fingering for the note it plays, and lets them go after', () => {
    // written G3: the thumb and all six fingers; the bridge and the ring pad closed by the rings; the
    // low keys open, the vents shut
    let s = play(frame(W(55))).st;
    down(s, RINGS);
    up(s, ['bridge', 'rpad', 'reg', 'A', 'gs', 'seb', 'csgs', 'gsd', 'tE_L', 'tFs_L', 'tF_R', 'tE_R', 'tAb']);
    down(s, ['fs', 'f', 'e']);
    // written E3: the left little finger's E/B key closes the E pad, and through the clutches F and F♯
    s = play(frame(W(52))).st;
    down(s, ['tE_L']);
    up(s, ['e', 'f', 'fs']);
    // written F3: the right little finger's F/C key: F and F♯ closed, E open
    s = play(frame(W(53))).st;
    down(s, ['tF_R', 'e']);
    up(s, ['f', 'fs']);
    // written G♯3: the A♭/E♭ touch opens the G♯/D♯ key; C♯4: the left little finger's C♯/G♯ key
    down(play(frame(W(56))).st, ['tAb', 'gsd']);
    down(play(frame(W(61))).st, ['csgs']);
    // the throat: A4 the A key alone (every ring up), B♭4 with the register key, G♯4 the G♯ key
    s = play(frame(W(69))).st;
    down(s, ['A']);
    up(s, [...RINGS, 'reg']);
    down(play(frame(W(70))).st, ['A', 'reg']);
    down(play(frame(W(68))).st, ['gs']);
    // written E♭4: the thumb, the first two rings and the side E♭/B♭ key (the WFG's T 12-|4); the second
    // ring down seats the ring pad and the bridge
    s = play(frame(W(63))).st;
    down(s, ['T', 'L1', 'L2', 'seb']);
    up(s, ['R1', 'rpad', 'bridge']);
    // the clarion: B4 is E3 a twelfth up, with the register key
    down(play(frame(W(71))).st, ['reg', 'tE_L', 'T', 'R3']);
    // after the note: a moment's hold, then every ring and key where it rests
    const held = play(frame(W(55)));
    const after = play(frame(null), 90, held.pose).st;
    up(after, [...RINGS, 'reg', 'A', 'gs', 'seb', 'tE_L', 'tF_R', 'tAb', 'gsd']);
    down(after, ['fs', 'f', 'e', 'bridge', 'rpad']);
  });

  it('springs: a pad seats with a small bounce', () => {
    const pose = newWindPose();
    play(frame(null), 10, pose);
    const i = cm.keys.findIndex((k) => k.name === 'e');
    const path: number[] = [];
    const b = new Batch();
    for (let k = 0; k < 60; k++) {
      b.clear();
      poseClarinet(b, cm, frame(W(52)), pose, 1 / 240, k * 4.2, 0.05);
      path.push(clarinetKeyState(pose)![i]);
    }
    const first = path.findIndex((v) => v < 0.005);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(6);
    expect(Math.max(...path.slice(first))).toBeGreaterThan(0.002);
    expect(path[path.length - 1]).toBeLessThan(0.005);
  });

  it('the reed’s tip closes onto the lay with its opening; the closed holes glow with the standing wave; the bell shimmers', () => {
    // the reed's tip (its middle, on the table side) as posed, and how far it has moved towards the axis
    const tipMove = (b: Batch) => {
      const W4 = b.inst.get(cm.reed[0].mesh)!.a.subarray(0, 16);
      const p: [number, number, number] = [0.0005, -CM.table / 1000, 0];
      const now = xform(new Float32Array(W4), p);
      const rest = xform(cm.T, p);
      const ty = [cm.T[4], cm.T[5], cm.T[6]];
      return ((now[0] - rest[0]) * ty[0] + (now[1] - rest[1]) * ty[1] + (now[2] - rest[2]) * ty[2]) * 1000;
    };
    const rest = play(frame(W(55), 1), 30).b;
    const shut = play(frame(W(55), 0), 30).b;
    expect(Math.abs(tipMove(rest))).toBeLessThan(0.08);
    expect(tipMove(shut)).toBeGreaterThan(0.85 * CM.tipOpening);
    expect(tipMove(shut)).toBeLessThan(1.15 * CM.tipOpening);
    // a pressed ring's instance carries a glow while the clarinet sounds; the plain hole (L3) is shown
    // glowing under its finger; nothing glows at rest
    const glowOf = (b: Batch, m: Mesh) => b.inst.get(m)?.a[19] ?? 0;
    const ring = (name: string) => cm.keys.find((x) => x.name === name)!.mesh;
    expect(glowOf(rest, ring('L1'))).toBeGreaterThan(0.01);
    expect(glowOf(rest, cm.plain[0].mesh)).toBeGreaterThan(0.01);
    const quiet = play(frame(null), 90).b;
    expect(glowOf(quiet, ring('L1'))).toBe(0);
    expect(quiet.inst.get(cm.plain[0].mesh)?.n ?? 0).toBe(0);
    // the bell, loud
    const b = new Batch();
    poseClarinet(b, cm, frame(W(55)), newWindPose(), 1 / 60, 0, 0.2);
    expect(b.inst.get(cm.bell)!.a[19]).toBeGreaterThan(0.02);
  });

  it('takes its own seat in the Orchestra beside the oboe (the others’ seats as they were), and is framed whole there', () => {
    const parts = (ps: [('wind' | 'reed' | 'brass' | 'bowed'), ('oboe' | 'clarinet')?][]) => ps.map(([family, reed]) => ({ family, reed, kind: 'grand' as const, bowed: null }));
    const withIt = ensembleSeats(parts([['wind'], ['reed', 'oboe'], ['reed', 'clarinet'], ['brass']]));
    const without = ensembleSeats(parts([['wind'], ['reed', 'oboe'], ['wind'], ['brass']]));
    for (const i of [0, 1, 3]) expect(Array.from(withIt[i].T)).toEqual(Array.from(without[i].T));
    const seat = withIt[2];
    let hi = -Infinity;
    let lo = Infinity;
    for (const m of all())
      for (let i = 0; i < m.count; i += 11) {
        const p = xform(seat.T, xform(cm.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]));
        hi = Math.max(hi, p[1]);
        lo = Math.min(lo, p[1]);
      }
    expect(hi).toBeLessThan(seat.top);
    expect(lo).toBeGreaterThan(0.5);
  });
});
