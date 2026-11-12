// The harp on the 3D stage: a concert grand pedal harp built from the 2D stage's own plan (ui/harp-plan.ts:
// the column, the neck's harmonic curve over the strings' tops, the soundboard rising to the knee, the base
// and its pedals; the strings the engine's own, at their lengths) given its depth: the strings in one plane,
// the neck beside them (they run down its left face, as on the instrument), the soundbox a tapering shell
// behind a flat spruce soundboard 0.42 m wide at its foot, the seven pedals round the base's back, the left
// foot's three and the right foot's four. Maple, gilded at the crown; spruce; brass action plates.
//
// What moves, by the engine's own state (the frame's `harp`): every string swings as wide as the engine says
// (the loudest few in their own shapes, the plucked triangle running out and back), each pedal stands in its
// notch and travels when the engine moves it.
import type { VisualFrame } from '@piano-model/engine';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, mulInto, rotX, translate, xform } from './gl3d.ts';
import { M, box, cyl, extrude, grid, variant } from './mesh.ts';
import { boxOf, latheOn, make } from './horn3d.ts';
import { BASE, BOARD_A, BOARD_B, COLUMN_X, COLUMN_Y0, COLUMN_Y1, CROWN_Y, PEDAL_STEP, PEDAL_Y, STRINGS, STRING_X, STRING_Y0, STRING_Y1, neckLower, neckUpper, pedalOf, stopY } from '../harp-plan.ts';

type P2 = [number, number];
const GILT = variant(M.brass, { name: 'harpGilt' });
/** the soundboard's half width at its foot and at the knee, the soundbox's depth behind it there */
const HALF_W = [0.21, 0.055];
const DEPTH = [0.2, 0.07];
/** the neck: from just beside the strings' plane to 52 mm out (the strings run down its near face) */
const NECK_Z: [number, number] = [0.004, 0.056];
/** the pedals' places round the base's back (m): x along the base, z out to either side; D C B on the
 *  player's left, E F G A on the right */
const PEDALS: { x: number; z: number; side: 1 | -1 }[] = [
  { x: 0.45, z: -0.2, side: -1 },
  { x: 0.39, z: -0.215, side: -1 },
  { x: 0.33, z: -0.225, side: -1 },
  { x: 0.33, z: 0.225, side: 1 },
  { x: 0.39, z: 0.215, side: 1 },
  { x: 0.45, z: 0.2, side: 1 },
  { x: 0.51, z: 0.17, side: 1 },
];

export interface HarpModel {
  /** the harp standing on the floor: its pose alone on the stage */
  T: Mat4;
  statics: Mesh[];
  /** one pedal (its lever and foot), drawn seven times at its places and notches */
  pedal: Mesh;
  pedalAt: Mat4[];
  /** tests: its height, its soundboard's width at the foot, the strings' count */
  height: number;
  boardWidth: number;
  strings: number;
  bounds: { c: Vec3; r: number };
}
/** the camera for the harp alone (scenes3d viewFor): three-quarter from the audience's side, the strings
 *  fanned across the picture; a narrow stage may swing further round */
export const HARP_VIEW = { yaw: -0.5, pitch: 0.1, swing: 0.5 };
/** a harp in the Orchestra stands on the floor by its player: its turn from the seat's facing (its profile to
 *  the hall, the column towards the conductor and the player behind the soundbox, as a harp is seen from the
 *  audience), its footprint's radius and its top (m) */
export const HARP_SEAT = { r: 0.6, top: 1.95, turn: Math.PI };

/** a side-view outline (x, y) as a slab between z0 and z1 */
const slab = (mb: Parameters<typeof box>[0], pts: P2[], z0: number, z1: number, m: typeof M.maple) => mb.with(rotX(-Math.PI / 2), () => extrude(mb, pts.map(([x, y]): P2 => [x, y]), -z1, -z0, m));

