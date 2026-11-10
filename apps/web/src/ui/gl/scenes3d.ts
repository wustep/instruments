// The instruments in 3D, built once per instrument as real instruments (piano3d, strings3d,
// winds3d) and posed every frame from the engine's live state (the same visual frames the 2D stage
// draws): keys, actions, hammers and dampers, the lid and pedals, string displacement, the bow and
// stopping points with their vibrato, the flute's cups and breath, the trumpet's valves and lips. Units are
// metres; y is up.
import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { AutoScale, type BowedGeom } from '../stage-draw.ts';
import type { PianoState } from '../piano-draw.ts';
import { chain, rotY, rotZ, translate, type Batch, type Mat4, type Mesh, type Vec3 } from './gl3d.ts';
import { buildGrandModel, buildUprightModel, newPianoPose, pianoPickSegments, pianoStrings, posePiano, type PianoModel, type PianoPose } from './piano3d.ts';
import { buildBowedModel, poseBowed, type BowedModel } from './strings3d.ts';
import { buildFluteModel, buildTrumpetModel, newWindPose, poseFlute, poseTrumpet, type FluteModel, type TrumpetModel, type WindPose } from './winds3d.ts';
import { buildOboeModel, poseOboe, type OboeModel } from './oboe3d.ts';
import { buildClarinetModel, poseClarinet, type ClarinetModel } from './clarinet3d.ts';
import { BASSOON_SEAT, BASSOON_VIEW, BASSOON_WIDE, buildBassoonModel, poseBassoon, type BassoonModel } from './bassoon3d.ts';
import { HORN_HELD, HORN_SEAT, HORN_VIEW, buildHornModel, poseHorn, type HornModel } from './horn3d.ts';
import { TROMBONE_SEAT, TROMBONE_VIEW, buildTromboneModel, poseTrombone, tromboneSizeIn, type TromboneModel } from './trombone3d.ts';
import { TIMPANI_SEAT, TIMPANI_VIEW, buildTimpaniModel, newTimpaniPose, poseTimpani, type TimpaniModel, type TimpaniPose } from './timpani3d.ts';
import { seatPlaces } from '../../orchestra/seats.ts';

export { keyX3 } from './piano3d.ts';

export interface SceneIn {
  fr: VisualFrame | null;
  now: number;
  /** seconds since the last frame */
  dt: number;
  family: 'piano' | 'bowed' | 'wind' | 'reed' | 'brass' | 'percussion';
  /** the reed family's instrument (default the oboe) */
  reed?: 'oboe' | 'clarinet' | 'bassoon';
  /** the brass family's (default the trumpet) */
  brass?: 'trumpet' | 'horn' | 'trombone';
  /** a trombone's size as the stage set it (its Size knob; the frame's own, when it carries one, wins) */
  tromboneSize?: 'alto' | 'tenor' | 'bass';
  kind: 'grand' | 'upright';
  keys: KeySummary[];
  piano: PianoState;
  bowed: BowedGeom | null;
  lid: number;
  room: number;
  rms: number;
  /** which keys are held (the piano's keys dip) */
  down: (m: number) => boolean;
  /** lighter scenes for slow devices */
  lite: boolean;
  /** pianos: the case hidden (the plate, strings, soundboard, keys and action stay) */
  caseHidden?: boolean;
  /** pianos: a key's action close up, and the section that cuts away the keys in front of it */
  zoomKey?: number | null;
  cut?: { at: number; side: 1 | -1 } | null;
  /** orchestra mode: several instruments, each from its own engine (the fields above are unused) */
  ensemble?: EnsPartIn[] | null;
  /** the stage's width over its height (an ensemble's seating and framing follow it) */
  aspect?: number;
}

/** one instrument of an ensemble on the 3D stage */
export interface EnsPartIn {
  family: 'piano' | 'bowed' | 'wind' | 'reed' | 'brass' | 'percussion';
  /** the reed family's instrument (default the oboe) */
  reed?: 'oboe' | 'clarinet' | 'bassoon';
  /** the brass family's (default the trumpet) */
  brass?: 'trumpet' | 'horn' | 'trombone';
  /** a trombone's size (its seat's, for its lines) */
  tromboneSize?: 'alto' | 'tenor' | 'bass';
  kind: 'grand' | 'upright';
  fr: VisualFrame | null;
  keys: KeySummary[];
  piano: PianoState;
  bowed: BowedGeom | null;
  down: (m: number) => boolean;
}

