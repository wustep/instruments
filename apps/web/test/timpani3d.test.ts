// The timpani in 3D (timpani3d.ts), without WebGL: built to a set's measures (docs/3d-reference.md,
// "Timpani": the engine's own heads, 32″ … 23″; the playing surface 0.80–0.83 m; the kettles' depth; eight
// tension screws on the three big drums and six on the 23″, Ludwig's count; the mallets 0.36 m with 38 mm
// felt), laid out in the American order (the 32″ on the player's left) in an arc about 2.6 m across; posed
// from the engine's frames — each pedal at its travel, each gauge's pointer at its drum's note, the mallets
// on the head while the engine says they are and rebounding as high as the stroke was hard (lower in a
// roll), each head moving as its modes do (the dent under the strike point, nothing at the rim, decaying);
// and seated in the Orchestra on the floor, two sets 3.2 m apart.
import { describe, expect, it } from 'vitest';
import { TIMPANI_DRUMS, type VisualFrame } from '@piano-model/engine';
import { Batch, type Mesh, xform } from '../src/ui/gl/gl3d.ts';
import { GAUGE, MALLET_BALL, MALLET_LEN, PEDAL, TIMPANI_SEAT, TIMPANI_SET, bowlR, buildTimpaniModel, malletLift, newTimpaniPose, pedalTilt, pointerAngle, poseTimpani, strikePoint, type TimpaniModel, type TimpaniPose } from '../src/ui/gl/timpani3d.ts';
import { ensembleSeats } from '../src/ui/gl/scenes3d.ts';

const t0 = performance.now();
const tm: TimpaniModel = buildTimpaniModel();
const buildMs = performance.now() - t0;
const near = (v: number, want: number, tol = 0.03) => expect(Math.abs(v / want - 1), `${v} vs ${want}`).toBeLessThan(tol);

/** the extent of a mesh's vertices (in its own frame) */
function extent(m: Mesh): { lo: number[]; hi: number[] } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.count; i++)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], m.data[i * 14 + k]);
      hi[k] = Math.max(hi[k], m.data[i * 14 + k]);
    }
  return { lo, hi };
}
/** a frame of the engine: drum k struck `ago` s ago (its first modes at `y`), the hands as given */
function frame(o: { k?: number; ago?: number; y?: number; pedal?: number[]; notes?: number[]; hands?: { drum: number; ago: number; vel: number; on: boolean }[] } = {}): VisualFrame {
  const k = o.k ?? 0;
  const modes = [
    [0, 2.405],
    [1, 3.832],
    [2, 5.136],
    [0, 5.52],
    [3, 6.38],
    [1, 7.016],
  ];
  const drums = TIMPANI_DRUMS.map((d, i) => {
    const head = new Float32Array(3 * 14);
    modes.forEach(([m, j], q) => {
      head[3 * q] = m;
      head[3 * q + 1] = j;
      head[3 * q + 2] = i === k ? (o.y ?? 0) * (q === 1 ? 1 : 0.4) : 0;
    });
    return { d: d.d, inches: d.inches, lo: d.lo, hi: d.hi, note: o.notes?.[i] ?? d.rest, pedal: o.pedal?.[i] ?? 0.25, level: i === k && (o.y ?? 0) > 0 ? 10 : 0, ago: i === k ? (o.ago ?? 0) : 99, vel: 100, head };
  });
  return { timpani: { drums, hands: o.hands ?? [{ drum: 1, ago: 1e6, vel: 0, on: false }, { drum: 2, ago: 1e6, vel: 0, on: false }], spot: 0.7, last: k } } as unknown as VisualFrame;
}
/** pose `n` frames of 1/60 s, a new frame object each time (as the stage receives them) */
function play(make: (i: number) => VisualFrame, n: number, pose: TimpaniPose = newTimpaniPose(), b = new Batch()): TimpaniPose {
  for (let i = 0; i < n; i++) {
    b.clear();
    poseTimpani(b, tm, make(i), pose, 1 / 60, i * 16.7);
  }
  return pose;
}