export function buildHarpModel(): HarpModel {
  const t: P2 = [BOARD_B[0] - BOARD_A[0], BOARD_B[1] - BOARD_A[1]];
  const tl = Math.hypot(t[0], t[1]);
  // (the board's normal, towards the player's side: the soundbox is behind it)
  const n: P2 = [t[1] / tl, -t[0] / tl];
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  const statics = make((mb) => {
    // the base and its feet
    slab(mb, BASE as P2[], -0.2, 0.2, M.maple);
    for (const [x, z] of [[0.0, -0.17], [0.0, 0.17], [0.43, -0.17], [0.43, 0.17]] as P2[]) cyl(mb, [x, 0, z], [x, 0.036, z], 0.03, 0.026, 16, GILT);
    // the column: a fluted shaft on a turned foot, its capital and crown gilded
    latheOn(mb, [COLUMN_X, COLUMN_Y0, 0], [0, 1, 0], [[0, 0], [0.05, 0], [0.052, 0.02], [0.038, 0.05], [0.031, 0.09], [0.029, COLUMN_Y1 - COLUMN_Y0 - 0.09], [0.034, COLUMN_Y1 - COLUMN_Y0 - 0.03]] as P2[], 28, M.maple);
    latheOn(mb, [COLUMN_X, COLUMN_Y1 - 0.03, 0], [0, 1, 0], [[0.034, 0], [0.052, 0.02], [0.056, 0.04], [0.042, 0.055], [0.05, 0.075], [0.036, 0.1], [0.016, 0.112], [0, CROWN_Y - COLUMN_Y1 + 0.045]] as P2[], 28, GILT);
    // the neck: its curve over the strings' tops, beside their plane; the brass action plate along its foot
    slab(mb, [...neckLower, ...[...neckUpper].reverse()] as P2[], NECK_Z[0], NECK_Z[1], M.maple);
    slab(mb, [...neckLower.map(([x, y]): P2 => [x, y - 0.012]), ...[...neckLower].reverse().map(([x, y]): P2 => [x, y + 0.012])], NECK_Z[0] - 0.003, NECK_Z[0], GILT);
    // the soundboard: a flat spruce plate widening to its foot, the strings' rail down its middle
    const at = (u: number, z: number, back: number): Vec3 => [lerp(BOARD_A[0], BOARD_B[0], u) + n[0] * back, lerp(BOARD_A[1], BOARD_B[1], u) + n[1] * back, z];
    grid(mb, 24, 2, (u, v) => at(u, (v * 2 - 1) * lerp(HALF_W[0], HALF_W[1], u), 0), M.spruce);
    grid(mb, 24, 2, (u, v) => at(u, (v * 2 - 1) * 0.012, -0.004), M.maple);
    // the soundbox: a rounded shell behind the board, deep and wide at the foot, narrow at the knee
    grid(mb, 24, 16, (u, v) => {
      const a = Math.PI * v;
      return at(u, -Math.cos(a) * lerp(HALF_W[0], HALF_W[1], u), Math.sin(a) * lerp(DEPTH[0], DEPTH[1], u));
    }, M.maple, { flip: true });
    // its ends closed: the foot on the base, the knee under the neck
    for (const u of [0, 1])
      grid(mb, 2, 12, (r, v) => {
        const a = Math.PI * v;
        return at(u, -Math.cos(a) * lerp(HALF_W[0], HALF_W[1], u) * r, Math.sin(a) * lerp(DEPTH[0], DEPTH[1], u) * r);
      }, M.maple, { flip: u === 1 });
    // the pedals' slots: a brass plate at each, on the base's flanks
    for (const p of PEDALS) box(mb, [p.x - 0.012, PEDAL_Y - 0.03, p.z - 0.004], [p.x + 0.012, PEDAL_Y + 0.036, p.z + 0.004], GILT);
  });
  // one pedal: a lever out of its slot to a foot plate (built at the origin, pointing along +z)
  const pedal = make((mb) => {
    box(mb, [-0.006, -0.004, 0], [0.006, 0.004, 0.07], M.brass);
    box(mb, [-0.02, -0.006, 0.07], [0.02, 0.006, 0.12], M.brass);
  });
  const bx = boxOf([statics]);
  const c: Vec3 = [(bx.lo[0] + bx.hi[0]) / 2, (bx.lo[1] + bx.hi[1]) / 2, 0];
  const r = 0.5 * Math.hypot(bx.hi[0] - bx.lo[0], bx.hi[1] - bx.lo[1], 0.6) + 0.02;
  // (the harp's middle over the stage's: its column to the audience's left)
  const T = translate(-c[0], 0, 0);
  const model: HarpModel = { T, statics: [statics], pedal, pedalAt: PEDALS.map(() => new Float32Array(16)), height: bx.hi[1] - bx.lo[1], boardWidth: 2 * HALF_W[0], strings: STRINGS.length, bounds: { c: xform(T, [c[0], c[1], 0]), r } };
  if (typeof window !== 'undefined') (window as unknown as { __harp3d?: unknown }).__harp3d = { bounds: model.bounds, state: () => stageState };
  return model;
}