/** where the camera looks and from how far, per instrument */
export interface View3 {
  target: Vec3;
  dist: number;
  yaw: number;
  pitch: number;
  /** on a narrow stage (a phone held upright) the bearing may turn up to this much further round, to
   *  whichever angle shows the instrument largest (stage3d's home view) */
  swing?: number;
  /** framed whole on every stage, a wide one too (a wide stage otherwise keeps the view as given,
   *  cropped like a photograph): the nearest camera on this bearing that shows all of it, clear of
   *  the file player (stage3d's home view, fit3d.ts) */
  whole?: boolean;
}

export interface Scene3State {
  str: AutoScale;
  env: Float32Array;
  grand: PianoModel | null;
  upright: PianoModel | null;
  bowedM: Map<string, BowedModel>;
  flute: FluteModel | null;
  trumpet: TrumpetModel | null;
  oboe: OboeModel | null;
  clarinet: ClarinetModel | null;
  bassoon: BassoonModel | null;
  horn: HornModel | null;
  /** the trombones, by size (alto, tenor, bass: one model at each one's measures), built on first use */
  trombones: Map<string, TromboneModel>;
  timpani: TimpaniModel | null;
  /** the single stage's timpani (their heads move: each set its own) */
  timpPose: TimpaniPose;
  floors: Map<string, Mesh>;
  pianoPose: PianoPose;
  windPose: WindPose;
  /** milliseconds spent building models (kept out of the frame budget) */
  buildMs: number;
  /** the current scene's pick segments (piano strings) */
  picks: { midi: number; a: Vec3; b: Vec3 }[];
  /** the bowed strings' bow as posed this frame (world: the hair's frog and tip ends), else null */
  bowLine: { a: Vec3; b: Vec3; pos: number } | null;
  /** an ensemble's instruments, by seat: each its own pose (the meshes are shared with the single
   *  instrument's model: two violins are one violin's meshes drawn twice) */
  ens: EnsSeat[];
  /** the room's light: the output's level, eased (0 … 1) */
  poolLevel: number;
}
interface EnsSeat {
  key: string;
  bowed: BowedModel | null;
  pianoPose: PianoPose;
  windPose: WindPose;
  timpPose: TimpaniPose | null;
  str: AutoScale;
}
export const newScene3State = (): Scene3State => ({
  str: new AutoScale(2e-6, 0.99),
  env: new Float32Array(0),
  grand: null,
  upright: null,
  bowedM: new Map(),
  flute: null,
  trumpet: null,
  oboe: null,
  clarinet: null,
  bassoon: null,
  horn: null,
  trombones: new Map(),
  timpani: null,
  timpPose: newTimpaniPose(),
  floors: new Map(),
  pianoPose: newPianoPose(),
  windPose: newWindPose(),
  buildMs: 0,
  picks: [],
  bowLine: null,
  ens: [],
  poolLevel: 0,
});


const timed = <T>(st: Scene3State, f: () => T): T => {
  const t0 = performance.now();
  const r = f();
  st.buildMs += performance.now() - t0;
  return r;
};

/** the model for the scene, built on first use (and again if the piano's string scale changes) */
function pianoModel(si: SceneIn, st: Scene3State): PianoModel | null {
  if (!si.keys.length) return null;
  const sig = si.keys.map((k) => `${k.lengthM.toFixed(3)}${k.nStrings}${k.hasDamper ? 1 : 0}`).join('');
  if (si.kind === 'grand') {
    if (!st.grand || st.grand.sig !== sig) st.grand = timed(st, () => caseParts(buildGrandModel(si.keys)));
    return st.grand;
  }
  if (!st.upright || st.upright.sig !== sig) st.upright = timed(st, () => caseParts(buildUprightModel(si.keys)));
  return st.upright;
}
/** a piano's box: its case and everything fixed inside it (from the meshes, once per model) */
const boxes = new WeakMap<PianoModel, { lo: Vec3; hi: Vec3 }>();
function modelBox(pm: PianoModel): { lo: Vec3; hi: Vec3 } {
  let bx = boxes.get(pm);
  if (bx) return bx;
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const m of [...pm.statics, ...pm.cases]) {
    const d = m.data;
    for (let i = 0; i < m.count; i++)
      for (let k = 0; k < 3; k++) {
        const v = d[i * 14 + k];
        if (v < lo[k]) lo[k] = v;
        if (v > hi[k]) hi[k] = v;
      }
  }
  bx = { lo, hi };
  boxes.set(pm, bx);
  return bx;
}
/** the lid, the music desk and (a grand's) pedals dissolve with the case: their shadows too */
function caseParts(pm: PianoModel): PianoModel {
  for (const m of [pm.lid, pm.desk, ...(pm.pedalsCase ? pm.pedals.map((p) => p.mesh) : [])]) if (m) m.fade = true;
  return pm;
}

