// The zephyr on the 3D stage: the 2D stage's own plan (ui/zephyr-plan.ts: the mast, the yard over the
// ribbons' tops, the boom with its soundboard, bridge and keyboard, the wind's blade) given its depth. The
// ribbons stand in one plane over the bridge; the blade is 30 mm behind them, a slot in its face for each;
// the case is 0.32 m deep under a pale soundboard, the five-octave keyboard 0.15 m out in front of it; the
// mast and the treble leg each stand on a cross foot, the blower's drum lies at the mast's foot. Carbon,
// satin and dark; the soundboard and the bridge pale (graphene skins on an aerogel core; a ceramic bridge);
// the blade and its duct brushed metal; ivory-white and black keys.
//
// What moves is the engine's (the frame's `zephyr`): a key whose slot blows is down, its slot is lit as far
// as its wind goes, and every ribbon swings as wide as the engine says (the loudest few in their own shapes).
import type { VisualFrame } from '@piano-model/engine';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, mulInto, rotX, translate, xform } from './gl3d.ts';
import { M, bbox, box, cyl, extrude, tube, variant } from './mesh.ts';
import { boxOf, make } from './horn3d.ts';
import { BLADE, BLADE_LOW, BLOWER, BOARD_Y, BOOM_X0, BOOM_X1, BOOM_Y0, BRIDGE_H, KEYS_X0, KEYS_X1, KEYS_Y0, KEYS_Y1, LEG_X, MAST_R, MAST_X, MAST_Y1, PITCH, POST_X, RIBBONS, RIBBON_X, RIBBON_Y0, RIBBON_Y1, WHITE_W, kindOf, slotY, whiteX, yardLower, yardUpper } from '../zephyr-plan.ts';

type P2 = [number, number];
const CARBON = variant(M.lacquerSatin, { name: 'zephyrCarbon', col: [0.075, 0.078, 0.086], rough: 0.38 });
const SKIN = variant(M.hornbeam, { name: 'zephyrSkin', col: [0.86, 0.84, 0.78], rough: 0.5 });
const CERAMIC = variant(M.keyIvory, { name: 'zephyrCeramic', col: [0.93, 0.92, 0.88], rough: 0.35 });
const BLADE_M = variant(M.nickelSatin, { name: 'zephyrBlade', col: [0.7, 0.74, 0.79], rough: 0.42, metal: 0.85 });
/** the case behind the ribbons' plane and in front of it, the keys' fronts, the blade's two faces (m; z
 *  towards the player) */
const CASE_Z: [number, number] = [-0.2, 0.12];
const KEY_Z1 = 0.27;
const BLADE_Z: [number, number] = [-0.058, -0.03];
/** a key's dip when it is down (m) */
const DIP = 0.009;

export interface ZephyrModel {
  /** the instrument on the floor, its middle over the stage's */
  T: Mat4;
  statics: Mesh[];
  /** one natural's key and one accidental's, drawn at each key's place; a slot's light (a unit bar) */
  white: Mesh;
  black: Mesh;
  light: Mesh;
  /** tests: its height, the soundboard's depth, the ribbons' and the keys' counts */
  height: number;
  boardDepth: number;
  ribbons: number;
  keys: number;
  bounds: { c: Vec3; r: number };
}
/** the camera for the zephyr alone (scenes3d viewFor): three-quarter from the player's side, the ribbons
 *  fanned across the picture; a narrow stage may swing further round */
export const ZEPHYR_VIEW = { yaw: 0.42, pitch: 0.08, swing: 0.45 };
/** a zephyr in the Orchestra stands on the floor with the keyboards and the harps: its turn from the seat's
 *  facing (its ribbons across the hall's view, the player behind the keyboard), its footprint's radius and
 *  its top (m) */
export const ZEPHYR_SEAT = { r: 0.72, top: 2.2, turn: Math.PI };

/** a front-view outline (x, y) as a slab between z0 and z1 */
const slab = (mb: Parameters<typeof box>[0], pts: P2[], z0: number, z1: number, m: typeof CARBON) => mb.with(rotX(-Math.PI / 2), () => extrude(mb, pts.map(([x, y]): P2 => [x, y]), -z1, -z0, m));

