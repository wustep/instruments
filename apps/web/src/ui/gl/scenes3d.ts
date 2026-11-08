// The instruments in 3D, built every frame from the engine's live state (the same visual
// frames the 2D stage draws): string displacement, hammers and dampers, the lid, the bow and
// stopping points with their vibrato, the flute's holes and breath, the trumpet's valves, lips
// and standing wave, and the room's wavefronts. Units are metres; y is up.
import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { AutoScale, INK, VALVE_DOWN, bodyHalf, tubeFor, type BowedGeom } from '../stage-draw.ts';
import { stepAction, type PianoState, type Pt } from '../piano-draw.ts';
import { type Batch, type RGBA, type Vec3, ink } from './gl3d.ts';

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
  waves: { t0: number; amp: number }[];
  lastRms: number;
  lastSpawn: number;
  env: Float32Array;
}
export const newScene3State = (): Scene3State => ({ str: new AutoScale(2e-6, 0.99), modes: new AutoScale(1e-9, 0.995), waves: [], lastRms: 0, lastSpawn: 0, env: new Float32Array(0) });

const C = {
  ivory: (a: number) => ink(INK.ivory, a),
  verm: (a: number) => ink(INK.vermilion, a),
  amber: (a: number) => ink(INK.amber, a),
  copper: (a: number) => ink(INK.copper, a),
  steel: (a: number) => ink(INK.steel, a),
  felt: (a: number) => ink(INK.felt, a),
  wood: (a: number) => ink(INK.wood, a),
};
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function modeAmps(fr: VisualFrame | null, st: Scene3State): Float32Array {
  const out = new Float32Array(16);
  const m = fr?.modes;
  if (!m || !m.length) return out;
  let mx = 0;
  for (let i = 0; i < m.length; i++) mx = Math.max(mx, Math.abs(m[i]));
  const s = st.modes.of(mx);
  // the strongest board modes, in order, onto the plate's lowest shapes
  for (let i = 0; i < 16 && i < m.length; i++) out[i] = m[i] / s;
  return out;
}

// ---------------------------------------------------------------- keyboard (shared by both pianos)
const WHITE = 0.0235;
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
function whiteIndex(m: number): number {
  let n = 0;
  for (let k = 21; k < m; k++) if (!isBlack(k)) n++;
  return n;
}
/** x of a key's centre (A0 at the left), metres */
export function keyX3(m: number): number {
  const w0 = -26 * WHITE;
  if (!isBlack(m)) return w0 + (whiteIndex(m) + 0.5) * WHITE;
  return w0 + whiteIndex(m) * WHITE;
}
function drawKeys(b: Batch, si: SceneIn, y0: number, zFront: number, tilt: (m: number) => number): void {
  for (let m = 21; m <= 108; m++) {
    const x = keyX3(m);
    const blk = isBlack(m);
    const w = blk ? WHITE * 0.55 : WHITE * 0.92;
    const len = blk ? 0.09 : 0.145;
    const yTop = y0 + (blk ? 0.012 : 0) - tilt(m) * 0.01;
    const z0 = zFront + (blk ? 0.055 : 0);
    const sounding = si.sounding(m);
    const held = si.down(m);
    const col: RGBA = sounding ? C.verm(0.55) : held ? C.felt(0.35) : blk ? [0.09, 0.08, 0.07, 0.95] : C.ivory(0.16);
    b.quad([x - w / 2, yTop, z0], [x + w / 2, yTop, z0], [x + w / 2, yTop + (blk ? 0 : 0), z0 + len], [x - w / 2, yTop, z0 + len], col);
    if (!blk) b.line([[x - w / 2, yTop, z0], [x + w / 2, yTop, z0]], C.ivory(0.25), 1);
  }
}