/** The room's light pool round an instrument of radius `r` (its bounds): its radius for the room
 *  parameter (0 … 1, the reverberation time 0.7 … 2.4 s; the room's grip sets it). A radius of 0.75 r
 *  in the driest room, 1.5 r in the largest; in the default rooms (0.14 … 0.25) it lights the floor
 *  about as far as the floor's glow reached before the pool. */
export const poolRadius = (r: number, room: number): number => r * (0.75 + 0.75 * Math.min(1, Math.max(0, room)));
/** the floor under the instrument (the renderer draws it: shadowed, fading into the ground), and the
 *  room's light on it (none in an ensemble: its parts' rooms are their own) */
function floor(b: Batch, st: Scene3State, _key: string, c: Vec3, r: number, si: SceneIn | null): void {
  if (!si) {
    b.floor = { y: 0, c: [c[0], 0, c[2]], r0: r * 0.45, r1: r * 1.6, pool: null };
    return;
  }
  // the pool's light follows the sound in the room: the output's level (its reverberation's tail
  // too), quick up and a little smoothed down (the room's own decay is in the level already)
  const db = 20 * Math.log10(Math.max(1e-6, si.rms));
  const lvl = Math.min(1, Math.max(0, (db + 50) / 36));
  st.poolLevel += (lvl - st.poolLevel) * (1 - Math.exp(-si.dt / (lvl > st.poolLevel ? 0.03 : 0.12)));
  const R = poolRadius(r, si.room);
  // the floor is whole inside the pool and fades into the ground past it
  b.floor = { y: 0, c: [c[0], 0, c[2]], r0: R * 0.92, r1: R + 0.6 * r, pool: { R, soft: Math.max(0.02, R * 0.09), lift: 0.22 * st.poolLevel } };
}

