// The harp on the 2D stage (the drawn style). STUB: the strings alone, each at its length, the Cs red and the
// Fs dark, swinging with the engine's own amplitudes, until the harp's own drawing lands. The API below is
// what the stage, the ensemble's rows and the tests use; the drawing module replaces the bodies.
import { harpStrings, type VisualFrame } from '@piano-model/engine';

/** what the drawing keeps between frames, and what it last drew (for the room's source and the tests) */
export interface HarpState {
  /** where the sound leaves (the soundboard's middle), px in the box drawn */
  src?: { x: number; y: number };
  /** what was drawn last (px in the box drawn): the instrument's box, the strings' band, the pedals' */
  drawn?: { body: Box; strings: Box; pedals: Box; ringing: number; pedalsAt: number[] };
}
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export const newHarpState = (): HarpState => ({});
/** the harp's box on the stage, m (width × height, with the margins its drawing keeps): a concert grand
 *  stands 1.88 m tall and about 1 m from the column to the soundboard's foot */
export const harpBox = (): { w: number; h: number } => ({ w: 1.15, h: 2.05 });
const STRINGS = harpStrings();

/** draw the harp in (W × H) px; `top`: px of the stage's top that something lies over (the file player) */
export function drawHarp(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: HarpState, top = 0, ink = false): void {
  const b = harpBox();
  const sc = Math.min(W / b.w, (H - top) / b.h) * 0.92;
  const x0 = W / 2 - 0.42 * sc;
  const yb = top + (H - top) / 2 + 0.9 * sc;
  const hv = fr?.harp;
  let ringing = 0;
  ctx.save();
  ctx.lineCap = 'round';
  STRINGS.forEach((s, i) => {
    // the strings from the column (the bass, at the left) to the player's side, each rising from the soundboard
    const x = x0 + (i / (STRINGS.length - 1)) * 0.84 * sc;
    const y1 = yb - (i / (STRINGS.length - 1)) * 0.95 * sc;
    const y0 = y1 - s.length * sc;
    const a = hv ? hv.amp[i] : 0;
    if (a > 0.02) ringing++;
    ctx.strokeStyle = ink ? 'rgba(236,226,206,0.8)' : s.colour === 'red' ? '#c8483a' : s.colour === 'black' ? '#5a6a8a' : s.material === 'wire' ? '#b9a077' : '#e8dfc8';
    ctx.lineWidth = Math.max(0.6, (s.material === 'wire' ? 0.0022 : 0.0012) * sc) + 6 * a;
    ctx.globalAlpha = 0.55 + 0.45 * Math.min(1, 4 * a);
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  // the pedals, a row at the foot: up (flat), middle, down (sharp)
  const ped = hv ? hv.pedals : [0, 0, 0, 0, 0, 0, 0];
  ctx.fillStyle = ink ? 'rgba(236,226,206,0.8)' : '#c9a25a';
  ped.forEach((p, k) => ctx.fillRect(x0 + (k + (k > 2 ? 0.8 : 0)) * 0.1 * sc, yb + (0.07 + 0.03 * p) * sc, 0.06 * sc, 0.012 * sc));
  ctx.restore();
  st.src = { x: x0 + 0.5 * sc, y: yb - 0.5 * sc };
  st.drawn = { body: { x0: x0 - 0.1 * sc, y0: yb - 1.9 * sc, x1: x0 + 0.95 * sc, y1: yb + 0.12 * sc }, strings: { x0, y0: yb - 1.6 * sc, x1: x0 + 0.84 * sc, y1: yb }, pedals: { x0, y0: yb + 0.03 * sc, x1: x0 + 0.84 * sc, y1: yb + 0.12 * sc }, ringing, pedalsAt: ped.slice() };
}
