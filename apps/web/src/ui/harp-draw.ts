// The harp on the 2D stage (the drawn look): its plan (harp-plan.ts) at its real sizes in metres, from its
// side as it stands: the column with its crown, the neck's harmonic curve, the soundbox and its spruce
// soundboard, the base and the seven pedals behind it, the 47 strings plumb between the neck and the board,
// every C red and every F dark, the wire strings of the bass heavier. And its live state, the engine's own
// (the frame's `harp`): each string swings as wide as the engine says it does (the loudest few in their own
// shapes: the plucked triangle running out and back), the strings that only answer shimmer faintly, each
// pedal stands in its notch (up flat, middle natural, down sharp) and moves when the engine moves it, and
// the discs on the neck close on the strings of a pedal that is down.
import type { VisualFrame } from '@piano-model/engine';
import { BASE, BOARD_A, BOARD_B, BODY, COLUMN_R, COLUMN_X, COLUMN_Y0, COLUMN_Y1, CROWN_Y, DISC_DY, FEET, HP_X0, HP_X1, HP_Y0, HP_Y1, PEDAL_LEN, PEDAL_X, PEDAL_Y, STRINGS, STRING_X, STRING_Y0, STRING_Y1, neckLower, neckUpper, pedalFoot, pedalOf, stopY, type P } from './harp-plan.ts';
import { INK, rgba } from './stage-draw.ts';

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface HarpState {
  /** where the sound leaves (the soundboard's middle), px in the box drawn */
  src?: { x: number; y: number };
  /** each string's swing as drawn (eased from the engine's), and each pedal's place */
  amp?: Float32Array;
  ped?: Float32Array;
  t?: number;
  /** what was drawn last (px in the box drawn): the whole harp, the strings' band, the pedals' row; how many
   *  strings swing, the widest's index and its swing (px), each pedal's foot (px, y), the pedals' notches */
  drawn?: { body: Box; strings: Box; pedals: Box; ringing: number; widest: number; swing: number; pedalY: number[]; set: number[] };
}
export const newHarpState = (): HarpState => ({});
/** the harp's box on the stage, m (its plan with the margins its drawing keeps) */
export const harpBox = (): { w: number; h: number } => ({ w: (HP_X1 - HP_X0) / 0.9, h: (HP_Y1 - HP_Y0) / 0.9 });

export interface HpLayout {
  key: string;
  sc: number;
  ox: number;
  oy: number;
  top: number;
  column: Path2D;
  crown: Path2D;
  neck: Path2D;
  neckEdge: Path2D;
  body: Path2D;
  board: Path2D;
  base: Path2D;
  slots: Path2D;
}
const layouts = new Map<string, HpLayout>();
const poly = (pts: P[], X: (x: number) => number, Y: (y: number) => number, close = true): Path2D => {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(X(x), Y(y)) : p.moveTo(X(x), Y(y))));
  if (close) p.closePath();
  return p;
};

/** The layout for a W×H box (the file player's `top` px kept clear at its top): the harp as large as fits in
 *  90 % of the width and of the height under the player, centred. */