/** build this frame's scene */
export function buildScene(b: Batch, si: SceneIn, st: Scene3State): void {
  st.bowLine = null;
  st.picks = [];
  if (si.ensemble?.length) return buildEnsemble(b, si, si.ensemble, st);
  if (si.family === 'piano') {
    const pm = pianoModel(si, st);
    if (!pm) return;
    const cut = si.cut ?? null;
    posePiano(b, pm, { piano: si.piano, keys: si.keys, dt: si.dt, lid: si.lid, down: si.down, lite: si.lite, caseHidden: si.caseHidden, zoomKey: si.zoomKey, cut }, st.pianoPose);
    pianoStrings(b, pm, si.fr, (mx) => st.str.of(mx), si.lite, cut);
    b.clip = cut;
    st.picks = pianoPickSegments(pm);
    b.bounds = pm.bounds;
    b.keepOut = modelBox(pm);
    floor(b, st, pm.kind, pm.bounds.c, pm.bounds.r, si);
    return;
  }
  if (si.family === 'bowed' && si.bowed) {
    let bm = st.bowedM.get(si.bowed.id);
    if (!bm) {
      const g = si.bowed;
      bm = timed(st, () => buildBowedModel(g));
      st.bowedM.set(si.bowed.id, bm);
    }
    poseBowed(b, bm, si.fr, st.str);
    st.bowLine = bm.bowLine;
    b.bounds = bm.bounds;
    floor(b, st, bm.id, bm.bounds.c, bm.bounds.r, si);
    return;
  }
  if (si.family === 'percussion') {
    if (!st.timpani) st.timpani = timed(st, () => buildTimpaniModel());
    poseTimpani(b, st.timpani, si.fr, st.timpPose, si.dt, si.now);
    b.bounds = st.timpani.bounds;
    floor(b, st, 'timpani', st.timpani.bounds.c, st.timpani.bounds.r, si);
    return;
  }
  if (si.family === 'brass' && si.brass === 'horn') {
    if (!st.horn) st.horn = timed(st, () => buildHornModel());
    poseHorn(b, st.horn, si.fr, st.windPose, si.dt, si.now, si.rms);
    b.bounds = st.horn.bounds;
    floor(b, st, 'horn', st.horn.bounds.c, st.horn.bounds.r, si);
    return;
  }
  if (si.family === 'brass' && si.brass === 'trombone') {
    const tm = tromboneModel(st, tromboneSizeIn(si.fr, si.tromboneSize));
    poseTrombone(b, tm, si.fr, st.windPose, si.dt, si.now, si.rms, tm.T, si.tromboneSize, (si.aspect ?? 2) >= 1.4);
    b.bounds = tm.bounds;
    floor(b, st, 'trombone', tm.bounds.c, tm.bounds.r, si);
    return;
  }
  if (si.family === 'brass') {
    if (!st.trumpet) st.trumpet = timed(st, () => buildTrumpetModel());
    poseTrumpet(b, st.trumpet, si.fr, st.windPose, si.dt, si.now, si.rms);
    b.bounds = st.trumpet.bounds;
    floor(b, st, 'trumpet', st.trumpet.bounds.c, st.trumpet.bounds.r, si);
    return;
  }
  if (si.family === 'reed' && si.reed === 'clarinet') {
    if (!st.clarinet) st.clarinet = timed(st, () => buildClarinetModel());
    poseClarinet(b, st.clarinet, si.fr, st.windPose, si.dt, si.now, si.rms);
    b.bounds = st.clarinet.bounds;
    floor(b, st, 'clarinet', st.clarinet.bounds.c, st.clarinet.bounds.r, si);
    return;
  }
  if (si.family === 'reed' && si.reed === 'bassoon') {
    if (!st.bassoon) st.bassoon = timed(st, () => buildBassoonModel());
    // (upright on a tall stage, leaned across as it is played on a wide one)
    const wide = (si.aspect ?? 2) >= BASSOON_WIDE;
    poseBassoon(b, st.bassoon, si.fr, st.windPose, si.dt, si.now, si.rms, wide ? st.bassoon.Tw : st.bassoon.T);
    b.bounds = wide ? st.bassoon.boundsW : st.bassoon.bounds;
    floor(b, st, 'bassoon', b.bounds.c, b.bounds.r, si);
    return;
  }
  if (si.family === 'reed') {
    if (!st.oboe) st.oboe = timed(st, () => buildOboeModel());
    poseOboe(b, st.oboe, si.fr, st.windPose, si.dt, si.now, si.rms);
    b.bounds = st.oboe.bounds;
    floor(b, st, 'oboe', st.oboe.bounds.c, st.oboe.bounds.r, si);
    return;
  }
  if (!st.flute) st.flute = timed(st, () => buildFluteModel());
  poseFlute(b, st.flute, si.fr, st.windPose, si.dt, si.now);
  b.bounds = st.flute.bounds;
  floor(b, st, 'flute', st.flute.bounds.c, st.flute.bounds.r, si);
  return;
}

/** a trombone of a size, built on first use */
function tromboneModel(st: Scene3State, size: string): TromboneModel {
  let tm = st.trombones.get(size);
  if (!tm) {
    tm = timed(st, () => buildTromboneModel(size as 'alto' | 'tenor' | 'bass'));
    st.trombones.set(size, tm);
  }
  return tm;
}

