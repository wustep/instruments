// A line pen for a painted drawing: the piano's action close-up (ui/action-view.ts) drawn by its own
// code, in the vector display's terms. The pen stands in for the 2D context and changes only what
// ink reaches the canvas:
//   * a fill becomes a black mask with its outline traced (so nearer parts still hide farther ones:
//     hidden lines, no filled colour); a faint fill (under half opaque) only its outline;
//   * a colour becomes its role: the structure's blue, dimmer for dark or quiet parts, with the few
//     colours named in `roles` (what sounds, a knob's part) given theirs;
//   * a part's dark edge line, drawn after its fill, is dropped (the traced outline is that edge).
// Geometry, order and hit areas are the drawing's own.
import { V } from './kit.ts';

/** 'r,g,b' (as stage-draw.ts's INK) → a palette colour */
export type PenRoles = Record<string, string>;

interface Ink {
  css: string;
  /** opaque enough to hide what is behind it */
  solid: boolean;
  dark: boolean;
}

const hexRgb = (hex: string) => [16, 8, 0].map((sh) => (parseInt(hex.slice(1), 16) >> sh) & 255).join(',');

export function linePen(ctx: CanvasRenderingContext2D, roles: PenRoles = {}): CanvasRenderingContext2D {
  const inks = new Map<string, Ink>();
  const inkOf = (style: unknown): Ink => {
    const key = String(style);
    let ink = inks.get(key);
    if (ink) return ink;
    const m = /^rgba?\(([^)]+)\)$/.exec(key);
    const p = m ? m[1].split(',').map((x) => parseFloat(x)) : [150, 150, 150, 1];
    const a = p[3] ?? 1;
    const role = roles[`${p[0]},${p[1]},${p[2]}`];
    const dark = !role && (p[0] + p[1] + p[2]) / 3 < 50;
    const hex = role ?? (dark ? V.blueDim : V.blue);
    ink = { css: `rgba(${hexRgb(hex)},${(role ? 0.5 + 0.5 * a : dark ? 0.9 : 0.3 + 0.6 * a).toFixed(3)})`, solid: a >= 0.5, dark };
    // (live colours vary in opacity from frame to frame: the table stays small)
    if (inks.size < 400) inks.set(key, ink);
    return ink;
  };
  let fillInk: Ink = inkOf('rgba(0,0,0,1)');
  let strokeInk: Ink = fillInk;
  let filled = false;
  const bound = new Map<PropertyKey, unknown>();
  const own: Record<string, unknown> = {
    beginPath: () => {
      filled = false;
      ctx.beginPath();
    },
    fill: () => {
      if (fillInk.solid) {
        ctx.fillStyle = '#000';
        ctx.fill();
      }
      const lw = ctx.lineWidth;
      ctx.strokeStyle = fillInk.css;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.lineWidth = lw;
      ctx.strokeStyle = strokeInk.css;
      filled = true;
    },
    stroke: () => {
      if (filled && strokeInk.dark) return;
      ctx.stroke();
    },
  };
  return new Proxy(ctx, {
    get(t, k) {
      if (typeof k === 'string' && k in own) return own[k];
      if (k === 'fillStyle') return fillInk.css;
      const v = Reflect.get(t, k, t);
      if (typeof v !== 'function') return v;
      let f = bound.get(k);
      if (!f) bound.set(k, (f = v.bind(t)));
      return f;
    },
    set(t, k, v) {
      if (k === 'fillStyle') fillInk = inkOf(v);
      else if (k === 'strokeStyle') {
        strokeInk = inkOf(v);
        t.strokeStyle = strokeInk.css;
      } else Reflect.set(t, k, v, t);
      return true;
    },
  });
}
