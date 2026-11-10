// The trombone in 3D (trombone3d.ts), without WebGL: built in each of the engine's sizes to its measures
// (TROMBONE_SIZES: the bore, the bell, the open tube, the slide's travel; docs/3d-reference.md, "Trombone": the
// Yamaha photographs' overall lengths and rim-to-crook distances), each valve's loop the tubing its valve adds,
// inside its budget; posed from the engine's frames — the outer slide stands out by the frame's `slide` (and
// runs on towards its target at the engine's speed between frames), the valves of the chart go down (the
// alto has none, the tenor one, the bass two) and their links turn the rotors a quarter turn; a frame without
// the field is read from its note — and seated in the Orchestra, held as a seated player holds it, clear of its
// neighbours.
import { describe, expect, it } from 'vitest';
import { TROMBONE_SIZES, tromboneFingering, tromboneSlideOut, type TromboneSize, type VisualFrame } from '@piano-model/engine';
import { Batch, type Mesh, xform } from '../src/ui/gl/gl3d.ts';
import { TROMBONE_SEAT, buildTromboneModel, poseTrombone, tromboneLeverState, tromboneOf, tromboneRotorTurn, tromboneSizeIn, tromboneSlideState, type TromboneModel } from '../src/ui/gl/trombone3d.ts';
import { newWindPose } from '../src/ui/gl/winds3d.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';