/** default cameras: a three-quarter view from the audience's side, a little above */
export function viewFor(si: SceneIn, st: Scene3State): View3 {
  if (si.ensemble?.length) return ensembleView(si.ensemble, si.aspect);
  // the grand from the treble front corner (as in Steinway's own photographs), above the rim so the
  // plate and strings show; the upright from the treble side, a little above the keys, into the action
  // (an upright is wider than it is tall: on a phone held upright it is seen from further round its
  // treble end, where it is as tall as the stage)
  if (si.family === 'piano') return si.kind === 'grand' ? { target: [-0.12, 0.58, 1.0], dist: 3.8, yaw: 0.74, pitch: 0.33 } : { target: [0, 0.62, 0.25], dist: 2.8, yaw: 0.45, pitch: 0.26, swing: 0.36 };
  if (si.family === 'bowed' && si.bowed) {
    const id = si.bowed.id;
    // the cello: from its bass side, a little below centre, the scroll against the rim light
    if (id === 'cello') return { target: [0, 0.78, 0.08], dist: 2.25, yaw: 0.62, pitch: 0.07 };
    // the double bass: as the cello, from its bass side a little below centre, the scroll against the
    // rim light; whole on every stage, scroll to endpin (it stands 1.94 m: cropped as the cello is on
    // a wide stage, it lost the scroll under the file player and the endpin under the stage's edge)
    if (id === 'bass') return { target: [0, 0.97, 0.1], dist: 3.6, yaw: 0.62, pitch: 0.07, whole: true };
    const bm = st.bowedM.get(id);
    const c = bm ? bm.bounds.c : ([0, 0.25, 0] as Vec3);
    // the violin and viola: from the scroll's side, low enough that the instrument reads in three-quarter
    // (not as a plan) and the bow, crossing the strings, lies into the picture instead of standing up
    // through its top and bottom edges
    return { target: [c[0], c[1] - 0.025, c[2]], dist: id === 'viola' ? 0.95 : 0.86, yaw: -0.5, pitch: 0.42 };
  }
  // the horn: from the player's side (the levers, the linkage), round towards the bell's mouth, a little
  // above, whole on every stage (horn3d.ts sets its pose)
  if (si.family === 'brass' && si.brass === 'horn') {
    const c = st.horn ? st.horn.bounds.c : ([0.06, 0.33, 0] as Vec3);
    // (on a phone held upright it may turn round towards the bell's mouth, which shortens the bell across
    // the picture: horn3d.ts HORN_VIEW.swing)
    return { target: [c[0], c[1], c[2]], dist: 1.1, yaw: HORN_VIEW.yaw, pitch: HORN_VIEW.pitch, swing: HORN_VIEW.swing, whole: true };
  }
  // the trombone: three-quarter from the bell's side, a little in front of it and above, the slide
  // running away past the bell (trombone3d.ts sets its pose); whole on every stage, framed with the
  // slide all the way out (seventh position), so a note never carries it out of the picture
  if (si.family === 'brass' && si.brass === 'trombone') {
    const tm = st.trombones.get(tromboneSizeIn(si.fr, si.tromboneSize));
    const c = tm ? tm.bounds.c : ([0, 0.3, 0] as Vec3);
    // (a narrow stage, a phone held upright, frames the slide all the way out, and may turn round towards the
    // bell's mouth, where its reach runs down the picture rather than across it: TROMBONE_VIEW.swing)
    return { target: [c[0], c[1], c[2]], dist: 1.6, yaw: TROMBONE_VIEW.yaw, pitch: TROMBONE_VIEW.pitch, swing: TROMBONE_VIEW.swing, whole: true };
  }
  if (si.family === 'brass') return { target: [0.0, 0.2, 0.0], dist: 0.6, yaw: 0.4, pitch: 0.28 };
  // the timpani: from the audience's side, round towards the big drums' end, a little above (the heads
  // as ellipses, the end drum's pedal and gauge past its kettle), whole on every stage (timpani3d.ts)
  if (si.family === 'percussion') {
    const c = st.timpani ? st.timpani.bounds.c : ([0, 0.5, 0] as Vec3);
    return { target: [c[0], 0.5, c[2]], dist: 4.2, yaw: TIMPANI_VIEW.yaw, pitch: TIMPANI_VIEW.pitch, swing: TIMPANI_VIEW.swing, whole: true };
  }
  // the oboe: held as a player holds it, seen from the audience a little to the bell's side and a
  // little above, the plates and the keywork towards the camera
  // the clarinet: as the oboe is seen (clarinet3d.ts sets its own pose)
  if (si.family === 'reed' && si.reed === 'clarinet') {
    const c = st.clarinet ? st.clarinet.bounds.c : ([0, 0.3, 0] as Vec3);
    return { target: [c[0], c[1], c[2]], dist: 0.82, yaw: 0.22, pitch: 0.16, whole: true };
  }
  // the bassoon: standing, from the audience's side a little round towards its long joint's outside
  // and a little above: the wing's finger holes and the long joint's thumb keys at its edge, the bocal
  // arcing away (bassoon3d.ts sets its own pose)
  if (si.family === 'reed' && si.reed === 'bassoon') {
    const wide = (si.aspect ?? 2) >= BASSOON_WIDE;
    const bd = st.bassoon ? (wide ? st.bassoon.boundsW : st.bassoon.bounds) : null;
    const c = bd ? bd.c : ([0, 0.67, 0] as Vec3);
    return { target: [c[0], c[1], c[2]], dist: 2.2, yaw: wide ? BASSOON_VIEW.wide : BASSOON_VIEW.tall, pitch: 0.12, whole: true };
  }
  if (si.family === 'reed') {
    const c = st.oboe ? st.oboe.bounds.c : ([0, 0.3, 0] as Vec3);
    return { target: [c[0], c[1], c[2]], dist: 0.78, yaw: 0.22, pitch: 0.16, whole: true };
  }
  return { target: [0.0, 0.17, 0.0], dist: 0.68, yaw: 0.24, pitch: 0.5 };
}


