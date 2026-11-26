// Day Studio's 2D drawers, what they share: the light laid on a dark part of an object, the one soft
// shadow an instrument casts on the studio's floor, lacquered brass and polished silver as they look in
// daylight, the sand on a vibrating plate, and the breath going into a wind.
//
// The rules these drawers are painted by (the theme's DESIGN: an instrument in a north-lit white room). An
// instrument is an opaque object in its own materials on pale plaster, with one soft shadow down and a
// little to the right (the window is up and to the left). Nothing glows: no added light, no halo. The one
// blue (INK.sound) is what sounds and only that; graphite (INK.line) is what is held or chosen, and a line
// on the ground; a pale thing (silver, ivory, a drum's head, bow hair) stands off the ground by an edge.
//
// What is here is paint. The layouts, the live state and what a drawer records for the tests are the
// shared drawers' own (ui/), imported from them.
import { type BreathPath, INK, rgba } from '../../../ui/stage-draw.ts';

/** a light laid on a dark part of an object (a sheen on ebony or grenadilla, a black key, dark varnish):
 *  the theme's line ink is graphite, which would vanish there */
export const LIGHT = '249,250,251';

// ---------------------------------------------------------------- the mode field
// A vibrating plate's picture (the shared `ModeField`): sand collects where the plate is still (nodal
// lines), as on Chladni's plates: dark sand on a pale board (a piano's spruce), pale sand on a dark one (a
// violin's varnish); where it moves most, a breath of the blue.
/** the sand's colour and strength, and the motion's */
export interface FieldInk {
  sand: [number, number, number];
  sandA: number;
  move: [number, number, number];
  moveA: number;
}
/** on pale wood: the plate's motion is sound, so its nodal lines and its swing are the blue's (a thin wash) */
export const FIELD_DARK: FieldInk = { sand: [29, 72, 209], sandA: 0.26, move: [29, 72, 209], moveA: 0.05 };
/** on dark varnish: the same in the blue's pale tint */
export const FIELD_PALE: FieldInk = { sand: [168, 196, 255], sandA: 0.34, move: [150, 185, 255], moveA: 0.08 };

// ---------------------------------------------------------------- the floor's shadow
/** A shadow on the floor, kept as a picture: its canvas and the box of the stage (px) it covers */
export interface FloorShadow {
  cv: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}
/**
 * The one soft shadow an instrument casts on the studio's floor, down and a little to the right (the window
 * is up and to the left), for the drawers that paint themselves every frame: what `paint` fills and strokes
 * (stage px, any colour) is taken as one silhouette, blurred once into a canvas of its own and kept by the
 * caller, who lays it under the instrument each frame (a blit, never a blur). `box`: the silhouette's box.
 * One canvas px to a stage px at most (a shadow has no detail). null where there is no canvas to paint on.
 */
export function floorShadow(box: { x0: number; y0: number; x1: number; y1: number }, blur: number, dx: number, dy: number, paint: (c: CanvasRenderingContext2D) => void, alpha = 0.32): FloorShadow | null {
  if (typeof document === 'undefined') return null;
  // (drawn small, an orchestra's seat, it still casts a shadow that can be seen)
  blur = Math.max(3, blur);
  dx = Math.max(2, dx);
  dy = Math.max(3.5, dy);
  const m = Math.ceil(2 * blur + Math.max(dx, dy)) + 2;
  const x = Math.floor(box.x0) - m;
  const y = Math.floor(box.y0) - m;
  const w = Math.max(1, Math.ceil(box.x1) + m - x);
  const h = Math.max(1, Math.ceil(box.y1) + m - y);
  const k = Math.min(1, Math.sqrt(2.5e6 / (w * h)));
  const cw = Math.max(1, Math.round(w * k));
  const ch = Math.max(1, Math.round(h * k));
  const sil = document.createElement('canvas');
  sil.width = cw;
  sil.height = ch;
  const sc = sil.getContext('2d');
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const c = cv.getContext('2d');
  if (!sc || !c) return null;
  sc.scale(k, k);
  sc.translate(-x, -y);
  sc.fillStyle = '#000';
  sc.strokeStyle = '#000';
  paint(sc);
  // (the silhouette is drawn off the canvas, its shadow thrown back onto it: the shadow alone is kept)
  c.shadowColor = `rgba(28,34,42,${alpha})`;
  c.shadowBlur = blur * k;
  c.shadowOffsetX = cw + dx * k;
  c.shadowOffsetY = dy * k;
  c.drawImage(sil, -cw, 0);
  sil.width = sil.height = 1;
  return { cv, x, y, w, h };
}
/** lacquered yellow brass and polished silver (or nickel) in daylight: the lit side, the body, the side in
 *  shade, the deep shade (a bore's inside), and an edge that stands off the plaster */
