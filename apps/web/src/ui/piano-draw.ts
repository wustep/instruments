// The piano on the stage, grand (plan view from above) or upright (front view, panels
// off). Strings at their real lengths, one per unison, above their own keys; hammers,
// dampers and the una corda shift follow the live state (key presses with their
// velocity, strike moments, the pedals, string levels from the audio thread). Plate,
// struts, pins, agraffes, bridges and soundboard ribs are drawn faintly, as structure.

import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { AutoScale, INK, ModeField, rgba } from './stage-draw.ts';
import { drawGrandPlan } from './grand-plan.ts';

export interface PianoGeom {
  keys: KeySummary[];
  /** x (CSS px, stage coordinates) of a key's centre, and its width (may lie off-screen) */
  keyX: (midi: number) => { x: number; w: number };
  kind: 'grand' | 'upright';
  /** lid opening 0 (closed) … 1 (fully open) */
  lid?: number;
}

export interface PianoState {
  /** longest visible string, smoothed (sets the drawing scale; phones show part of the keyboard) */
  maxL: number;
  /** strike moments (performance.now) and velocities per key */
  strikes: Map<number, number>;
  vels: Map<number, number>;
  down: Set<number>;
  sustain: number;
  soft: number;
  /** the middle pedal: a grand's sostenuto, an upright's muffler (0 … 1) */
  middle: number;
  /** an upright's action: the soft pedal is the half-blow rail, the middle pedal the muffler */
  upright: boolean;
  /** keys whose dampers the sostenuto holds (latched as it went down) */
  sost: Uint8Array;
  sostWas: boolean;
  strScale: AutoScale;
  lvlScale: AutoScale;
  /** running scale for all sounding strings' shapes together (so quieter ones look smaller) */
  allScale: AutoScale;
  /** smoothed hammer height (0 rest … 1 at the string) and damper lift per key (A0…C8) */
  hammer: Float32Array;
  damper: Float32Array;
  shift: number;
  lastStrike: Map<number, number>;
  /** set while drawing: where sound leaves the instrument, the case, and the lid's free edge */
  src: { x: number; y: number };
  caseBox: { x0: number; x1: number; y0: number; y1: number };
  lidEdge: { x: number; y: number } | null;
  /** each visible key's strings as drawn (for clicking a note's strings) */
  hits: { midi: number; x0: number; y0: number; x1: number; y1: number; w: number }[];
}

/** the key whose strings are nearest (x, y) in stage coordinates, if close enough */
export function stringAt(st: PianoState, x: number, y: number): number | null {
  let best: number | null = null;
  let bd = Infinity;
  for (const h of st.hits) {
    const dx = h.x1 - h.x0;
    const dy = h.y1 - h.y0;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - h.x0) * dx + (y - h.y0) * dy) / L2));
    const d = Math.hypot(x - (h.x0 + t * dx), y - (h.y0 + t * dy));
    if (d < Math.max(6, h.w * 0.6) && d < bd) {
      bd = d;
      best = h.midi;
    }
  }
  return best;
}

export const newPianoState = (): PianoState => ({
  maxL: 0,
  strikes: new Map(),
  vels: new Map(),
  down: new Set(),
  sustain: 0,
  soft: 0,
  middle: 0,
  upright: false,
  sost: new Uint8Array(88),
  sostWas: false,
  strScale: new AutoScale(2e-6),
  lvlScale: new AutoScale(1e-6, 0.995),
  allScale: new AutoScale(2e-6, 0.99),
  hammer: new Float32Array(88),
  damper: new Float32Array(88),
  shift: 0,
  lastStrike: new Map(),
  src: { x: 0, y: 0 },
  caseBox: { x0: 0, x1: 0, y0: 0, y1: 0 },
  lidEdge: null,
  hits: [],
});

export interface Pt {
  midi: number;
  i: number;
  x: number;
  w: number;
  L: number;
  k: KeySummary;
  wound: boolean;
}

/** advance the action: hammers jump to the string when struck, rebound with the key's
 *  velocity, are caught by the backcheck while the key is held; dampers follow the key
 *  and the sustain pedal (half-pedal lifts them part way) */
export function stepAction(pts: Pt[], st: PianoState): void {
  // a grand's soft pedal shifts the action; an upright's brings the hammers nearer the strings
  st.shift += ((st.upright ? 0 : st.soft) - st.shift) * 0.25;
  // the sostenuto (a grand's middle pedal) latches the keys down as it goes down, as the engine does
  const sostOn = !st.upright && st.middle >= 0.5;
  for (const p of pts) {
    if (!sostOn) st.sost[p.i] = 0;
    else if (st.sostWas === false && st.down.has(p.midi)) st.sost[p.i] = 1;
  }
  st.sostWas = sostOn;
  for (const p of pts) {
    const t = st.strikes.get(p.midi);
    if (t !== undefined && st.lastStrike.get(p.midi) !== t) {
      st.lastStrike.set(p.midi, t);
      st.hammer[p.i] = 1;
    }
    const held = st.down.has(p.midi);
    const v = (st.vels.get(p.midi) ?? 64) / 127;
    // louder strikes rebound faster and further
    const rate = 0.1 + 0.18 * v;
    // (the half-blow rail holds an upright's hammers about 45 % of the way to the strings)
    const target = Math.max(held ? 0.32 : 0, st.upright ? 0.45 * st.soft : 0);
    st.hammer[p.i] += (target - st.hammer[p.i]) * rate;
    const lift = p.k.hasDamper ? Math.max(held || st.sost[p.i] ? 1 : 0, Math.min(1, st.sustain * 1.4)) : 1;
    st.damper[p.i] += (lift - st.damper[p.i]) * (lift > st.damper[p.i] ? 0.45 : 0.22);
  }
}