// ---------------------------------------------------------------- grand (from above, lid hinged on the bass side)
export function grandView(): View3 {
  return { target: [0, 0.15, 0.7], dist: 2.5, yaw: -0.55, pitch: 0.7 };
}
function grandPts(si: SceneIn): Pt[] {
  return si.keys.map((k) => ({ midi: k.midi, i: k.midi - 21, x: keyX3(k.midi), w: WHITE, L: k.lengthM, k, wound: k.midi < 48 && k.nStrings <= 2 }));
}
export function buildGrand(b: Batch, si: SceneIn, st: Scene3State): void {
  const keys = si.keys;
  if (!keys.length) return;
  const ps = si.piano;
  const pts = grandPts(si);
  stepAction(pts, ps);
  const zCap = 0.24; // agraffes / capo: the strings' front end
  const yStr = 0.25;
  const xs = (m: number) => keyX3(m) * 0.96;
  // strings run straight back; the bass (wound) strings cross over the tenor, higher and angled
  const ends = (p: Pt): [Vec3, Vec3] => {
    const L = Math.max(0.05, p.L);
    if (p.wound) {
      const a = -0.22; // fan toward the treble
      const x0 = xs(p.midi) - 0.03;
      return [[x0, yStr + 0.03, zCap + 0.02], [x0 - Math.sin(a) * L, yStr + 0.03, zCap + 0.02 + Math.cos(a) * L]];
    }
    return [[xs(p.midi), yStr, zCap], [xs(p.midi), yStr, zCap + L]];
  };
  // case outline: straight bass side, the bentside following the string ends, the tail
  const bridge = pts.filter((p) => !p.wound).map((p) => ends(p)[1]);
  const xL = keyX3(21) - 0.05;
  const xR = keyX3(108) + 0.04;
  const zTail = Math.max(...pts.map((p) => ends(p)[1][2])) + 0.08;
  const outline: Vec3[] = [[xR, 0, 0]];
  for (let i = bridge.length - 1; i >= 0; i -= 3) outline.push([bridge[i][0] + 0.06, 0, bridge[i][2] + 0.06]);
  outline.push([xL + 0.25, 0, zTail], [xL, 0, zTail - 0.05], [xL, 0, 0]);
  const rimH = 0.3;
  const top = outline.map((p): Vec3 => [p[0], rimH, p[2]]);
  b.loop(outline, C.ivory(0.18), 1.2);
  b.loop(top, C.ivory(0.42), 1.5);
  for (let i = 0; i < outline.length; i += 2) b.line([outline[i], top[i]], C.ivory(0.1), 1);
  // soundboard (its modes, live), ribs
  const sbY = 0.12;
  const board = top.map((p): Vec3 => [p[0], sbY, p[2]]);
  const bx0 = xL;
  const bx1 = xR + 0.1;
  b.plate({ pts: board, uv: board.map((p) => [(p[0] - bx0) / (bx1 - bx0), p[2] / zTail]), amps: modeAmps(si.fr, st), base: [0.23, 0.16, 0.1, 0.35], hot: [0.95, 0.65, 0.27], gain: 0.9 });
  for (let r = 1; r < 9; r++) {
    const z = (r / 9) * zTail;
    b.line([[xL + 0.02, sbY + 0.002, z - 0.25], [xR, sbY + 0.002, z + 0.15]], C.felt(0.07), 1);
  }
  // plate struts (the iron frame), faint
  for (const x of [-0.35, -0.05, 0.25]) b.line([[x, yStr + 0.06, zCap - 0.02], [x - 0.12, yStr + 0.06, zTail * 0.85]], C.copper(0.22), 2);
  // bridges
  b.line(bridge, C.felt(0.45), 2.4);
  const bassBridge = pts.filter((p) => p.wound).map((p) => ends(p)[1]);
  if (bassBridge.length > 1) b.line(bassBridge, C.felt(0.45), 2.4);
  // strings: static lines, then every sounding string moving (vertical: the hammer strikes up)
  const shapes = si.fr?.pianoShapes;
  const lv = si.fr?.levels;
  const sym = si.fr?.symLevels;
  let lvMax = 0;
  if (lv) for (let i = 0; i < lv.length; i++) lvMax = Math.max(lvMax, lv[i]);
  for (const p of pts) {
    if (si.lite && p.midi % 2) continue;
    const [a, z] = ends(p);
    const l = lv && lvMax > 0 ? Math.sqrt(lv[p.i] / lvMax) : 0;
    const s = sym ? Math.min(1, sym[p.i]) : 0;
    const col = l > 0.03 ? C.verm(0.15 + 0.6 * l) : s > 0.03 ? C.amber(0.08 + 0.4 * s) : p.wound ? C.copper(0.35) : C.ivory(0.16);
    b.line([a, z], col, p.wound ? 1.6 : 1);
  }
  if (shapes && shapes.midi.length) {
    let mx = 0;
    for (let i = 0; i < shapes.shapes.length; i++) mx = Math.max(mx, Math.abs(shapes.shapes[i]));
    const sc = st.str.of(mx);
    const P = shapes.points;
    for (let j = 0; j < shapes.midi.length; j++) {
      const p = pts[shapes.midi[j] - 21];
      if (!p) continue;
      const symS = shapes.light[j] === 1;
      const rel = symS ? (sym?.[p.i] ?? 0) : 1;
      if (symS && rel < 0.03) continue;
      const [a, z] = ends(p);
      const line: Vec3[] = [];
      for (let i = 0; i < P; i++) {
        const q = lerp3(a, z, i / (P - 1));
        q[1] += (shapes.shapes[j * P + i] / sc) * 0.03;
        line.push(q);
      }
      b.line(line, symS ? C.amber(Math.min(0.55, 0.1 + 0.6 * rel)) : C.verm(0.9), symS ? 1.2 : 2);
    }
  }
  // hammers (below the strings, at β; they rise to strike) and dampers (on top, lifting)
  for (const p of pts) {
    if (si.lite && p.midi % 3) continue;
    const [a, z] = ends(p);
    const beta = 0.12;
    const hp = lerp3(a, z, beta);
    const hRise = ps.hammer[p.i];
    const hy = yStr - 0.035 + hRise * 0.03;
    const hot = hRise > 0.4;
    b.line([[hp[0] - 0.006, hy, hp[2]], [hp[0] + 0.006, hy, hp[2]]], hot ? C.verm(0.9) : C.felt(0.45), hot ? 4 : 3);
    if (p.k.hasDamper) {
      const dp = lerp3(a, z, 0.03);
      const lift = ps.damper[p.i];
      const dy = yStr + 0.012 + lift * 0.02;
      b.line([[dp[0] - 0.007, dy, dp[2]], [dp[0] + 0.007, dy, dp[2]]], lift > 0.3 ? C.amber(0.75) : C.felt(0.35), 3);
    }
  }
  // keys
  drawKeys(b, si, 0.1, -0.16, (m) => (si.down(m) ? 1 : 0));
  // the lid: hinged along the bass side, open by `lid` (0 closed … 1 fully up, ~40°)
  const ang = si.lid * 0.7;
  const hingeX = xL;
  const lidPts = top.map((p): Vec3 => {
    const dx = p[0] - hingeX;
    return [hingeX + dx * Math.cos(ang), rimH + 0.01 + dx * Math.sin(ang), p[2]];
  });
  b.fan(lidPts, [0.07, 0.06, 0.05, 0.35]);
  b.loop(lidPts, C.ivory(0.35), 1.3);
  if (si.lid > 0.05) {
    const prop = lidPts[Math.floor(lidPts.length * 0.35)];
    b.line([[prop[0], rimH, prop[2]], prop], C.steel(0.4), 1.2);
  }
}