/** each key's place: its left edge and its natural's index (naturals), or its middle (accidentals) */
const KEY_AT: { sharp: boolean; x: number }[] = (() => {
  const out: { sharp: boolean; x: number }[] = [];
  let k = 0;
  for (let i = 0; i < RIBBONS.length; i++) {
    if (RIBBONS[i].sharp) out.push({ sharp: true, x: RIBBON_X[i] });
    else out.push({ sharp: false, x: whiteX(k++) });
  }
  return out;
})();

export function buildZephyrModel(): ZephyrModel {
  const n = RIBBONS.length;
  const statics = make((mb) => {
    // the feet: a cross bar under the mast and under the treble leg, rubber under their ends
    for (const x of [MAST_X, LEG_X]) {
      bbox(mb, [x - 0.03, 0.006, -0.3], [x + 0.03, 0.03, 0.3], CARBON, 0.004);
      for (const z of [-0.27, 0.27]) cyl(mb, [x, 0, z], [x, 0.006, z], 0.024, 0.024, 12, M.rubber);
    }
    // the blower: a drum lying at the mast's foot, its intake a ring of slots at one end, the duct up into
    // the mast
    {
      const cx = (BLOWER[0][0] + BLOWER[1][0]) / 2;
      const cy = 0.135;
      cyl(mb, [cx, cy, -0.13], [cx, cy, 0.13], 0.1, 0.1, 28, CARBON);
      cyl(mb, [cx, cy, 0.13], [cx, cy, 0.136], 0.086, 0.086, 28, BLADE_M);
      cyl(mb, [cx, cy, 0.136], [cx, cy, 0.14], 0.03, 0.03, 16, CARBON);
      cyl(mb, [cx, cy, -0.136], [cx, cy, -0.13], 0.086, 0.086, 28, BLADE_M);
    }
    // the mast: a carbon tube, a turned collar where the yard and the blade leave it, a cap
    cyl(mb, [MAST_X, 0.03, 0], [MAST_X, MAST_Y1, 0], MAST_R * 1.08, MAST_R * 0.92, 24, CARBON);
    cyl(mb, [MAST_X, MAST_Y1, 0], [MAST_X, MAST_Y1 + 0.012, 0], MAST_R * 0.98, MAST_R * 0.6, 24, BLADE_M);
    cyl(mb, [MAST_X, 0.03, 0], [MAST_X, 0.06, 0], MAST_R * 1.5, MAST_R * 1.15, 24, BLADE_M);
    // the treble leg, and the post from the boom up to the yard's end
    cyl(mb, [LEG_X, 0.03, 0], [LEG_X, BOOM_Y0, 0], 0.016, 0.014, 16, CARBON);
    cyl(mb, [POST_X, BOARD_Y, 0], [POST_X, yardLower[yardLower.length - 1][1] + 0.012, 0], 0.011, 0.01, 14, CARBON);
    // the yard: its curve over the ribbons' tops, a pin through it for each
    slab(mb, [...yardLower, ...[...yardUpper].reverse()] as P2[], -0.016, 0.016, CARBON);
    for (let i = 0; i < n; i++) {
      const y = RIBBON_Y1[i] + 0.022;
      cyl(mb, [RIBBON_X[i], y, 0.016], [RIBBON_X[i], y, 0.024], 0.0026, 0.0026, 8, M.pinNickel);
    }
    // the boom: the case under the soundboard, the soundboard, the bridge the ribbons stand on
    bbox(mb, [BOOM_X0, BOOM_Y0, CASE_Z[0]], [BOOM_X1, BOARD_Y - 0.005, CASE_Z[1]], CARBON, 0.008);
    box(mb, [BOOM_X0 + 0.004, BOARD_Y - 0.005, CASE_Z[0] + 0.004], [BOOM_X1 - 0.004, BOARD_Y, CASE_Z[1] - 0.004], SKIN);
    bbox(mb, [RIBBON_X[0] - 0.014, BOARD_Y, -0.006], [RIBBON_X[n - 1] + 0.014, BOARD_Y + BRIDGE_H, 0.006], CERAMIC, 0.002);
    // the keyboard's bed in front of the case, its cheeks
    box(mb, [KEYS_X0 - 0.03, KEYS_Y0 - 0.03, CASE_Z[1]], [KEYS_X1 + 0.03, KEYS_Y0 - 0.004, KEY_Z1 + 0.004], CARBON);
    for (const x of [KEYS_X0 - 0.03, KEYS_X1 + 0.004]) bbox(mb, [x, KEYS_Y0 - 0.004, CASE_Z[1]], [x + 0.026, KEYS_Y1 + 0.014, KEY_Z1 + 0.004], CARBON, 0.004);
    // the blade behind the ribbons, the duct along its lower edge from the mast; a slot in its face for
    // each ribbon
    slab(mb, BLADE as P2[], BLADE_Z[0], BLADE_Z[1], BLADE_M);
    tube(mb, BLADE_LOW.map(([x, y]): Vec3 => [x, y - 0.012, (BLADE_Z[0] + BLADE_Z[1]) / 2]), (i) => 0.02 - 0.012 * (i / (BLADE_LOW.length - 1)), 14, BLADE_M);
    for (let i = 0; i < n; i++) {
      const [a, b] = slotY(i);
      const hw = Math.max(0.0012, 0.9 * RIBBONS[i].width);
      box(mb, [RIBBON_X[i] - hw, a, BLADE_Z[1]], [RIBBON_X[i] + hw, b, BLADE_Z[1] + 0.0006], M.hole);
    }
  });
  // a natural's key (its left edge at x 0, its top at y 0, from the case out to its front) and an accidental's
  // (its middle at x 0, standing 9 mm over the naturals, shorter)
  const white = make((mb) => bbox(mb, [0.0006, -0.022, CASE_Z[1] + 0.002], [WHITE_W - 0.0006, 0, KEY_Z1], CERAMIC, 0.0012));
  const black = make((mb) => bbox(mb, [-0.3 * PITCH, -0.004, CASE_Z[1] + 0.002], [0.3 * PITCH, 0.009, CASE_Z[1] + 0.095], M.ebony, 0.0012));
  // a slot's light: a bar one metre tall on the blade's face, scaled to its slot
  const light = make((mb) => box(mb, [-0.5, 0, 0], [0.5, 1, 0.0008], CERAMIC));
  const bx = boxOf([statics]);
  const c: Vec3 = [(bx.lo[0] + bx.hi[0]) / 2, (bx.lo[1] + bx.hi[1]) / 2, 0];
  const r = 0.5 * Math.hypot(bx.hi[0] - bx.lo[0], bx.hi[1] - bx.lo[1], 0.6) + 0.02;
  // (the instrument's middle over the stage's: the mast at the audience's left)
  const T = translate(-c[0], 0, 0);
  const model: ZephyrModel = { T, statics: [statics], white, black, light, height: bx.hi[1] - bx.lo[1], boardDepth: CASE_Z[1] - CASE_Z[0], ribbons: n, keys: KEY_AT.length, bounds: { c: xform(T, [c[0], c[1], 0]), r } };
  if (typeof window !== 'undefined') (window as unknown as { __zephyr3d?: unknown }).__zephyr3d = { bounds: model.bounds, state: () => stageState };
  return model;
}