/** struck strings: √level on an auto scale, so a decaying note stays visible while it sounds.
 *  Sympathetic strings: their real displacement relative to the loudest struck string, linear
 *  (the engine's `symLevels`), so they glow only when they really move. Under a bass note the
 *  undamped treble moves at about −70 dB and stays dark; a pedalled octave builds to −10 dB. */
function levelsOf(fr: VisualFrame | null, st: PianoState): { l: (i: number) => number; s: (i: number) => number } {
  const levels = fr?.levels;
  const sym = fr?.symLevels;
  let mx = 0;
  if (levels) for (let i = 0; i < levels.length; i++) mx = Math.max(mx, levels[i]);
  const norm = st.lvlScale.of(mx);
  return { l: (i) => (levels ? Math.sqrt(levels[i] / norm) : 0), s: (i) => (sym ? Math.min(1, sym[i]) : 0) };
}

/** below this relative displacement (−30 dB) a sympathetic string is not drawn as moving */
const SYM_VISIBLE = 0.03;

/** a string's static line plus its live glow */
function strokeString(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, wound: boolean, l: number, s: number): void {
  ctx.strokeStyle = rgba(wound ? INK.copper : INK.ivory, wound ? 0.45 : 0.22);
  ctx.lineWidth = wound ? 1.3 : 0.8;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  if (l > 0.02 || s > SYM_VISIBLE) {
    // sympathetic glow is kept faint: at most 0.55 alpha even when it moves like a struck string
    ctx.strokeStyle = l >= s ? rgba(INK.vermilion, 0.15 + 0.85 * l) : rgba(INK.amber, 0.08 + 0.47 * s);
    ctx.lineWidth = l >= s ? 1 + 1.6 * l : 0.9 + 0.9 * s;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

/** the last struck note's strings, their live shape, from (x0,y0) to (x1,y1) */
function drawFocus(ctx: CanvasRenderingContext2D, focus: NonNullable<VisualFrame['focus']>, ends: (j: number) => [number, number, number, number], w: number, st: PianoState): void {
  let m = 0;
  for (const s of focus.shapes) for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i]));
  const scale = st.strScale.of(m);
  const amp = Math.max(10, w * 1.7) / scale;
  focus.shapes.forEach((s, j) => {
    const [x0, y0, x1, y1] = ends(j);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    for (const [wid, a] of [
      [4, 0.18],
      [1.4, 0.95],
    ] as const) {
      ctx.strokeStyle = rgba(j === 0 ? INK.vermilion : j === 1 ? INK.amber : INK.steel, a);
      ctx.lineWidth = wid;
      ctx.beginPath();
      for (let i = 0; i < s.length; i++) {
        const f = i / (s.length - 1);
        const x = x0 + (x1 - x0) * f + nx * s[i] * amp;
        const y = y0 + (y1 - y0) * f + ny * s[i] * amp;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  });
}


/** every sounding string at once: struck strings vermilion, sympathetic ones amber and
 *  (being quieter) smaller; all on one scale, so a decaying note visibly settles */
function drawAllShapes(ctx: CanvasRenderingContext2D, fr: VisualFrame | null, byMidi: Map<number, Pt>, ends: (p: Pt) => [number, number, number, number], st: PianoState, W: number, skip: number): void {
  const ps = fr?.pianoShapes;
  if (!ps || !ps.midi.length) return;
  const P = ps.points;
  let mx = 0;
  for (let i = 0; i < ps.shapes.length; i++) mx = Math.max(mx, Math.abs(ps.shapes[i]));
  const scale = st.allScale.of(mx);
  for (let j = 0; j < ps.midi.length; j++) {
    const m = ps.midi[j];
    if (m === skip && !ps.light[j]) continue;
    const p = byMidi.get(m);
    if (!p || p.x < -p.w || p.x > W + p.w) continue;
    const amp = Math.max(8, p.w * 1.5) / scale;
    const [x0, y0, x1, y1] = ends(p);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    const sym = ps.light[j] === 1;
    let alpha = 0.85;
    if (sym) {
      // as faint as the string's real motion, relative to the loudest struck string (the
      // engine's reference, which remembers a released chord for a second or two)
      const rel = fr?.symLevels?.[m - 21] ?? 0;
      if (rel < SYM_VISIBLE) continue;
      alpha = Math.min(0.55, 0.1 + 0.6 * rel);
    }
    ctx.strokeStyle = sym ? rgba(INK.amber, alpha) : rgba(INK.vermilion, alpha);
    ctx.lineWidth = sym ? 0.9 : 1.2;
    ctx.beginPath();
    for (let i = 0; i < P; i++) {
      const f = i / (P - 1);
      const d = ps.shapes[j * P + i] * amp;
      const x = x0 + (x1 - x0) * f + nx * d;
      const y = y0 + (y1 - y0) * f + ny * d;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
}

function felt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, glow: number): void {
  const r = Math.min(h / 2, 3);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
  ctx.fillStyle = glow > 0.02 ? `rgba(${Math.round(205 + 50 * glow)},${Math.round(181 - 87 * glow)},${Math.round(146 - 90 * glow)},${(0.55 + 0.45 * glow).toFixed(3)})` : rgba(INK.felt, 0.5);
  ctx.fill();
}

// ================================================================ grand (from above)
export function drawPiano(ctx: CanvasRenderingContext2D, W: number, H: number, g: PianoGeom, fr: VisualFrame | null, st: PianoState, field: ModeField, now: number): void {
  if (g.kind === 'upright') return drawUpright(ctx, W, H, g, fr, st, field, now);
  const keys = g.keys;
  if (!keys.length) return;
  const pts: Pt[] = keys.map((k) => {
    const kx = g.keyX(k.midi);
    return { midi: k.midi, i: k.midi - 21, x: kx.x, w: kx.w, L: k.lengthM, k, wound: k.midi < 48 && k.nStrings <= 2 };
  });
  stepAction(pts, st);
  // the grand from above, lid off (grand-plan.ts), then every sounding string's live shape and the
  // last struck note's unisons in detail
  const { ends, unison } = drawGrandPlan(ctx, W, H, pts, g.lid ?? 1, fr, st, field, now, levelsOf(fr, st));
  const focus = fr?.focus ?? null;
  drawAllShapes(ctx, fr, new Map(pts.map((p) => [p.midi, p])), ends, st, W, focus?.midi ?? -1);
  if (focus) {
    const p = pts.find((q) => q.midi === focus.midi);
    if (p) {
      const [x0, y0, x1, y1] = ends(p);
      const off = unison(p);
      drawFocus(ctx, focus, (j) => {
        const o = off[Math.min(off.length - 1, j)] ?? 0;
        return [x0 + o, y0, x1 + o, y1];
      }, p.w, st);
    }
  }
}

// ================================================================ upright (front view)
// The upright from the front with its upper and lower panels off, as a technician sees it
// (upright-action.jpg), in true proportion from the floor to the lid: the 3D upright's measures
// (piano3d.ts `U`, a Yamaha U1). Behind, the gold plate with its pin field and its openings onto
// the soundboard (where the board's modes glow); the overstrung strings from their pins down to
// the bridges, the bass crossing the tenor; in front, the action standing on the keybed (wippens,
// backchecks and catchers with their bridle tapes, the shanks, the hammer rail, the hammers on the
// strike line), the dampers' heads on the strings 50 mm under it, the open fallboard and the keys.
// x follows the on-screen keyboard (each key's strings and action above it); a slight oblique
// (depth reads as height, as from a camera a little above the keys) lets a hammer's flight to the
// strings, a damper's lift and the muffler show.
const UP = {
  top: 1.21,
  strike: 1.017,
  /** the hammer rail, just under the heads; the damper heads 50 mm under the strike line */
  rail: [0.958, 0.99] as const,
  damp: [0.955, 0.98] as const,
  butt: 0.865,
  catcher: [0.853, 0.876] as const,
  backcheck: [0.842, 0.866] as const,
  wippen: [0.768, 0.792] as const,
  fall: [0.729, 0.805] as const,
  keyTop: 0.725,
  bed: [0.655, 0.682] as const,
  plate: [0.07, 1.18] as const,
  /** the practice muffler: its felt (raised) and how far the middle pedal drops it */
  muffler: [1.038, 1.076] as const,
  mufDrop: 0.045,
};
/** depth of each layer from the key fronts (m): the oblique lifts the deeper ones */
const UZ = { key: 0, fall: 0.175, wippen: 0.38, backcheck: 0.325, catcher: 0.342, shank: 0.385, rail: 0.365, head: 0.41, blow: 0.045, damp: 0.468, muffler: 0.464, string: 0.478, bass: 0.47, plate: 0.49 };
/** the oblique: a metre of depth reads as 0.3 m of height, about a camera 17° above the keys */
const OBL = 0.3;
const UZ0 = 0.4;
const CROSS = 0.3; // the bass strings lean towards the treble at the bottom (rad)
const betaOf = (m: number) => (m <= 60 ? 0.12 : 0.12 - ((m - 60) / 48) * 0.055);
const C_UP = {
  plate: '170,128,60',
  board: '196,160,108',
  bridge: '142,98,56',
  beech: '214,188,142',
  hornbeam: '230,212,172',
  hFelt: '238,231,214',
  mahogany: '126,76,46',
  green: '44,96,72',
  red: '160,44,36',
  lacquer: '14,12,11',
  sheen: '120,112,102',
  pin: '206,210,216',
  brass: '196,158,88',
};
interface UpString {
  p: Pt;
  /** the key's action and strings: evenly spaced across the keyboard (the key sticks fan to it) */
  x: number;
  pitch: number;
  /** the speaking length, agraffe to bridge (stage px) */
  a: [number, number];
  b: [number, number];
  /** per unison: the pin, and the x offset along the string */
  pins: [number, number][];
  off: number[];
  hitch: [number, number];
}
interface UpLayout {
  key: string;
  Y: (m: number, z: number) => number;
  sy: number;
  strings: UpString[];
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
  windows: Path2D;
  box: { x0: number; x1: number; y0: number; y1: number };
  span: [number, number];
}
let upCache: UpLayout | null = null;

function upLayout(W: number, H: number, pts: Pt[], whiteW: number, dpr: number): UpLayout {
  const key = `${W}|${H}|${dpr}|${pts[0].x.toFixed(1)}|${whiteW.toFixed(2)}|${pts.map((p) => p.L.toFixed(3)).join('')}`;
  if (upCache && upCache.key === key) return upCache;
  // vertical: the floor (with the plate's foot) to the lid, the deepest layer lifted by the oblique
  const M0 = 0.04;
  const M1 = UP.top + OBL * (UZ.plate - UZ0) + 0.012;
  const yFloor = H - 3;
  const sy = (yFloor - 4) / (M1 - M0);
  const Y = (m: number, z: number) => yFloor - (m + OBL * (z - UZ0) - M0) * sy;
  const pxm = whiteW / 0.0235; // x: the keyboard's own scale (a white key is 23.5 mm)
  // the action's pitch: 88 even steps across the 52 white keys (13.9 mm), as in the 3D model
  const kx0 = pts[0].x - pts[0].w / 2;
  const kx1 = pts[pts.length - 1].x + pts[pts.length - 1].w / 2;
  const pitch = (kx1 - kx0) / 88;
  const strings: UpString[] = pts.map((p) => {
    const ax = kx0 + (p.midi - 21 + 0.5) * pitch;
    const L = Math.min(1.12, Math.max(0.04, p.L));
    const beta = betaOf(p.midi);
    const z = p.wound ? UZ.bass : UZ.string;
    const sx = p.wound ? Math.sin(CROSS) : 0;
    const cy = p.wound ? Math.cos(CROSS) : 1;
    const up = beta * L;
    const down = Math.min((1 - beta) * L, (UP.strike - 0.075) / cy);
    const aM = UP.strike + cy * up;
    const a: [number, number] = [ax - sx * up * pxm, Y(aM, z)];
    const b: [number, number] = [ax + sx * down * pxm, Y(UP.strike - cy * down, z)];
    const n = Math.max(1, p.k.nStrings);
    const spx = Math.min(2.4, pitch * 0.2);
    const off = Array.from({ length: n }, (_, j) => (j - (n - 1) / 2) * spx);
    const pins = off.map((o, j): [number, number] => [a[0] + o, Y(Math.min(1.172, aM + 0.028 + 0.016 * j + (p.wound ? 0 : 0.008 * (p.i % 2))), UZ.plate)]);
    const hitch: [number, number] = [b[0] + sx * 0.06 * pxm, b[1] + cy * 0.06 * sy];
    return { p, x: ax, pitch, a, b, pins, off, hitch };
  });
  const span: [number, number] = [pts[0].x - whiteW * 3.4, pts[pts.length - 1].x + whiteW * 3.4];
  const bass = strings.filter((s) => s.p.wound);
  const treb = strings.filter((s) => !s.p.wound);
  // ---- the plate's openings onto the soundboard (as the 3D plate: bass, treble, and below the
  //      treble's hitch-pin flange), in stage px
  const windows = new Path2D();
  const poly = (ps: [number, number][]) => {
    ps.forEach(([x, y], k) => (k ? windows.lineTo(x, y) : windows.moveTo(x, y)));
    windows.closePath();
  };
  const g = 0.012 * sy;
  if (bass.length > 1) {
    const f = bass[0];
    const l = bass[bass.length - 1];
    poly([
      [f.a[0] - 0.4 * whiteW, f.a[1] + g],
      ...bass.map((s): [number, number] => [s.a[0], s.a[1] + g]),
      [l.a[0] + 0.5 * whiteW, l.a[1] + g],
      [l.b[0] + 0.5 * whiteW, l.b[1] + 3 * g],
      ...bass
        .slice()
        .reverse()
        .map((s): [number, number] => [s.b[0], s.b[1] + 3 * g]),
      [f.b[0] - 0.4 * whiteW, f.b[1] + 3 * g],
    ]);
  }
  const strutX = (y: number) => {
    // the bass strut: along the last bass string, a little towards the treble
    const l = bass[bass.length - 1];
    if (!l) return span[0];
    const t = (y - l.a[1]) / (l.b[1] - l.a[1] || 1);
    return l.a[0] + (l.b[0] - l.a[0]) * t + 1.3 * whiteW;
  };
  const tIn = treb.filter((s) => s.b[0] > strutX(s.b[1]) + 2);
  if (tIn.length > 1) {
    const yTop = (s: UpString) => s.a[1] + g;
    poly([
      [strutX(yTop(tIn[0])), yTop(tIn[0])],
      ...tIn.map((s): [number, number] => [s.a[0], yTop(s)]),
      [span[1] - whiteW, yTop(tIn[tIn.length - 1])],
      [span[1] - whiteW, tIn[tIn.length - 1].b[1] + 3 * g],
      ...tIn
        .slice()
        .reverse()
        .map((s): [number, number] => [s.b[0], s.b[1] + 3 * g]),
      [strutX(tIn[0].b[1] + 3 * g), tIn[0].b[1] + 3 * g],
    ]);
    // below the treble's hitch pins, down to the plate's foot
    const lowY = (s: UpString) => s.hitch[1] + 2 * g;
    const yFoot = Y(UP.plate[0] + 0.1, UZ.plate);
    const lowT = tIn.filter((s) => lowY(s) < yFoot - 4 * g);
    if (lowT.length > 2)
      poly([[strutX(lowY(lowT[0])), lowY(lowT[0])], ...lowT.map((s): [number, number] => [s.hitch[0], lowY(s)]), [span[1] - whiteW, lowY(lowT[lowT.length - 1])], [span[1] - whiteW, yFoot], [strutX(yFoot), yFoot]]);
  }
  const box = { x0: span[0], x1: span[1], y0: Y(UP.top, UZ.plate), y1: yFloor };
  // ---- the back layer: soundboard, plate, bridges, hitch pins, the strings at rest, felt, pins
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * dpr));
    c.height = Math.max(1, Math.round(H * dpr));
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, x };
  };
  const { c: back, x: bx } = mk();
  {
    const yP0 = Y(UP.plate[1], UZ.plate);
    const yP1 = Y(UP.plate[0], UZ.plate);
    // the back frame and the soundboard (spruce, its grain running down and across)
    bx.fillStyle = rgba(C_UP.board, 0.05);
    bx.fillRect(span[0], yP0, span[1] - span[0], yP1 - yP0);
    bx.save();
    bx.clip(windows);
    bx.fillStyle = rgba(C_UP.board, 0.2);
    bx.fillRect(span[0], yP0, span[1] - span[0], yP1 - yP0);
    bx.strokeStyle = rgba('120,92,58', 0.12);
    bx.lineWidth = 1;
    for (let x0 = span[0] - H; x0 < span[1]; x0 += 6) {
      bx.beginPath();
      bx.moveTo(x0, yP1);
      bx.lineTo(x0 + H * 0.5, yP0);
      bx.stroke();
    }
    bx.restore();
    // the plate: gold-bronze lacquer over cast iron, lit from above, its openings cut out
    const plate = new Path2D();
    const r = 0.05 * sy;
    plate.moveTo(span[0], yP1);
    plate.lineTo(span[0], yP0 + r);
    plate.lineTo(span[0] + r, yP0);
    plate.lineTo(span[1] - r, yP0);
    plate.lineTo(span[1], yP0 + r);
    plate.lineTo(span[1], yP1);
    plate.closePath();
    plate.addPath(windows);
    const gr = bx.createLinearGradient(0, yP0, 0, yP1);
    gr.addColorStop(0, rgba('196,150,70', 0.62));
    gr.addColorStop(0.4, rgba(C_UP.plate, 0.46));
    gr.addColorStop(1, rgba('120,88,40', 0.42));
    bx.fillStyle = gr;
    bx.fill(plate, 'evenodd');
    // the openings' cast rims: lit on top, in shadow below
    bx.strokeStyle = rgba('240,206,140', 0.45);
    bx.lineWidth = 1.2;
    bx.stroke(windows);
    // the pin block's band behind the pins
    bx.fillStyle = rgba(C_UP.plate, 0.12);
    bx.fillRect(span[0], Y(1.172, UZ.plate) - 3, span[1] - span[0], Y(1.09, UZ.plate) - Y(1.172, UZ.plate) + 6);
    // bridges on the board (treble along the strings' lower ends, the bass on its own), hitch pins
    for (const part of [treb, bass]) {
      if (part.length < 2) continue;
      // (dark maple under the strings: it shows between the action's parts, so it stays quiet)
      bx.strokeStyle = rgba(C_UP.bridge, 0.5);
      bx.lineWidth = Math.max(2, 0.014 * sy);
      bx.lineJoin = 'round';
      bx.beginPath();
      part.forEach((s, k) => (k ? bx.lineTo(s.b[0], s.b[1]) : bx.moveTo(s.b[0], s.b[1])));
      bx.stroke();
    }
    bx.fillStyle = rgba(C_UP.pin, 0.5);
    for (const s of strings) bx.fillRect(s.hitch[0] - 0.8, s.hitch[1] - 0.8, 1.6, 1.6);
    // strings at rest: steel trebles, copper-wound basses over their steel cores (bass last: in front)
    for (const s of [...treb, ...bass]) {
      for (const o of s.off) {
        bx.strokeStyle = rgba(INK.ivory, 0.2);
        bx.lineWidth = 0.6;
        bx.beginPath();
        bx.moveTo(s.pins[0][0] + o * 0, s.pins[0][1]);
        bx.lineTo(s.a[0] + o, s.a[1]);
        bx.lineTo(s.b[0] + o, s.b[1]);
        bx.lineTo(s.hitch[0] + o, s.hitch[1]);
        bx.stroke();
        if (s.p.wound) {
          bx.strokeStyle = rgba(INK.copper, 0.55);
          bx.lineWidth = Math.min(2.4, 0.9 + 1.4 * (1 - s.p.i / 26));
          bx.beginPath();
          bx.moveTo(s.a[0] + o + (s.b[0] - s.a[0]) * 0.03, s.a[1] + (s.b[1] - s.a[1]) * 0.03);
          bx.lineTo(s.b[0] + o - (s.b[0] - s.a[0]) * 0.03, s.b[1] - (s.b[1] - s.a[1]) * 0.03);
          bx.stroke();
        }
      }
    }
    // the red understring felt across the treble, under the pins; the pressure bar over the top
    // treble, brass agraffes for the rest
    bx.strokeStyle = rgba(C_UP.red, 0.7);
    bx.lineWidth = Math.max(1.5, 0.007 * sy);
    bx.beginPath();
    treb.forEach((s, k) => {
      const y = s.a[1] - 0.02 * sy;
      if (k) bx.lineTo(s.a[0], y);
      else bx.moveTo(s.a[0], y);
    });
    bx.stroke();
    const pb = treb.filter((s) => s.p.midi >= 74);
    if (pb.length > 1) {
      bx.strokeStyle = rgba('214,214,208', 0.55);
      bx.lineWidth = Math.max(2, 0.014 * sy);
      bx.beginPath();
      pb.forEach((s, k) => (k ? bx.lineTo(s.a[0], s.a[1] - 0.004 * sy) : bx.moveTo(s.a[0], s.a[1] - 0.004 * sy)));
      bx.stroke();
    }
    bx.fillStyle = rgba(C_UP.brass, 0.75);
    for (const s of strings) if (s.p.midi < 74) bx.fillRect(s.a[0] - Math.max(1.5, s.p.w * 0.18), s.a[1] - 2, Math.max(3, s.p.w * 0.36), 3);
    // tuning pins: a field of steel heads in staggered rows, each with its coil
    for (const s of strings)
      for (const [x, y] of s.pins) {
        bx.fillStyle = rgba(C_UP.pin, 0.75);
        bx.beginPath();
        bx.arc(x, y, Math.max(1.1, Math.min(2.2, s.p.w * 0.1)), 0, Math.PI * 2);
        bx.fill();
        bx.fillStyle = rgba('255,255,255', 0.5);
        bx.fillRect(x - 0.5, y - 1, 1, 0.8);
      }
  }
  // ---- the front layer: the action's fixed parts on the keybed (wippens, backchecks, catchers and
  //      their bridle tapes), the brackets, the hammer rail, the open fallboard, the keybed
  const { c: front, x: fx } = mk();
  {
    const xs = strings.map((s) => s.x);
    const w = (_p: Pt) => pitch * 0.82;
    const X = (p: Pt) => strings[p.i - strings[0].p.i].x;
    // the action's cast brackets at the section breaks (gold)
    fx.fillStyle = rgba(C_UP.plate, 0.55);
    for (const k of [0, Math.floor(pts.length * 0.3), Math.floor(pts.length * 0.62), pts.length - 1]) {
      const x = xs[k] + (k === 0 ? -whiteW : k === pts.length - 1 ? whiteW : 0);
      fx.fillRect(x - 2, Y(1.06, UZ.rail), 4, Y(0.7, UZ.wippen) - Y(1.06, UZ.rail));
    }
    // wippens: pale beech bodies, the jack's spring and the red felt of the heel
    fx.fillStyle = rgba(C_UP.beech, 0.55);
    for (const p of pts) fx.fillRect(X(p) - w(p) / 2, Y(UP.wippen[1], UZ.wippen), w(p), Y(UP.wippen[0], UZ.wippen) - Y(UP.wippen[1], UZ.wippen));
    // bridle wires and their white cotton tapes, the red leather of the hooks
    fx.strokeStyle = rgba('238,233,222', 0.55);
    fx.lineWidth = Math.max(0.8, Math.min(2, whiteW * 0.07));
    fx.beginPath();
    for (const p of pts) {
      const x = X(p) - w(p) * 0.3;
      fx.moveTo(x, Y(0.82, UZ.backcheck));
      fx.quadraticCurveTo(x - w(p) * 0.25, Y(0.84, UZ.backcheck), x + w(p) * 0.15, Y(0.86, UZ.catcher));
    }
    fx.stroke();
    fx.fillStyle = rgba(C_UP.red, 0.8);
    for (const p of pts) fx.fillRect(X(p) - w(p) * 0.36, Y(0.822, UZ.backcheck) - 1.5, 3, 3);
    // backchecks (pale, red felt facing the catcher) and catchers (green felt)
    for (const p of pts) {
      const x0 = X(p) - w(p) / 2;
      fx.fillStyle = rgba(C_UP.hornbeam, 0.6);
      fx.fillRect(x0, Y(UP.backcheck[1], UZ.backcheck), w(p), Y(UP.backcheck[0], UZ.backcheck) - Y(UP.backcheck[1], UZ.backcheck));
      fx.fillStyle = rgba(C_UP.green, 0.95);
      fx.fillRect(x0 + 0.5, Y(UP.catcher[1], UZ.catcher), w(p) - 1, Y(UP.catcher[0], UZ.catcher) - Y(UP.catcher[1], UZ.catcher));
    }
    // the hammer rail: beech, just under the heads, the full width of the action
    const yr0 = Y(UP.rail[1], UZ.rail);
    const yr1 = Y(UP.rail[0], UZ.rail);
    const rg = fx.createLinearGradient(0, yr0, 0, yr1);
    rg.addColorStop(0, rgba(C_UP.beech, 0.95));
    rg.addColorStop(1, rgba(C_UP.beech, 0.6));
    fx.fillStyle = rg;
    fx.beginPath();
    fx.roundRect(xs[0] - whiteW * 0.9, yr0, xs[xs.length - 1] - xs[0] + whiteW * 1.8, yr1 - yr0, 2);
    fx.fill();
    // the open fallboard: black lacquer leaning back over the key ends, its rounded top catching
    // the light; under it the felt it rests on, and the keybed's edge
    const yf0 = Y(UP.fall[1], UZ.fall);
    const yf1 = Y(UP.fall[0], UZ.fall);
    const fg = fx.createLinearGradient(0, yf0, 0, yf1);
    fg.addColorStop(0, rgba(C_UP.sheen, 0.95));
    fg.addColorStop(0.1, rgba('40,36,32', 0.95));
    fg.addColorStop(0.5, rgba(C_UP.lacquer, 0.92));
    fg.addColorStop(1, rgba('30,27,24', 0.92));
    fx.fillStyle = fg;
    fx.fillRect(span[0], yf0, span[1] - span[0], yf1 - yf0);
    fx.fillStyle = rgba(C_UP.red, 0.75);
    fx.fillRect(span[0], yf1 - 1.5, span[1] - span[0], 1.5);
    // the case's sides (where they show) and the top
    fx.fillStyle = rgba(C_UP.lacquer, 0.98);
    fx.fillRect(span[0] - whiteW * 2, Y(UP.top, UZ.plate) - 2, span[1] - span[0] + whiteW * 4, 0.025 * sy + 2);
    fx.fillRect(span[0] - whiteW * 2, Y(UP.top, UZ.plate), whiteW * 2, H);
    fx.fillRect(span[1], Y(UP.top, UZ.plate), whiteW * 2, H);
  }
  upCache = { key, Y, sy, strings, back, front, windows, box, span };
  return upCache;
}