// ---------------------------------------------------------------- upright (front, strings vertical)
export function uprightView(): View3 {
  return { target: [0, 0.72, 0], dist: 2.3, yaw: -0.5, pitch: 0.22 };
}
export function buildUpright(b: Batch, si: SceneIn, st: Scene3State): void {
  if (!si.keys.length) return;
  const ps = si.piano;
  const pts = grandPts(si);
  stepAction(pts, ps);
  const yTop = 1.32;
  const zStr = 0.12;
  const xs = (m: number) => keyX3(m) * 0.95;
  const ends = (p: Pt): [Vec3, Vec3] => {
    const L = Math.min(1.15, Math.max(0.06, p.L));
    if (p.wound) {
      // cross-strung: the bass runs diagonally over the tenor, a little in front
      const x0 = xs(p.midi) - 0.05;
      return [[x0, yTop - 0.04, zStr - 0.012], [x0 + 0.35 * L, yTop - 0.04 - 0.93 * L, zStr - 0.012]];
    }
    return [[xs(p.midi), yTop - 0.08, zStr], [xs(p.midi), yTop - 0.08 - L, zStr]];
  };
  const xL = keyX3(21) - 0.06;
  const xR = keyX3(108) + 0.06;
  // case: a tall box, keybed at 0.72 m
  const box = (z: number): Vec3[] => [[xL, 0, z], [xR, 0, z], [xR, yTop + 0.06, z], [xL, yTop + 0.06, z]];
  b.loop(box(zStr + 0.18), C.ivory(0.2), 1.2);
  b.loop(box(-0.08), C.ivory(0.12), 1);
  for (const [x, y] of [[xL, 0], [xR, 0], [xR, yTop + 0.06], [xL, yTop + 0.06]] as [number, number][]) b.line([[x, y, -0.08], [x, y, zStr + 0.18]], C.ivory(0.12), 1);
  // soundboard behind the strings, live modes
  const board: Vec3[] = [[xL + 0.03, 0.2, zStr + 0.08], [xR - 0.03, 0.2, zStr + 0.08], [xR - 0.03, yTop - 0.02, zStr + 0.08], [xL + 0.03, yTop - 0.02, zStr + 0.08]];
  b.plate({ pts: board, uv: [[0, 0], [1, 0], [1, 1], [0, 1]], amps: modeAmps(si.fr, st), base: [0.23, 0.16, 0.1, 0.35], hot: [0.95, 0.65, 0.27], gain: 0.9 });
  // pin block and plate, faint
  b.line([[xL + 0.04, yTop - 0.05, zStr], [xR - 0.04, yTop - 0.05, zStr]], C.copper(0.35), 3);
  const lv = si.fr?.levels;
  const sym = si.fr?.symLevels;
  let lvMax = 0;
  if (lv) for (let i = 0; i < lv.length; i++) lvMax = Math.max(lvMax, lv[i]);
  for (const p of pts) {
    if (si.lite && p.midi % 2) continue;
    const [a, z] = ends(p);
    const l = lv && lvMax > 0 ? Math.sqrt(lv[p.i] / lvMax) : 0;
    const s = sym ? Math.min(1, sym[p.i]) : 0;
    b.line([a, z], l > 0.03 ? C.verm(0.15 + 0.6 * l) : s > 0.03 ? C.amber(0.08 + 0.4 * s) : p.wound ? C.copper(0.35) : C.ivory(0.16), p.wound ? 1.6 : 1);
  }
  const shapes = si.fr?.pianoShapes;
  if (shapes && shapes.midi.length) {
    let mx = 0;
    for (let i = 0; i < shapes.shapes.length; i++) mx = Math.max(mx, Math.abs(shapes.shapes[i]));
    const sc = st.str.of(mx);
    const P = shapes.points;
    for (let j = 0; j < shapes.midi.length; j++) {
      const p = pts[shapes.midi[j] - 21];
      if (!p) continue;
      const symS = shapes.light[j] === 1;
      const rel = symS ? (sym?.[p.i] ?? 0) : 1;
      if (symS && rel < 0.03) continue;
      const [a, z] = ends(p);
      const line: Vec3[] = [];
      for (let i = 0; i < P; i++) {
        const q = lerp3(a, z, i / (P - 1));
        q[2] -= (shapes.shapes[j * P + i] / sc) * 0.03; // the hammer strikes from the front
        line.push(q);
      }
      b.line(line, symS ? C.amber(Math.min(0.55, 0.1 + 0.6 * rel)) : C.verm(0.9), symS ? 1.2 : 2);
    }
  }
  // hammers in front of the strings (they swing back to strike), dampers above them
  for (const p of pts) {
    if (si.lite && p.midi % 3) continue;
    const [a, z] = ends(p);
    const hp = lerp3(a, z, 0.12);
    const hRise = ps.hammer[p.i];
    const hz = zStr - 0.045 + hRise * 0.035;
    b.line([[hp[0], hp[1] - 0.006, hz], [hp[0], hp[1] + 0.006, hz]], hRise > 0.4 ? C.verm(0.9) : C.felt(0.45), 4);
    if (p.k.hasDamper) {
      const dp = lerp3(a, z, 0.06);
      const off = ps.damper[p.i] * 0.02;
      b.line([[dp[0], dp[1] - 0.01, zStr - 0.012 - off], [dp[0], dp[1] + 0.01, zStr - 0.012 - off]], ps.damper[p.i] > 0.3 ? C.amber(0.75) : C.felt(0.35), 3);
    }
  }
  drawKeys(b, si, 0.72, -0.3, (m) => (si.down(m) ? 1 : 0));
}

