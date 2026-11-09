// One key's action, close up: key lever, wippen and jack (and the grand's repetition lever),
// escapement at the let-off button, the hammer's flight, strike and check, the damper, and the
// vibrating string. Driven by the engine's own record of that key:
//   * live: whether the key is held, the damper's contact (pedals included), the string's shape;
//   * each strike is replayed in slow motion from its record: the hammer's speed at the string,
//     the felt's contact force and compression over time, and the rebound that follows from
//     them (m·Δv = ∫F dt). The travel before the strike is reconstructed from that speed (the
//     jack accelerates the hammer from rest; it flies free for the last few mm).
// A schematic: the levers show the sequence; the hammer's travel and the string's position are
// in proportion (blow distance 47 mm grand / 45 mm upright, let-off 2.5 mm).
import { midiName, type VisualFrame, type WatchKey } from '@piano-model/engine';
import { audio } from '../audio.ts';
import { h } from './dom.ts';
import { AutoScale, INK, rgba } from './stage-draw.ts';

type Kind = 'grand' | 'upright';
const BLOW = { grand: 47, upright: 45 };
/** let-off: where the jack's toe meets its button, mm before the string (the grand's 2 mm as the 3D
 *  model's `G.letoff` and [Askenfelt-Jansson]'s 1-3 mm; the upright's 2.5) */
const LETOFF_OF = { grand: 2, upright: 2.5 };
const KEY_DIP = 10;
/** the check (backcheck catching the hammer) and, for the grand, where the repetition lever holds it */
const CHECK = { grand: 16, upright: 13 };
const REP = 9;
/** slowest replay of the travel before the strike, s (soft notes are slower) */
const MAX_DRIVE_S = 2.2;

interface Replay {
  t0: number;
  slow: number;
  vH: number;
  ta: number;
  tb: number;
  force: Float32Array;
  comp: Float32Array;
  fs: number;
  tc: number;
  vOut: number;
}

/** hammer height (mm above rest) and phase at physical time t (s) of a replay */
function replayAt(r: Replay, kind: Kind, t: number, held: boolean): { y: number; phase: 'drive' | 'free' | 'contact' | 'fall' | 'checked'; comp: number; escaped: boolean } {
  const D = BLOW[kind];
  const LETOFF = LETOFF_OF[kind];
  if (t < r.ta) return { y: (D - LETOFF) * (t / r.ta) ** 2, phase: 'drive', comp: 0, escaped: false };
  if (t < r.ta + r.tb) return { y: D - LETOFF + r.vH * 1000 * (t - r.ta), phase: 'free', comp: 0, escaped: true };
  const tc = t - r.ta - r.tb;
  if (tc < r.tc) {
    const i = Math.min(r.comp.length - 1, Math.floor(tc * r.fs));
    return { y: D, phase: 'contact', comp: r.comp[i] * 1000, escaped: true };
  }
  // after the strike: back down at the rebound speed, against gravity and the shank's spring
  const tf = tc - r.tc;
  const g = kind === 'grand' ? 9.8 : 14; // the upright's hammer is returned by a spring
  const y = D - r.vOut * 1000 * tf - 0.5 * g * 1000 * tf * tf;
  const stop = held ? D - CHECK[kind] : 0;
  if (y <= stop) return { y: stop, phase: held ? 'checked' : 'fall', comp: 0, escaped: true };
  return { y, phase: 'fall', comp: 0, escaped: true };
}

export function openActionView(opts: { midi: number; kind: Kind; host: HTMLElement; latest: () => VisualFrame | null; onClose: () => void }): { el: HTMLElement; close: () => void } {
  const { midi, kind } = opts;
  const canvas = h('canvas', { class: 'av-cv', 'data-tip-follow': '', role: 'img', 'aria-label': `The ${kind} action of ${midiName(midi)}: key, jack, hammer, damper and string` }) as HTMLCanvasElement;
  const close = h('button', { class: 'av-close', type: 'button', 'aria-label': 'Close', 'data-tip': 'close · Esc' }, '×');
  const name = h('div', { class: 'av-name' }, midiName(midi));
  const speed = h('div', { class: 'av-speed', 'aria-hidden': 'true' });
  const panel = h('div', { class: 'av-panel', tabindex: '-1', role: 'dialog', 'aria-label': `${midiName(midi)}: the ${kind} action` }, canvas, name, speed, close);
  const el = h('div', { class: 'action-view' }, panel);
  opts.host.append(el);
  audio.piano?.watchKey(midi);

  let replay: Replay | null = null;
  let lastSerial = -1;
  let first = true;
  let keyPos = 0; // 0 up … 1 down (eased), when not replaying
  let hamY = 0; // live hammer height (mm above rest)
  let jackOut = 0; // 0 under the knuckle … 1 tipped out
  const strScale = new AutoScale(1e-7, 0.985);
  let raf = 0;
  let playing = false;
  /** part names at canvas positions, from the last frame */
  let hover: [string, number, number][] = [];
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best = '';
    let bd = 22;
    for (const [n, px, py] of hover) {
      const d = Math.hypot(px - x, py - y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) canvas.dataset.tip = best;
    else delete canvas.dataset.tip;
  });

  const done = () => {
    cancelAnimationFrame(raf);
    audio.piano?.watchKey(null);
    window.removeEventListener('keydown', onKey, true);
    if (playing) audio.noteOff(midi, 'mouse');
    el.remove();
    opts.onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      done();
    }
  };
  window.addEventListener('keydown', onKey, true);
  close.addEventListener('click', done);
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el) done();
  });
  // press the drawn key (anywhere on the drawing) to play this note
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    playing = true;
    audio.noteOn(midi, 84, 'mouse');
  });
  const lift = () => {
    if (!playing) return;
    playing = false;
    audio.noteOff(midi, 'mouse');
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  window.setTimeout(() => panel.focus({ preventScroll: true }), 0);

  const loop = (now: number) => {
    const w = opts.latest()?.watch ?? null;
    const st = w?.strike;
    if (w && st && st.serial !== lastSerial) {
      // a new strike of this key: replay it (not the one that was there when the view opened)
      if (!first) replay = makeReplay(st, w, kind, now);
      lastSerial = st.serial;
    }
    first = false;
    draw(now, w);
    raf = requestAnimationFrame(loop);
  };

  function makeReplay(st: NonNullable<WatchKey['strike']>, w: WatchKey, k: Kind, now: number): Replay {
    const vH = Math.max(0.2, st.vHammer);
    const ta = (2 * (BLOW[k] - LETOFF_OF[k])) / 1000 / vH;
    const tb = LETOFF_OF[k] / 1000 / vH;
    let imp = 0;
    for (let i = 0; i < st.force.length; i++) imp += st.force[i] / st.fs;
    const vOut = Math.max(0.05 * vH, imp / Math.max(1e-4, w.hammerMass) - vH);
    const slow = Math.max(12, Math.min(40, ta > 0 ? MAX_DRIVE_S / ta : 25));
    return { t0: now, slow, vH, ta, tb, force: st.force, comp: st.compression, fs: st.fs, tc: Math.max(st.duration, st.force.length / st.fs), vOut };
  }

  function draw(now: number, w: WatchKey | null) {
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const held = !!w?.held;
    // ---- state: from the replay while it runs, else live
    let y = 0;
    let comp = 0;
    let phase = 'rest';
    let escaped = false;
    if (replay) {
      const t = (now - replay.t0) / 1000 / replay.slow;
      const r = replayAt(replay, kind, t, held);
      y = r.y;
      comp = r.comp;
      phase = r.phase;
      escaped = r.escaped;
      speed.textContent = `×1/${Math.round(replay.slow)}`;
      if ((r.phase === 'checked' || (r.phase === 'fall' && r.y <= 0)) && t > replay.ta + replay.tb + replay.tc + 0.05) {
        replay = null;
        hamY = y;
        jackOut = 1;
      }
    }
    if (!replay) {
      speed.textContent = '';
      const D = BLOW[kind];
      const target = held ? (kind === 'grand' && jackOut < 0.5 ? D - REP : D - CHECK[kind]) : 0;
      hamY += (target - hamY) * 0.25;
      y = hamY;
      // the jack resets under the knuckle once the key has risen (the grand's repetition lever
      // lets it do so with the key only part-way up)
      if (!held) jackOut = Math.max(0, jackOut - 0.08);
      escaped = jackOut > 0.5;
      phase = held ? 'checked' : 'rest';
    }
    const D = BLOW[kind];
    // the key follows the hammer while the jack drives it, then sits on the key bed while held
    const driveFrac = Math.min(1, y / (D - LETOFF_OF[kind]));
    const keyT = replay ? (phase === 'drive' ? driveFrac : held || phase !== 'fall' ? 1 : driveFrac) : held ? 1 : 0;
    keyPos += (keyT - keyPos) * (replay ? 1 : 0.35);
    // the damper: live from the engine (0 lifted … 1 on the string); while replaying, the key
    // lifts it in the second half of its travel, as on the instrument
    const damperLive = w ? w.damper : 1;
    const damperOn = replay && phase === 'drive' ? Math.max(Math.min(damperLive, 1 - smooth((keyPos - 0.45) / 0.45)), damperLive === 0 && held ? 0 : 0) : damperLive;
    const hasDamper = w ? w.hasDamper : true;
    // ---- layout: model units (≈ mm) into the canvas, y up
    const MW = kind === 'grand' ? 640 : 560;
    const MH = kind === 'grand' ? 300 : 460;
    const pad = 18;
    const s = Math.min((cw - 2 * pad) / MW, (ch - 2 * pad) / MH);
    const ox = (cw - MW * s) / 2;
    const oy = ch - (ch - MH * s) / 2;
    const X = (x: number) => ox + x * s;
    const Y = (yy: number) => oy - yy * s;
    const shape = w?.shape;
    let mx = 0;
    if (shape) for (let i = 0; i < shape.length; i++) mx = Math.max(mx, Math.abs(shape[i]));
    const sc = strScale.of(mx);
    const parts: [string, number, number][] = [];
    const pedals = opts.latest();
    const geo = { soft: pedals?.soft ?? 0, middle: pedals?.middle ?? 0, parts, X, Y, s, y, comp, keyPos, escaped: escaped || phase === 'free' || phase === 'contact' || phase === 'fall' || phase === 'checked', damperOn: hasDamper ? damperOn : 0, hasDamper, shape, sc, beta: w?.beta ?? 0.12, active: phase === 'drive' || phase === 'free' || phase === 'contact', contact: phase === 'contact', jackOut: replay ? (phase === 'drive' ? 0 : 1) : jackOut };
    if (kind === 'grand') drawGrand(ctx, { ...geo, midi, watch: w, sustain: pedals?.sustain ?? 0 });
    else drawUpright(ctx, { ...geo, midi, watch: w, sustain: pedals?.sustain ?? 0 });
    hover = parts.map(([n, px, py]) => [n, X(px), Y(py)] as [string, number, number]);
    if (!replay && held) jackOut = 1;
  }

  raf = requestAnimationFrame(loop);
  return { el, close: done };
}

