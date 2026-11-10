// The oboe on the vector display. PLACEHOLDER: the classic silhouette's outline until the drawn oboe lands.
import type { VisualFrame } from '@piano-model/engine';
import type { OboeState } from '../oboe-draw.ts';

export function drawOboeV(ctx: CanvasRenderingContext2D, W: number, H: number, _fr: VisualFrame | null, st: OboeState): void {
  const L = Math.min(W * 0.86, H * 4);
  const x0 = (W - L) / 2;
  const y = H * 0.5;
  const r = Math.max(2, L * 0.012);
  ctx.save();
  ctx.strokeStyle = 'rgba(120, 230, 190, 0.9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x0, y - r * 0.4);
  ctx.lineTo(x0 + L * 0.85, y - r);
  ctx.quadraticCurveTo(x0 + L, y - r, x0 + L, y - r * 2.4);
  ctx.lineTo(x0 + L, y + r * 2.4);
  ctx.quadraticCurveTo(x0 + L, y + r, x0 + L * 0.85, y + r);
  ctx.lineTo(x0, y + r * 0.4);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  st.src = { x: x0 + L, y };
}
