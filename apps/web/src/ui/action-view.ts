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
const LETOFF = 2.5;
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
    const ta = (2 * (BLOW[k] - LETOFF)) / 1000 / vH;
    const tb = LETOFF / 1000 / vH;
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
    const driveFrac = Math.min(1, y / (D - LETOFF));
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
    const geo = { parts, X, Y, s, y, comp, keyPos, escaped: escaped || phase === 'free' || phase === 'contact' || phase === 'fall' || phase === 'checked', damperOn: hasDamper ? damperOn : 0, hasDamper, shape, sc, beta: w?.beta ?? 0.12, active: phase === 'drive' || phase === 'free' || phase === 'contact', contact: phase === 'contact', jackOut: replay ? (phase === 'drive' ? 0 : 1) : jackOut };
    if (kind === 'grand') drawGrand(ctx, geo);
    else drawUpright(ctx, geo);
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

// ---------------------------------------------------------------- grand (side view, player left)
// The key pivots on the balance rail; its capstan lifts the wippen, whose jack pushes the hammer
// shank's knuckle; the jack's toe meets the let-off button 2.5 mm before the string and the jack
// tips out (escapement); the hammer flies, strikes from below, falls back and is caught by the
// backcheck on the key's tail; the repetition lever then holds it up so the jack can reset with
// the key only part-way up. The key's tail lifts the damper underlever off the string.
function drawGrand(ctx: CanvasRenderingContext2D, g: Geo): void {
  const D = BLOW.grand;
  const yRest = 150; // hammer head centre at rest
  const yStr = yRest + 13 + D;
  const xHam = 430;
  const kA = (g.keyPos * KEY_DIP) / 240; // key angle about the balance rail (front down)
  // ---- key bed, balance rail, key
  line(ctx, [[0, 8], [600, 8]], rgba(INK.wood, 1), 3, g);
  const kp: [number, number] = [240, 26];
  const key = (x: number, yy: number) => rot(kp[0], kp[1], x, yy, kA);
  line(ctx, [key(0, 40), key(520, 40)], rgba(INK.felt, 0.8), 2, g);
  line(ctx, [key(0, 26), key(520, 26)], rgba(INK.felt, 0.35), 1, g);
  line(ctx, [key(0, 40), key(60, 40)], rgba(INK.ivory, 0.9), 4, g); // the key top
  pivot(ctx, kp[0], kp[1], g);
  g.parts.push(['key', ...key(30, 40)], ['key lever', ...key(150, 34)], ['balance rail', kp[0], kp[1]], ['key bed', 120, 8]);
  // ---- capstan → wippen (pivot at its front), jack, repetition lever
  const cap = key(350, 52);
  line(ctx, [key(350, 40), cap], rgba(INK.steel, 0.7), 2, g);
  const wp: [number, number] = [290, 78];
  const capRise = cap[1] - 52;
  const wA = capRise / 60; // wippen angle (rear up)
  const wip = (x: number, yy: number) => rot(wp[0], wp[1], x, yy, -wA * -1);
  line(ctx, [wp, wip(350, 60), wip(400, 66)], rgba(INK.wood, 1), 4, g);
  line(ctx, [wp, wip(350, 60), wip(400, 66)], rgba(INK.felt, 0.5), 1, g);
  pivot(ctx, wp[0], wp[1], g);
  // hammer shank: flange at the front, hammer at the back; angle from the hammer's height
  const sp: [number, number] = [300, 150];
  const sA = Math.atan2(g.y, xHam - sp[0]);
  const sh = (x: number, yy: number) => rot(sp[0], sp[1], x, yy, sA);
  const knuckle = sh(372, 141);
  // the jack: from the wippen up to the knuckle, or tipped forward after escapement
  const jb = wip(368, 66);
  const jTilt = g.escaped || g.jackOut > 0.5 ? 0.32 : 0;
  const jt = rot(jb[0], jb[1], jb[0], knuckle[1] - 2, jTilt);
  line(ctx, [jb, jt], g.active && !g.escaped ? rgba(INK.vermilion, 0.9) : rgba(INK.steel, 0.8), 2.4, g);
  // let-off button above the jack's toe
  line(ctx, [[352, 112], [362, 112]], rgba(INK.amber, 0.8), 3, g);
  g.parts.push(['capstan', ...cap], ['wippen', ...wip(340, 62)], ['jack', (jb[0] + jt[0]) / 2, (jb[1] + jt[1]) / 2], ['let-off button (escapement)', 357, 112]);
  // repetition lever: on the wippen, spring-loaded up under the knuckle
  const rp = wip(330, 96);
  const repUp = g.escaped ? Math.min(knuckle[1] - 4, rp[1] + 22) : rp[1] + 14;
  line(ctx, [rp, [knuckle[0] + 6, repUp]], rgba(INK.copper, 0.85), 2, g);
  pivot(ctx, rp[0], rp[1], g);
  g.parts.push(['repetition lever', (rp[0] + knuckle[0]) / 2, (rp[1] + repUp) / 2]);
  // shank and knuckle
  const hc = sh(xHam, yRest);
  line(ctx, [sp, hc], rgba(INK.wood, 1), 4, g);
  line(ctx, [sp, hc], rgba(INK.felt, 0.6), 1.2, g);
  ctx.fillStyle = rgba(INK.felt, 0.7);
  ctx.beginPath();
  ctx.arc(g.X(knuckle[0]), g.Y(knuckle[1]), 4, 0, Math.PI * 2);
  ctx.fill();
  pivot(ctx, sp[0], sp[1], g);
  // backcheck on the key's tail, catching the hammer's tail
  const bc0 = key(476, 40);
  const bc1 = key(470, 128);
  line(ctx, [bc0, bc1], rgba(INK.wood, 1), 3, g);
  felt(ctx, g, bc1[0] - 4, bc1[1] + 4, 9, 18, 0.5, false);
  // the hammer head, striking up into the string
  felt(ctx, g, hc[0], hc[1], 26, 30, sA, g.active, g.contact ? Math.min(8, g.comp * 6) : 0);
  g.parts.push(['hammer shank', ...sh(360, 150)], ['knuckle', ...knuckle], ['backcheck', bc1[0] - 4, bc1[1] + 4], ['hammer (felt)', ...hc]);
  // ---- string (agraffe at the left, bridge off to the right); the hammer strikes at β
  const L = (xHam - 360) / g.beta;
  string(ctx, g, 360, yStr, 1, 0, L, 600 - 360);
  line(ctx, [[352, yStr - 6], [360, yStr], [352, yStr + 6]], rgba(INK.steel, 0.8), 2, g); // agraffe
  g.parts.push(['agraffe', 356, yStr], ['string', 470, yStr], ['string', 580, yStr]);
  // ---- damper: underlever lifted by the key's tail, damper head on the string from above
  if (g.hasDamper) {
    const lift = (1 - g.damperOn) * 14;
    const tail = key(515, 40);
    const lp: [number, number] = [600, 70];
    const la = Math.atan2(lift, 600 - 510);
    const lev = (x: number, yy: number) => rot(lp[0], lp[1], x, yy, -la);
    line(ctx, [lev(505, 70), lp], rgba(INK.wood, 1), 3.5, g);
    pivot(ctx, lp[0], lp[1], g);
    line(ctx, [tail, lev(515, 70)], rgba(INK.felt, 0.4), 1, g);
    const wx = 540;
    const top = yStr + 4 + lift;
    line(ctx, [lev(wx, 70), [wx, top]], rgba(INK.steel, 0.6), 1.2, g);
    ctx.fillStyle = g.damperOn > 0.5 ? rgba(INK.amber, 0.6) : rgba(INK.amber, 0.3);
    ctx.fillRect(g.X(wx - 16), g.Y(top + 16), 32 * g.s, 16 * g.s);
    ctx.strokeStyle = rgba(INK.amber, 0.9);
    ctx.lineWidth = 1;
    ctx.strokeRect(g.X(wx - 16), g.Y(top + 16), 32 * g.s, 16 * g.s);
    g.parts.push(['damper', wx, top + 8], ['damper wire', wx, (top + 70) / 2], ['damper underlever', ...lev(560, 70)]);
  }
}