export const BRASS = { lit: '#f3dc9a', body: '#dcb65c', shade: '#b0863a', deep: '#7d5c22', edge: '#8a651f' };
export const SILVER = { lit: '#f6f7f8', body: '#d3d8dd', shade: '#98a1aa', deep: '#7c858e', edge: '#5f6872' };
/** The breath going into a wind instrument, drawn alike on each (a reed's tip, a clarinet's mouthpiece, a
 *  brass mouthpiece's cup): three faint dashed streams from the player's lips converging on the tip, the
 *  dashes flowing in. `at(a, w)`: the screen point `a` m back from the tip and `w` m across the axis; `sc`
 *  px per metre; `alpha` the streams' strength (a reed's 0.45 at full breath). */
export function breathStream(ctx: CanvasRenderingContext2D, at: (a: number, w: number) => readonly [number, number], sc: number, path: BreathPath, alpha: number, now: number): void {
  ctx.save();
  ctx.setLineDash([0.003 * sc, 0.0025 * sc]);
  ctx.lineDashOffset = -((now / 1000) * 0.03 * sc);
  // (on the plaster: a pale ground takes more of the slate than the night's did for the same stream)
  ctx.strokeStyle = rgba(INK.cool, Math.min(1, alpha * 2.2));
  ctx.lineWidth = 1.4;
  const [p0, p1, p2] = path;
  for (const j of [-1, 0, 1]) {
    const m = at(p1[0], j * p1[1]);
    const e = at(p2[0], j * p2[1]);
    ctx.beginPath();
    ctx.moveTo(...at(p0[0], j * p0[1]));
    ctx.quadraticCurveTo(m[0], m[1], e[0], e[1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** The sand on a vibrating plate (the shared `ModeField` hands its pixels over: themes/drawers.ts). Laid
 *  over the wood as it is, not added to it: each ink by its share, the nodal lines fine. */
export function paintField(d: Uint8ClampedArray, f: Float32Array, mx: number, lv: number, pale: boolean): void {
  const { sand: sc, sandA, move: mc, moveA } = pale ? FIELD_PALE : FIELD_DARK;
  for (let i = 0; i < f.length; i++) {
    const x = Math.abs(f[i]) / mx;
    // nodal lines, fine (off them, e^-z is below 1e-17 of a step: not computed)
    const z = (x * x) / 0.0009;
    const sand = (z < 40 ? Math.exp(-z) : 0) * sandA;
    const glow = Math.pow(x, 1.6) * moveA;
    const o = i * 4;
    // (laid over the wood as it is, not added to it: each ink by its share)
    const a = sand + glow;
    const k = a > 1e-4 ? 1 / a : 0;
    d[o] = (mc[0] * glow + sc[0] * sand) * k;
    d[o + 1] = (mc[1] * glow + sc[1] * sand) * k;
    d[o + 2] = (mc[2] * glow + sc[2] * sand) * k;
    d[o + 3] = 255 * lv * Math.min(1, a);
  }
}