function drawUpright(ctx: CanvasRenderingContext2D, W: number, H: number, g: PianoGeom, fr: VisualFrame | null, st: PianoState, field: ModeField, now: number): void {
  const keys = g.keys;
  if (!keys.length) return;
  st.maxL = keys.reduce((a, k) => Math.max(a, k.lengthM), 0);
  const pts: Pt[] = keys.map((k) => {
    const kx = g.keyX(k.midi);
    return { midi: k.midi, i: k.midi - 21, x: kx.x, w: kx.w, L: k.lengthM, k, wound: k.midi < 48 && k.nStrings <= 2 };
  });
  stepAction(pts, st);
  let whiteW = 0;
  for (const p of pts) whiteW = Math.max(whiteW, p.w);
  const dpr = ctx.getTransform().a || 1;
  const lay = upLayout(W, H, pts, whiteW, dpr);
  const { Y, sy } = lay;
  // ---- behind: board, plate, strings at rest (cached); the board's live modes in its openings
  ctx.drawImage(lay.back, 0, 0, W, H);
  const lv = field.update(fr?.modes ?? null, now / 1000);
  if (lv > 0.01) {
    ctx.save();
    ctx.clip(lay.windows);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(field.canvas, lay.span[0], Y(UP.plate[1], UZ.plate), lay.span[1] - lay.span[0], Y(UP.plate[0], UZ.plate) - Y(UP.plate[1], UZ.plate));
    ctx.restore();
  }
  // ---- the sounding strings glow over their resting lines
  const lv2 = levelsOf(fr, st);
  st.hits = [];
  for (const s of lay.strings) {
    const p = s.p;
    if (p.x < -p.w * 14 || p.x > W + p.w * 14) continue;
    st.hits.push({ midi: p.midi, x0: s.a[0], y0: s.a[1], x1: s.b[0], y1: s.b[1], w: p.w });
    const l = lv2.l(p.i);
    const sym = lv2.s(p.i);
    if (l <= 0.02 && sym <= SYM_VISIBLE) continue;
    for (const o of s.off) {
      ctx.strokeStyle = l >= sym ? rgba(INK.vermilion, 0.15 + 0.85 * l) : rgba(INK.amber, 0.08 + 0.47 * sym);
      ctx.lineWidth = l >= sym ? 1 + 1.6 * l : 0.9 + 0.9 * sym;
      ctx.beginPath();
      ctx.moveTo(s.a[0] + o, s.a[1]);
      ctx.lineTo(s.b[0] + o, s.b[1]);
      ctx.stroke();
    }
  }
  // ---- the practice muffler: a felt strip on a rail over the hammers, dropped by the middle pedal
  //      between hammers and strings
  {
    const d = st.middle * UP.mufDrop;
    const y0 = Y(UP.muffler[1] - d, UZ.muffler);
    const y1 = Y(UP.muffler[0] - d, UZ.muffler);
    const x0 = pts[0].x - whiteW;
    const x1 = pts[pts.length - 1].x + whiteW;
    ctx.fillStyle = rgba(C_UP.beech, 0.5);
    ctx.fillRect(x0, Y(UP.muffler[1] + 0.012 - d, UZ.muffler), x1 - x0, 0.012 * sy);
    ctx.fillStyle = rgba(C_UP.green, 0.28 + 0.5 * st.middle);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  // ---- the dampers' heads on the strings, 50 mm under the strike line (seen over the hammer
  //      rail, between the heads): lifted by their key or the sustain pedal, they come forward
  for (const s of lay.strings) {
    const p = s.p;
    if (!p.k.hasDamper || p.x < -p.w || p.x > W + p.w) continue;
    const d = st.damper[p.i];
    const z = UZ.damp - 0.012 * d;
    const yd0 = Y(UP.damp[1], z) + 2.5 * d;
    const yd1 = Y(UP.damp[0], z) + 2.5 * d;
    const x = s.a[0] + (s.b[0] - s.a[0]) * ((s.a[1] - yd1) / (s.a[1] - s.b[1] || 1));
    const wd = s.pitch * 0.62;
    ctx.fillStyle = rgba(C_UP.hornbeam, 0.55 + 0.25 * d);
    ctx.fillRect(x - wd / 2, yd0, wd, yd1 - yd0);
    ctx.fillStyle = d > 0.3 ? rgba(INK.amber, 0.35 + 0.4 * d) : rgba(C_UP.hFelt, 0.85);
    ctx.fillRect(x - wd / 2, yd0 - 1, wd, 2);
  }
  // ---- the shanks: up from the butts to the heads (they swing back as the hammer flies)
  const head = (p: Pt) => {
    const h = st.hammer[p.i];
    return { h, z: UZ.head + UZ.blow * h, y: 0 };
  };
  ctx.strokeStyle = rgba(C_UP.hornbeam, 0.75);
  ctx.lineWidth = Math.max(1, Math.min(2.6, whiteW * 0.11));
  ctx.beginPath();
  for (const s of lay.strings) {
    const p = s.p;
    if (s.x < -p.w || s.x > W + p.w) continue;
    const hd = head(p);
    ctx.moveTo(s.x, Y(UP.butt, UZ.shank));
    ctx.lineTo(s.x, Y(UP.strike - 0.012, UZ.shank + (hd.z - UZ.head)));
  }
  ctx.stroke();
  // ---- the fixed action in front (cached): catchers, backchecks, tapes, the hammer rail, the
  //      fallboard, the case
  ctx.drawImage(lay.front, 0, 0, W, H);
  // ---- the hammers on the strike line, seen from behind: the moulding's tail between the felt's
  //      shoulders; a strike carries the head to the strings (up, in this view) and lights it
  for (const s of lay.strings) {
    const p = s.p;
    if (s.x < -p.w || s.x > W + p.w) continue;
    const hd = head(p);
    const hs = 1.15 - 0.3 * ((p.midi - 21) / 87);
    const hh = 0.029 * hs * sy;
    const yc = Y(UP.strike, hd.z);
    const wh = s.pitch * 0.84;
    const flash = hd.h > 0.6 ? (hd.h - 0.6) / 0.4 : 0;
    ctx.fillStyle = flash > 0.02 ? rgba(INK.vermilion, 0.55 + 0.45 * flash) : rgba(C_UP.hFelt, 0.92);
    ctx.beginPath();
    ctx.roundRect(s.x - wh / 2, yc - hh / 2, wh, hh, Math.min(wh, hh) * 0.35);
    ctx.fill();
    ctx.fillStyle = flash > 0.02 ? rgba('150,60,40', 0.9) : rgba('150,96,62', 0.92);
    ctx.fillRect(s.x - wh * 0.4, yc - hh * 0.2, wh * 0.8, hh * 0.42);
  }
  // ---- the keys in front: white fronts and the sharps behind them, a held key dipping and lit
  {
    const yT = Y(UP.keyTop, UZ.key + 0.14);
    const yB = Y(UP.keyTop, UZ.key);
    const yF = Y(UP.keyTop - 0.022, UZ.key);
    for (const p of pts) {
      if (p.x < -p.w || p.x > W + p.w) continue;
      const black = [1, 3, 6, 8, 10].includes(p.midi % 12);
      const dn = st.down.has(p.midi) ? 1 : 0;
      const dip = dn * 0.01 * sy;
      if (!black) {
        ctx.fillStyle = dn ? rgba('246,214,196', 0.6) : rgba(INK.ivory, 0.26);
        ctx.fillRect(p.x - p.w / 2 + 0.5, yT + dip, p.w - 1, yB - yT);
        ctx.fillStyle = dn ? rgba(INK.vermilion, 0.6) : rgba('200,190,170', 0.5);
        ctx.fillRect(p.x - p.w / 2 + 0.5, yB + dip, p.w - 1, yF - yB);
      }
    }
    for (const p of pts) {
      if (p.x < -p.w || p.x > W + p.w) continue;
      if (![1, 3, 6, 8, 10].includes(p.midi % 12)) continue;
      const dn = st.down.has(p.midi) ? 1 : 0;
      const dip = dn * 0.01 * sy;
      const yb0 = Y(UP.keyTop + 0.012, UZ.key + 0.14);
      const yb1 = Y(UP.keyTop + 0.012, UZ.key + 0.05);
      ctx.fillStyle = dn ? rgba('120,60,48', 0.95) : rgba(C_UP.lacquer, 0.92);
      ctx.fillRect(p.x - p.w * 0.29, yb0 + dip, p.w * 0.58, yb1 - yb0 + Y(UP.keyTop - 0.002, UZ.key + 0.05) - yb1);
    }
    // the keybed and its key slip, below the keys
    ctx.fillStyle = rgba(C_UP.lacquer, 0.98);
    ctx.fillRect(lay.span[0] - whiteW * 2, yF, lay.span[1] - lay.span[0] + whiteW * 4, Math.max(4, 0.03 * sy));
  }
  st.src = { x: (lay.box.x0 + lay.box.x1) / 2, y: Y(0.5, UZ.plate) };
  st.caseBox = lay.box;
  st.lidEdge = null;
  // ---- every sounding string's live shape, then the last struck note's unisons in detail
  const ends = (p: Pt): [number, number, number, number] => {
    const s = lay.strings[p.i - lay.strings[0].p.i];
    return [s.a[0], s.a[1], s.b[0], s.b[1]];
  };
  const focus = fr?.focus ?? null;
  drawAllShapes(ctx, fr, new Map(pts.map((p) => [p.midi, p])), ends, st, W, focus?.midi ?? -1);
  if (focus) {
    const p = pts.find((q) => q.midi === focus.midi);
    if (p) {
      const n = focus.shapes.length;
      const sp = Math.min(2.4, p.w * 0.13);
      const [x0, y0, x1, y1] = ends(p);
      drawFocus(ctx, focus, (j) => {
        const o = (j - (n - 1) / 2) * sp;
        return [x0 + o, y0, x1 + o, y1];
      }, p.w, st);
    }
  }
}
