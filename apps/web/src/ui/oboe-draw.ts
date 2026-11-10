// The oboe on the 2D stage (the classic look). PLACEHOLDER: a plain silhouette until the drawn oboe
// lands (the same layout contract as the flute's and trumpet's: drawOboe fills a w×h box).
import type { VisualFrame } from '@piano-model/engine';
import { AutoScale } from './stage-draw.ts';

export interface OboeState {
  pScale: AutoScale;
  env: Float32Array;
  /** where its sound leaves (the room's wavefronts start there), px in the box */
  src?: { x: number; y: number };
}
export const newOboeState = (): OboeState => ({ pScale: new AutoScale(1e-6), env: new Float32Array(0) });

/** the oboe's length, reed tip to bell rim (m): a conservatoire oboe, about 0.65 m with its reed */
export const OB_LEN = 0.65;
/** the box (m) the oboe is drawn in at one px per metre (an ensemble sizes it from the strings' scale) */
export const oboeBox = (): { w: number; h: number } => ({ w: OB_LEN / 0.9, h: 0.16 });

export function drawOboe(ctx: CanvasRenderingContext2D, W: number, H: number, _fr: VisualFrame | null, st: OboeState): void {
  const L = Math.min(W * 0.86, H * 4);
  const x0 = (W - L) / 2;
  const y = H * 0.5;
  const r = Math.max(2, L * 0.012);
  ctx.save();
  ctx.fillStyle = '#1a1612';
  ctx.strokeStyle = 'rgba(236,226,206,0.5)';
  ctx.beginPath();
  ctx.moveTo(x0, y - r * 0.4);
  ctx.lineTo(x0 + L * 0.85, y - r);
  ctx.quadraticCurveTo(x0 + L, y - r, x0 + L, y - r * 2.4);
  ctx.lineTo(x0 + L, y + r * 2.4);
  ctx.quadraticCurveTo(x0 + L, y + r, x0 + L * 0.85, y + r);
  ctx.lineTo(x0, y + r * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  st.src = { x: x0 + L, y };
}