describe('the timpani in 3D', () => {
  it('are a set of four at the engine’s sizes: heads, hoops, kettles, heights, rods, mallets', () => {
    let bad = 0;
    for (const d of tm.drums) for (const m of [d.statics, d.pedal, d.pointer]) for (let i = 0; i < m.count * 14; i++) if (!Number.isFinite(m.data[i])) bad++;
    expect(bad).toBe(0);
    expect(TIMPANI_SET.map((s) => s.inches)).toEqual(TIMPANI_DRUMS.map((d) => d.inches));
    tm.drums.forEach((d, k) => {
      const s = d.spec;
      near(s.d, TIMPANI_DRUMS[k].d, 0.005);
      // the counterhoop's outside: the head plus its chrome channel (≈ 6 cm over the head's diameter)
      const e = extent(d.statics);
      const across = e.hi[0] - e.lo[0];
      expect(across, `${s.inches}″ across`).toBeGreaterThan(s.d + 0.05);
      expect(across, `${s.inches}″ across`).toBeLessThan(s.d + 0.2);
      // playing height (Kolberg 82 cm on gliders; Yamaha TP-8300 85 cm overall): 0.78–0.86 m
      expect(s.h).toBeGreaterThan(0.78);
      expect(s.h).toBeLessThan(0.86);
      // the kettle about 0.55–0.62 of its diameter deep, its wall at the edge the head's radius
      expect(s.depth / s.d).toBeGreaterThan(0.54);
      expect(s.depth / s.d).toBeLessThan(0.62);
      near(bowlR(s.d / 2, 0), s.d / 2, 1e-6);
      expect(bowlR(s.d / 2, 0.5)).toBeGreaterThan(0.85 * (s.d / 2));
      // standing on its casters: the lowest point on the floor, the highest the T-handles' (≈ 4 cm up)
      expect(Math.abs(e.lo[1])).toBeLessThan(0.002);
      expect(e.hi[1] - s.h).toBeGreaterThan(0.025);
      expect(e.hi[1] - s.h).toBeLessThan(0.08);
    });
    // Ludwig AV1454: six lugs on the 23″, eight on the 26″–32″
    expect(TIMPANI_SET.map((s) => s.rods)).toEqual([8, 8, 8, 6]);
    // the mallets: 0.36 m, a 38 mm felt ball (Vic Firth T1: 36.8 cm, 38.1 mm)
    near(MALLET_LEN, 0.368, 0.03);
    near(2 * MALLET_BALL, 0.0381, 0.03);
    const me = extent(tm.mallet);
    near(me.hi[2] - me.lo[2], MALLET_LEN + MALLET_BALL, 0.03);
    // inside the budget
    const verts = tm.drums.reduce((a, d) => a + d.statics.count + d.pedal.count + d.pointer.count, 0) + tm.mallet.count * 2;
    expect(verts).toBeLessThan(700_000);
    expect(buildMs).toBeLessThan(3000);
  });

  it('stand in the American order, the 32″ on the player’s left, in an arc about 2.6 m across round the player', () => {
    const c = tm.drums.map((d) => xform(d.T, [0, 0, 0]));
    // (+x is the player's left, the audience's right: the renderer mirrors x)
    for (let k = 1; k < 4; k++) expect(c[k][0]).toBeLessThan(c[k - 1][0]);
    // round the player: each drum's strike point faces the player, its centre about the same distance off
    const P = tm.player;
    for (const d of tm.drums) {
      const s = xform(d.T, strikePoint(d.spec, 0.7, 0));
      const cc = xform(d.T, [0, 0, 0]);
      expect(Math.hypot(s[0] - P[0], s[2] - P[2])).toBeLessThan(Math.hypot(cc[0] - P[0], cc[2] - P[2]));
    }
    // the middle drums in front of the player (towards the audience, −z), the end drums beside
    expect(c[1][2]).toBeLessThan(P[2] - 0.5);
    expect(c[2][2]).toBeLessThan(P[2] - 0.5);
    // the hoops a hand's breadth apart, never touching
    for (let k = 1; k < 4; k++) {
      const gap = Math.hypot(c[k][0] - c[k - 1][0], c[k][2] - c[k - 1][2]) - (tm.drums[k].spec.d + tm.drums[k - 1].spec.d) / 2;
      expect(gap).toBeGreaterThan(0.08);
      expect(gap).toBeLessThan(0.3);
    }
    const x0 = Math.min(...tm.drums.map((d, k) => c[k][0] - d.spec.d / 2));
    const x1 = Math.max(...tm.drums.map((d, k) => c[k][0] + d.spec.d / 2));
    near(x1 - x0, 2.5, 0.1);
  });

  it('pose the pedals at the engine’s travel and the gauges’ pointers at each drum’s note', () => {
    const pose = play(() => frame({ pedal: [0, 0.5, 1, 0.25], notes: [36, 44, 53, 51] }), 40);
    near(pose.tilt[0], PEDAL.lo, 0.01);
    near(pose.tilt[2], PEDAL.hi, 0.01);
    expect(pose.tilt[0]).toBeGreaterThan(pose.tilt[1]);
    expect(pose.tilt[1]).toBeGreaterThan(pose.tilt[2]);
    expect(pedalTilt(0)).toBeGreaterThan(0.2);
    expect(pedalTilt(1)).toBeLessThan(-0.1);
    // the pointers: the lowest note at one end of the arc, the highest at the other
    near(pose.needle[0], -GAUGE.span, 0.01);
    near(pose.needle[2], GAUGE.span, 0.01);
    near(pose.needle[1], pointerAngle(44, 41, 48), 0.01);
  });

  it('strike with the mallet on the head while the engine says so, rebound by how hard, and come back to rest', () => {
    const at = (d: number, t: number, vel: number, on = false) => frame({ hands: [{ drum: d, ago: t, vel, on }, { drum: 2, ago: 1e6, vel: 0, on: false }] });
    // on the head: the felt's bottom on the playing surface at the strike point
    const pose = play(() => at(0, 0.001, 120, true), 3);
    expect(pose.alpha[0]).toBe(0);
    const dr = tm.drums[0];
    const S = xform(dr.T, strikePoint(dr.spec, 0.7, 0));
    expect(Math.hypot(pose.ball[0][0] - S[0], pose.ball[0][2] - S[2])).toBeLessThan(0.003);
    near(pose.ball[0][1] - MALLET_BALL, dr.spec.h, 0.003);
    // the rebound: higher for a loud stroke than a soft one, then back to rest
    expect(malletLift(0.075, 127, 9, false)).toBeGreaterThan(malletLift(0.075, 40, 9, false) + 0.15);
    expect(malletLift(0.075, 127, 9, false)).toBeGreaterThan(malletLift(2, 127, 9, false));
    near(malletLift(2, 127, 9, false), malletLift(1e3, 10, 9, false), 0.01);
    // in a roll (8–16 strokes a second, each hand every 0.12–0.25 s) the stroke stays low
    expect(malletLift(0.075, 100, 0.12, false)).toBeLessThan(0.75 * malletLift(0.075, 100, 9, false));
    // the engine's strokes, frame by frame: struck at 0, the ball rises over the next frames
    const p2 = newTimpaniPose();
    play((i) => at(3, 0.5 + i / 60, 110), 10, p2);
    const rest = p2.ball[0][1];
    play((i) => at(3, i / 60, 110, i === 0), 6, p2);
    expect(p2.ball[0][1]).toBeGreaterThan(rest);
    // the hand moves to the drum it struck
    const d3 = tm.drums[3];
    const S3 = xform(d3.T, strikePoint(d3.spec, 0.7, 0));
    expect(Math.hypot(p2.ball[0][0] - S3[0], p2.ball[0][2] - S3[2])).toBeLessThan(0.2);
  });

  it('move each head as its modes do: the dent under the strike point, still at the rim, decaying with the drum', () => {
    const pose = newTimpaniPose();
    const b = new Batch();
    play(() => frame({ k: 1, ago: 0, y: 1.5e-3 }), 1, pose, b);
    const hm = pose.heads[1];
    expect(hm.mesh.dyn).toBeGreaterThan(0);
    // its vertices: at the strike point (towards the player, +z, 0.7 of the radius) the head is down
    const s = tm.drums[1].spec;
    const a = s.d / 2;
    let under = 0;
    let rim = 0;
    let peak = 0;
    for (let v = 0; v < hm.mesh.count; v++) {
      const x = hm.mesh.data[v * 14];
      const y = hm.mesh.data[v * 14 + 1] - s.h;
      const z = hm.mesh.data[v * 14 + 2];
      peak = Math.max(peak, Math.abs(y));
      if (Math.hypot(x, z - 0.7 * a) < 0.03) under = Math.min(under, y);
      if (Math.hypot(x, z) > a - 1e-4) rim = Math.max(rim, Math.abs(y));
    }
    expect(under).toBeLessThan(-0.003);
    expect(rim).toBeLessThan(1e-6);
    // exaggerated to be seen (the engine's 1.5 mm: centimetres), not past a hand's breadth
    expect(peak).toBeGreaterThan(0.006);
    expect(peak).toBeLessThan(0.04);
    // it decays as the drum's modes do: their amplitudes fall, the head with them
    play((i) => frame({ k: 1, ago: i / 60, y: 1.5e-3 * Math.exp(-i / 20) }), 120, pose, b);
    let late = 0;
    for (let v = 0; v < hm.mesh.count; v++) late = Math.max(late, Math.abs(hm.mesh.data[v * 14 + 1] - s.h));
    expect(late).toBeLessThan(0.25 * peak);
    // the drums not struck stay still
    expect(pose.heads[3].flat).toBe(true);
  });

  it('take their place in the Orchestra on the floor behind the players, two sets 3.2 m apart, without moving anyone', () => {
    const bowed = (id: string) => ({ family: 'bowed' as const, kind: 'grand' as const, bowed: { id } as never });
    const timp = { family: 'percussion' as const, kind: 'grand' as const, bowed: null };
    const before = ensembleSeats([bowed('violin'), bowed('viola'), bowed('cello')]);
    const seats = ensembleSeats([bowed('violin'), bowed('viola'), bowed('cello'), timp, timp]);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 16; k++) expect(seats[i].T[k]).toBeCloseTo(before[i].T[k], 6);
    const [a, b] = [seats[3], seats[4]];
    // on the floor, behind the players, facing the audience
    expect(a.T[13]).toBe(0);
    expect(a.T[14]).toBeGreaterThan(1.2);
    near(Math.abs(b.T[12] - a.T[12]), 3.2, 0.01);
    expect(a.r).toBe(TIMPANI_SEAT.r);
    expect(a.top).toBeGreaterThan(TIMPANI_SET[3].h);
    // a set's half-width covers its drums
    const xs = tm.drums.map((d) => xform(d.T, [0, 0, 0])[0]);
    expect(TIMPANI_SEAT.r).toBeGreaterThan(Math.max(...xs.map((x, k) => Math.abs(x) + tm.drums[k].spec.d / 2)) - 0.05);
  });
});
