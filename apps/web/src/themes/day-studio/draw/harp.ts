// Day Studio: the harp on the 2D stage, maple and gilding on the pale ground, the strings in tones that
// read on the plaster (one that sounds is drawn in the blue), a pedal out of its middle notch and a disc
// closed in ink. Its layout and live state are the shared drawer's (ui/harp-draw.ts).
import type { VisualFrame } from '@piano-model/engine';
import { harpLayout, harpLive, harpRecord, type HarpState, type HpLayout, PLUCK_SHOWN, pluckXY, swingPx } from '../../../ui/harp-draw.ts';
import { BOARD_A, COLUMN_R, COLUMN_X, CROWN_Y, DISC_DY, discScale, HP_X0, HP_X1, HP_Y0, HP_Y1, PEDAL_LEN, PEDAL_X, PEDAL_Y, pedalFoot, pedalOf, PIN_DY, stopY, STRING_X, STRING_Y0, STRING_Y1, STRINGS } from '../../../ui/harp-plan.ts';
import { INK, rgba } from '../../../ui/stage-draw.ts';
import { BRASS, floorShadow, type FloorShadow } from './kit.ts';

// the strings' tones on the plaster: every C red, every F dark (a blue-black), gut a tan, nylon a cool grey,
// the wound wire strings of the bass a bronze
const STRING_INK = { red: '204,52,42', black: '34,44,78', gut: '156,130,92', nylon: '128,136,146', wire: '134,98,40' };
export const stringInk = (i: number): string => (STRINGS[i].colour === 'red' ? STRING_INK.red : STRINGS[i].colour === 'black' ? STRING_INK.black : STRINGS[i].material === 'wire' ? STRING_INK.wire : STRINGS[i].material === 'nylon' ? STRING_INK.nylon : STRING_INK.gut);