const hex = (h: string, a = 1): RGBA => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, a];
const INK = { red: hex('#c8402f'), black: hex('#2c3854'), gut: hex('#e6dcc2'), nylon: hex('#f2efe8'), wire: hex('#b98d55') };
const inkOf = (i: number): RGBA => (STRINGS[i].colour === 'red' ? INK.red : STRINGS[i].colour === 'black' ? INK.black : STRINGS[i].material === 'wire' ? INK.wire : STRINGS[i].material === 'nylon' ? INK.nylon : INK.gut);
/** a string's gauge (m): the wire strings of the bass heaviest, the nylon of the top finest */
const gauge = (i: number): number => (STRINGS[i].material === 'wire' ? 0.0034 - 0.0012 * (i / 11) : STRINGS[i].material === 'gut' ? 0.0021 - 0.0009 * ((i - 12) / 25) : 0.0011);

/** what the stage last drew of the single harp (tests): each string's swing (m), each pedal's place */
let stageState: { swing: number[]; pedals: number[]; ringing: number } | null = null;
const SEG = 14;
const pts: Vec3[] = Array.from({ length: SEG + 1 }, () => [0, 0, 0]);
const two: Vec3[] = [[0, 0, 0], [0, 0, 0]];
const PM = new Float32Array(16);

export function poseHarp(b: Batch, hm: HarpModel, fr: VisualFrame | null, _dt: number, _now: number, T: Mat4 = hm.T): void {
  for (const s of hm.statics) b.mesh(s, T);
  const hv = fr?.harp ?? null;
  const swing: number[] = [];
  let ringing = 0;
  // the strings: each from the board to its sounding top; a ringing one swings across the strings' plane
  for (let i = 0; i < STRINGS.length; i++) {
    const k = pedalOf(i);
    const x = STRING_X[i];
    const y0 = STRING_Y0[i];
    const y1 = hv ? stopY(i, hv.pedals[k]) : stopY(i, 0);
    const a = hv ? Math.min(1, hv.amp[i] ?? 0) : 0;
    // (a hard pluck at the middle of a long string swings about 12 mm either way)
    const w = a > 0.002 ? Math.sqrt(a) * Math.min(0.014, 0.003 + 0.011 * STRINGS[i].length) : 0;
    swing.push(w);
    const col = inkOf(i);
    const g = gauge(i);
    // (above the disc that stops it: the string's still end, up to its pin)
    if (STRING_Y1[i] - y1 > 0.002) {
      two[0] = xform(T, [x, y1, 0]);
      two[1] = xform(T, [x, STRING_Y1[i], 0]);
      b.wire(two, col, g);
    }
    if (w > 0) {
      ringing++;
      const sh = hv?.shapes.find((s) => s.string === i)?.shape ?? null;
      let pk = 1e-9;
      if (sh) for (let q = 0; q < sh.length; q++) pk = Math.max(pk, Math.abs(sh[q]));
      for (let q = 0; q <= SEG; q++) {
        const u = q / SEG;
        // its own shape now (the loudest few), else its first mode's bow
        const d = sh ? sh[Math.min(sh.length - 1, Math.round(u * (sh.length - 1)))] / pk : Math.sin(Math.PI * u) * Math.sin(_now * 0.045 + i);
        pts[q] = xform(T, [x, y0 + (y1 - y0) * u, d * w]);
      }
      b.wire(pts, col, g);
    } else {
      two[0] = xform(T, [x, y0, 0]);
      two[1] = xform(T, [x, y1, 0]);
      b.wire(two, col, g);
    }
  }
  // the pedals: each in its notch (up flat, the middle natural, down sharp)
  const ped: number[] = [];
  PEDALS.forEach((p, k) => {
    const pos = hv ? hv.pedals[k] : 0;
    ped.push(pos);
    const m = hm.pedalAt[k];
    m.set(translate(p.x, PEDAL_Y - PEDAL_STEP * pos, p.z));
    // (the lever points out of the base's flank: along +z on the right, −z on the left)
    if (p.side < 0) {
      m[0] = -1;
      m[10] = -1;
    }
    mulInto(PM, 0, T, m);
    b.mesh(hm.pedal, PM);
  });
  if (T === hm.T) stageState = { swing, pedals: ped, ringing };
}
