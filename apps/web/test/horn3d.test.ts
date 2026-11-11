// The horn in 3D (horn3d.ts), without WebGL: built to a Kruspe double horn's measures (docs/
// 3d-reference.md, "Horn": the bell's rim 311 mm, the coil 0.31 m across, the F horn's open path 3.74 m and
// the B♭ horn's 2.80 m, each valve's slide its semitones), inside its budget; posed from the engine's
// frames — the levers follow the engine's own double-horn fingering (hornFingering: the thumb's lever on
// the B♭ side, the fingers' for the valves) on springs, their linkages turning the rotors a quarter turn,
// back to rest after the note; the bore glows along the air's own path (the side and the pressed valves'
// slides, not the others); the bell shimmers with the level — and seated in the Orchestra without moving
// anyone else.
import { describe, expect, it } from 'vitest';
import { hornFingering, type VisualFrame } from '@piano-model/engine';
import { Batch, type Mesh, xform } from '../src/ui/gl/gl3d.ts';
import { BELL_RIM, HORN_BORE, HORN_HELD, HORN_SEAT, LEVER_TRAVEL, airPath, buildHornModel, hornLeverState, hornPathLength, hornSlides, poseHorn, rotorTurn, type HornModel } from '../src/ui/gl/horn3d.ts';
import { newWindPose } from '../src/ui/gl/winds3d.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';

const t0 = performance.now();
const hm: HornModel = buildHornModel();
const buildMs = performance.now() - t0;
const all = (): Mesh[] => [...hm.statics, ...hm.segs.map((s) => s.mesh), hm.rim, ...hm.valves.flatMap((v) => [v.rotor, v.lever, v.link])];
const near = (v: number, want: number, tol = 0.03) => expect(Math.abs(v / want - 1), `${v} vs ${want}`).toBeLessThan(tol);
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** a frame of the engine playing `midi` (the standing wave lips → bell), lips blowing */
const frame = (midi: number | null, blow = 0.6): VisualFrame =>
  ({
    focus: midi === null ? null : { midi, lengthM: 3.74, f1: hz(midi), shapes: [Float32Array.from({ length: 160 }, (_, i) => Math.cos(3 * Math.PI * (i / 159)))] },
    lips: { open: midi === null ? 0 : 0.6, blow: midi === null ? 0 : blow },
  }) as unknown as VisualFrame;
/** pose `n` frames of 1/60 s; the levers' springs (the change valve, 1, 2, 3) */
function play(fr: VisualFrame, n = 45, pose = newWindPose(), b = new Batch(), rms = 0.05): { st: number[]; pose: ReturnType<typeof newWindPose>; b: Batch } {
  for (let k = 0; k < n; k++) {
    b.clear();
    poseHorn(b, hm, fr, pose, 1 / 60, k * 16.7, rms);
  }
  return { st: Array.from(hornLeverState(pose)!), pose, b };
}
const glowOf = (b: Batch, m: Mesh) => b.inst.get(m)?.a[19] ?? 0;