/** The harp from its side. `top`: the file player's px over the box's top. */
export function drawHarp(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: HarpState, top = 0): void {
  // (the floor's shadow is kept with the shared layout: `shade` is this drawer's own on it)
  const L: HpLayout & { shade?: FloorShadow | null } = harpLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const lv = harpLive(fr, st, performance.now());
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- its shadow on the floor (kept with the layout)
  if (L.shade === undefined) {
    const k = ((HP_Y1 - HP_Y0) * sc) / 700;
    L.shade = floorShadow({ x0: X(HP_X0), y0: Y(HP_Y1), x1: X(HP_X1), y1: Y(HP_Y0) }, Math.max(2, 24 * k), 7 * k, 12 * k, (c) => {
      for (const q of [L.body, L.base, L.column, L.crown, L.neck, L.plate]) c.fill(q);
    });
  }
  if (L.shade) ctx.drawImage(L.shade.cv, L.shade.x, L.shade.y, L.shade.w, L.shade.h);
  // ---- the body: the soundbox's side (maple, darker towards its back), the soundboard's edge (spruce)
  const WOOD_EDGE = 'rgba(58,36,14,0.85)';
  {
    const g = ctx.createLinearGradient(X(BOARD_A[0]), Y(BOARD_A[1]), X(BOARD_A[0] + 0.3), Y(BOARD_A[1] - 0.2));
    g.addColorStop(0, '#a87838');
    g.addColorStop(0.5, '#855a28');
    g.addColorStop(1, '#5e3d1a');
    ctx.fillStyle = g;
    ctx.fill(L.body);
    ctx.strokeStyle = WOOD_EDGE;
    ctx.lineWidth = 1;
    ctx.stroke(L.body);
    // (the board's edge is pale spruce, towards the plaster: an edge under it)
    const bw = Math.max(1.5, 0.012 * sc);
    ctx.strokeStyle = 'rgba(96,66,26,0.9)';
    ctx.lineWidth = bw + 1.4;
    ctx.stroke(L.board);
    ctx.strokeStyle = '#ead2a0';
    ctx.lineWidth = bw;
    ctx.stroke(L.board);
  }
  // ---- the base and its feet, the pedals' slots
  ctx.fillStyle = '#6a4a22';
  ctx.fill(L.base);
  ctx.strokeStyle = WOOD_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke(L.base);
  // ---- the column (fluted maple, gilded) and its crown: gold in daylight, lit from the left
  {
    const g = ctx.createLinearGradient(X(COLUMN_X - COLUMN_R), 0, X(COLUMN_X + COLUMN_R), 0);
    g.addColorStop(0, '#c9a04c');
    g.addColorStop(0.28, BRASS.lit);
    g.addColorStop(0.56, BRASS.body);
    g.addColorStop(1, BRASS.shade);
    ctx.fillStyle = g;
    ctx.fill(L.column);
    ctx.strokeStyle = BRASS.edge;
    ctx.stroke(L.column);
    // (the shaft's flutes)
    ctx.strokeStyle = 'rgba(125,92,34,0.6)';
    ctx.lineWidth = Math.max(0.8, 0.004 * sc);
    ctx.stroke(L.flutes);
    ctx.fillStyle = g;
    ctx.fill(L.crown);
    ctx.fillStyle = 'rgba(243,220,154,0.35)';
    ctx.fill(L.crown);
    ctx.strokeStyle = BRASS.edge;
    ctx.lineWidth = 1;
    ctx.stroke(L.crown);
  }
  // ---- the neck (the action's brass plates along its lower edge)
  {
    const g = ctx.createLinearGradient(0, Y(CROWN_Y), 0, Y(1.3));
    g.addColorStop(0, '#b08040');
    g.addColorStop(1, '#7a5424');
    ctx.fillStyle = g;
    ctx.fill(L.neck);
    ctx.strokeStyle = WOOD_EDGE;
    ctx.lineWidth = 1;
    ctx.stroke(L.neck);
    // (the action plate: brass, from the neck's lower edge down past the discs)
    const gp = ctx.createLinearGradient(0, Y(CROWN_Y), 0, Y(1.2));
    gp.addColorStop(0, '#ecd28a');
    gp.addColorStop(1, '#cfa850');
    ctx.fillStyle = gp;
    ctx.fill(L.plate);
    ctx.strokeStyle = BRASS.edge;
    ctx.lineWidth = 1;
    ctx.stroke(L.plate);
  }
  // ---- the strings: each from the board to its sounding top (under its discs when its pedal is down); at
  // rest in its own tone, sounding in the blue (its swing's envelope a wash, its shape a firm line)
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
      ctx.strokeStyle = rgba(ink, 0.5);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    if (w > 0) {
      // its swing, in the blue by its level (a string that only answers keeps its own tone, with a breath
      // of the blue): the envelope, and (the loudest few) its own shape now
      const sh = lv.shapes.get(i);
      const lvl = Math.pow(Math.min(1, 2.2 * Math.sqrt(a)), 1.4);
      if (lvl < 0.98) {
        ctx.strokeStyle = rgba(ink, (s.colour === 'plain' ? 0.78 : 0.95) * (1 - lvl));
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(INK.sound, 0.18 * lvl);
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.quadraticCurveTo(x + 2 * w, (y0 + y1) / 2, x, y0);
      ctx.quadraticCurveTo(x - 2 * w, (y0 + y1) / 2, x, y1);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.sound, 0.92 * lvl);
      ctx.lineWidth = lw + (Math.max(lw, small ? 1.1 : 1.5) - lw) * lvl;
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
      ctx.strokeStyle = rgba(ink, s.colour === 'plain' ? 0.78 : 0.95);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    // the discs on the plate: the upper closes for the natural, the lower too for the sharp (a disc closed
    // is in ink, one open a brass dot beside the string); over them the bridge pin at the string's sounding
    // top, and its tuning pin in the neck
    if (!small) {
      for (let d = 0; d < 2; d++) {
        const on = acc >= d;
        ctx.fillStyle = on ? rgba(INK.line, 0.95) : 'rgba(125,92,34,0.9)';
        ctx.beginPath();
        ctx.arc(x + (on ? 0 : 0.004 * sc), yTop + DISC_DY[d] * discScale(i) * sc, Math.max(0.9, 0.0032 * sc), 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.strokeStyle = rgba(ink, 0.4);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yTop - PIN_DY * sc);
      ctx.stroke();
      ctx.fillStyle = 'rgba(226,230,234,0.95)';
      ctx.beginPath();
      ctx.arc(x, yTop - PIN_DY * sc, Math.max(0.8, 0.0026 * sc), 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  // ---- the fingers: where each string plucked a moment ago was taken (the engine's own place: no two alike);
  // the pluck is what sets the string sounding: a ring in the blue, widening and fading
  for (const p of lv.plucks) {
    const { x, y } = pluckXY(L, p.string, p.at, lv.ped[pedalOf(p.string)]);
    const u = p.age / PLUCK_SHOWN;
    ctx.strokeStyle = rgba(INK.sound, 0.9 * (1 - u) * (1 - u));
    ctx.lineWidth = Math.max(1.5, 0.003 * sc);
    ctx.beginPath();
    ctx.arc(x, y, (0.006 + 0.022 * u) * sc, 0, 2 * Math.PI);
    ctx.stroke();
  }
  // ---- the pedals: seven levers in their slots, each at its notch (up flat, middle natural, down sharp): brass
  // in its middle notch, in ink out of it (a pedal set is a mechanical fact)
  ctx.strokeStyle = rgba(INK.line, 0.5);
  ctx.lineWidth = Math.max(2, 0.014 * sc);
  ctx.stroke(L.slots);
  for (let k = 0; k < 7; k++) {
    const [fx, fy] = pedalFoot(k, lv.ped[k]);
    const moved = Math.abs(lv.ped[k]) > 0.02;
    const pw = Math.max(1.6, 0.011 * sc);
    ctx.beginPath();
    ctx.moveTo(X(PEDAL_X[k] - 0.035), Y(PEDAL_Y + 0.004));
    ctx.lineTo(X(fx), Y(fy));
    ctx.lineTo(X(fx + PEDAL_LEN * 0.5), Y(fy - 0.004));
    ctx.strokeStyle = moved ? rgba(INK.line, 0.95) : BRASS.edge;
    ctx.lineWidth = pw + (moved ? 0.6 : 1.2);
    ctx.stroke();
    if (!moved) {
      ctx.strokeStyle = '#e6c777';
      ctx.lineWidth = Math.max(0.8, pw - 0.6);
      ctx.stroke();
    }
  }
  ctx.restore();
  harpRecord(L, st, lv);
}