const hex = (h: string, a = 1): RGBA => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, a];
const INK = { c: hex('#d9a05c'), natural: hex('#dedad0'), sharp: hex('#4a5670') };
/** a ribbon as a wire: never finer than the eye can find at the top of the compass */
const gauge = (i: number): number => Math.max(0.0011, RIBBONS[i].width * 0.85);

/** what the stage last drew of the single zephyr (tests): each ribbon's swing (m), each key's dip (m), how
 *  many ribbons swing and how many slots are lit */
let stageState: { swing: number[]; dip: number[]; ringing: number; lit: number } | null = null;
const SEG = 16;
const pts: Vec3[] = Array.from({ length: SEG + 1 }, () => [0, 0, 0]);
const two: Vec3[] = [[0, 0, 0], [0, 0, 0]];
const KM = new Float32Array(16);
const PM = new Float32Array(16);
const AIR: RGBA = [0.62, 0.84, 1, 0];
/** each scene's keys as drawn: eased towards down or up */
const dips = new WeakMap<ZephyrModel, { d: Float32Array; t: number }>();

export function poseZephyr(b: Batch, zm: ZephyrModel, fr: VisualFrame | null, _dt: number, now: number, T: Mat4 = zm.T): void {
  for (const s of zm.statics) b.mesh(s, T);
  const zv = fr?.zephyr ?? null;
  const n = RIBBONS.length;
  let ks = dips.get(zm);
  if (!ks) dips.set(zm, (ks = { d: new Float32Array(n), t: now }));
  const dt = Math.min(0.1, Math.max(0, (now - ks.t) / 1000));
  ks.t = now;
  const kk = 1 - Math.exp(-dt / 0.02);
  const swing: number[] = [];
  const dip: number[] = [];
  let ringing = 0;
  let lit = 0;
  for (let i = 0; i < n; i++) {
    const x = RIBBON_X[i];
    const y0 = RIBBON_Y0[i];
    const y1 = RIBBON_Y1[i];
    const a = zv ? Math.min(1, zv.amp[i] ?? 0) : 0;
    const wind = zv ? Math.min(1.2, zv.wind[i] ?? 0) : 0;
    // (a fortissimo in the bass swings the ribbon's middle about a centimetre either way)
    const w = a > 0.004 ? Math.sqrt(a) * Math.min(0.016, 0.003 + 0.012 * RIBBONS[i].length) : 0;
    swing.push(w);
    const col = INK[kindOf(i)];
    const g = gauge(i);
    if (w > 0) {
      ringing++;
      const sh = zv?.shapes.find((s) => s.string === i)?.shape ?? null;
      let pk = 1e-12;
      if (sh) for (let q = 0; q < sh.length; q++) pk = Math.max(pk, Math.abs(sh[q]));
      for (let q = 0; q <= SEG; q++) {
        const u = q / SEG;
        // its own shape now (the loudest few), else its first mode's bow; it swings along the bridge, across
        // the wind
        const d = sh ? sh[Math.min(sh.length - 1, Math.round(u * (sh.length - 1)))] / pk : Math.sin(Math.PI * u) * Math.sin(now * 0.045 + i);
        pts[q] = xform(T, [x + d * w, y0 + (y1 - y0) * u, 0]);
      }
      b.wire(pts, col, g);
    } else {
      two[0] = xform(T, [x, y0, 0]);
      two[1] = xform(T, [x, y1, 0]);
      b.wire(two, col, g);
    }
    // its key: down while its slot blows
    const to = wind > 0.06 ? 1 : 0;
    ks.d[i] += (to - ks.d[i]) * kk;
    const k = KEY_AT[i];
    dip.push(ks.d[i] * DIP);
    KM.set(translate(k.x, KEYS_Y1 - ks.d[i] * DIP, 0));
    mulInto(PM, 0, T, KM);
    b.mesh(k.sharp ? zm.black : zm.white, PM);
    // its slot's light: as tall as the slot, as bright as its wind
    if (wind > 0.06) {
      lit++;
      const [sa, sb] = slotY(i);
      // (the stored frame has the plan's z turned over: the blade's face, behind the ribbons, is at +z here)
      KM.set(translate(x, sa, -(BLADE_Z[1] + 0.0008)));
      KM[0] = Math.max(0.004, 2.4 * RIBBONS[i].width);
      KM[5] = sb - sa;
      mulInto(PM, 0, T, KM);
      AIR[3] = Math.min(1, 0.35 + 0.65 * wind);
      b.mesh(zm.light, PM, AIR);
    }
  }
  if (T === zm.T) stageState = { swing, dip, ringing, lit };
}