describe('the horn in 3D', () => {
  it('is a double horn’s size: the bell’s rim 311 mm, the coil 0.31 m across, the bore 0.468″, the mouthpiece', () => {
    let bad = 0;
    for (const m of all()) for (let i = 0; i < m.count * 14; i++) if (!Number.isFinite(m.data[i])) bad++;
    expect(bad).toBe(0);
    // the rim (Conn 8D, Holton H179: 12¼″; Hoyer 6801: 310 mm): the rim mesh's widest extent
    near(BELL_RIM, 311, 0.01);
    const d = hm.rim.data;
    let far = 0;
    for (let i = 0; i < hm.rim.count; i += 3)
      for (let j = i + 3; j < hm.rim.count; j += 97) far = Math.max(far, Math.hypot(d[i * 14] - d[j * 14], d[i * 14 + 1] - d[j * 14 + 1], d[i * 14 + 2] - d[j * 14 + 2]));
    near(far, 0.311, 0.02);
    // the coil: the bell branch's and the leadpipe's wraps across the middle (the photographs: 0.31–0.32 m)
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const s of hm.segs)
      if (s.route === 'tail' || s.route === 'lead')
        for (let i = 0; i < s.mesh.count; i += 2) {
          const y = s.mesh.data[i * 14 + 1];
          if (Math.abs(y) < 0.04) {
            x0 = Math.min(x0, s.mesh.data[i * 14]);
            x1 = Math.max(x1, s.mesh.data[i * 14]);
          }
        }
    near(x1 - x0, 0.312, 0.04);
    near(HORN_BORE, 11.9, 0.01);
  });

  it('winds the F horn’s 3.74 m and the B♭ horn’s 2.80 m, and each valve’s slide adds its semitones', () => {
    near(hornPathLength(hm, { side: 'F', valves: '0' }), 3.74, 0.02);
    near(hornPathLength(hm, { side: 'Bb', valves: '0' }), 2.8, 0.02);
    // the second valve a semitone, the first a tone, within 3 %; the third's long S-loops within 25 %
    // (the coil has no room for all of its 0.71 m on the F side: docs/3d-reference.md)
    for (const s of hornSlides()) near(s.len, s.want, s.name.startsWith('v3') ? 0.25 : 0.03);
    // each slide inside the coil's inner wraps
    for (const s of hornSlides()) expect(s.rMax, s.name).toBeLessThan(125);
    // the air's path through the pressed valves only: 1+2 on the B♭ side passes the B♭ slide and the first
    // and second valves' B♭ slides, not the F loop or the third's
    const p = airPath({ side: 'Bb', valves: '1+2' }, hm.lengths).map((q) => q.route);
    expect(p).toContain('Bbslide');
    expect(p).toContain('v1Bb');
    expect(p).toContain('v2Bb');
    expect(p).not.toContain('Floop');
    expect(p).not.toContain('v3Bb');
    expect(p).not.toContain('v1F');
  });

  it('builds in its budget: under 0.9 M vertices, quickly', () => {
    const verts = all().reduce((a, m) => a + m.count, 0);
    expect(verts).toBeLessThan(900_000);
    expect(buildMs).toBeLessThan(1500);
  });

  it('presses the levers of the engine’s fingering, the thumb’s on the B♭ side, and lets them go after', () => {
    const want = (m: number) => {
      const f = hornFingering(m);
      const d = new Set(f.valves === '0' ? [] : f.valves.split('+'));
      return [f.side === 'Bb', d.has('1'), d.has('2'), d.has('3')];
    };
    // across the compass: every lever where the fingering says
    for (const m of [34, 40, 43, 45, 46, 47, 48, 55, 60, 61, 63, 64, 66, 70, 77]) {
      const st = play(frame(m)).st;
      want(m).forEach((on, i) => (on ? expect(st[i], `${m}: lever ${i} down`).toBeGreaterThan(0.95) : expect(st[i], `${m}: lever ${i} up`).toBeLessThan(0.05)));
    }
    // F side 1+2 (A2), B♭ side 2+3 (F♯4), as the shots use
    expect(hornFingering(45)).toMatchObject({ side: 'F', valves: '1+2' });
    expect(hornFingering(66).side).toBe('Bb');
    // after the note: a moment's hold, then every lever back up
    const held = play(frame(43));
    const after = play(frame(null), 90, held.pose).st;
    for (const v of after) expect(v).toBeLessThan(0.02);
  });

  it('turns each rotor a quarter turn through its linkage, the link’s length kept, with a small bounce at the stop', () => {
    for (let i = 0; i < 4; i++) {
      expect(rotorTurn(hm, i, 0)).toBeCloseTo(0, 6);
      near(Math.abs(rotorTurn(hm, i, 1)), 90, 0.04);
    }
    expect(LEVER_TRAVEL).toBeGreaterThan(10);
    // the lever's spring: it reaches its stop quickly and bounces off it a little
    const pose = newWindPose();
    play(frame(null), 10, pose);
    const path: number[] = [];
    const b = new Batch();
    for (let k = 0; k < 60; k++) {
      b.clear();
      poseHorn(b, hm, frame(45), pose, 1 / 240, k * 4.2, 0.05);
      path.push(hornLeverState(pose)![1]);
    }
    const first = path.findIndex((v) => v > 0.995);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(30);
    expect(Math.min(...path.slice(first))).toBeLessThan(0.99);
    expect(path[path.length - 1]).toBeGreaterThan(0.99);
    // the link meets both balls in every pose: its far end where the rotor's crank ball is
    const lever = hm.valves[1];
    const W = b.inst.get(lever.link)!.a;
    const linkEnd = xform(new Float32Array(W.subarray(0, 16)), [0, lever.L0 / 1000, 0]);
    const R = new Float32Array(b.inst.get(lever.rotor)!.a.subarray(0, 16));
    // (the rotor's crank ball, at rest in the model, turned with the rotor)
    const ball = xform(R, ballAtRest(1));
    expect(Math.hypot(linkEnd[0] - ball[0], linkEnd[1] - ball[1], linkEnd[2] - ball[2])).toBeLessThan(0.0003);
  });

  it('glows along the air’s path while it sounds: the pressed valves’ slides of the side played, nothing else; the bell shimmers', () => {
    const segsOf = (route: string) => hm.segs.filter((s) => s.route === route).map((s) => s.mesh);
    const lit = (b: Batch, route: string) => Math.max(...segsOf(route).map((m) => glowOf(b, m)));
    // A2: F side, 1+2
    const f = play(frame(45)).b;
    for (const r of ['lead', 'Floop', 'v1F', 'v2F', 'tail']) expect(lit(f, r), r).toBeGreaterThan(0.004);
    for (const r of ['Bbslide', 'v1Bb', 'v2Bb', 'v3F', 'v3Bb']) expect(lit(f, r), r).toBe(0);
    // F♯4: B♭ side
    const bb = play(frame(66)).b;
    expect(lit(bb, 'Bbslide')).toBeGreaterThan(0.004);
    expect(lit(bb, 'Floop')).toBe(0);
    // silent: nothing glows
    const quiet = play(frame(null), 90, newWindPose(), new Batch(), 0).b;
    for (const s of hm.segs) expect(glowOf(quiet, s.mesh)).toBe(0);
    // the rim, loud
    const loud = play(frame(45), 5, newWindPose(), new Batch(), 0.2).b;
    expect(glowOf(loud, hm.rim)).toBeGreaterThan(0.02);
    expect(glowOf(quiet, hm.rim)).toBe(0);
  });

  it('takes its own seat among a few players, held as a seated player holds it (the others’ seats as they were)', () => {
    const parts = (ps: [('wind' | 'reed' | 'brass' | 'bowed'), ('oboe' | 'clarinet' | 'bassoon')?, ('trumpet' | 'horn')?][]) => ps.map(([family, reed, brass]) => ({ family, reed, brass, kind: 'grand' as const, bowed: null }));
    // (four players sit on one arc in the lineup's order; five or more as an orchestra: seats.test.ts)
    const withIt = ensembleSeats(parts([['reed', 'oboe'], ['brass', undefined, 'horn'], ['reed', 'bassoon'], ['brass', undefined, 'trumpet']]));
    const without = ensembleSeats(parts([['reed', 'oboe'], ['wind'], ['reed', 'bassoon'], ['brass', undefined, 'trumpet']]));
    for (const i of [0, 2, 3]) expect(Array.from(withIt[i].T)).toEqual(Array.from(without[i].T));
    const seat = withIt[1];
    expect(seat.top).toBe(HORN_SEAT.top);
    let hi = -Infinity;
    let lo = Infinity;
    let mpY = 0;
    let rimY = 0;
    for (const m of all())
      for (let i = 0; i < m.count; i += 13) {
        const p = xform(seat.T, xform(HORN_HELD, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]));
        hi = Math.max(hi, p[1]);
        lo = Math.min(lo, p[1]);
      }
    mpY = xform(seat.T, xform(HORN_HELD, hm.lips))[1];
    const rd = hm.rim.data;
    rimY = xform(seat.T, xform(HORN_HELD, [rd[0], rd[1], rd[2]]))[1];
    expect(hi).toBeLessThan(seat.top);
    // the mouthpiece at a seated player's lips (≈ 1.1–1.25 m), the bell down by the thigh
    expect(mpY).toBeGreaterThan(1.05);
    expect(mpY).toBeLessThan(1.3);
    expect(rimY).toBeLessThan(mpY - 0.2);
    expect(lo).toBeGreaterThan(0.25);
  });

  it('stands clear of the floor on its own, inside its bounds', () => {
    let lowY = Infinity;
    let far = 0;
    for (const m of all())
      for (let i = 0; i < m.count; i += 7) {
        const p = xform(hm.T, [m.data[i * 14], m.data[i * 14 + 1], m.data[i * 14 + 2]]);
        lowY = Math.min(lowY, p[1]);
        far = Math.max(far, Math.hypot(p[0] - hm.bounds.c[0], p[1] - hm.bounds.c[1], p[2] - hm.bounds.c[2]));
      }
    expect(lowY).toBeGreaterThan(0.05);
    expect(far).toBeLessThan(hm.bounds.r);
  });
});

/** the rotor's crank ball at rest, in the model (the rotor's own mesh is built round it) */
function ballAtRest(i: number): [number, number, number] {
  return hm.valves[i].ball;
}