// ---------------------------------------------------------------- violin family (lying on its back)
export function bowedView(g: BowedGeom): View3 {
  const L = g.L;
  return { target: [0.2 * L, 0, 0], dist: 2.1 * L + 0.12, yaw: -0.35, pitch: 0.8 };
}
export function buildBowed(b: Batch, si: SceneIn, st: Scene3State): void {
  const g = si.bowed;
  if (!g) return;
  const L = g.L;
  // along x: scroll … nut (x = −L/2 … ) — the strings' speaking length runs nut → bridge
  const nut = -0.6 * L;
  const bridge = nut + L;
  const bodyStart = nut + 0.4 * L;
  const bodyLen = 1.09 * L;
  const ribs = (g.id === 'cello' ? 0.11 : g.id === 'viola' ? 0.042 : 0.035) * (L / 0.328) * (g.id === 'cello' ? 0.5 : 1);
  const yTop = 0;
  const outline = (y: number): Vec3[] => {
    const o: Vec3[] = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      o.push([bodyStart + u * bodyLen, y, -bodyHalf(u) * bodyLen]);
    }
    for (let i = 40; i >= 0; i--) {
      const u = i / 40;
      o.push([bodyStart + u * bodyLen, y, bodyHalf(u) * bodyLen]);
    }
    return o;
  };
  const topO = outline(yTop);
  const backO = outline(yTop - ribs);
  b.plate({ pts: topO, uv: topO.map((p) => [(p[0] - bodyStart) / bodyLen, 0.5 + p[2] / (0.6 * bodyLen)]), amps: modeAmps(si.fr, st), base: [0.25, 0.15, 0.08, 0.4], hot: [0.95, 0.65, 0.27], gain: 0.9 });
  b.loop(topO, C.ivory(0.45), 1.5);
  b.loop(backO, C.ivory(0.14), 1);
  for (let i = 0; i < topO.length; i += 6) b.line([topO[i], backO[i]], C.ivory(0.08), 1);
  // f-holes
  for (const side of [-1, 1]) {
    const z = side * 0.105 * bodyLen;
    const f: Vec3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      f.push([bridge - 0.1 * L + 0.2 * L * t, yTop + 0.001, z + side * 0.025 * bodyLen * Math.sin(Math.PI * 2 * t) * 0.5]);
    }
    b.line(f, C.ivory(0.5), 1.4);
  }
  // neck, fingerboard, scroll
  const fbH = 0.012 * (L / 0.328);
  const fbW = 0.03 * (L / 0.328);
  b.quad([nut, yTop + fbH, -fbW * 0.5], [bridge - 0.25 * L, yTop + fbH * 1.4, -fbW * 0.8], [bridge - 0.25 * L, yTop + fbH * 1.4, fbW * 0.8], [nut, yTop + fbH, fbW * 0.5], [0.06, 0.05, 0.04, 0.85]);
  b.line([[nut - 0.32 * L, yTop + fbH * 0.5, 0], [nut, yTop + fbH, 0]], C.wood(1), 6);
  b.line([[nut - 0.32 * L, yTop + fbH * 0.5, 0], [nut, yTop + fbH, 0]], C.felt(0.4), 1.2);
  const scroll: Vec3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 3;
    const r = 0.045 * L * (1 - i / 30);
    scroll.push([nut - 0.32 * L - r * Math.cos(a), yTop + fbH * 0.5 + r * Math.sin(a), 0]);
  }
  b.line(scroll, C.felt(0.5), 1.4);
  // bridge
  const bh = 0.032 * (L / 0.328);
  b.line([[bridge, yTop, -fbW], [bridge, yTop + bh, -fbW * 0.8], [bridge, yTop + bh * 1.05, 0], [bridge, yTop + bh, fbW * 0.8], [bridge, yTop, fbW]], C.felt(0.8), 2);
  // tailpiece
  const tail = bodyStart + bodyLen * 0.98;
  b.line([[bridge + 0.06 * L, yTop + bh * 0.6, -fbW * 0.6], [tail, yTop + 0.01, -fbW * 0.3], [tail, yTop + 0.01, fbW * 0.3], [bridge + 0.06 * L, yTop + bh * 0.6, fbW * 0.6]], C.wood(1), 3);
  // strings: nut → bridge → tailpiece; live: level glow, the bowed one's shape, stopping marks
  const strs = si.fr?.strings;
  const focus = si.fr?.focus ?? null;
  const bowedIdx = strs ? strs.findIndex((s) => s.bowing) : -1;
  const nS = g.strings.length;
  const zOf = (i: number, x: number) => {
    const spread = x <= nut ? 0.5 : x >= bridge ? 1 : 0.5 + 0.5 * ((x - nut) / L);
    return (i - (nS - 1) / 2) * 0.0068 * (L / 0.328) * spread * 1.6;
  };
  const yOf = (x: number) => yTop + fbH + 0.004 + ((x - nut) / L) * (bh - fbH);
  let mx = 0;
  if (focus) for (const s of focus.shapes) for (let i = 0; i < s.length; i++) mx = Math.max(mx, Math.abs(s[i]));
  const sc = st.str.of(mx);
  g.strings.forEach((sd, i) => {
    const s = strs?.[i];
    const l = s ? Math.min(1, s.level * 3) : 0;
    b.line([[nut, yOf(nut), zOf(i, nut)], [bridge, yOf(bridge), zOf(i, bridge)], [bridge + 0.06 * L, yTop + bh * 0.6, zOf(i, bridge) * 0.7]], l > 0.03 ? (s?.bowing ? C.verm(0.25 + 0.6 * l) : C.amber(0.2 + 0.6 * l)) : C.ivory(0.3), 1 + 0.6 * (i / nS));
    // the stopping point: a glowing bar, rocking with the vibrato (stopNow follows the live loop)
    if (s && s.stop < 0.999 && s.level > 0.002) {
      const frac = 1 - (s.stopNow ?? s.stop);
      const x = nut + frac * L;
      b.line([[x, yOf(x) + 0.002, zOf(i, x) - 0.004], [x, yOf(x) + 0.002, zOf(i, x) + 0.004]], C.amber(0.9), 5);
    }
    // the bowed string, moving (its live shape between the stop and the bridge)
    if (focus && i === bowedIdx && focus.shapes[0]) {
      const sh = focus.shapes[0];
      const x0 = nut + (1 - (s?.stopNow ?? s?.stop ?? 1)) * L;
      const line: Vec3[] = [];
      for (let k = 0; k < sh.length; k++) {
        const x = x0 + (k / (sh.length - 1)) * (bridge - x0);
        line.push([x, yOf(x), zOf(i, x) + (sh[k] / sc) * 0.012 * (L / 0.328)]);
      }
      b.line(line, C.verm(0.95), 2);
    }
  });
  // the bow: across the bowed string near the bridge, at its contact point along the hair
  const bow = si.fr?.bow;
  if (bow && bowedIdx >= 0) {
    const xc = bridge - 0.085 * L;
    const yc = yOf(xc) + 0.006;
    const zc = zOf(bowedIdx, xc);
    const hair = g.bowLength;
    const pos = bow.pos; // 0 frog … 1 tip at the string
    const tilt = (bowedIdx - (nS - 1) / 2) * 0.18;
    const dir: Vec3 = [Math.sin(tilt) * 0.15, Math.sin(tilt), Math.cos(tilt)];
    const frog: Vec3 = [xc - dir[0] * pos * hair, yc - dir[1] * pos * hair * 0.3, zc - dir[2] * pos * hair];
    const tip: Vec3 = [frog[0] + dir[0] * hair, frog[1] + dir[1] * hair * 0.3, frog[2] + dir[2] * hair];
    b.line([frog, tip], bow.changing ? C.amber(0.7) : C.ivory(0.7), 1.4);
    b.line([[frog[0], frog[1] + 0.012, frog[2]], [tip[0], tip[1] + 0.012, tip[2]]], C.wood(1), 3);
    b.line([[xc, yc - 0.003, zc], [xc, yc + 0.003, zc]], C.verm(0.9), 6);
  }
}