// ================================================================ orchestra mode
/** where an ensemble's instruments sit: the melodic ones on an arc opening towards the audience (the
 *  first at the audience's left, as a quartet sits: first violin, second, viola, cello), held about
 *  where a seated player holds them, each turned to show its best side (the single instrument's hero
 *  angle); the pianos behind, side-on with the lid open towards the audience. A tall, narrow stage (a
 *  phone held upright) seats them in two rows. */
export interface Seat {
  T: Mat4;
  /** the seat's footprint centre (x, z), a radius and the instrument's height, for the floor and the framing */
  c: Vec3;
  r: number;
  top: number;
}
/** a held instrument's lift above its single-instrument pose (m) */
const HELD = 0.42;
type SeatIn = Pick<EnsPartIn, 'family' | 'kind' | 'bowed'> & { reed?: EnsPartIn['reed']; brass?: EnsPartIn['brass'] };
export function ensembleSeats(parts: SeatIn[], aspect = 2): Seat[] {
  const places = seatPlaces(
    parts.map((p) => ({ family: p.family, kind: p.kind, cello: p.family === 'bowed' && (p.bowed?.id === 'cello' || p.bowed?.id === 'bass'), bass: p.family === 'bowed' && p.bowed?.id === 'bass' })),
    aspect,
  );
  return parts.map((p, i) => {
    const { x, z, face } = places[i];
    if (p.family === 'piano') {
      // a grand side-on, its open lid towards the audience; an upright faces them
      const T = p.kind === 'grand' ? chain(translate(x - 1.0, 0, z), rotY(Math.PI / 2)) : chain(translate(x, 0, z - 0.1), rotY(Math.PI));
      return { T, c: [x, 0, z], r: 1.05, top: 1.75 };
    }
    // held about where a seated player holds it, turned to its hero angle (the single instrument's
    // camera yaw); the renderer's world is mirrored in x: −x is the audience's left
    const cello = p.family === 'bowed' && (p.bowed?.id === 'cello' || p.bowed?.id === 'bass');
    const bass = p.family === 'bowed' && p.bowed?.id === 'bass';
    const wind = p.family !== 'bowed';
    // (a bassoon is held diagonally, its boot by the seated player's right thigh, its bell up past the
    // left shoulder: bassoon3d.ts BASSOON_SEAT)
    if (p.family === 'reed' && p.reed === 'bassoon') return { T: chain(translate(x, BASSOON_SEAT.y, z), rotY(face + BASSOON_SEAT.turn), rotZ(BASSOON_SEAT.lean)), c: [x, 0, z], r: 0.42, top: BASSOON_SEAT.top };
    // (a horn is held as a seated player holds it: the valves up under the left hand, the bell down by
    // the right thigh, its mouth back: horn3d.ts HORN_SEAT)
    if (p.family === 'brass' && p.brass === 'horn') return { T: chain(translate(x, HORN_SEAT.y, z), rotY(face + HORN_SEAT.turn)), c: [x, 0, z], r: 0.42, top: HORN_SEAT.top };
    // (a trombone is held as a seated player holds it: the slide forward and a little down, the bell over
    // the left shoulder towards the audience: trombone3d.ts TROMBONE_SEAT, TROMBONE_HELD)
    if (p.family === 'brass' && p.brass === 'trombone') return { T: chain(translate(x, TROMBONE_SEAT.y, z), rotY(face + TROMBONE_SEAT.turn)), c: [x, 0, z + TROMBONE_SEAT.dz], r: TROMBONE_SEAT.r, top: TROMBONE_SEAT.top };
    // (the timpani stand on the floor in their arc, their player's place behind them: timpani3d.ts)
    if (p.family === 'percussion') return { T: chain(translate(x, 0, z), rotY(face)), c: [x, 0, z], r: TIMPANI_SEAT.r, top: TIMPANI_SEAT.top };
    let T: Mat4;
    if (cello) T = chain(translate(x, 0, z), rotY(face - 0.62));
    else if (p.family === 'bowed') T = chain(translate(x, HELD, z), rotY(face + 0.5));
    // (an oboe is held as the flute is, its middle level with the flute's, slanting down from the
    // player's mouth: its own model stands 0.13 m higher, oboe3d.ts OBOE_POSE)
    else if (p.family === 'reed') T = chain(translate(x, HELD + 0.4 - 0.13, z), rotY(face - 0.32));
    // (a flute or trumpet is held higher, level with the player's mouth)
    else T = chain(translate(x, HELD + 0.4, z), rotY(face - 0.3));
    // (a bass stands 1.97 m to its scroll's top, strings3d.ts SPEC.bass: framed to 2.15, headroom for
    // the scroll, the stage's highest point, under the file player; the oboe's reed reaches 1.17 m)
    return { T, c: [x, 0, z], r: bass ? 0.6 : cello ? 0.45 : 0.36, top: bass ? 2.15 : cello ? 1.5 : p.family === 'reed' ? HELD + 0.78 : wind ? HELD + 0.62 : HELD + 0.38 };
  });
}