const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

interface Geo {
  X: (x: number) => number;
  Y: (y: number) => number;
  s: number;
  /** hammer height above rest, mm */
  y: number;
  /** felt compression, mm */
  comp: number;
  /** key: 0 up … 1 on the key bed */
  keyPos: number;
  escaped: boolean;
  /** damper contact 0 lifted … 1 on the string */
  damperOn: number;
  hasDamper: boolean;
  shape: Float32Array | undefined;
  sc: number;
  beta: number;
  /** hammer moving towards / touching the string (drawn hot) */
  active: boolean;
  contact: boolean;
  jackOut: number;
  /** part names at their positions (model units), for the hover names */
  parts: [string, number, number][];
  /** the pedals, live: soft (an upright's half-blow rail) and the middle (an upright's muffler) */
  soft?: number;
  middle?: number;
}

function line(ctx: CanvasRenderingContext2D, pts: [number, number][], col: string, wid: number, g: Geo): void {
  ctx.strokeStyle = col;
  ctx.lineWidth = wid;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(g.X(x), g.Y(y)) : ctx.moveTo(g.X(x), g.Y(y))));
  ctx.stroke();
}
function rot(cx: number, cy: number, x: number, y: number, a: number): [number, number] {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * c];
}
function pivot(ctx: CanvasRenderingContext2D, x: number, y: number, g: Geo): void {
  ctx.fillStyle = rgba(INK.steel, 0.7);
  ctx.beginPath();
  ctx.arc(g.X(x), g.Y(y), 2.2, 0, Math.PI * 2);
  ctx.fill();
}
/** the string, with its live shape: from (x0,y0) (agraffe / pressure bar) towards the bridge */
function string(ctx: CanvasRenderingContext2D, g: Geo, x0: number, y0: number, dx: number, dy: number, len: number, visible: number): void {
  const nx = -dy;
  const ny = dx;
  ctx.strokeStyle = rgba(INK.ivory, 0.35);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(g.X(x0), g.Y(y0));
  ctx.lineTo(g.X(x0 + dx * visible), g.Y(y0 + dy * visible));
  ctx.stroke();
  const sh = g.shape;
  if (!sh) return;
  const amp = 9 / g.sc;
  ctx.strokeStyle = rgba(INK.vermilion, 0.9);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  const n = sh.length;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const d = f * len;
    if (d > visible) break;
    const o = sh[i] * amp;
    const x = x0 + dx * d + nx * o;
    const y = y0 + dy * d + ny * o;
    if (i) ctx.lineTo(g.X(x), g.Y(y));
    else ctx.moveTo(g.X(x), g.Y(y));
  }
  ctx.stroke();
}
function felt(ctx: CanvasRenderingContext2D, g: Geo, cx: number, cy: number, w: number, hgt: number, angle: number, hot: boolean, squash = 0): void {
  ctx.save();
  ctx.translate(g.X(cx), g.Y(cy));
  ctx.rotate(-angle);
  const W = w * g.s;
  const H = (hgt - squash) * g.s;
  ctx.beginPath();
  ctx.ellipse(0, 0, W / 2, H / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = hot ? rgba(INK.vermilion, 0.55) : rgba(INK.felt, 0.55);
  ctx.fill();
  ctx.strokeStyle = rgba(INK.felt, 0.9);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- grand (side section, player left)
// A section through this key, to scale, from the 3D grand (piano3d.ts `G`, `keyStick`, `hammerHead` and
// its wippen, jack, repetition lever and underlever; the modern Renner/Steinway geometry of
// [Erwin AR]): the key rocks on the balance rail (266 mm); its capstan (390) lifts the wippen
// (flanged at 456, 66 mm behind the capstan, the "spread" 113 mm behind the hammer flange at 340);
// the jack (99 mm in front of the wippen's centre) pushes the knuckle 17 mm from the hammer centre
// until its toe meets the let-off button and it tips out 2 mm before the string (escapement); the
// hammer (130 mm from its centre) flies, strikes from below, falls back and is caught by the
// backcheck on the key's tail; the repetition lever holds it so the jack can reset. The key's tail
// lifts the damper underlever (pivoted at 665), whose wire carries the head off the strings 37 mm
// behind the strike line (507); the sustain pedal's tray lifts every underlever. Above: the pin
// block under the plate's web, the tuning pins, the understring felt, the agraffe (a capo bar from
// key 74), the string over the belly rail and the soundboard glued over it (from 520).
// Deviation from the 3D model: the hammer's tail and the backcheck are shaped so that they meet at
// the check (the hammer 16 mm under the string, `CHECK`), as they do on a regulated action.
interface GrandGeo extends Geo {
  midi: number;
  watch: WatchKey | null;
  /** the sustain pedal (0 … 1): its tray lifts every underlever */
  sustain: number;
}
type Q = [number, number];
/** the 3D grand's action (piano3d.ts `G`), mm: z from the key front, y from the floor */
const GA = {
  balZ: 266,
  pivY: 698,
  stickTop: 722,
  keyTop: 725,
  keyLen: 560,
  capZ: 390,
  capH: 10,
  wipZ: 456,
  wipY: 748,
  jackZ: 357,
  knR: 17,
  hamZ: 340,
  hamY: 800,
  shank: 130,
  strikeZ: 470,
  strY: 895,
  bassAgY: 903,
  bassBrY: 927,
  damperZ: 507,
  ulZ: 665,
  ulY: 736,
  boardZ: 520,
  bellyZ: 550,
  boardY: 848,
  plateY: 882,
  plateFront: 195,
  dip: 10,
  /** the damper's full lift at the head, mm (as the 3D) */
  lift: 9.5,
  /** the key's lifter felt to the underlever's felt at rest: the damper starts to rise at about a
   *  third of the key's dip and is fully off at the bottom */
  ulGap: 3.3,
};
/** colours: the 3D materials (gl/mesh.ts) */
const GC = {
  lacquer: '14,12,11',
  sheen: '120,112,102',
  keyWood: '198,165,122',
  hornbeam: '226,201,154',
  actionWood: '168,123,76',
  maple: '168,122,72',
  buckskin: '179,152,118',
  hFelt: '236,228,207',
  underfelt: '120,30,34',
  red: '160,44,36',
  green: '44,96,72',
  brass: '214,176,101',
  steel: '201,204,208',
  plate: '170,128,60',
  plateLit: '236,198,122',
  spruce: '196,160,108',
  head: '30,26,23',
  dFelt: '217,214,207',
  bracket: '125,115,84',
  ivory: '240,235,223',
  ebony: '24,21,20',
};
/** the action bracket's cast profile (piano3d.ts), mm */
const BRACKET: Q[] = [
  [600, 682], [645, 682], [648, 710], [635, 742], [600, 752], [530, 752], [470, 760], [420, 776], [370, 800], [340, 822], [310, 828], [294, 815], [298, 795], [325, 782], [370, 762], [430, 744], [500, 738], [575, 735], [600, 720],
];
const egg = (a: number, b: number, c0: number, y0: number, n = 22): Q[] => {
  const out: Q[] = [];
  const t0 = Math.asin(Math.max(-1, Math.min(1, (y0 - c0) / b)));
  for (let k = 0; k <= n; k++) {
    const t = t0 + ((Math.PI - 2 * t0) * k) / n;
    out.push([a * Math.cos(t), c0 + b * Math.sin(t)]);
  }
  return out;
};
const HEAD_FELT = egg(14.5, 32, 16, 0);
const HEAD_UNDER = egg(9, 22.6, 16, 1.2);
// the moulding: as the 3D's, its tail drawn down and back to meet the backcheck
const HEAD_MOULD: Q[] = [[-9, -9.5], [5, -9.5], [9, -13], [11.5, -19.5], [15, -19], [15, -8], [12.8, -2], [9.5, 3], ...egg(7.5, 21.1, 16, 3, 14), [-9.5, 3], [-9.8, -2]];
let grandKey = 0;
let grandJack = 0;

function drawGrand(ctx: CanvasRenderingContext2D, g: GrandGeo): void {
  const cw = ctx.canvas.clientWidth;
  const ch = ctx.canvas.clientHeight;
  // the section shown (mm): key front to the underlever's rail, keybed to the dampers' heads; a tall
  // panel (a phone) shows the action from behind the key's front
  const narrow = cw / Math.max(1, ch) < 1.3;
  const z0 = narrow ? 215 : -14;
  const z1 = 712;
  const y0 = 640;
  const y1 = 950;
  const pad = 16;
  const top = narrow ? 52 : 40;
  const s = Math.min((cw - 2 * pad) / (z1 - z0), (ch - top - pad) / (y1 - y0));
  const ox = (cw - (z1 - z0) * s) / 2 - z0 * s;
  const oy = top + (ch - top - pad - (y1 - y0) * s) / 2 + y1 * s;
  const X = (z: number) => ox + z * s;
  const Y = (y: number) => oy - y * s;
  // hover names: positions in the panel's shared model units
  const part = (n: string, p: Q) => g.parts.push([n, (X(p[0]) - g.X(0)) / g.s, (g.Y(0) - Y(p[1])) / g.s]);
  const lw = (mm: number) => Math.max(0.6, mm * s);
  const shape = (pts: Q[], fill: string | null, stroke: string | null = null, w = 1) => {
    ctx.beginPath();
    pts.forEach(([z, y], k) => (k ? ctx.lineTo(X(z), Y(y)) : ctx.moveTo(X(z), Y(y))));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = w;
      ctx.stroke();
    }
  };
  const box = (za: number, ya: number, zb: number, yb: number, fill: string | null, stroke: string | null = null, w = 1) => shape([[za, ya], [zb, ya], [zb, yb], [za, yb]], fill, stroke, w);
  const poly = (pts: Q[], col: string, w: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([z, y], k) => (k ? ctx.lineTo(X(z), Y(y)) : ctx.moveTo(X(z), Y(y))));
    ctx.stroke();
  };
  const disc = (p: Q, r: number, fill: string, stroke: string | null = null) => {
    ctx.beginPath();
    ctx.arc(X(p[0]), Y(p[1]), Math.max(0.8, r * s), 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  };
  const centrePin = (p: Q) => {
    disc(p, 2.4, rgba('0,0,0', 0.6));
    disc(p, 1.4, rgba(GC.steel, 0.95));
  };
  const R = (c: Q, a: number) => (p: Q): Q => rot(c[0], c[1], p[0], p[1], a);
  const outline = rgba('0,0,0', 0.55);
  // the fixed frame (rails, blocks, the bracket) is drawn quiet, in outline; the moving parts solid
  const FIX = rgba(GC.actionWood, 0.26);
  const FIXS = rgba(GC.actionWood, 0.62);
  // ---- the key's string data
  const w = g.watch;
  const black = [1, 3, 6, 8, 10].includes(g.midi % 12);
  const nStr = w?.nStrings ?? 3;
  const wound = g.midi < 48 && nStr <= 2;
  const L = Math.max(40, (w?.lengthM ?? 1) * 1000);
  const beta = g.beta;
  const hs = 1.22 - 0.38 * ((g.midi - 21) / 87);
  const cB = wound ? Math.cos(0.18) : 1;
  const aZ = GA.strikeZ - cB * beta * L;
  const bZ = aZ + cB * L;
  const strAt = (z: number) => (wound ? GA.bassAgY + ((GA.bassBrY - GA.bassAgY) * (z - aZ)) / (bZ - aZ) : GA.strY);
  const hy = (strAt(GA.strikeZ) - 47 - GA.hamY) / 48;
  const webZ = Math.min(aZ - 8, GA.strikeZ - 16);
  const pinZ = Math.max(222, Math.min(270, webZ - 155));
  // ---- the state: during the drive the jack carries the knuckle, so the key follows the hammer
  //      (it is at 84 % of its dip at let-off, and goes on to the key bed after it)
  const driving = g.active && !g.escaped;
  const keyFromHammer = Math.min(1, (((g.y * GA.knR) / GA.shank / 99) * 66) / (GA.capZ - GA.balZ) / (GA.dip / GA.balZ));
  const keyT = driving ? keyFromHammer : g.keyPos;
  grandKey += (keyT - grandKey) * (driving || keyT < grandKey ? 1 : 0.35);
  const kp = grandKey;
  const kA = (kp * GA.dip) / GA.balZ;
  const K = R([GA.balZ, GA.pivY], kA);
  const capRise = (GA.capZ - GA.balZ) * Math.sin(kA);
  const wA = capRise / (GA.wipZ - GA.capZ);
  const Wp = R([GA.wipZ, GA.wipY], -wA);
  // the jack tips as its toe meets the button (and stays tipped while the hammer is free)
  const toe0: Q = [GA.jackZ - 19, GA.wipY + 4 + 9];
  const toeY = Wp(toe0)[1];
  const contactTip = Math.max(0, Math.min(0.3, Math.asin(Math.max(0, Math.min(1, (toeY - 767) / 19)))));
  const jTarget = Math.max(contactTip, g.escaped || g.jackOut > 0.5 ? 0.28 : 0);
  grandJack += (jTarget - grandJack) * (jTarget > grandJack ? 1 : 0.3);
  const jA = grandJack;
  const sA = Math.atan2(g.y, GA.shank);
  const Sh = R([GA.hamZ, GA.hamY], sA);
  // ---- background: the action bracket (cast, behind this key), the fallboard folded back
  const br = BRACKET;
  shape(br, rgba(GC.bracket, 0.12), rgba(GC.bracket, 0.38), 1);
  disc([392, 772.4], 7.2, rgba('8,7,6', 1));
  disc([622.5, 713], 8.5, rgba('8,7,6', 1));
  shape([[150, 730], [168, 730], [212, 862], [200, 868], [186, 866], [150, 760]], rgba(GC.lacquer, 1), rgba(GC.sheen, 0.6), 1);
  box(147, 722, 180, 730, rgba(GC.red, 0.6));
  // ---- the keybed and the key frame's rails
  box(-20, 648, 712, 682, rgba('34,29,25', 1));
  poly([[-20, 682], [712, 682]], rgba(GC.sheen, 0.5), 1);
  box(4, 682, 30, 692, FIX, FIXS, 0.8);
  box(8, 692, 26, 693.5, rgba(GC.red, 0.9));
  box(255, 682, 277, 698, FIX, FIXS, 0.8);
  box(520, 682, 560, 694, FIX, FIXS, 0.8);
  box(520, 694, 560, 698, rgba(GC.green, 0.9));
  part('key bed', [120, 665]);
  part('balance rail', [266, 690]);
  // ---- the action's rails: hammer flange rail, wippen rail, hammer rest rail, damper guide rail,
  //      the underlever rail
  box(298, 790, 332, 822, FIX, FIXS, 0.8);
  box(GA.wipZ - 16, 726, GA.wipZ + 16, 742, FIX, FIXS, 0.8);
  box(428, 775, 448, 790, FIX, FIXS, 0.8);
  box(428, 790, 448, 794, rgba(GC.green, 0.95));
  box(657, 698, 693, 742, FIX, FIXS, 0.8);
  part('hammer flange rail', [315, 806]);
  part('hammer rest rail', [438, 782]);
  part('wippen rail', [GA.wipZ, 734]);
  // ---- the string's surroundings: pin block, plate web, belly rail, soundboard and its ribs
  box(199, 826, 334, 866, rgba(GC.maple, 0.3), rgba(GC.maple, 0.7), 0.8);
  box(GA.plateFront, 866, webZ, 882, rgba(GC.plate, 0.85), rgba(GC.plateLit, 0.5), 0.8);
  shape([[197, 878], [216, 878], [216, 888], [212, 894], [201, 894], [197, 888]], rgba(GC.plate, 0.9), rgba(GC.plateLit, 0.5), 0.8);
  box(GA.boardZ, 788, GA.bellyZ, 839, rgba('22,19,17', 1), rgba(GC.sheen, 0.5), 0.8);
  box(GA.boardZ, 839, 712, GA.boardY, rgba(GC.spruce, 0.42), rgba(GC.spruce, 0.85), 0.8);
  for (const rz of [600, 690]) shape([[rz - 11.5, 839], [rz + 11.5, 839], [rz + 11.5, 824], [rz - 11.5, 824]], rgba(GC.spruce, 0.18), rgba(GC.spruce, 0.55), 0.8);
  box(494, 833, 520, 848, FIX, FIXS, 0.8);
  box(503.5, 833, 510.5, 848, rgba(GC.red, 0.6));
  part('pin block', [266, 846]);
  part('plate', [240, 874]);
  part('belly rail', [535, 810]);
  part('soundboard', [640, 844]);
  part('damper guide rail', [507, 840]);
  // ---- the key: stick, top, leads, capstan, backcheck and the damper lifter, rocking as one
  const keyPts = (pts: Q[]) => pts.map(K);
  shape(keyPts([[52, GA.pivY], [GA.keyLen, GA.pivY], [GA.keyLen, GA.stickTop], [52, GA.stickTop]]), rgba(GC.keyWood, 0.8), outline, 0.8);
  for (const lz of [180, 205]) disc(K([lz, 709]), 4.5, rgba('91,94,99', 0.95));
  if (black) {
    shape(keyPts([[50, 723], [145, 723], [145, 736.5], [58, 736.5], [50, 731]]), rgba(GC.ebony, 1), rgba(GC.sheen, 0.8), 0.8);
    shape(keyPts([[0, GA.pivY], [52, GA.pivY], [52, GA.stickTop], [0, GA.stickTop]]), rgba(GC.keyWood, 0.8), outline, 0.8);
  } else {
    shape(keyPts([[0, 703], [147, 703], [147, 725], [0, 725]]), rgba(GC.ivory, 0.95), rgba('0,0,0', 0.4), 0.8);
    shape(keyPts([[52, GA.pivY], [147, GA.pivY], [147, 703], [52, 703]]), rgba(GC.keyWood, 0.8), outline, 0.8);
  }
  // capstan: a brass screw with a rounded head
  shape(keyPts([[385.8, 722], [394.2, 722], [394.2, 729], [392, 732], [388, 732], [385.8, 729]]), rgba(GC.brass, 0.95), outline, 0.8);
  // backcheck: a wire up from the tail, its head faced with buckskin towards the hammer's tail
  poly(keyPts([[506, GA.stickTop], [497, 792]]), rgba(GC.steel, 0.9), lw(1.2));
  shape(keyPts([[488, 792], [501, 790], [504, 821], [492, 823]]), rgba(GC.actionWood, 0.95), outline, 0.8);
  shape(keyPts([[486, 792], [489, 792], [493, 823], [490, 823.5]]), rgba(GC.buckskin, 1));
  shape(keyPts([[538, GA.stickTop], [552, GA.stickTop], [552, GA.stickTop + 4], [538, GA.stickTop + 4]]), rgba(GC.red, 0.95));
  part('key', K([40, 725]));
  part('key lever', K([150, 712]));
  part('key leads', K([192, 709]));
  part('capstan', K([390, 728]));
  part('backcheck', K([494, 808]));
  part('damper lifter', K([545, 724]));
  centrePin([GA.balZ, GA.pivY]);
  // ---- the wippen on its flange: body, heel on the capstan, the repetition lever's post and spring
  const wipAbs = (pts: Q[]): Q[] => pts.map(([u, v]) => Wp([GA.wipZ + u, GA.wipY + v]));
  box(GA.wipZ - 6, 742, GA.wipZ + 10, 752, rgba(GC.hornbeam, 0.3), rgba(GC.hornbeam, 0.6), 0.8);
  shape(wipAbs([[9, -7], [9, 5], [-30, 7], [-80, 6], [-112, 4], [-112, -6], [-80, -10], [-45, -11], [-20, -9]]), rgba(GC.hornbeam, 0.85), outline, 0.8);
  shape(wipAbs([[-74, -16], [-58, -16], [-58, -10], [-74, -10]]), rgba(GC.buckskin, 1), outline, 0.6);
  shape(wipAbs([[-50, 4], [-40, 4], [-42, 31], [-49, 31]]), rgba(GC.hornbeam, 0.85), outline, 0.8);
  poly(wipAbs([[-30, 4], [-34, 16], [-50, 26]]), rgba(GC.steel, 0.8), lw(0.8));
  shape(wipAbs([[-107, 2], [-93, 2], [-93, 9], [-107, 9]]), rgba(GC.hornbeam, 0.85), outline, 0.6);
  centrePin([GA.wipZ, GA.wipY]);
  part('wippen', Wp([GA.wipZ - 60, GA.wipY - 2]));
  part('wippen heel', Wp([GA.wipZ - 66, GA.wipY - 13]));
  // ---- the let-off button over the jack's toe (hung from the hammer flange rail)
  box(338.2, 772, 339.8, 790, rgba(GC.brass, 0.9));
  shape([[334.8, 767], [343.2, 767], [343.2, 773], [334.8, 773]], rgba(GC.red, 0.95), outline, 0.6);
  part('let-off button', [339, 770]);
  // ---- the hammer: flange, shank, knuckle; the head at the shank's end
  box(330, 794, 350, 812, rgba(GC.hornbeam, 0.3), rgba(GC.hornbeam, 0.6), 0.8);
  const shk = (pts: Q[]) => pts.map(([u, v]) => Sh([GA.hamZ + u, GA.hamY + v]));
  shape(shk([[-6, -4.6], [GA.shank + 2, -3.5], [GA.shank + 2, 4.7], [-6, 4.6]]), rgba(GC.hornbeam, 0.95), outline, 0.8);
  shape(shk([[GA.knR - 8, -7.5], [GA.knR + 8, -7.5], [GA.knR + 8, -2], [GA.knR - 8, -2]]), rgba(GC.hornbeam, 0.95));
  const kn = Sh([GA.hamZ + GA.knR, GA.hamY - 11]);
  disc(kn, 6.5, rgba(GC.buckskin, 1), outline);
  // the repetition lever (on the wippen; the knuckle presses it down once the jack has tripped)
  const repC = Wp([GA.wipZ - 45, GA.wipY + 28]);
  const repA = 0.06 * Math.min(1, jA / 0.28) * Math.min(1, kp * 2);
  const repL = (pts: Q[]) => pts.map(([u, v]) => Wp(R([GA.wipZ - 45, GA.wipY + 28], repA)([GA.wipZ - 45 + u, GA.wipY + 28 + v])));
  shape(repL([[12, -3.5], [12, 4], [-72, 4], [-76, 0.5], [-72, -3], [-20, -3.5]]), rgba(GC.hornbeam, 0.95), outline, 0.8);
  shape(repL([[-60, -1.5], [-47, -1.5], [-47, 2.5], [-60, 2.5]]), rgba('20,17,15', 1));
  disc(repC, 1.6, rgba(GC.brass, 1));
  part('repetition lever', Wp(R([GA.wipZ - 45, GA.wipY + 28], repA)([GA.wipZ - 80, GA.wipY + 30])));
  // the jack: up from its flange on the wippen to the knuckle, its toe forward to the button; it
  // tips forward (towards the player) out from under the knuckle
  const jC: Q = [GA.jackZ, GA.wipY + 4];
  const jk = (pts: Q[]) => pts.map(([u, v]) => Wp(R(jC, jA)([GA.jackZ + u, GA.wipY + 4 + v])));
  const jackHot = driving && g.y > 0.5;
  shape(jk([[-3.2, 0], [3.5, 0], [3.5, 30.5], [-2.5, 30.5], [-3.2, 12], [-19, 9], [-20, 4.5], [-3.2, 3]]), jackHot ? rgba(INK.vermilion, 0.9) : rgba(GC.hornbeam, 0.95), jackHot ? rgba(INK.vermilion, 1) : outline, 0.8);
  centrePin(Wp(jC));
  part('jack', Wp(R(jC, jA)([GA.jackZ, GA.wipY + 20])));
  part('knuckle', kn);
  part('hammer shank', Sh([GA.hamZ + 70, GA.hamY]));
  part('hammer flange', [340, 806]);
  centrePin([GA.hamZ, GA.hamY]);
  // the head: maple moulding with its tail, the coloured underfelt and the felt; squashed on the
  // string while in contact; lit at the strike
  const head = (pts: Q[]) => pts.map(([a, c]) => Sh([GA.hamZ + GA.shank + a * hs, GA.hamY + c * hy]));
  const squash = g.contact ? Math.min(6, g.comp) : 0;
  const feltPts = head(HEAD_FELT.map(([a, c]): Q => [a, Math.min(c, 48 - squash / hy)]));
  const hot = g.contact ? 0.95 : g.active && g.escaped ? 0.55 : 0;
  shape(feltPts, hot ? rgba(INK.vermilion, hot) : rgba(GC.hFelt, 0.95), outline, 0.8);
  shape(head(HEAD_UNDER), rgba(GC.underfelt, 0.95));
  shape(head(HEAD_MOULD), rgba('196,152,100', 0.95), outline, 0.8);
  if (!hot) poly(head(HEAD_FELT.slice(8, 15).map(([a, c]): Q => [a * 0.92, Math.min(c, 48 - squash / hy) - 1.2])), rgba('255,252,244', 0.9), lw(1.4));
  part('hammer (felt)', Sh([GA.hamZ + GA.shank, GA.hamY + 40 * hy]));
  part('hammer tail', Sh([GA.hamZ + GA.shank + 12 * hs, GA.hamY - 15 * hy]));
  // ---- the damper: the underlever (lifted by the key's tail, the pedal's tray or, if latched, the
  //      sostenuto), its wire up through the guide rail, the head on the strings
  if (g.hasDamper) {
    const tailRise = (545 - GA.balZ) * Math.sin(kA);
    const byKey = (Math.max(0, tailRise - GA.ulGap) * (GA.ulZ - GA.damperZ)) / (GA.ulZ - 545);
    const byEngine = driving ? 0 : (1 - g.damperOn) * GA.lift;
    const tray = Math.min(1, g.sustain * 1.4) * GA.lift;
    const lift = Math.max(byKey, byEngine, tray);
    const ulA = -lift / (GA.ulZ - GA.damperZ);
    const U = R([GA.ulZ, GA.ulY], ulA);
    const ul = (pts: Q[]) => pts.map(([u, v]) => U([GA.ulZ + u, GA.ulY + v]));
    // the pedal's tray under the underlevers
    const trayAt = 605;
    const trayY = GA.ulY - 5.5 + (tray * (GA.ulZ - trayAt)) / (GA.ulZ - GA.damperZ);
    box(585, trayY - 10, 640, trayY, rgba(GC.actionWood, 0.6), g.sustain > 0.05 ? rgba(INK.amber, 0.5 + 0.4 * g.sustain) : outline, 0.8);
    part('damper tray (sustain pedal)', [612, trayY - 5]);
    const ulLen = GA.ulZ - GA.damperZ;
    shape(ul([[12, -5], [12, 6], [-ulLen - 14, 5], [-ulLen - 14, -4]]), rgba(GC.actionWood, 0.9), outline, 0.8);
    shape(ul([[-127, -9], [-112, -9], [-112, -4], [-127, -4]]), rgba(GC.red, 0.95));
    shape(ul([[-ulLen - 8, 5], [-ulLen + 8, 5], [-ulLen + 8, 12], [-ulLen - 8, 12]]), rgba(GC.hornbeam, 0.95), outline, 0.6);
    centrePin([GA.ulZ, GA.ulY]);
    // the sostenuto (the middle pedal): a rod along the underlevers; turned in, its lip catches the
    // tab of an underlever already raised, so that damper stays off after its key comes up
    shape(ul([[-98, 5], [-93, 5], [-93, 13], [-84, 13], [-84, 16.5], [-98, 16.5]]), rgba(GC.hornbeam, 0.95), outline, 0.6);
    const rodC: Q = [589, 744];
    const mid = g.middle ?? 0;
    const holding = mid > 0.5 && lift > 2 && byKey < 0.5 && tray < 1;
    const under = U([GA.ulZ - 88, GA.ulY + 12.4]);
    const lipA = holding ? Math.atan2(under[1] - rodC[1], under[0] - rodC[0]) : mid > 0.5 ? Math.PI * 1.08 : -Math.PI / 2;
    const lipL = holding ? Math.min(14, Math.hypot(under[0] - rodC[0], under[1] - rodC[1])) : 10;
    poly([rodC, [rodC[0] + Math.cos(lipA) * lipL, rodC[1] + Math.sin(lipA) * lipL]], holding ? rgba(INK.amber, 0.95) : rgba(GC.dFelt, 0.7), lw(2.2));
    disc(rodC, 3.4, rgba(GC.steel, 0.85), outline);
    part('sostenuto rod (middle pedal)', rodC);
    const yStr = strAt(GA.damperZ);
    const hb = yStr + 1.2 + lift;
    const wb = U([GA.damperZ, GA.ulY + 12]);
    poly([[GA.damperZ, wb[1]], [GA.damperZ, hb + 6]], rgba(GC.steel, 0.9), lw(1.1));
    const hh = wound ? 17 : 14;
    const lifted = lift > 2;
    const dz = GA.damperZ;
    shape([[dz - hh + 1, hb - 0.5], [dz + hh - 1, hb - 0.5], [dz + hh - 1, hb + 6], [dz - hh + 1, hb + 6]], rgba(GC.dFelt, 0.95), outline, 0.6);
    shape([[dz - hh, hb + 6], [dz + hh, hb + 6], [dz + hh, hb + 21], [dz + hh - 7, hb + 28], [dz - hh + 7, hb + 28], [dz - hh, hb + 21]], rgba(GC.head, 1), lifted ? rgba(INK.amber, 0.5 + 0.4 * Math.min(1, lift / GA.lift)) : rgba(GC.sheen, 0.8), lifted ? 1.2 : 0.8);
    box(dz - 2.4, hb + 27.5, dz + 2.4, hb + 31, rgba(GC.brass, 1));
    part('damper', [dz, hb + 16]);
    part('damper wire', [dz, (wb[1] + hb) / 2]);
    part('damper underlever', U([GA.ulZ - 60, GA.ulY]));
  }
  // ---- the string: from its tuning pin over the understring felt, through the agraffe (or under the
  //      capo bar), its speaking length over the belly rail and the board; live shape in vermilion
  const pinsZ = Array.from({ length: Math.max(1, nStr) }, (_, j) => pinZ + 24 * j + 12 * ((g.midi - 21) % 2));
  const feltZ = Math.min(Math.max(...pinsZ) + 40, aZ - 14);
  const yA = strAt(aZ);
  box(feltZ - 7, GA.plateY, feltZ + 7, yA - 0.8, rgba(GC.red, 0.95));
  for (const pz of pinsZ) {
    shape([[pz - 3.5, GA.plateY - 4], [pz + 3.5, GA.plateY - 4], [pz + 3.5, yA + 6], [pz + 2, yA + 8], [pz - 2, yA + 8], [pz - 3.5, yA + 6]], rgba(GC.steel, 0.85), outline, 0.6);
    box(pz - 4.2, yA - 1.5, pz + 4.2, yA + 1.5, rgba(GC.steel, 1));
  }
  const strCol = wound ? rgba('196,128,82', 0.95) : rgba(GC.steel, 0.85);
  const strW = lw(wound ? 3.4 : 1.1);
  poly([[pinsZ[pinsZ.length - 1], yA], [aZ, yA]], wound ? rgba(GC.steel, 0.7) : strCol, lw(1.1));
  const zEnd = Math.min(bZ, z1 + 40);
  poly([[aZ, yA], [zEnd, strAt(zEnd)]], strCol, strW);
  if (g.midi >= 74) {
    const y = yA + 0.6;
    shape([[aZ + 2, y], [aZ + 2, y + 12], [aZ - 6, y + 22], [aZ - 26, y + 22], [aZ - 32, y + 12], [aZ - 32, y]], rgba(GC.plate, 0.95), rgba(GC.plateLit, 0.6), 0.8);
    part('capo bar', [aZ - 14, y + 12]);
  } else {
    shape([[aZ - 7.5, GA.plateY], [aZ + 1.2, GA.plateY], [aZ + 1.2, yA + 3.5], [aZ - 1.5, yA + 6], [aZ - 4.5, yA + 6], [aZ - 7.5, yA + 3.5]], rgba(GC.brass, 0.95), outline, 0.6);
    part('agraffe', [aZ - 3, yA + 2]);
  }
  if (bZ < z1) {
    // a short treble string: its bridge on the board, then down to the hitch pin
    const yb = strAt(bZ);
    shape([[bZ - 16, GA.boardY], [bZ + 16, GA.boardY], [bZ + 11, yb - 0.8], [bZ - 11, yb - 0.8]], rgba(GC.maple, 0.9), outline, 0.8);
    box(bZ - 11, yb - 3.8, bZ + 11, yb - 0.8, rgba('58,42,28', 1));
    poly([[bZ, yb], [bZ + 75, GA.plateY + 7]], wound ? rgba(GC.steel, 0.6) : strCol, lw(1));
    part('bridge', [bZ, yb - 10]);
  }
  part('tuning pins', [pinsZ[0], yA + 4]);
  part('understring felt', [feltZ, GA.plateY + 6]);
  part('string', [GA.strikeZ + 40, strAt(GA.strikeZ + 40)]);
  part('strike point', [GA.strikeZ, strAt(GA.strikeZ)]);
  const sh = g.shape;
  if (sh) {
    const amp = 9 / g.sc;
    ctx.strokeStyle = rgba(INK.vermilion, 0.95);
    ctx.lineWidth = wound ? 1.6 : 1.3;
    ctx.beginPath();
    const n = sh.length;
    let started = false;
    for (let i = 0; i < n; i++) {
      const z = aZ + ((bZ - aZ) * i) / (n - 1);
      if (z > z1 + 40) break;
      const x = X(z);
      const y = Y(strAt(z) + sh[i] * amp);
      if (started) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      started = true;
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- upright (side section, player left)
// A section through this key, to scale, from the 3D upright (piano3d.ts `U`, a Yamaha U1, the
// parts as built there): the key rocks on its balance rail (215 mm); its capstan (335) lifts the
// front of the wippen, flanged at its back on the main rail (433); the wippen's jack (58 mm in
// front of its centre) pushes the hammer butt until its toe meets the let-off button and it tips
// out towards the player; the hammer (152 mm shank) swings into the strings at 478 and back, the
// catcher on the butt is caught by the backcheck on the wippen, and the bridle tape pulls it back
// as the key rises. Single escapement: no repetition lever. An underdamper: the damper lever,
// flanged behind the butt, is pushed at its foot by the wippen's spoon (or the sustain pedal's rail)
// and swings its head, on the strings 50 mm under the strike line, towards the player. The deep
// hammer rail just under the heads moves the hammers half-way to the strings with the soft pedal
// (half-blow); the middle pedal drops the practice muffler's felt between hammers and strings.
const UA = {
  balZ: 215,
  pivY: 698,
  stickTop: 722,
  keyTop: 725,
  keyLen: 420,
  capZ: 335,
  capH: 41,
  wipZ: 433,
  wipY: 780,
  jackZ: 375,
  buttZ: 385,
  buttY: 865,
  shank: 152,
  strike: 1017,
  strZ: 478,
  plateZ: 488,
  boardZ: 535,
  dampZ: 438,
  dampY: 880,
  dip: 10,
  blow: 45,
  mufZ: 462.5,
  /** the damper's head swings off the strings by about 4.5 mm at the felt */
  dampA: 0.05,
};
let uprightKey = 0;
let uprightJack = 0;
function drawUpright(ctx: CanvasRenderingContext2D, g: GrandGeo): void {
  const cw = ctx.canvas.clientWidth;
  const ch = ctx.canvas.clientHeight;
  // the section shown (mm): the key's front to the soundboard, the keybed to the tuning pins; a tall
  // panel (a phone) starts behind the key's front
  const narrow = cw / Math.max(1, ch) < 1.0;
  const z0 = narrow ? 140 : -12;
  const z1 = 560;
  const y0 = 645;
  const y1 = 1165;
  const pad = 16;
  const top = narrow ? 52 : 40;
  const s = Math.min((cw - 2 * pad) / (z1 - z0), (ch - top - pad) / (y1 - y0));
  const ox = (cw - (z1 - z0) * s) / 2 - z0 * s;
  const oy = top + (ch - top - pad - (y1 - y0) * s) / 2 + y1 * s;
  const X = (z: number) => ox + z * s;
  const Y = (y: number) => oy - y * s;
  const part = (n: string, p: Q) => g.parts.push([n, (X(p[0]) - g.X(0)) / g.s, (g.Y(0) - Y(p[1])) / g.s]);
  const shape = (pts: Q[], fill: string | null, stroke: string | null = null, w = 1) => {
    ctx.beginPath();
    pts.forEach(([z, y], k) => (k ? ctx.lineTo(X(z), Y(y)) : ctx.moveTo(X(z), Y(y))));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = w;
      ctx.stroke();
    }
  };
  const box = (za: number, ya: number, zb: number, yb: number, fill: string | null, stroke: string | null = null, w = 1) => shape([[za, ya], [zb, ya], [zb, yb], [za, yb]], fill, stroke, w);
  const poly = (pts: Q[], col: string, w: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([z, y], k) => (k ? ctx.lineTo(X(z), Y(y)) : ctx.moveTo(X(z), Y(y))));
    ctx.stroke();
  };
  const disc = (p: Q, r: number, fill: string, stroke: string | null = null) => {
    ctx.beginPath();
    ctx.arc(X(p[0]), Y(p[1]), Math.max(0.8, r * s), 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  };
  const centrePin = (p: Q) => {
    disc(p, 2.4, rgba('0,0,0', 0.6));
    disc(p, 1.4, rgba(GC.steel, 0.95));
  };
  const R = (c: Q, a: number) => (p: Q): Q => rot(c[0], c[1], p[0], p[1], a);
  const outline = rgba('0,0,0', 0.55);
  const FIX = rgba(GC.actionWood, 0.26);
  const FIXS = rgba(GC.actionWood, 0.62);
  const lw = (mm: number) => Math.max(0.6, mm * s);
  // ---- this key's string
  const w = g.watch;
  const nStr = w?.nStrings ?? 3;
  const wound = g.midi < 48 && nStr <= 2;
  const L = Math.max(40, (w?.lengthM ?? 0.6) * 1000);
  const zS = wound ? 470 : UA.strZ;
  const aY = UA.strike + g.beta * L;
  const bY = Math.max(y0 - 20, UA.strike - (1 - g.beta) * L);
  // ---- the state: the key follows the hammer while the jack drives it, then rests on the key bed
  const driving = g.active && !g.escaped;
  const fromHammer = Math.min(1, ((g.y / UA.shank) * 10 / 58) * (UA.wipZ - UA.capZ) / (UA.capZ - UA.balZ) / (UA.dip / UA.balZ));
  const keyT = driving ? fromHammer : g.keyPos;
  uprightKey += (keyT - uprightKey) * (driving || keyT < uprightKey ? 1 : 0.35);
  const kA = (uprightKey * UA.dip) / UA.balZ;
  const K = R([UA.balZ, UA.pivY], kA); // the back of the key rises
  const capRise = (UA.capZ - UA.balZ) * Math.sin(kA);
  const wA = capRise / (UA.wipZ - UA.capZ);
  const Wp = R([UA.wipZ, UA.wipY], -wA); // the wippen's front rises about its back
  const jTarget = g.escaped || g.jackOut > 0.5 ? 0.22 : 0;
  uprightJack += (jTarget - uprightJack) * (jTarget > uprightJack ? 1 : 0.3);
  // the hammer: the soft pedal's half-blow rest, the muffler's felt stopping it short of the string
  const half = (g.soft ?? 0) * 0.45 * UA.blow;
  const mu = g.middle ?? 0;
  const maxT = UA.blow - mu * (zS - UA.mufZ);
  const travel = Math.min(maxT, Math.max(g.y, half));
  const hA = Math.asin(Math.min(0.95, travel / UA.shank));
  const Sh = R([UA.buttZ, UA.buttY], -hA); // the shank swings towards the strings
  const off = g.hasDamper ? 1 - g.damperOn : 0;
  const Dm = R([UA.dampZ, UA.dampY], UA.dampA * off); // its head swings towards the player
  // ---- behind: the soundboard, the plate, the pin block, the string, its bridge
  box(UA.boardZ, y0, UA.boardZ + 9, y1, rgba(GC.spruce, 0.35), rgba(GC.spruce, 0.5), 0.8);
  shape([[UA.plateZ, y0], [UA.plateZ + 16, y0], [UA.plateZ + 16, 1180], [UA.plateZ, 1180]], rgba(GC.plate, 0.38), rgba(GC.plateLit, 0.45), 0.8);
  box(UA.plateZ + 12, 1080, UA.boardZ + 20, 1180, rgba(GC.maple, 0.45), rgba(GC.maple, 0.6), 0.8);
  part('plate', [UA.plateZ + 8, 820]);
  part('soundboard', [UA.boardZ + 4, 760]);
  part('pin block', [UA.boardZ, 1130]);
  // the tuning pin through the plate into the block, the agraffe (pressure bar in the top treble)
  const pinY = Math.min(1160, aY + 30);
  box(UA.plateZ - 12, pinY - 3.5, UA.plateZ + 20, pinY + 3.5, rgba(GC.steel, 0.85), outline, 0.6);
  poly([[UA.plateZ - 8, pinY], [zS, aY + 2]], rgba(GC.steel, 0.7), lw(1));
  if (g.midi >= 74) box(zS - 13, aY - 1, zS - 1, aY + 16, rgba(GC.steel, 0.7), outline, 0.6);
  else box(zS - 5, aY - 2, UA.plateZ, aY + 8, rgba(GC.brass, 0.85), outline, 0.6);
  box(zS + 1.5, aY + 16, UA.plateZ, aY + 24, rgba(GC.red, 0.8));
  part(g.midi >= 74 ? 'pressure bar' : 'agraffe', [zS - 4, aY + 4]);
  part('tuning pin', [UA.plateZ + 4, pinY]);
  // the bridge on the board, where the speaking length ends (if it is in view)
  if (bY > y0 + 4) {
    box(zS + 1, bY - 12, UA.boardZ, bY + 12, rgba(GC.maple, 0.8), outline, 0.6);
    part('bridge', [zS + 20, bY]);
  }
  // the string (its live shape over the speaking length, drawn sideways: the motion is towards the hammer)
  {
    ctx.strokeStyle = rgba(wound ? GC.brass : GC.steel, 0.55);
    ctx.lineWidth = Math.max(1, (wound ? 3 : 1) * s);
    ctx.beginPath();
    ctx.moveTo(X(zS), Y(aY));
    ctx.lineTo(X(zS), Y(bY));
    ctx.stroke();
    const sh = g.shape;
    if (sh) {
      const amp = 9 / g.sc;
      ctx.strokeStyle = rgba(INK.vermilion, 0.9);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < sh.length; i++) {
        const y = aY - ((aY - bY) * i) / (sh.length - 1);
        const z = zS - sh[i] * amp / s;
        if (i) ctx.lineTo(X(z), Y(y));
        else ctx.moveTo(X(z), Y(y));
      }
      ctx.stroke();
    }
    part('string', [zS, (UA.strike + aY) / 2 + 10]);
  }
  // ---- the fixed frame, quiet: keybed, key frame rails, the bracket, main rail, damper rail,
  //      let-off rail and its button
  box(z0 - 20, 655, 440, 682, rgba(GC.lacquer, 0.9), rgba(GC.sheen, 0.4), 0.8);
  box(4, 682, 30, 692, FIX, FIXS, 0.7);
  box(UA.balZ - 11, 682, UA.balZ + 11, 698, FIX, FIXS, 0.7);
  box(385, 682, 420, 698, FIX, FIXS, 0.7);
  part('key bed', [200, 668]);
  part('balance rail', [UA.balZ, 690]);
  const bracket: Q[] = [[360, 698], [470, 698], [470, 720], [452, 780], [468, 860], [470, 1000], [484, 1060], [484, 1090], [458, 1090], [448, 1000], [440, 900], [425, 790], [390, 730], [360, 720]];
  shape(bracket, rgba(GC.plate, 0.12), rgba(GC.plate, 0.4), 0.8);
  part('action bracket', [462, 940]);
  box(398, 815, 424, 848, FIX, FIXS, 0.8);
  box(448, 890, 462, 905, FIX, FIXS, 0.8);
  box(352, 822, 372, 832, FIX, FIXS, 0.8);
  box(358, 816, 366, 822, rgba(GC.red, 0.85));
  part('main rail', [411, 832]);
  part('damper rail', [455, 897]);
  part('let-off rail and button', [362, 822]);
  // ---- the key: stick, key top, leads, the capstan
  const stick: Q[] = [K([50, UA.pivY]), K([UA.keyLen, UA.pivY]), K([UA.keyLen, UA.stickTop]), K([50, UA.stickTop])];
  shape(stick, rgba(GC.keyWood, 0.95), outline, 0.7);
  shape([K([0, 703]), K([147, 703]), K([147, UA.keyTop]), K([0, UA.keyTop])], rgba(GC.ivory, 0.95), outline, 0.7);
  for (const z of [180, 205]) disc(K([z, 709]), 4.5, rgba('92,94,99', 0.95));
  const capBase = K([UA.capZ, UA.stickTop]);
  const capTop = K([UA.capZ, UA.stickTop + UA.capH]);
  box(capBase[0] - 4.2, capBase[1], capBase[0] + 4.2, capTop[1] - 2, rgba(GC.brass, 0.9), outline, 0.6);
  centrePin([UA.balZ, UA.pivY]);
  part('key', K([70, 715]));
  part('capstan', [capBase[0], (capBase[1] + capTop[1]) / 2]);
  // ---- the open fallboard over the key ends
  {
    const fb: Q[] = [[148, 729], [171, 729], [186, 792]];
    for (let k = 0; k <= 8; k++) {
      const a = (Math.PI * k) / 8;
      fb.push([176 + 11 * Math.cos(a) - 2 * Math.sin(a), 794 + 11 * Math.sin(a)]);
    }
    fb.push([157, 785]);
    shape(fb, rgba(GC.lacquer, 0.95), rgba(GC.sheen, 0.6), 0.8);
    part('fallboard', [168, 760]);
  }
  // ---- the wippen and what it carries: heel on the capstan, jack, backcheck, bridle wire and tape, spoon
  const W = (p: Q): Q => Wp([UA.wipZ + p[0], UA.wipY + p[1]]);
  shape([W([8, -8]), W([8, 6]), W([-30, 12]), W([-60, 12]), W([-112, 6]), W([-118, -2]), W([-110, -12]), W([-60, -12])], rgba(GC.hornbeam, 0.95), outline, 0.7);
  shape([W([-106, -17]), W([-90, -17]), W([-90, -11]), W([-106, -11])], rgba(GC.buckskin, 0.95));
  poly([W([-100, 6]), W([-108, 68])], rgba(GC.brass, 0.85), lw(1.4));
  shape([W([-116, 62]), W([-102, 62]), W([-100, 84]), W([-114, 86])], rgba(GC.hornbeam, 0.95), outline, 0.6);
  shape([W([-100, 64]), W([-97, 64]), W([-95, 83]), W([-100, 84])], rgba(GC.red, 0.95));
  poly([W([-112, 4]), W([-124, 46])], rgba(GC.brass, 0.85), lw(1.2));
  disc(W([-124, 46]), 2.5, rgba(GC.red, 0.95));
  poly([W([4, 4]), W([14, 30]), W([10, 58])], rgba(GC.steel, 0.85), lw(2.6));
  centrePin([UA.wipZ, UA.wipY]);
  part('wippen', W([-60, 0]));
  part('backcheck', W([-108, 74]));
  part('bridle wire', W([-120, 30]));
  part('damper spoon', W([12, 40]));
  // the jack: on the wippen, up to the butt; tipped out after let-off (its top towards the player)
  {
    const jp = W([UA.jackZ - UA.wipZ, 6]);
    const J = (p: Q): Q => rot(jp[0], jp[1], jp[0] + p[0], jp[1] + p[1], uprightJack);
    const hot = g.active && !g.escaped;
    shape([J([-3.5, 0]), J([3.5, 0]), J([3.5, 68]), J([-3.5, 68]), J([-3.5, 24]), J([-13, 20]), J([-13, 14]), J([-3.5, 14])], hot ? rgba(INK.vermilion, 0.9) : rgba(GC.hornbeam, 0.95), outline, 0.7);
    centrePin(jp);
    part('jack', J([0, 40]));
  }
  // ---- the damper: lever on its flange behind the butt, its red felt where the spoon pushes,
  //      the wire and the head on the string 50 mm under the strike line
  if (g.hasDamper) {
    const D = (p: Q): Q => Dm([UA.dampZ + p[0], UA.dampY + p[1]]);
    shape([D([-3.5, -30]), D([4.5, -30]), D([5.5, 68]), D([-2.5, 68])], rgba(GC.hornbeam, 0.9), outline, 0.6);
    shape([D([-8, -30]), D([-5, -30]), D([-5, -14]), D([-8, -14])], rgba(GC.red, 0.95));
    poly([D([3, 62]), D([22, 82])], rgba(GC.brass, 0.85), lw(1.2));
    shape([D([19, 74]), D([34, 74]), D([34, 100]), D([19, 100])], rgba(GC.hornbeam, 0.95), outline, 0.6);
    shape([D([34, 75.5]), D([40.2, 75.5]), D([40.2, 98.5]), D([34, 98.5])], off > 0.3 ? rgba(INK.amber, 0.9) : rgba(GC.dFelt, 0.95));
    centrePin([UA.dampZ, UA.dampY]);
    part('damper lever', D([0, 30]));
    part('damper', D([30, 88]));
  }
  // ---- the hammer: butt, catcher (green felt), shank, head; the bridle tape from the catcher's shank
  {
    const B = (p: Q): Q => Sh([UA.buttZ + p[0], UA.buttY + p[1]]);
    poly([W([-124, 50]), W([-128, 62]), W([-122, 74]), B([-25, 2]), B([-14, 1])], rgba('238,233,222', 0.85), lw(2.8));
    part('bridle tape', W([-126, 60]));
    shape([B([-14, -11]), B([13, -11]), B([14, 4]), B([8, 17]), B([-12, 17]), B([-15, 4])], rgba(GC.hornbeam, 0.95), outline, 0.7);
    shape([B([-14, -13.5]), B([0, -13.5]), B([0, -10.5]), B([-14, -10.5])], rgba(GC.buckskin, 0.95));
    poly([B([-13, 3]), B([-30, 0])], rgba(GC.hornbeam, 0.95), lw(3.6));
    shape([B([-40.5, -12]), B([-30, -11]), B([-28, 0]), B([-30, 10]), B([-38, 11]), B([-41.5, 2])], rgba(GC.hornbeam, 0.95), outline, 0.6);
    shape([B([-43, -12.5]), B([-40.2, -12.5]), B([-41.2, 2.5]), B([-38.5, 11.5]), B([-41, 11.8]), B([-44, 2])], rgba(GC.green, 0.95));
    shape([B([-3.6, 15]), B([3.6, 15]), B([3.3, UA.shank - 6]), B([-3.3, UA.shank - 6])], rgba(GC.hornbeam, 0.95), outline, 0.6);
    centrePin([UA.buttZ, UA.buttY]);
    part('hammer butt', B([0, 0]));
    part('catcher', B([-38, 0]));
    part('hammer shank', B([0, 80]));
    // the head: the felt's egg (crown towards the strings), the coloured underfelt, the moulding
    const hs = 1.15 - 0.3 * ((g.midi - 21) / 87);
    const H = (al: number, cr: number): Q => B([cr, UA.shank - al * hs]);
    const hot = g.active ? (g.contact ? 1 : 0.6) : 0;
    shape(HEAD_FELT.map(([al, cr]) => H(al, cr)), hot ? rgba(INK.vermilion, 0.55 + 0.4 * hot) : rgba(GC.hFelt, 0.97), outline, 0.7);
    shape(HEAD_UNDER.map(([al, cr]) => H(al, cr)), rgba(GC.underfelt, 0.95));
    shape([H(-5.8, -7.5), H(5.8, -7.5), H(6.8, 3), ...egg(7.5, 21.1, 16, 3, 14).map(([al, cr]) => H(al, cr)), H(-6.8, 3)], rgba('124,75,46', 0.95), outline, 0.6);
    part('hammer (felt)', H(0, 40));
  }
  // ---- the hammer rail (deep, just under the heads; it moves with the soft pedal), its felt
  {
    const dz = half * ((958 - UA.buttY + 16) / UA.shank);
    box(351 + dz, 958, 378 + dz, 990, rgba(GC.hornbeam, 0.85), outline, 0.7);
    box(378 + dz, 962, 381.4 + dz, 986, rgba(GC.green, 0.95));
    part('hammer rail', [365 + dz, 974]);
  }
  // ---- the practice muffler: its rail and felt above the hammers, dropped between hammer and string
  {
    const d = mu * 45;
    box(460.5, 1075 - d, 466.5, 1087 - d, rgba(GC.hornbeam, 0.8), outline, 0.6);
    box(UA.mufZ, 1038 - d, UA.mufZ + 3.5, 1076 - d, rgba(GC.green, 0.5 + 0.45 * mu));
    part('muffler', [UA.mufZ + 2, 1056 - d]);
  }
}