// ---------------------------------------------------------------- flute (along x, keys up)
export function fluteView(): View3 {
  return { target: [0.33, 0, 0], dist: 0.78, yaw: -0.25, pitch: 0.55 };
}
export function buildFlute(b: Batch, si: SceneIn, st: Scene3State): void {
  const r = 0.0095;
  const emb = 0.037;
  const full = emb + tubeFor(60) + 0.01;
  // the tube: rings and four long lines
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * full;
    const ring: Vec3[] = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ring.push([x, r * Math.sin(a), r * Math.cos(a)]);
    }
    b.loop(ring, C.ivory(i % 6 === 0 ? 0.28 : 0.1), 1);
  }
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) b.line([[0, r * Math.sin(a), r * Math.cos(a)], [full, r * Math.sin(a), r * Math.cos(a)]], C.ivory(0.3), 1.1);
  // embouchure hole, the breath crossing it (its strength from the engine's breath pressure)
  const br = si.fr?.breath;
  const blow = br ? br.pressure : 0;
  const vib = br ? br.vib : 0;
  const eh: Vec3[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    eh.push([emb + 0.006 * Math.cos(a), r + 0.0005, 0.005 * Math.sin(a)]);
  }
  b.loop(eh, C.ivory(0.6), 1.3);
  if (blow > 0.02) {
    for (let j = -2; j <= 2; j++) {
      const z = j * 0.0018;
      const jet: Vec3[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        jet.push([emb - 0.035 + 0.04 * t, r + 0.012 - 0.0115 * t + 0.002 * Math.sin(si.now / 40 + j + t * 6) * blow, z]);
      }
      b.line(jet, C.steel(0.25 + 0.5 * blow * (1 + 4 * vib)), 1.2);
    }
  }
  // tone holes for the fingering: covered (filled) up to the sounding end, open beyond, the
  // covered ones pulsing with the breath vibrato
  const focus = si.fr?.focus ?? null;
  const end = emb + (focus ? focus.lengthM : tubeFor(60));
  for (let m = 61; m <= 73; m++) {
    const at = emb + tubeFor(m) + 0.006;
    if (at > full - 0.005) continue;
    const open = at >= end - 0.004;
    const rr = 0.0045 * (open ? 1 : 1 + 2.5 * vib);
    const hole: Vec3[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      hole.push([at + rr * Math.cos(a), r + 0.001, rr * Math.sin(a)]);
    }
    if (open) b.loop(hole, C.ivory(0.6), 1.2);
    else {
      b.fan(hole, C.amber(Math.min(0.9, 0.5 + 0.35 * blow + 3 * vib)));
      b.loop(hole, C.amber(0.3 * blow + 0.2), 2.5);
    }
  }
  // the standing pressure wave along the bore (embouchure → sounding end)
  if (focus && focus.shapes[0]) {
    const s = focus.shapes[0];
    let mx = 0;
    for (let i = 0; i < s.length; i++) mx = Math.max(mx, Math.abs(s[i]));
    const sc = st.str.of(mx);
    const line: Vec3[] = [];
    const cols: RGBA[] = [];
    for (let i = 0; i < s.length; i++) {
      const x = emb + (i / (s.length - 1)) * (end - emb);
      line.push([x, (s[i] / sc) * r * 0.8, 0]);
      cols.push(C.verm(0.3 + 0.6 * Math.abs(s[i] / sc)));
    }
    b.line(line, cols, 2);
  }
}