// ---------------------------------------------------------------- upright (side view, player left)
// The string hangs vertically behind the action; the key's capstan lifts the wippen, whose jack
// pushes the hammer butt so the hammer swings back into the string; the jack tips out at the
// let-off button; the catcher on the butt is caught by the backcheck on the wippen; the bridle
// tape pulls the hammer back as the key rises. The damper spoon on the wippen pushes the damper
// lever, swinging its head off the string. Single escapement: no repetition lever.
function drawUpright(ctx: CanvasRenderingContext2D, g: Geo): void {
  const D = BLOW.upright;
  const kA = (g.keyPos * KEY_DIP) / 200;
  line(ctx, [[0, 8], [470, 8]], rgba(INK.wood, 1), 3, g);
  const kp: [number, number] = [200, 26];
  const key = (x: number, yy: number) => rot(kp[0], kp[1], x, yy, kA);
  line(ctx, [key(0, 40), key(380, 40)], rgba(INK.felt, 0.8), 2, g);
  line(ctx, [key(0, 26), key(380, 26)], rgba(INK.felt, 0.35), 1, g);
  line(ctx, [key(0, 40), key(60, 40)], rgba(INK.ivory, 0.9), 4, g);
  pivot(ctx, kp[0], kp[1], g);
  g.parts.push(['key', ...key(30, 40)], ['key lever', ...key(130, 34)], ['balance rail', kp[0], kp[1]], ['key bed', 120, 8]);
  // capstan lifts the wippen's front; the wippen pivots at its back on the action rail
  const cap = key(330, 54);
  line(ctx, [key(330, 40), cap], rgba(INK.steel, 0.7), 2, g);
  const wp: [number, number] = [420, 120];
  const wA = (cap[1] - 54) / 90;
  const wip = (x: number, yy: number) => rot(wp[0], wp[1], x, yy, -wA);
  line(ctx, [wip(330, 58), wip(370, 96), wp], rgba(INK.wood, 1), 5, g);
  line(ctx, [wip(330, 58), wip(370, 96), wp], rgba(INK.felt, 0.5), 1, g);
  pivot(ctx, wp[0], wp[1], g);
  // the hammer: butt pivots at (420, 200); shank up to the head; it swings right into the string
  const bp: [number, number] = [415, 205];
  const R = 150; // butt pivot to hammer centre
  const xRest = bp[0];
  const hA = Math.asin(Math.min(0.9, g.y / R)); // clockwise swing towards the string
  const ham = (x: number, yy: number) => rot(bp[0], bp[1], x, yy, -hA);
  const head = ham(xRest, bp[1] + R);
  const xStr = xRest + 13 + D;
  line(ctx, [bp, head], rgba(INK.wood, 1), 3.5, g);
  line(ctx, [bp, head], rgba(INK.felt, 0.6), 1, g);
  // hammer rail the shanks rest against
  line(ctx, [[392, 250], [392, 290]], rgba(INK.felt, 0.35), 4, g);
  // butt, catcher (towards the player) and the backcheck on the wippen
  const butt = ham(402, 205);
  ctx.fillStyle = rgba(INK.felt, 0.6);
  ctx.beginPath();
  ctx.arc(g.X(butt[0]), g.Y(butt[1]), 7 * g.s, 0, Math.PI * 2);
  ctx.fill();
  const catcher = ham(372, 190);
  line(ctx, [ham(404, 200), catcher], rgba(INK.wood, 1), 3, g);
  felt(ctx, g, catcher[0], catcher[1], 9, 9, 0, false);
  const bcb = wip(372, 100);
  line(ctx, [bcb, [bcb[0] - 6, bcb[1] + 70]], rgba(INK.steel, 0.6), 1.2, g);
  felt(ctx, g, bcb[0] - 6, bcb[1] + 76, 8, 16, 0.3, false);
  // bridle tape: from the wippen to the butt
  ctx.strokeStyle = rgba(INK.ivory, 0.3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  const bw = wip(396, 104);
  ctx.moveTo(g.X(bw[0]), g.Y(bw[1]));
  ctx.quadraticCurveTo(g.X(bw[0] - 18), g.Y(bw[1] + 40), g.X(butt[0] - 6), g.Y(butt[1] - 4));
  ctx.stroke();
  // jack: from the wippen up to the butt; tipped out after let-off
  const jb = wip(394, 100);
  const jTilt = g.escaped || g.jackOut > 0.5 ? -0.3 : 0;
  const jt = rot(jb[0], jb[1], butt[0] + 2, butt[1] - 8, jTilt);
  line(ctx, [jb, jt], g.active && !g.escaped ? rgba(INK.vermilion, 0.9) : rgba(INK.steel, 0.8), 2.4, g);
  line(ctx, [[372, 168], [380, 168]], rgba(INK.amber, 0.8), 3, g); // let-off button
  pivot(ctx, bp[0], bp[1], g);
  // hammer head
  felt(ctx, g, head[0], head[1], 30, 26, -hA, g.active, g.contact ? Math.min(8, g.comp * 6) : 0);
  g.parts.push(['capstan', ...cap], ['wippen', ...wip(370, 96)], ['jack', (jb[0] + jt[0]) / 2, (jb[1] + jt[1]) / 2], ['let-off button (escapement)', 376, 168], ['hammer butt', ...butt], ['catcher', ...catcher], ['backcheck', bcb[0] - 6, bcb[1] + 76], ['bridle tape', bw[0] - 12, bw[1] + 30], ['hammer rail', 392, 270], ['hammer shank', (bp[0] + head[0]) / 2, (bp[1] + head[1]) / 2], ['hammer (felt)', ...head]);
  // ---- string: vertical; pressure bar above, bridge far below; the hammer strikes at β from the top
  const yTop = head[1] + 50;
  const L = 50 / g.beta;
  string(ctx, g, xStr, yTop, 0, -1, L, yTop - 20);
  line(ctx, [[xStr - 6, yTop + 6], [xStr, yTop], [xStr + 6, yTop + 6]], rgba(INK.steel, 0.8), 2, g);
  g.parts.push(['pressure bar', xStr, yTop], ['string', xStr, yTop - 120], ['string', xStr, 60]);
  // ---- damper: lever pivoted below; the spoon on the wippen pushes its foot, the head leaves the string
  if (g.hasDamper) {
    // the lever stands in front of the string (player's side), pivoted on the action rail; its
    // foot is pushed by the spoon, so its head swings off the string
    const off = (1 - g.damperOn) * 12;
    const dp: [number, number] = [448, 215];
    const yHead = bp[1] + R + 28;
    const da = Math.atan2(off, yHead - dp[1]);
    const dl = (x: number, yy: number) => rot(dp[0], dp[1], x, yy, da);
    const headPt = dl(dp[0], yHead);
    line(ctx, [dl(dp[0], 165), dp, headPt], rgba(INK.wood, 1), 3, g);
    pivot(ctx, dp[0], dp[1], g);
    const spoon = wip(430, 128);
    line(ctx, [wp, spoon, dl(dp[0] - 2, 168)], rgba(INK.steel, 0.6), 1.5, g);
    ctx.fillStyle = g.damperOn > 0.5 ? rgba(INK.amber, 0.6) : rgba(INK.amber, 0.3);
    const dx = xStr - 3 - 14 - off;
    ctx.fillRect(g.X(dx), g.Y(yHead + 14), 14 * g.s, 28 * g.s);
    ctx.strokeStyle = rgba(INK.amber, 0.9);
    ctx.lineWidth = 1;
    ctx.strokeRect(g.X(dx), g.Y(yHead + 14), 14 * g.s, 28 * g.s);
    line(ctx, [headPt, [dx + 7, yHead]], rgba(INK.steel, 0.5), 1, g);
    g.parts.push(['damper', dx + 7, yHead], ['damper lever', ...dl(dp[0], 190)], ['damper spoon', ...spoon]);
  }
}
