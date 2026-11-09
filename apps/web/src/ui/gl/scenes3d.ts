// The instruments in 3D, built once per instrument as real instruments (piano3d, strings3d,
// winds3d) and posed every frame from the engine's live state (the same visual frames the 2D stage
// draws): keys, actions, hammers and dampers, the lid and pedals, string displacement, the bow and
// stopping points with their vibrato, the flute's cups and breath, the trumpet's valves, lips and
// standing wave, and the room's wavefronts on the floor. Units are metres; y is up.
import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { AutoScale, INK, type BowedGeom } from '../stage-draw.ts';
import type { PianoState } from '../piano-draw.ts';
import { type Batch, type Mesh, type RGBA, type Vec3, ink } from './gl3d.ts';
import { boardOverlay, buildGrandModel, buildUprightModel, newPianoPose, pianoPickSegments, pianoStrings, posePiano, type PianoModel, type PianoPose } from './piano3d.ts';
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
  modes: AutoScale;
  wave: AutoScale;
  waves: { t0: number; amp: number }[];
  lastRms: number;
  lastSpawn: number;
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
}
export const newScene3State = (): Scene3State => ({
  str: new AutoScale(2e-6, 0.99),
  modes: new AutoScale(1e-9, 0.995),
  wave: new AutoScale(1e-6, 0.99),
  waves: [],
  lastRms: 0,
  lastSpawn: 0,
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
});

const C = {
  ivory: (a: number) => ink(INK.ivory, a),
  amber: (a: number) => ink(INK.amber, a),
};

function modeAmps(fr: VisualFrame | null, st: Scene3State): Float32Array {
  const out = new Float32Array(16);
  const m = fr?.modes;
  if (!m || !m.length) return out;
  let mx = 0;
  for (let i = 0; i < m.length; i++) mx = Math.max(mx, Math.abs(m[i]));
  const s = st.modes.of(mx);
  for (let i = 0; i < 16 && i < m.length; i++) out[i] = m[i] / s;
  return out;
}

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
    if (!st.grand || st.grand.sig !== sig) st.grand = timed(st, () => buildGrandModel(si.keys));
    return st.grand;
  }
  if (!st.upright || st.upright.sig !== sig) st.upright = timed(st, () => buildUprightModel(si.keys));
  return st.upright;
}

/** the floor under the instrument (the renderer draws it: shadowed, fading into the ground) */
function floor(b: Batch, _st: Scene3State, _key: string, c: Vec3, r: number): void {
  b.floor = { y: 0, c: [c[0], 0, c[2]], r0: r * 0.45, r1: r * 1.6 };
}

/** build this frame's scene; returns where sound leaves the instrument and the room's span */
export function buildScene(b: Batch, si: SceneIn, st: Scene3State): { src: Vec3; span: number } {
  st.picks = [];
  if (si.family === 'piano') {
    const pm = pianoModel(si, st);
    if (!pm) return { src: [0, 0, 0], span: 1 };
    posePiano(b, pm, { piano: si.piano, keys: si.keys, dt: si.dt, lid: si.lid, down: si.down, sounding: si.sounding, lite: si.lite }, st.pianoPose);
    boardOverlay(b, pm, modeAmps(si.fr, st));
    pianoStrings(b, pm, si.fr, (mx) => st.str.of(mx), si.lite);
    st.picks = pianoPickSegments(pm);
    b.bounds = pm.bounds;
    floor(b, st, pm.kind, pm.bounds.c, pm.bounds.r);
    return { src: pm.src, span: pm.kind === 'grand' ? 1.5 : 1.1 };
  }
  if (si.family === 'bowed' && si.bowed) {
    let bm = st.bowedM.get(si.bowed.id);
    if (!bm) {
      const g = si.bowed;
      bm = timed(st, () => buildBowedModel(g));
      st.bowedM.set(si.bowed.id, bm);
    }
    poseBowed(b, bm, si.fr, st.str, modeAmps(si.fr, st));
    b.bounds = bm.bounds;
    floor(b, st, bm.id, bm.bounds.c, bm.bounds.r);
    return { src: bm.src, span: bm.id === 'cello' ? 1.0 : 0.6 };
  }
  if (si.family === 'brass') {
    if (!st.trumpet) st.trumpet = timed(st, () => buildTrumpetModel());
    poseTrumpet(b, st.trumpet, si.fr, st.windPose, si.dt, si.now, si.rms, st.wave);
    b.bounds = st.trumpet.bounds;
    floor(b, st, 'trumpet', st.trumpet.bounds.c, st.trumpet.bounds.r);
    return { src: st.trumpet.src, span: 0.5 };
  }
  if (!st.flute) st.flute = timed(st, () => buildFluteModel());
  poseFlute(b, st.flute, si.fr, st.windPose, si.dt, si.now, st.wave);
  b.bounds = st.flute.bounds;
  floor(b, st, 'flute', st.flute.bounds.c, st.flute.bounds.r);
  return { src: st.flute.src, span: 0.55 };
}