// ---------------------------------------------------------------- trumpet (a wrapped tube, bell to the right)
export function trumpetView(): View3 {
  return { target: [0.05, 0.0, 0], dist: 0.75, yaw: -0.35, pitch: 0.3 };
}
/** the trumpet's tubing as a path (metres), mouthpiece first */
function trumpetPath(): Vec3[] {
  const p: Vec3[] = [];
  const seg = (a: Vec3, c: Vec3, n: number) => {
    for (let i = 1; i <= n; i++) p.push(lerp3(a, c, i / n));
  };
  p.push([-0.2, 0.06, 0]);
  seg([-0.2, 0.06, 0], [0.02, 0.06, 0], 10); // leadpipe
  // the valve block: down through the three casings and back
  for (const x of [0.04, 0.07, 0.1]) {
    seg(p[p.length - 1], [x, 0.06, 0], 2);
    seg([x, 0.06, 0], [x, 0.0, 0], 3);
    seg([x, 0.0, 0], [x + 0.015, 0.0, 0], 1);
    seg([x + 0.015, 0.0, 0], [x + 0.015, 0.06, 0], 3);
  }
  // main tuning slide: a loop back towards the player, then forward to the bell
  seg(p[p.length - 1], [0.14, 0.0, 0.0], 3);
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    p.push([0.14 + 0.05 * Math.sin(a), -0.035 + 0.035 * Math.cos(a), 0.0]);
  }
  seg(p[p.length - 1], [-0.12, -0.07, 0], 10);
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    p.push([-0.12 - 0.035 * Math.sin(a), -0.035 - 0.035 * Math.cos(a), 0]);
  }
  seg(p[p.length - 1], [0.3, 0.0, 0], 14); // bell section
  return p;
}
const T_PATH = trumpetPath();
export function buildTrumpet(b: Batch, si: SceneIn, st: Scene3State): void {
  const path = T_PATH;
  const n = path.length;
  const radius = (i: number) => {
    const t = i / (n - 1);
    return t < 0.85 ? 0.0058 : 0.0058 + 0.06 * ((t - 0.85) / 0.15) ** 2.4; // the flare
  };
  // tube rings and the centre line
  for (let i = 0; i < n; i += 2) {
    const pr = path[Math.max(0, i - 1)];
    const nx = path[Math.min(n - 1, i + 1)];
    const t = [nx[0] - pr[0], nx[1] - pr[1], nx[2] - pr[2]];
    const tl = Math.hypot(t[0], t[1], t[2]) || 1;
    const tx = t[0] / tl;
    const ty = t[1] / tl;
    // a ring in the plane normal to the tube (the path lies in z = 0)
    const ring: Vec3[] = [];
    const R = radius(i);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ring.push([path[i][0] - ty * R * Math.cos(a), path[i][1] + tx * R * Math.cos(a), R * Math.sin(a)]);
    }
    b.loop(ring, C.amber(i > n * 0.85 ? 0.35 : 0.14), 1);
  }
  b.line(path, C.amber(0.35), 1.3);
  // the bell's rim
  const rim: Vec3[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    rim.push([0.3, 0.066 * Math.cos(a), 0.066 * Math.sin(a)]);
  }
  b.loop(rim, C.amber(0.7), 1.6);
  // valves: pistons pressed for the fingering (the engine's own: "valves 1+3 · partial 4")
  const meta = si.fr?.excite?.meta ?? '';
  const valves = /valves (\S+)/.exec(meta)?.[1] ?? 'open';
  const down = VALVE_DOWN[valves] ?? VALVE_DOWN.open;
  [0.0475, 0.0775, 0.1075].forEach((x, i) => {
    const d = down[i] ? 0.014 : 0;
    b.line([[x, -0.01, 0], [x, 0.075, 0]], C.ivory(0.25), 6);
    b.line([[x, 0.075 - d, 0], [x, 0.1 - d, 0]], down[i] ? C.verm(0.9) : C.ivory(0.55), 3);
    const cap: Vec3[] = [];
    for (let k = 0; k < 12; k++) cap.push([x + 0.008 * Math.cos((k / 12) * 6.283), 0.1 - d, 0.008 * Math.sin((k / 12) * 6.283)]);
    b.loop(cap, down[i] ? C.verm(0.9) : C.ivory(0.5), 1.4);
  });
  // lips at the mouthpiece: they buzz at the note, opening with the playing level
  const lvl = Math.min(1, Math.sqrt(si.rms) * 3);
  const f = si.fr?.focus?.f1 ?? 0;
  const gap = lvl > 0.02 ? 0.0015 + 0.002 * lvl * (0.5 + 0.5 * Math.sin(si.now * 0.001 * Math.min(f, 18) * 6.283)) : 0.0006;
  for (const sgn of [-1, 1]) {
    const lip: Vec3[] = [];
    for (let k = 0; k <= 8; k++) {
      const z = -0.011 + (k / 8) * 0.022;
      lip.push([-0.212, 0.06 + sgn * (gap + 0.0035 * (1 - (z / 0.011) ** 2)), z]);
    }
    b.line(lip, lvl > 0.02 ? C.verm(0.85) : C.felt(0.5), 2.5);
  }
  const mp: Vec3[] = [];
  for (let k = 0; k < 14; k++) mp.push([-0.2, 0.06 + 0.012 * Math.cos((k / 14) * 6.283), 0.012 * Math.sin((k / 14) * 6.283)]);
  b.loop(mp, C.ivory(0.5), 1.4);
  // the standing wave along the tubing (the engine's bore pressure, mouthpiece → bell)
  const focus = si.fr?.focus ?? null;
  if (focus && focus.shapes[0]) {
    const s = focus.shapes[0];
    let mx = 0;
    for (let i = 0; i < s.length; i++) mx = Math.max(mx, Math.abs(s[i]));
    const sc = st.str.of(mx);
    if (st.env.length !== n) st.env = new Float32Array(n);
    const line: Vec3[] = [];
    const cols: RGBA[] = [];
    for (let i = 0; i < n; i++) {
      const v = s[Math.min(s.length - 1, Math.round((i / (n - 1)) * (s.length - 1)))] / sc;
      st.env[i] = Math.max(Math.abs(v), st.env[i] * 0.94);
      line.push([path[i][0], path[i][1], v * 0.012]);
      cols.push(C.verm(0.2 + 0.7 * st.env[i]));
    }
    b.line(line, cols, 2);
  }
}

// ---------------------------------------------------------------- the room: walls and wavefronts on the floor
export function buildRoom(b: Batch, si: SceneIn, st: Scene3State, src: Vec3, span: number, floorY: number): void {
  const size = 0.55 + 0.45 * si.room;
  const t60 = 0.7 + 1.7 * si.room;
  const half = span * (0.9 + 1.4 * size);
  const H = span * (0.6 + 0.6 * size);
  const corners: Vec3[] = [[src[0] - half, floorY, src[2] - half * 0.8], [src[0] + half, floorY, src[2] - half * 0.8], [src[0] + half, floorY, src[2] + half * 0.8], [src[0] - half, floorY, src[2] + half * 0.8]];
  b.loop(corners, C.ivory(0.08), 1);
  b.loop(corners.map((c): Vec3 => [c[0], floorY + H, c[2]]), C.ivory(0.04), 1);
  for (const c of corners) b.line([c, [c[0], floorY + H, c[2]]], C.ivory(0.04), 1);
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
    const a = w.amp * Math.pow(10, (-3 * age) / t60) * 0.5 * lidBoost;
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
  // start just after a gap, walk once round
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