export function harpLayout(W: number, H: number, top = 0): HpLayout {
  const key = `${W}x${H}x${top}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const sc = Math.max(1, Math.min((W * 0.9) / (HP_X1 - HP_X0), ((H - top) * 0.9) / (HP_Y1 - HP_Y0)));
  const ox = W / 2 - ((HP_X0 + HP_X1) / 2) * sc;
  const oy = top + (H - top) / 2 + ((HP_Y0 + HP_Y1) / 2) * sc;
  const X = (x: number) => ox + x * sc;
  const Y = (y: number) => oy - y * sc;
  const column = new Path2D();
  // (a fluted shaft, a little wider at its foot and under the crown)
  column.moveTo(X(COLUMN_X - COLUMN_R * 1.25), Y(COLUMN_Y0));
  column.lineTo(X(COLUMN_X - COLUMN_R), Y(COLUMN_Y0 + 0.08));
  column.lineTo(X(COLUMN_X - COLUMN_R * 0.92), Y(COLUMN_Y1 - 0.08));
  column.lineTo(X(COLUMN_X - COLUMN_R * 1.2), Y(COLUMN_Y1));
  column.lineTo(X(COLUMN_X + COLUMN_R * 1.2), Y(COLUMN_Y1));
  column.lineTo(X(COLUMN_X + COLUMN_R * 0.92), Y(COLUMN_Y1 - 0.08));
  column.lineTo(X(COLUMN_X + COLUMN_R), Y(COLUMN_Y0 + 0.08));
  column.lineTo(X(COLUMN_X + COLUMN_R * 1.25), Y(COLUMN_Y0));
  column.closePath();
  const crown = poly([[COLUMN_X - 0.05, COLUMN_Y1], [COLUMN_X - 0.058, COLUMN_Y1 + 0.02], [COLUMN_X - 0.04, CROWN_Y - 0.012], [COLUMN_X - 0.012, CROWN_Y + 0.012], [COLUMN_X + 0.03, CROWN_Y], [COLUMN_X + 0.06, COLUMN_Y1 + 0.03], [COLUMN_X + 0.05, COLUMN_Y1]], X, Y);
  const neck = poly([...neckLower, ...[...neckUpper].reverse()], X, Y);
  const neckEdge = poly(neckLower, X, Y, false);
  const L: HpLayout = { key, sc, ox, oy, top, column, crown, neck, neckEdge, body: poly(BODY, X, Y), board: poly([BOARD_A, BOARD_B], X, Y, false), base: poly(BASE, X, Y), slots: new Path2D() };
  for (const f of FEET) L.base.addPath(poly(f, X, Y));
  PEDAL_X.forEach((x) => {
    L.slots.moveTo(X(x), Y(PEDAL_Y + 0.034));
    L.slots.lineTo(X(x), Y(PEDAL_Y - 0.034));
  });
  if (layouts.size > 8) layouts.clear();
  layouts.set(key, L);
  return L;
}

/** the frame into what both styles draw: each string's swing (0…1, eased so a pluck swells in a frame and
 *  dies as the engine's does), each pedal's place (the engine's, −1 … 1), the engine's pedal notches */
export function harpLive(fr: VisualFrame | null, st: HarpState, now: number): { amp: Float32Array; ped: Float32Array; set: number[]; shapes: Map<number, Float32Array> } {
  const hv = fr?.harp ?? null;
  const amp = (st.amp ??= new Float32Array(STRINGS.length));
  const ped = (st.ped ??= new Float32Array(7));
  const dt = Math.min(0.1, Math.max(0, (now - (st.t ?? now)) / 1000));
  st.t = now;
  const kUp = 1 - Math.exp(-dt / 0.012);
  const kDn = 1 - Math.exp(-dt / 0.06);
  for (let i = 0; i < amp.length; i++) {
    const a = hv ? Math.min(1, hv.amp[i] ?? 0) : 0;
    amp[i] += (a - amp[i]) * (a > amp[i] ? kUp : kDn);
    if (amp[i] < 1e-4) amp[i] = 0;
  }
  for (let k = 0; k < 7; k++) ped[k] = hv ? hv.pedals[k] : ped[k] * (1 - kDn);
  const shapes = new Map<number, Float32Array>();
  if (hv) for (const s of hv.shapes) shapes.set(s.string, s.shape);
  return { amp, ped, set: hv ? hv.set : [0, 0, 0, 0, 0, 0, 0], shapes };
}

/** a string's swing in px for its amplitude (a hard pluck at the middle of a long string swings about 12 mm
 *  either way; drawn at least a few px wide so that a soft one still shows) */
export const swingPx = (a: number, i: number, sc: number): number => (a <= 0 ? 0 : Math.max(1.2, Math.sqrt(a) * Math.min(0.016, 0.004 + 0.012 * STRINGS[i].length) * sc));

/** record what was drawn */
export function harpRecord(L: HpLayout, st: HarpState, lv: ReturnType<typeof harpLive>): void {
  const X = (x: number) => L.ox + x * L.sc;
  const Y = (y: number) => L.oy - y * L.sc;
  const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0: X(x0), y0: Y(y1), x1: X(x1), y1: Y(y0) });
  let ringing = 0;
  let widest = -1;
  let swing = 0;
  for (let i = 0; i < lv.amp.length; i++) {
    if (lv.amp[i] > 0.01) ringing++;
    const w = swingPx(lv.amp[i], i, L.sc);
    if (w > swing) [swing, widest] = [w, i];
  }
  st.drawn = {
    body: box(HP_X0, HP_Y0, HP_X1, HP_Y1),
    strings: box(STRING_X[0] - 0.01, STRING_Y0[0], STRING_X[STRINGS.length - 1] + 0.01, STRING_Y1[0]),
    pedals: box(PEDAL_X[0] - 0.02, PEDAL_Y - 0.05, PEDAL_X[6] + PEDAL_LEN, PEDAL_Y + 0.05),
    ringing,
    widest,
    swing,
    pedalY: Array.from(lv.ped, (p, k) => Y(pedalFoot(k, p)[1])),
    set: lv.set.slice(),
  };
  st.src = { x: X(0.5 * (BOARD_A[0] + BOARD_B[0]) + 0.05), y: Y(0.5 * (BOARD_A[1] + BOARD_B[1])) };
}

const STRING_INK = { red: '214,72,58', black: '96,112,150', gut: '236,226,206', nylon: '244,240,232', wire: '196,168,120' };
export const stringInk = (i: number): string => (STRINGS[i].colour === 'red' ? STRING_INK.red : STRINGS[i].colour === 'black' ? STRING_INK.black : STRINGS[i].material === 'wire' ? STRING_INK.wire : STRINGS[i].material === 'nylon' ? STRING_INK.nylon : STRING_INK.gut);

/** The harp from its side. `top`: the file player's px over the box's top. */
export function drawHarp(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: HarpState, top = 0): void {
  const L = harpLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const lv = harpLive(fr, st, performance.now());
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- the body: the soundbox's side (maple, darker towards its back), the soundboard's edge (spruce)
  {
    const g = ctx.createLinearGradient(X(BOARD_A[0]), Y(BOARD_A[1]), X(BOARD_A[0] + 0.3), Y(BOARD_A[1] - 0.2));
    g.addColorStop(0, '#6a4a22');
    g.addColorStop(0.5, '#4a3216');
    g.addColorStop(1, '#2a1b0c');
    ctx.fillStyle = g;
    ctx.fill(L.body);
    ctx.strokeStyle = rgba(INK.amber, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke(L.body);
    ctx.strokeStyle = 'rgba(226,190,130,0.85)';
    ctx.lineWidth = Math.max(1.5, 0.012 * sc);
    ctx.stroke(L.board);
  }
  // ---- the base and its feet, the pedals' slots
  ctx.fillStyle = '#3a2812';
  ctx.fill(L.base);
  ctx.strokeStyle = rgba(INK.amber, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke(L.base);
  // ---- the column (fluted maple, gilded) and its crown
  {
    const g = ctx.createLinearGradient(X(COLUMN_X - COLUMN_R), 0, X(COLUMN_X + COLUMN_R), 0);
    g.addColorStop(0, '#5a3f1a');
    g.addColorStop(0.3, '#c9a25a');
    g.addColorStop(0.55, '#7a5826');
    g.addColorStop(1, '#3a2812');
    ctx.fillStyle = g;
    ctx.fill(L.column);
    ctx.strokeStyle = rgba(INK.amber, 0.55);
    ctx.stroke(L.column);
    ctx.fillStyle = '#b8924a';
    ctx.fill(L.crown);
    ctx.fillStyle = 'rgba(255,236,190,0.18)';
    ctx.fill(L.crown);
    ctx.strokeStyle = rgba(INK.amber, 0.7);
    ctx.stroke(L.crown);
  }
  // ---- the neck (the action's brass plates along its lower edge)
  {
    const g = ctx.createLinearGradient(0, Y(CROWN_Y), 0, Y(1.3));
    g.addColorStop(0, '#7a5826');
    g.addColorStop(1, '#3f2b12');
    ctx.fillStyle = g;
    ctx.fill(L.neck);
    ctx.strokeStyle = rgba(INK.amber, 0.55);
    ctx.lineWidth = 1;
    ctx.stroke(L.neck);
    ctx.strokeStyle = 'rgba(214,176,101,0.75)';
    ctx.lineWidth = Math.max(1.2, 0.016 * sc);
    ctx.lineCap = 'butt';
    ctx.stroke(L.neckEdge);
    ctx.lineCap = 'round';
  }
  // ---- the strings: each from the board to its sounding top (under its discs when its pedal is down)
  const small = sc < 260;
  for (let i = 0; i < STRINGS.length; i++) {
    const s = STRINGS[i];
    const x = X(STRING_X[i]);
    const y0 = Y(STRING_Y0[i]);
    const acc = lv.set[pedalOf(i)] ?? 0;
    const yTop = Y(STRING_Y1[i]);
    const y1 = Y(stopY(i, lv.ped[pedalOf(i)]));
    const ink = stringInk(i);
    const a = lv.amp[i];
    const w = swingPx(a, i, sc);
    const lw = Math.max(small ? 0.7 : 0.9, (s.material === 'wire' ? 0.0026 : s.material === 'gut' ? 0.0016 : 0.0012) * sc);
    // (the length above the disc that stops it: still, dimmer)
    if (y1 > yTop + 0.5) {
      ctx.strokeStyle = rgba(ink, 0.35);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    if (w > 0) {
      // its swing: the envelope, and (the loudest few) its own shape now
      const sh = lv.shapes.get(i);
      ctx.fillStyle = rgba(ink, 0.1 + 0.2 * Math.min(1, a * 3));
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.quadraticCurveTo(x + 2 * w, (y0 + y1) / 2, x, y0);
      ctx.quadraticCurveTo(x - 2 * w, (y0 + y1) / 2, x, y1);
      ctx.fill();
      ctx.strokeStyle = rgba(ink, 0.95);
      ctx.lineWidth = lw;
      ctx.beginPath();
      if (sh && sh.length > 2) {
        let pk = 1e-9;
        for (let k = 0; k < sh.length; k++) pk = Math.max(pk, Math.abs(sh[k]));
        // (the shape runs board 0 → neck 1; drawn as wide as the envelope)
        for (let k = 0; k < sh.length; k++) {
          const u = k / (sh.length - 1);
          const px = x + (sh[k] / pk) * w;
          const py = y0 + (y1 - y0) * u;
          if (k) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
      } else {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = rgba(ink, s.colour === 'plain' ? 0.62 : 0.9);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    // the discs on the neck: the upper closes for the natural, the lower too for the sharp
    if (!small)
      for (let d = 0; d < 2; d++) {
        const on = acc >= d;
        ctx.fillStyle = on ? 'rgba(236,206,140,0.95)' : 'rgba(150,120,70,0.5)';
        ctx.beginPath();
        ctx.arc(x + (on ? 0 : 0.004 * sc), yTop + DISC_DY[d] * Math.min(1, s.length / 0.12) * sc, Math.max(0.9, 0.0032 * sc), 0, 2 * Math.PI);
        ctx.fill();
      }
  }
  // ---- the pedals: seven levers in their slots, each at its notch (up flat, middle natural, down sharp)
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = Math.max(2, 0.014 * sc);
  ctx.stroke(L.slots);
  for (let k = 0; k < 7; k++) {
    const [fx, fy] = pedalFoot(k, lv.ped[k]);
    const moved = Math.abs(lv.ped[k]) > 0.02;
    ctx.strokeStyle = moved ? 'rgba(236,206,140,0.95)' : 'rgba(190,160,100,0.8)';
    ctx.lineWidth = Math.max(1.6, 0.011 * sc);
    ctx.beginPath();
    ctx.moveTo(X(PEDAL_X[k] - 0.035), Y(PEDAL_Y + 0.004));
    ctx.lineTo(X(fx), Y(fy));
    ctx.lineTo(X(fx + PEDAL_LEN * 0.5), Y(fy - 0.004));
    ctx.stroke();
  }
  ctx.restore();
  harpRecord(L, st, lv);
}
