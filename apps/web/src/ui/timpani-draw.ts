// The timpani on the 2D stage: a set of four pedal drums seen from the audience, a little above, the low
// drum on the player's left (the audience's right). (A first drawing: the heads, the kettles, the struts and
// pedals, the mallets; ui/vector/timpani.ts draws the same in lines.)
import type { VisualFrame, TimpaniVisual } from '@piano-model/engine';
import { TIMPANI_DRUMS, besselJ } from '@piano-model/engine';
import { AutoScale } from './stage-draw.ts';

export interface TimpaniState {
  /** where its sound leaves (the struck head: the room's wavefronts start there), px in the box */
  src?: { x: number; y: number };
  scale: AutoScale;
  /** test hook: the heads' centres and radii as last drawn (px, in the box) */
  drawn?: { x: number; y: number; rx: number; ry: number }[];
}
export const newTimpaniState = (): TimpaniState => ({ scale: new AutoScale(1e-7) });

/** the set's footprint seen from the front (m): four drums side by side, and their height to the heads */
export function timpaniBox(): { w: number; h: number } {
  const w = TIMPANI_DRUMS.reduce((s, d) => s + d.d * 1.12, 0);
  return { w, h: 1.25 };
}

/** the drums' places across the box (m from its left: the audience's left is the player's right, so the
 *  small drum is on the left of the picture) and their heads' radii */
export function timpaniLayout(W: number, H: number, top = 0): { sc: number; ox: number; oy: number; drums: { cx: number; r: number }[] } {
  const box = timpaniBox();
  const sc = Math.min((W * 0.92) / box.w, ((H - top) * 0.8) / box.h);
  const ox = (W - box.w * sc) / 2;
  const oy = top + (H - top - box.h * sc) / 2;
  const drums: { cx: number; r: number }[] = [];
  let x = 0;
  for (let i = TIMPANI_DRUMS.length - 1; i >= 0; i--) {
    const d = TIMPANI_DRUMS[i];
    drums[i] = { cx: x + d.d * 0.56, r: d.d / 2 };
    x += d.d * 1.12;
  }
  return { sc, ox, oy, drums };
}

/** the head's displacement at (r, θ) from its first modes (r in 0…1 of the radius, θ from the strike point) */
export function headAt(head: Float32Array, r: number, th: number): number {
  let s = 0;
  for (let i = 0; i + 2 < head.length; i += 3) {
    const y = head[i + 2];
    if (!y) continue;
    s += y * besselJ(head[i], head[i + 1] * r) * Math.cos(head[i] * th);
  }
  return s;
}

export function drawTimpani(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TimpaniState, top = 0, lines = false): void {
  const L = timpaniLayout(W, H, top);
  const tv: TimpaniVisual | undefined = fr?.timpani;
  const headY = L.oy + 0.22 * 1.25 * L.sc;
  const ink = lines ? 'rgba(160, 230, 200, 0.9)' : 'rgba(233, 226, 210, 0.9)';
  st.drawn = [];
  let peak = 0;
  if (tv) for (const d of tv.drums) for (let i = 2; i < d.head.length; i += 3) peak = Math.max(peak, Math.abs(d.head[i]));
  const s = st.scale.of(peak);
  L.drums.forEach((dr, i) => {
    const cx = L.ox + dr.cx * L.sc;
    const rx = dr.r * L.sc;
    const ry = rx * 0.3;
    const bowlH = (0.62 + 0.1 * (dr.r / 0.4)) * L.sc;
    st.drawn!.push({ x: cx, y: headY, rx, ry });
    // the kettle: a copper bowl rounding down from the rim
    ctx.beginPath();
    ctx.moveTo(cx - rx, headY);
    ctx.bezierCurveTo(cx - rx, headY + bowlH * 0.8, cx - rx * 0.45, headY + bowlH, cx, headY + bowlH);
    ctx.bezierCurveTo(cx + rx * 0.45, headY + bowlH, cx + rx, headY + bowlH * 0.8, cx + rx, headY);
    if (lines) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
      g.addColorStop(0, '#6b3a1f');
      g.addColorStop(0.35, '#c87a45');
      g.addColorStop(0.55, '#e7a46c');
      g.addColorStop(1, '#5a2f18');
      ctx.fillStyle = g;
      ctx.fill();
    }
    // the struts and the base, the pedal
    ctx.strokeStyle = lines ? ink : 'rgba(200, 200, 205, 0.8)';
    ctx.lineWidth = 1.5;
    const baseY = L.oy + 1.25 * L.sc;
    ctx.beginPath();
    for (const k of [-0.7, 0.7]) {
      ctx.moveTo(cx + k * rx * 0.8, headY + bowlH * 0.7);
      ctx.lineTo(cx + k * rx * 0.9, baseY);
    }
    ctx.moveTo(cx - rx * 0.25, baseY);
    ctx.lineTo(cx + rx * 0.25, baseY - 0.05 * L.sc * (1 - (tv?.drums[i]?.pedal ?? 0.5)));
    ctx.stroke();
    // the head: lit by its motion
    const d = tv?.drums[i];
    ctx.beginPath();
    ctx.ellipse(cx, headY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = lines ? 'rgba(0,0,0,0)' : '#efe9dc';
    if (!lines) ctx.fill();
    if (d && s > 0) {
      const N = 18;
      for (let a = 0; a < N; a++)
        for (let b = 1; b <= 4; b++) {
          const r = (b - 0.5) / 4;
          const th = ((a + 0.5) / N) * Math.PI * 2;
          const v = headAt(d.head, r, th) / s;
          if (Math.abs(v) < 0.05) continue;
          // (the strike point is towards the player: the back of the head, away from the audience)
          const x = cx + rx * r * Math.sin(th);
          const y = headY - ry * r * Math.cos(th);
          ctx.fillStyle = v > 0 ? `rgba(200, 110, 60, ${Math.min(0.55, Math.abs(v) * 0.5)})` : `rgba(60, 110, 200, ${Math.min(0.55, Math.abs(v) * 0.5)})`;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, rx * 0.07), 0, Math.PI * 2);
          ctx.fill();
        }
    }
    ctx.beginPath();
    ctx.ellipse(cx, headY, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = lines ? ink : '#8a8f96';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  // the mallets: over the drum each last struck, falling to it and rising away
  if (tv)
    tv.hands.forEach((hd) => {
      const dr = L.drums[hd.drum];
      if (!dr) return;
      const cx = L.ox + dr.cx * L.sc;
      const rx = dr.r * L.sc;
      const lift = hd.on ? 0 : Math.min(1, hd.ago / 0.15) * 0.25 * L.sc;
      const x = cx + (hd === tv.hands[0] ? 0.25 : -0.25) * rx;
      const y = headY - rx * 0.3 * 0.55 - lift;
      ctx.strokeStyle = lines ? ink : '#c9b48a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (hd === tv.hands[0] ? 1 : -1) * 0.1 * L.sc, y - 0.32 * L.sc);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 0.022 * L.sc, 0, Math.PI * 2);
      ctx.fillStyle = lines ? 'rgba(0,0,0,0)' : '#f2efe8';
      if (!lines) ctx.fill();
      ctx.strokeStyle = lines ? ink : '#b9b2a2';
      ctx.stroke();
    });
  const last = tv ? L.drums[tv.last] : L.drums[1];
  st.src = { x: L.ox + last.cx * L.sc, y: headY };
}