function ensSeat(st: Scene3State, i: number, key: string): EnsSeat {
  let e = st.ens[i];
  if (!e || e.key !== key) e = st.ens[i] = { key, bowed: null, pianoPose: newPianoPose(), windPose: newWindPose(), timpPose: null, str: new AutoScale(2e-6, 0.99) };
  return e;
}

function buildEnsemble(b: Batch, si: SceneIn, parts: EnsPartIn[], st: Scene3State): void {
  const seats = ensembleSeats(parts, si.aspect);
  st.ens.length = Math.min(st.ens.length, parts.length);
  const lo: Vec3 = [Infinity, 0, Infinity];
  const hi: Vec3 = [-Infinity, 1.5, -Infinity];
  parts.forEach((p, i) => {
    const seat = seats[i];
    const key = p.family === 'piano' ? p.kind : p.family === 'bowed' ? (p.bowed?.id ?? 'bowed') : p.family === 'reed' ? (p.reed ?? 'oboe') : p.family === 'brass' ? (p.brass ?? 'trumpet') : p.family;
    const e = ensSeat(st, i, key);
    b.world = seat.T;
    if (p.family === 'piano') {
      const pm = pianoModel({ ...si, kind: p.kind, keys: p.keys }, st);
      if (pm) {
        const m0 = b.mirrors.length;
        posePiano(b, pm, { piano: p.piano, keys: p.keys, dt: si.dt, lid: 1, down: p.down, lite: si.lite, caseHidden: false, zoomKey: null, cut: null }, e.pianoPose);
        pianoStrings(b, pm, p.fr, (mx) => e.str.of(mx), si.lite, null);
        // the lid's mirror is in the piano's own frame: placed on its seat
        for (let j = m0; j < b.mirrors.length; j++) b.mirrors[j] = { ...b.mirrors[j], m: chain(seat.T, b.mirrors[j].m) };
      }
    } else if (p.family === 'bowed' && p.bowed) {
      let bm = st.bowedM.get(p.bowed.id);
      if (!bm) {
        const g = p.bowed;
        bm = timed(st, () => buildBowedModel(g));
        st.bowedM.set(p.bowed.id, bm);
      }
      // the model's meshes, this seat's own bow
      if (!e.bowed || e.bowed.meshes !== bm.meshes) e.bowed = { ...bm, bowPose: null, bowLine: null };
      poseBowed(b, e.bowed, p.fr, e.str);
    } else if (p.family === 'percussion') {
      if (!st.timpani) st.timpani = timed(st, () => buildTimpaniModel());
      if (!e.timpPose) e.timpPose = newTimpaniPose();
      poseTimpani(b, st.timpani, p.fr, e.timpPose, si.dt, si.now, null, false);
    } else if (p.family === 'brass' && p.brass === 'horn') {
      if (!st.horn) st.horn = timed(st, () => buildHornModel());
      poseHorn(b, st.horn, p.fr, e.windPose, si.dt, si.now, si.rms, HORN_HELD);
    } else if (p.family === 'brass' && p.brass === 'trombone') {
      const tm = tromboneModel(st, tromboneSizeIn(p.fr, p.tromboneSize));
      poseTrombone(b, tm, p.fr, e.windPose, si.dt, si.now, si.rms, tm.held, p.tromboneSize);
    } else if (p.family === 'brass') {
      if (!st.trumpet) st.trumpet = timed(st, () => buildTrumpetModel());
      poseTrumpet(b, st.trumpet, p.fr, e.windPose, si.dt, si.now, si.rms);
    } else if (p.family === 'reed' && p.reed === 'clarinet') {
      if (!st.clarinet) st.clarinet = timed(st, () => buildClarinetModel());
      poseClarinet(b, st.clarinet, p.fr, e.windPose, si.dt, si.now, si.rms);
    } else if (p.family === 'reed' && p.reed === 'bassoon') {
      if (!st.bassoon) st.bassoon = timed(st, () => buildBassoonModel());
      poseBassoon(b, st.bassoon, p.fr, e.windPose, si.dt, si.now, si.rms);
    } else if (p.family === 'reed') {
      if (!st.oboe) st.oboe = timed(st, () => buildOboeModel());
      poseOboe(b, st.oboe, p.fr, e.windPose, si.dt, si.now, si.rms);
    } else {
      if (!st.flute) st.flute = timed(st, () => buildFluteModel());
      poseFlute(b, st.flute, p.fr, e.windPose, si.dt, si.now);
    }
    b.world = null;
    for (const k of [0, 2]) {
      lo[k] = Math.min(lo[k], seat.c[k] - seat.r);
      hi[k] = Math.max(hi[k], seat.c[k] + seat.r);
    }
  });
  const c: Vec3 = [(lo[0] + hi[0]) / 2, 0.6, (lo[2] + hi[2]) / 2];
  const r = Math.max(1, 0.5 * Math.hypot(hi[0] - lo[0], hi[2] - lo[2], 1.5));
  b.bounds = { c, r };
  floor(b, st, 'ensemble', c, r, null);
}