/** default cameras: a three-quarter view from the audience's side, a little above */
export function viewFor(si: SceneIn, st: Scene3State): View3 {
  // the grand from the treble front corner (as in Steinway's own photographs), above the rim so the
  // plate and strings show; the upright from the treble side, a little above the keys, into the action
  if (si.family === 'piano') return si.kind === 'grand' ? { target: [-0.12, 0.58, 1.0], dist: 3.8, yaw: 0.74, pitch: 0.33 } : { target: [0, 0.62, 0.25], dist: 2.8, yaw: 0.45, pitch: 0.26 };
  if (si.family === 'bowed' && si.bowed) {
    const id = si.bowed.id;
    // the cello: from its bass side, a little below centre, the scroll against the rim light
    if (id === 'cello') return { target: [0, 0.76, 0.08], dist: 2.55, yaw: 0.62, pitch: 0.07 };
    const bm = st.bowedM.get(id);
    const c = bm ? bm.bounds.c : ([0, 0.25, 0] as Vec3);
    return { target: [c[0] - 0.05, c[1], c[2]], dist: id === 'viola' ? 0.86 : 0.76, yaw: 0.25, pitch: 0.6 };
  }
  if (si.family === 'brass') return { target: [0.0, 0.2, 0.0], dist: 0.6, yaw: 0.4, pitch: 0.28 };
  return { target: [0.0, 0.17, 0.0], dist: 0.68, yaw: 0.24, pitch: 0.5 };
}

// ---------------------------------------------------------------- the room: walls and wavefronts on the floor
export function buildRoom(b: Batch, si: SceneIn, st: Scene3State, src: Vec3, span: number, floorY: number): void {
  const size = 0.55 + 0.45 * si.room;
  const t60 = 0.7 + 1.7 * si.room;
  const half = span * (0.9 + 1.4 * size);
  const H = span * (0.6 + 0.6 * size);
  const corners: Vec3[] = [[src[0] - half, floorY, src[2] - half * 0.8], [src[0] + half, floorY, src[2] - half * 0.8], [src[0] + half, floorY, src[2] + half * 0.8], [src[0] - half, floorY, src[2] + half * 0.8]];
  // the room's outline: barely there (the wavefronts carry the room)
  b.loop(corners, C.ivory(0.025), 1);
  for (const c of corners) b.line([c, [c[0], floorY + H, c[2]]], C.ivory(0.012), 1);
  // fronts: spawned on onsets and while it sounds; they expand, fading with the room's T60
  const t = si.now / 1000;
  const jump = si.rms > st.lastRms * 1.35 + 1e-4;
  if ((jump && t - st.lastSpawn > 0.06) || (si.rms > 1e-3 && t - st.lastSpawn > 0.35)) {
    st.waves.push({ t0: t, amp: Math.min(1, Math.sqrt(si.rms) * 2.2) });
    st.lastSpawn = t;
  }
  st.lastRms = si.rms * 0.9 + st.lastRms * 0.1;
  const speed = half / 1.1; // slowed for the eye: one crossing of the room in ~1 s
  const lidBoost = si.family === 'piano' && si.kind === 'grand' ? 0.5 + 0.7 * si.lid : 1;
  st.waves = st.waves.filter((w) => t - w.t0 < t60 * 1.2);
  for (const w of st.waves) {
    const age = t - w.t0;
    const r = age * speed;
    const a = w.amp * Math.pow(10, (-3 * age) / t60) * 0.45 * lidBoost;
    if (a < 0.01) continue;
    arcs(b, src[0], src[2], r, src, half, floorY, C.ivory(a), 1.2);
    // first reflections: from the four walls' mirror images, once the front has reached them
    for (const [mx, mz] of [[2 * half, 0], [-2 * half, 0], [0, 1.6 * half], [0, -1.6 * half]] as [number, number][]) {
      if (r < Math.hypot(mx, mz) / 2) continue;
      const ra = a * 0.45;
      if (ra < 0.01) continue;
      arcs(b, src[0] + mx, src[2] + mz, r, src, half, floorY, C.amber(ra), 1);
    }
  }
}

/** a circle on the floor around (cx, cz), radius r, drawn only inside the room: one line per
 *  unbroken run, so a clipped circle never jumps across the gap */
function arcs(b: Batch, cx: number, cz: number, r: number, src: Vec3, half: number, y: number, col: RGBA, w: number): void {
  const N = 64;
  const inside: boolean[] = [];
  const pts: Vec3[] = [];
  for (let k = 0; k < N; k++) {
    const ang = (k / N) * Math.PI * 2;
    const x = cx + r * Math.cos(ang);
    const z = cz + r * Math.sin(ang) * 0.8;
    pts.push([x, y + 0.002, z]);
    inside.push(Math.abs(x - src[0]) <= half && Math.abs(z - src[2]) <= half * 0.8);
  }
  if (inside.every(Boolean)) {
    b.line([...pts, pts[0]], col, w);
    return;
  }
  const s0 = inside.findIndex((v, k) => v && !inside[(k + N - 1) % N]);
  if (s0 < 0) return;
  let run: Vec3[] = [];
  for (let i = 0; i < N; i++) {
    const k = (s0 + i) % N;
    if (inside[k]) run.push(pts[k]);
    else if (run.length) {
      if (run.length > 1) b.line(run, col, w);
      run = [];
    }
  }
  if (run.length > 1) b.line(run, col, w);
}
