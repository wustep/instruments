// The instruments in 3D, built once per instrument as real instruments (piano3d, strings3d,
// winds3d) and posed every frame from the engine's live state (the same visual frames the 2D stage
// draws): keys, actions, hammers and dampers, the lid and pedals, string displacement, the bow and
// stopping points with their vibrato, the flute's cups and breath, the trumpet's valves and lips. Units are
// metres; y is up.
import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { AutoScale, type BowedGeom } from '../stage-draw.ts';
import type { PianoState } from '../piano-draw.ts';
import { type Batch, type Mesh, type Vec3 } from './gl3d.ts';
import { buildGrandModel, buildUprightModel, newPianoPose, pianoPickSegments, pianoStrings, posePiano, type PianoModel, type PianoPose } from './piano3d.ts';
import { buildBowedModel, poseBowed, type BowedModel } from './strings3d.ts';
import { buildFluteModel, buildTrumpetModel, newWindPose, poseFlute, poseTrumpet, type FluteModel, type TrumpetModel, type WindPose } from './winds3d.ts';

export { keyX3 } from './piano3d.ts';

export interface SceneIn {
  fr: VisualFrame | null;
  now: number;
  /** seconds since the last frame */
  dt: number;
  family: 'piano' | 'bowed' | 'wind' | 'brass';
  kind: 'grand' | 'upright';
  keys: KeySummary[];
  piano: PianoState;
  bowed: BowedGeom | null;
  lid: number;
  room: number;
  rms: number;
  /** which keys are held / really sounding (for the piano's keys) */
  down: (m: number) => boolean;
  sounding: (m: number) => boolean;
  /** lighter scenes for slow devices */
  lite: boolean;
  /** pianos: the case hidden (the plate, strings, soundboard, keys and action stay) */
  caseHidden?: boolean;
  /** pianos: a key's action close up, and the section that cuts away the keys in front of it */
  zoomKey?: number | null;
  cut?: { at: number; side: 1 | -1 } | null;
}

/** where the camera looks and from how far, per instrument */
export interface View3 {
  target: Vec3;
  dist: number;
  yaw: number;
  pitch: number;
}

export interface Scene3State {
  str: AutoScale;
  env: Float32Array;
  grand: PianoModel | null;
  upright: PianoModel | null;
  bowedM: Map<string, BowedModel>;
  flute: FluteModel | null;
  trumpet: TrumpetModel | null;
  floors: Map<string, Mesh>;
  pianoPose: PianoPose;
  windPose: WindPose;
  /** milliseconds spent building models (kept out of the frame budget) */
  buildMs: number;
  /** the current scene's pick segments (piano strings) */
  picks: { midi: number; a: Vec3; b: Vec3 }[];
  /** the bowed strings' bow as posed this frame (world: the hair's frog and tip ends), else null */
  bowLine: { a: Vec3; b: Vec3; pos: number } | null;
}
export const newScene3State = (): Scene3State => ({
  str: new AutoScale(2e-6, 0.99),
  env: new Float32Array(0),
  grand: null,
  upright: null,
  bowedM: new Map(),
  flute: null,
  trumpet: null,
  floors: new Map(),
  pianoPose: newPianoPose(),
  windPose: newWindPose(),
  buildMs: 0,
  picks: [],
  bowLine: null,
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

/** the floor under the instrument (the renderer draws it: shadowed, fading into the ground) */
function floor(b: Batch, _st: Scene3State, _key: string, c: Vec3, r: number): void {
  b.floor = { y: 0, c: [c[0], 0, c[2]], r0: r * 0.45, r1: r * 1.6 };
}

/** build this frame's scene */
export function buildScene(b: Batch, si: SceneIn, st: Scene3State): void {
  st.bowLine = null;
  st.picks = [];
  if (si.family === 'piano') {
    const pm = pianoModel(si, st);
    if (!pm) return;
    const cut = si.cut ?? null;
    posePiano(b, pm, { piano: si.piano, keys: si.keys, dt: si.dt, lid: si.lid, down: si.down, sounding: si.sounding, lite: si.lite, caseHidden: si.caseHidden, zoomKey: si.zoomKey, cut }, st.pianoPose);
    pianoStrings(b, pm, si.fr, (mx) => st.str.of(mx), si.lite, cut);
    b.clip = cut;
    st.picks = pianoPickSegments(pm);
    b.bounds = pm.bounds;
    b.keepOut = modelBox(pm);
    floor(b, st, pm.kind, pm.bounds.c, pm.bounds.r);
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
    floor(b, st, bm.id, bm.bounds.c, bm.bounds.r);
    return;
  }
  if (si.family === 'brass') {
    if (!st.trumpet) st.trumpet = timed(st, () => buildTrumpetModel());
    poseTrumpet(b, st.trumpet, si.fr, st.windPose, si.dt, si.now, si.rms);
    b.bounds = st.trumpet.bounds;
    floor(b, st, 'trumpet', st.trumpet.bounds.c, st.trumpet.bounds.r);
    return;
  }
  if (!st.flute) st.flute = timed(st, () => buildFluteModel());
  poseFlute(b, st.flute, si.fr, st.windPose, si.dt, si.now);
  b.bounds = st.flute.bounds;
  floor(b, st, 'flute', st.flute.bounds.c, st.flute.bounds.r);
  return;
}

/** On a narrow stage (a phone held upright) every view steps back to fit the width; these step back
 *  further: the flute and trumpet are all width, and the violin and viola keep the whole bow in the
 *  picture, as they did before the wide stage's view moved in. */
export function narrowStep(si: SceneIn): number {
  if (si.family === 'wind' || si.family === 'brass') return 1.28;
  if (si.family === 'bowed' && si.bowed && si.bowed.id !== 'cello') return 1.16;
  return 1;
}

/** default cameras: a three-quarter view from the audience's side, a little above */
export function viewFor(si: SceneIn, st: Scene3State): View3 {
  // the grand from the treble front corner (as in Steinway's own photographs), above the rim so the
  // plate and strings show; the upright from the treble side, a little above the keys, into the action
  if (si.family === 'piano') return si.kind === 'grand' ? { target: [-0.12, 0.58, 1.0], dist: 3.8, yaw: 0.74, pitch: 0.33 } : { target: [0, 0.62, 0.25], dist: 2.8, yaw: 0.45, pitch: 0.26 };
  if (si.family === 'bowed' && si.bowed) {
    const id = si.bowed.id;
    // the cello: from its bass side, a little below centre, the scroll against the rim light
    if (id === 'cello') return { target: [0, 0.78, 0.08], dist: 2.25, yaw: 0.62, pitch: 0.07 };
    const bm = st.bowedM.get(id);
    const c = bm ? bm.bounds.c : ([0, 0.25, 0] as Vec3);
    // the violin and viola: from the scroll's side, low enough that the instrument reads in three-quarter
    // (not as a plan) and the bow, crossing the strings, lies into the picture instead of standing up
    // through its top and bottom edges
    return { target: [c[0], c[1] - 0.025, c[2]], dist: id === 'viola' ? 0.95 : 0.86, yaw: -0.5, pitch: 0.42 };
  }
  if (si.family === 'brass') return { target: [0.0, 0.2, 0.0], dist: 0.6, yaw: 0.4, pitch: 0.28 };
  return { target: [0.0, 0.17, 0.0], dist: 0.68, yaw: 0.24, pitch: 0.5 };
}