/** the camera for an ensemble: from the audience, a little above the players, every instrument in
 *  frame. Each seat's box is projected through the stage's lens (24° vertical; the views' distances are
 *  in units stage3d scales by FRAME) and the distance found that fits them all. */
const ENS_FOV = (24 * Math.PI) / 180;
const ENS_FRAME = Math.tan(0.3) / Math.tan(ENS_FOV / 2);
export function ensembleView(parts: EnsPartIn[], aspect = 2): View3 {
  const seats = ensembleSeats(parts, aspect);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let top = 0;
  for (const s of seats) {
    x0 = Math.min(x0, s.c[0] - s.r);
    x1 = Math.max(x1, s.c[0] + s.r);
    z0 = Math.min(z0, s.c[2] - s.r);
    z1 = Math.max(z1, s.c[2] + s.r);
    top = Math.max(top, s.top);
  }
  const yaw = 0;
  const pitch = parts.some((p) => p.family === 'piano') ? 0.42 : top > 1.5 ? 0.36 : 0.32;
  const target: Vec3 = [(x0 + x1) / 2, top * 0.42, (z0 + z1) / 2];
  const dir: Vec3 = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
  const f: Vec3 = [-dir[0], -dir[1], -dir[2]];
  const rl = Math.hypot(f[2], f[0]) || 1;
  const r: Vec3 = [-f[2] / rl, 0, f[0] / rl];
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const tanV = Math.tan(ENS_FOV / 2);
  const tanH = tanV * Math.max(0.4, aspect);
  const pts: Vec3[] = [];
  for (const s of seats) for (const dx of [-1, 1]) for (const dz of [-1, 1]) for (const y of [0, s.top]) pts.push([s.c[0] + dx * s.r, y, s.c[2] + dz * s.r]);
  /** the points' extent on screen (NDC) from distance D */
  const extent = (D: number) => {
    const E: Vec3 = [target[0] + D * dir[0], target[1] + D * dir[1], target[2] + D * dir[2]];
    let xm = 0;
    let y0 = Infinity;
    let y1 = -Infinity;
    let near = Infinity;
    for (const P of pts) {
      const v: Vec3 = [P[0] - E[0], P[1] - E[1], P[2] - E[2]];
      const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
      near = Math.min(near, z);
      xm = Math.max(xm, Math.abs((v[0] * r[0] + v[2] * r[2]) / (z * tanH)));
      const y = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / (z * tanV);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { xm, y0, y1, near };
  };
  const fit = () => {
    let lo = 0.5;
    let hi = 40;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      const e = extent(mid);
      if (e.near > 0.2 && e.xm <= 0.96 && e.y1 - e.y0 <= 1.86) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  // fit, centre the picture vertically (the near floor reaches lower than the scrolls reach up), fit again
  let D = fit();
  for (let k = 0; k < 2; k++) {
    const e = extent(D);
    const mid = (e.y0 + e.y1) / 2;
    // a shift of the target along the screen's up by mid·tanV·(distance to the target)
    const sh = mid * tanV * D;
    for (let j = 0; j < 3; j++) target[j] += u[j] * sh;
    D = fit();
  }
  return { target, dist: D / ENS_FRAME, yaw, pitch };
}