const SIZES: TromboneSize[] = ['alto', 'tenor', 'bass'];
const built: Record<string, { tm: TromboneModel; ms: number }> = {};
for (const s of SIZES) {
  const t0 = performance.now();
  const tm = buildTromboneModel(s);
  built[s] = { tm, ms: performance.now() - t0 };
}
const tenor = built.tenor.tm;
const all = (tm: TromboneModel): Mesh[] => [...tm.slideStatics, tm.outer, ...tm.bellStatics, tm.rim, ...tm.valves.flatMap((v) => [v.rotor, v.lever, v.link])];
const near = (v: number, want: number, tol = 0.03) => expect(Math.abs(v / want - 1), `${v} vs ${want}`).toBeLessThan(tol);
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** a frame of the engine playing `midi` on a size (its chart's slide and valves), the slide at `slide` (m) */
const frame = (size: TromboneSize, midi: number | null, slide?: number, blow = 0.6): VisualFrame => {
  if (midi === null) return { focus: null, lips: { open: 0, blow: 0 } } as unknown as VisualFrame;
  const fg = tromboneFingering(midi, size);
  const out = tromboneSlideOut(fg, size);
  return {
    focus: { midi, lengthM: 2.74, f1: hz(midi), shapes: [new Float32Array(160)] },
    lips: { open: 0.6, blow },
    trombone: { size, slide: slide ?? out, target: out, position: fg.position, valves: fg.valves, side: fg.side, partial: fg.partial },
  } as unknown as VisualFrame;
};
/** pose `n` frames of 1/60 s (each a new frame object, as the worklet sends them) */
function play(tm: TromboneModel, mk: () => VisualFrame, n = 45, pose = newWindPose(), b = new Batch(), rms = 0.05, T?: Float32Array): { pose: ReturnType<typeof newWindPose>; b: Batch } {
  // (an ensemble's seat, kept across the frames: clear() lets it go)
  const world = b.world;
  for (let k = 0; k < n; k++) {
    b.clear();
    b.world = world;
    poseTrombone(b, tm, mk(), pose, 1 / 60, k * 16.7, rms, T);
  }
  return { pose, b };
}

describe('the trombone in 3D', () => {
  it('is built to each size’s measures: bore, bell, open tube, travel; the photographs’ lengths', () => {
    // (Yamaha's photographs scaled by their bells: overall with the slide closed, the bell's rim to the crook's end)
    const photo: Record<TromboneSize, { overall: number; rimToCrook: number }> = { alto: { overall: 854, rimToCrook: 392 }, tenor: { overall: 1175, rimToCrook: 513 }, bass: { overall: 1150, rimToCrook: 506 } };
    for (const s of SIZES) {
      const { tm } = built[s];
      const B = TROMBONE_SIZES[s];
      let bad = 0;
      for (const m of all(tm)) for (let i = 0; i < m.count * 14; i++) if (!Number.isFinite(m.data[i])) bad++;
      expect(bad, s).toBe(0);
      const M = tm.measures;
      // the bell's rim: the rim mesh's farthest point from the bell's axis (its frame: the axis along x at v = vb)
      const vb = tm.dims.L.vb / 1000;
      let rim = 0;
      for (let i = 0; i < tm.rim.count; i++) rim = Math.max(rim, Math.hypot(tm.rim.data[i * 14 + 1] - vb, tm.rim.data[i * 14 + 2]));
      near(2 * rim, B.bell, 0.01);
      near(M.open / 1000, B.length, 0.005);
      near(tm.travel, B.travel, 0.001);
      // the slide's tubes: the inner a hair over the bore, the outer over the inner
      expect(M.innerOD).toBeGreaterThan(B.bore * 1000);
      expect(M.outerOD).toBeGreaterThan(M.innerOD);
      near(M.outerOD, B.bore * 1000 + 1.5, 0.02);
      // each valve's loop: the tubing it adds (2.74 m × (2^(k/12) − 1); the bass's D valve less the F side's)
      M.loops.forEach((l, i) => near(l, M.loopWant[i], 0.01));
      near(M.overall, photo[s].overall, 0.035);
      near(M.rimToCrook, photo[s].rimToCrook, 0.03);
    }
    // the tenor's F loop is 0.92 m, its slide's tubes 82 mm apart (a replacement crook's published 85)
    near(tenor.measures.loops[0], 917, 0.01);
    near(tenor.measures.spacing, 85, 0.04);
    // valves: the alto none, the tenor the F attachment, the bass F and D
    expect(SIZES.map((s) => built[s].tm.valves.length)).toEqual([0, 1, 2]);
  });

  it('builds in its budget: under 0.65 M vertices a size, quickly', () => {
    for (const s of SIZES) {
      const verts = all(built[s].tm).reduce((a, m) => a + m.count, 0);
      expect(verts, s).toBeLessThan(650_000);
      expect(built[s].ms, s).toBeLessThan(1500);
    }
  });

  it('stands its outer slide out by the frame’s slide, running on to its target at the engine’s speed, inside its travel', () => {
    const at = (b: Batch, m: Mesh) => b.inst.get(m)!.a[12];
    // first position, then the slide where the frame has it
    for (const s of [0, 0.081, 0.356, 0.567]) {
      const { pose, b } = play(tenor, () => frame('tenor', 60, s, 0.6), 30);
      expect(tromboneSlideState(pose)!).toBeCloseTo(s, 4);
      expect(at(b, tenor.outer) - at(b, tenor.slideStatics[0])).toBeCloseTo(s, 4);
    }
    // never past its travel
    const far = play(tenor, () => ({ ...frame('tenor', 60), trombone: { ...frame('tenor', 60).trombone!, slide: 2, target: 2 } }) as VisualFrame, 20);
    expect(tromboneSlideState(far.pose)!).toBeCloseTo(tenor.travel, 4);
    // between frames (one frame object held 0.1 s), on towards the target at no more than 4 m/s
    const pose = newWindPose();
    const b = new Batch();
    const fr = frame('tenor', 36, 0);
    const path: number[] = [];
    for (let k = 0; k < 12; k++) {
      b.clear();
      poseTrombone(b, tenor, fr, pose, 1 / 120, k * (1000 / 120), 0.05);
      path.push(tromboneSlideState(pose)!);
    }
    expect(path[path.length - 1]).toBeGreaterThan(0.2);
    for (let k = 1; k < path.length; k++) expect(path[k] - path[k - 1]).toBeLessThan(4 / 120 + 1e-6);
    expect(path[path.length - 1]).toBeLessThanOrEqual(tromboneSlideOut(tromboneFingering(36, 'tenor'), 'tenor') + 1e-6);
  });

  it('presses the valves of the engine’s chart and turns their rotors a quarter turn, then lets them go', () => {
    for (const s of SIZES) {
      const { tm } = built[s];
      for (let i = 0; i < tm.valves.length; i++) {
        expect(tromboneRotorTurn(tm, i, 0)).toBeCloseTo(0, 6);
        near(tromboneRotorTurn(tm, i, 1), 90, 0.02);
        expect(tm.valves[i].travel).toBeGreaterThan(15);
        expect(tm.valves[i].travel).toBeLessThan(60);
      }
    }
    // the tenor: C2 on the F attachment (sixth position), B♭2 on the slide alone
    expect(tromboneFingering(36, 'tenor').valves).toEqual([1]);
    const f = play(tenor, () => frame('tenor', 36)).pose;
    expect(tromboneLeverState(f)![0]).toBeGreaterThan(0.95);
    const bb = play(tenor, () => frame('tenor', 46)).pose;
    expect(tromboneLeverState(bb)![0]).toBeLessThan(0.05);
    // the bass: D2 on both valves, F2 on the first alone
    const bass = built.bass.tm;
    expect(tromboneFingering(38, 'bass').valves).toEqual([1, 2]);
    const d = Array.from(tromboneLeverState(play(bass, () => frame('bass', 38)).pose)!);
    expect(d[0]).toBeGreaterThan(0.95);
    expect(d[1]).toBeGreaterThan(0.95);
    const fb = Array.from(tromboneLeverState(play(bass, () => frame('bass', 41)).pose)!);
    expect(fb[0]).toBeGreaterThan(0.95);
    expect(fb[1]).toBeLessThan(0.05);
    // after the note: a moment's hold, then back up
    const held = play(tenor, () => frame('tenor', 36));
    const after = play(tenor, () => frame('tenor', null), 90, held.pose).pose;
    expect(tromboneLeverState(after)![0]).toBeLessThan(0.02);
  });

  it('reads a frame without the field from its note: the chart’s fingering, the size the stage set', () => {
    const fr = frame('tenor', 36) as unknown as { trombone?: unknown };
    delete fr.trombone;
    const t = tromboneOf(fr as VisualFrame, 'tenor')!;
    expect(t.valves).toEqual([1]);
    expect(t.target).toBeCloseTo(tromboneSlideOut(tromboneFingering(36, 'tenor'), 'tenor'), 6);
    expect(tromboneSizeIn(fr as VisualFrame, 'bass')).toBe('bass');
    expect(tromboneSizeIn(frame('alto', 60), 'bass')).toBe('alto');
    // the drawn slide runs from where it was to the note's position
    const { pose } = play(tenor, () => {
      const g = frame('tenor', 42) as unknown as { trombone?: unknown };
      delete g.trombone;
      return g as VisualFrame;
    }, 60);
    expect(tromboneSlideState(pose)!).toBeCloseTo(tromboneSlideOut(tromboneFingering(42, 'tenor'), 'tenor'), 3);
  });

  it('shimmers at the bell’s mouth with the level, and only then', () => {
    const glow = (b: Batch) => b.inst.get(tenor.rim)?.a[19] ?? 0;
    expect(glow(play(tenor, () => frame('tenor', 53), 5, newWindPose(), new Batch(), 0.2).b)).toBeGreaterThan(0.02);
    expect(glow(play(tenor, () => frame('tenor', null), 5, newWindPose(), new Batch(), 0).b)).toBe(0);
  });

  it('stands clear of the floor on its own, inside its bounds, the slide all the way out', () => {
    for (const s of SIZES) {
      const { tm } = built[s];
      let lowY = Infinity;
      let far = 0;
      const pose = play(tm, () => frame(s, 60, tm.travel), 5).b;
      for (const m of all(tm)) {
        const inst = pose.inst.get(m);
        if (!inst) continue;
        const W = new Float32Array(inst.a.subarray(0, 16));
        for (let i = 0; i < m.count; i += 7) {
          const p = xform(W, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]);
          lowY = Math.min(lowY, p[1]);
          far = Math.max(far, Math.hypot(p[0] - tm.bounds.c[0], p[1] - tm.bounds.c[1], p[2] - tm.bounds.c[2]));
        }
      }
      expect(lowY, s).toBeGreaterThan(0.1);
      expect(far, s).toBeLessThan(tm.bounds.r);
    }
  });

  it('takes its seat in the Orchestra, held as a seated player holds it: the lips at the mouthpiece, the slide forward and down, the bell on the left, clear of its neighbours', () => {
    type P = { family: 'wind' | 'reed' | 'brass' | 'bowed'; reed?: 'oboe' | 'clarinet' | 'bassoon'; brass?: 'trumpet' | 'horn' | 'trombone'; kind: 'grand'; bowed: null };
    const p = (family: P['family'], o: Partial<P> = {}): P => ({ family, kind: 'grand', bowed: null, ...o });
    // the Air's four (alto, tenor, tenor, bass), and among a wind section: the others' seats as they were
    const withIt = ensembleSeats([p('wind'), p('reed', { reed: 'oboe' }), p('brass', { brass: 'trombone' }), p('reed', { reed: 'bassoon' })]);
    const without = ensembleSeats([p('wind'), p('reed', { reed: 'oboe' }), p('wind'), p('reed', { reed: 'bassoon' })]);
    for (const i of [0, 1, 3]) expect(Array.from(withIt[i].T)).toEqual(Array.from(without[i].T));
    const seats = ensembleSeats(['alto', 'tenor', 'tenor', 'bass'].map(() => p('brass', { brass: 'trombone' })));
    const sizes: TromboneSize[] = ['alto', 'tenor', 'tenor', 'bass'];
    const clouds: [number, number, number][][] = [];
    seats.forEach((seat, k) => {
      const tm = built[sizes[k]].tm;
      expect(seat.top).toBe(TROMBONE_SEAT.top);
      // posed held, the slide halfway out
      const b = new Batch();
      b.world = seat.T;
      play(tm, () => frame(sizes[k], 60, tm.travel / 2), 3, newWindPose(), b, 0.05, tm.held);
      const pts: [number, number, number][] = [];
      let hi = -Infinity;
      let lo = Infinity;
      for (const m of all(tm)) {
        const inst = b.inst.get(m);
        if (!inst) continue;
        const W = new Float32Array(inst.a.subarray(0, 16));
        for (let i = 0; i < m.count; i += 11) {
          const q = xform(W, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]);
          hi = Math.max(hi, q[1]);
          lo = Math.min(lo, q[1]);
          if (i % 77 === 0) pts.push(q);
        }
      }
      clouds.push(pts);
      // the mouthpiece's rim at a seated player's lips (the seat's height, over its place)
      const lips = xform(seat.T, xform(tm.held, tm.lips));
      expect(lips[1]).toBeCloseTo(TROMBONE_SEAT.y, 3);
      // the crook forward of the lips (towards the audience, −z) and below them; the bell's rim on the
      // player's left (the world is mirrored: +x) and forward of the lips
      const crook = xform(seat.T, xform(tm.held, [tm.dims.xe / 1000, -tm.dims.L.S / 2000, 0]));
      const local = (q: number[]) => {
        // (in the seat's own frame: undo its turn)
        const dx = q[0] - seat.T[12];
        const dz = q[2] - seat.T[14];
        const c = seat.T[0];
        const s = seat.T[8];
        return [c * dx - s * dz, q[1], s * dx + c * dz];
      };
      const cl = local(crook);
      expect(cl[2]).toBeLessThan(-0.5);
      expect(cl[1]).toBeLessThan(lips[1] - 0.2);
      const bellAxis = xform(seat.T, xform(tm.held, xform(tm.bellHeld, [tm.dims.L.rimX / 1000, tm.dims.L.vb / 1000, 0])));
      const bl = local(bellAxis);
      expect(bl[0]).toBeGreaterThan(0.08);
      expect(bl[2]).toBeLessThan(-0.1);
      expect(hi).toBeLessThan(seat.top + 0.05);
      expect(lo).toBeGreaterThan(0.2);
    });
    // neighbours never touch: the nearest points of two seated trombones more than 5 cm apart
    for (let k = 1; k < clouds.length; k++) {
      let d = Infinity;
      for (const a of clouds[k - 1]) for (const c of clouds[k]) d = Math.min(d, Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]));
      expect(d, `trombones ${k - 1} and ${k}`).toBeGreaterThan(0.05);
    }
  });
});
