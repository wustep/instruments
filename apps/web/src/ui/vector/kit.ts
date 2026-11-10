// The vector display: the 2D stage's other style. Thin glowing lines on black, after the screens
// Jameson Hodge drew for his Chimera vocal synth (github.com/jamesondh/chimera-vocal-synth,
// docs/ui-redesign.md), themselves after the NORAD displays in WarGames and the OP-1's colour-coded
// encoders. Nothing is filled: an instrument is its outline, and the sound is drawn over it.
//
// Colour roles, the same on every instrument:
//   blue   the instrument: outlines, strings at rest, the room
//   amber  sound: string shapes, plate modes, bore pressure, wavefronts, spectra
//   green, red, pink, white: the four control slots. A knob takes a slot colour (the first four of an
//   instrument's knobs, in order) and whatever it moves on the drawing is drawn in that colour.
//
// Beams are added ('lighter'), so crossings brighten as on a tube. One cheap glow pass per frame
// (`glow`) copies the canvas down and adds it back blurred. Coordinates are CSS pixels.
//
// No canvas or DOM object is made at module level: these files are also loaded where there is no
// document (apps/web/test/models3d.test.ts).

export const V = {
  blue: '#4fb6f2',
  blueMid: '#3487c4',
  blueDim: '#1f5f8c',
  frame: '#133954',
  green: '#5be381',
  red: '#ff5d40',
  pink: '#ff73cf',
  white: '#eef6f8',
  amber: '#ffb340',
} as const;
/** the four control slots, in knob order */
export const SLOTS = [V.green, V.red, V.pink, V.white] as const;
/** a knob's colour: its slot, or the structure's blue past the fourth */
export const slotColor = (i: number): string => SLOTS[i] ?? V.blue;

/** mix two #rrggbb colours */
export function mix(hex: string, to: string, u: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - u) + ((b >> s) & 255) * u);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}
/** the whitish core of a bright beam in this colour */
export const core = (hex: string): string => mix(hex, '#ffffff', 0.55);

const HEAT: [number, string][] = [
  [0, '#3a2408'],
  [0.35, '#c9822a'],
  [0.6, '#ffb340'],
  [0.82, '#ffe39a'],
  [1, '#fff8ec'],
];
/** sound level 0..1 → dim amber → amber → pale yellow → white */
export function heat(level: number): string {
  const v = Math.max(0, Math.min(1, level));
  for (let i = 1; i < HEAT.length; i++) if (v <= HEAT[i][0]) return mix(HEAT[i - 1][1], HEAT[i][1], (v - HEAT[i - 1][0]) / (HEAT[i][0] - HEAT[i - 1][0]));
  return HEAT[HEAT.length - 1][1];
}

/** the palette as rgb triplets, for the drawings shared with the stage's own style (they take an ink) */
const rgb = (hex: string) => [16, 8, 0].map((sh) => (parseInt(hex.slice(1), 16) >> sh) & 255).join(',');
/** the excitation scope: the trace is sound (amber), its second row and the axis the structure's blue */
export const SCOPE_INK_V = { ivory: rgb(V.blue), vermilion: rgb(V.amber) };
/** the spectrum: the measured line amber, and where the partials should fall in blue. On a piano the
 *  stiff string's series is in the stiffness knob's slot (red) against the ideal harmonics in blue. */
export const SPECTRUM_INK_V = { line: rgb(V.amber), label: rgb(V.blue), ideal: rgb(V.blueMid), partial: rgb(V.blue), font: '500 10px "Hershey", "IBM Plex Mono", monospace' };
export const SPECTRUM_INK_V_PIANO = { ...SPECTRUM_INK_V, partial: rgb(V.red) };

export type Pt = [number, number];
export interface BeamOpts {
  alpha?: number;
  /** a whitish core, for the brightest lines */
  hot?: boolean;
  dash?: number[];
  /** butt ends (rows of short marks); round otherwise */
  butt?: boolean;
}

/** a path through points */
export function pathOf(pts: ArrayLike<Pt>, close = false): Path2D {
  const p = new Path2D();
  if (!pts.length) return p;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (close) p.closePath();
  return p;
}

/** stroke a path as a beam (or the current path, given none) */
export function beam(ctx: CanvasRenderingContext2D, path: Path2D | null, color: string, width: number, o: BeamOpts = {}): void {
  const a = o.alpha ?? 1;
  if (a <= 0.004) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= Math.min(1, a);
  ctx.lineJoin = 'round';
  ctx.lineCap = o.butt ? 'butt' : 'round';
  ctx.setLineDash(o.dash ?? []);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (path) ctx.stroke(path);
  else ctx.stroke();
  if (o.hot) {
    // the core is laid over the line, not added to it (adding saturates to white)
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = core(color);
    ctx.lineWidth = width * 0.42;
    if (path) ctx.stroke(path);
    else ctx.stroke();
  }
  ctx.restore();
}
export function beamPts(ctx: CanvasRenderingContext2D, pts: ArrayLike<Pt>, color: string, width: number, o: BeamOpts & { close?: boolean } = {}): void {
  if (pts.length < 2) return;
  beam(ctx, pathOf(pts, o.close), color, width, o);
}
export function seg(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width: number, o: BeamOpts = {}): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  beam(ctx, null, color, width, o);
}
export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width = 1.2, o: BeamOpts = {}): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  beam(ctx, null, color, width, o);
}
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void {
  if (alpha <= 0.004) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
/** a control's handle: a ring with crosshair ticks, where a slot's control acts on the drawing */
export function handle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r = 7, alpha = 1): void {
  const t = 4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r - t, y);
  ctx.lineTo(x - r + 2, y);
  ctx.moveTo(x + r - 2, y);
  ctx.lineTo(x + r + t, y);
  ctx.moveTo(x, y - r - t);
  ctx.lineTo(x, y - r + 2);
  ctx.moveTo(x, y + r - 2);
  ctx.lineTo(x, y + r + t);
  beam(ctx, null, color, 1.25, { alpha });
}

// ---------------------------------------------------------------- type
/** Hershey Simplex (single-stroke capitals); what it lacks (×, ·, ♯, Greek) falls to the mono */
export const HERSHEY = '"Hershey", "IBM Plex Mono", ui-monospace, monospace';
export const hfont = (size: number, weight: 'l' | 'm' = 'm') => `${weight === 'm' ? 500 : 300} ${size}px ${HERSHEY}`;
let fontAsked = false;
/** ask for the faces once (a canvas does not fetch a font by drawing with it) */
export function loadVectorFont(): void {
  if (fontAsked || typeof document === 'undefined' || !document.fonts) return;
  fontAsked = true;
  void document.fonts.load(hfont(12, 'm'));
  void document.fonts.load(hfont(12, 'l'));
}
export interface LabelOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  weight?: 'l' | 'm';
  /** letter spacing as a fraction of the size */
  ls?: number;
  alpha?: number;
}
/** text on the display: capitals, spaced. Numbers and units only: the stage stays wordless. */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, o: LabelOpts = {}): void {
  const size = o.size ?? 11;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.font = hfont(size, o.weight);
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${((o.ls ?? 0.12) * size).toFixed(2)}px`;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  ctx.fillStyle = o.color ?? V.blue;
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.restore();
}

// ---------------------------------------------------------------- glow
let gA: HTMLCanvasElement | null = null;
let gB: HTMLCanvasElement | null = null;
let gC: HTMLCanvasElement | null = null;
const sized = (c: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement => {
  const cv = c ?? document.createElement('canvas');
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return cv;
};
/**
 * The tube's glow, once per frame after everything is drawn: the canvas halved three times (each
 * step a bilinear average, so thin lines do not shimmer) and the two smallest added back on top.
 * Crisp, not bloom: the lines stay sharp and gain a short halo. `strength` 0 skips it.
 */
export function glow(ctx: CanvasRenderingContext2D, strength = 1): void {
  if (strength <= 0) return;
  const cv = ctx.canvas;
  const w = cv.width;
  const h = cv.height;
  if (w < 16 || h < 16) return;
  gA = sized(gA, Math.ceil(w / 2), Math.ceil(h / 2));
  gB = sized(gB, Math.ceil(w / 4), Math.ceil(h / 4));
  gC = sized(gC, Math.ceil(w / 8), Math.ceil(h / 8));
  let src: HTMLCanvasElement = cv;
  for (const d of [gA, gB, gC]) {
    const x = d.getContext('2d')!;
    x.globalCompositeOperation = 'copy';
    x.imageSmoothingEnabled = true;
    x.drawImage(src, 0, 0, d.width, d.height);
    src = d;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.42 * strength;
  ctx.drawImage(gB, 0, 0, w, h);
  ctx.globalAlpha = 0.5 * strength;
  ctx.drawImage(gC, 0, 0, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------- plate modes as lines
/**
 * A vibrating plate drawn as lines: the same picture as stage-draw.ts's ModeField (the instrument's
 * own modes, each given a plate shape sin(mπu)·sin(nπv) in order of frequency, weighted by its live
 * amplitude), but traced: the nodal lines where the sand would collect, and a contour either side
 * round the parts that move most. Phases drift slowly, since the true motion cannot be shown at
 * the frame rate.
 */
export class Contours {
  private field: Float32Array;
  private SU: Float32Array[] = [];
  private SV: Float32Array[] = [];
  private pairs: [number, number][] = [];
  private peak = 1e-30;
  private mx = 1;
  level = 0;
  constructor(
    readonly gw: number,
    readonly gh: number,
    aspect: number,
    stiffRatio = 1,
  ) {
    this.field = new Float32Array(gw * gh);
    const cand: { m: number; n: number; f: number }[] = [];
    for (let m = 1; m <= 14; m++)
      for (let n = 1; n <= 10; n++) {
        const a = m / aspect;
        cand.push({ m, n, f: Math.sqrt(stiffRatio * a ** 4 + n ** 4 + 2 * Math.sqrt(stiffRatio) * 0.6 * a * a * n * n) });
      }
    cand.sort((x, y) => x.f - y.f);
    this.pairs = cand.map((c) => [c.m, c.n]);
    // (sampled a little past the plate's edges, where every mode is still: no line runs along them)
    for (let m = 0; m <= 14; m++) {
      const su = new Float32Array(gw);
      for (let i = 0; i < gw; i++) su[i] = Math.sin(m * Math.PI * (0.04 + (0.92 * i) / (gw - 1)));
      this.SU.push(su);
    }
    for (let n = 0; n <= 10; n++) {
      const sv = new Float32Array(gh);
      for (let j = 0; j < gh; j++) sv[j] = Math.sin(n * Math.PI * (0.04 + (0.92 * j) / (gh - 1)));
      this.SV.push(sv);
    }
  }
  /** returns 0..1, how strongly the plate moves overall */
  update(amps: Float32Array | null, t: number): number {
    let total = 0;
    if (amps) for (let k = 0; k < amps.length; k++) total += amps[k];
    this.peak = Math.max(total, this.peak * 0.995);
    const target = total > 0 ? Math.min(1, Math.pow(total / this.peak, 0.6)) : 0;
    this.level += (target - this.level) * 0.25;
    if (!amps || this.level < 0.01) return this.level;
    const f = this.field;
    f.fill(0);
    const { gw, gh } = this;
    // the strongest modes only
    let top = 0;
    const n = Math.min(amps.length, this.pairs.length);
    for (let k = 0; k < n; k++) top = Math.max(top, amps[k]);
    if (top <= 0) return this.level;
    let used = 0;
    for (let k = 0; k < n && used < 28; k++) {
      if (amps[k] < 0.04 * top) continue;
      used++;
      const [m, nn] = this.pairs[k];
      const w = (amps[k] / top) * Math.cos(t * (0.7 + (k % 7) * 0.23) + k * 1.7);
      const su = this.SU[m];
      const sv = this.SV[nn];
      for (let j = 0; j < gh; j++) {
        const a = w * sv[j];
        const row = j * gw;
        for (let i = 0; i < gw; i++) f[row + i] += a * su[i];
      }
    }
    let mx = 1e-9;
    for (let i = 0; i < f.length; i++) mx = Math.max(mx, Math.abs(f[i]));
    this.mx = mx;
    return this.level;
  }
  /** the contour f = c·max (c in −1..1; 0 is the nodal lines) across the box, as a path */
  path(c: number, x: number, y: number, w: number, h: number): Path2D {
    const p = new Path2D();
    this.trace(c, x, y, w, h, (x0, y0, x1, y1) => {
      p.moveTo(x0, y0);
      p.lineTo(x1, y1);
    });
    return p;
  }
  /** the same contour as loose segments (marching squares over the grid), each handed to `line` */
  trace(c: number, x: number, y: number, w: number, h: number, line: (x0: number, y0: number, x1: number, y1: number) => void): void {
    const { gw, gh, field: f } = this;
    const lv = c * this.mx;
    const sx = w / (gw - 1);
    const sy = h / (gh - 1);
    for (let j = 0; j < gh - 1; j++) {
      const r0 = j * gw;
      const r1 = r0 + gw;
      for (let i = 0; i < gw - 1; i++) {
        const a = f[r0 + i] - lv;
        const b = f[r0 + i + 1] - lv;
        const d = f[r1 + i] - lv;
        const e = f[r1 + i + 1] - lv;
        const code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (e > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
        if (code === 0 || code === 15) continue;
        // crossings on the cell's edges: top (a–b), right (b–e), bottom (d–e), left (a–d)
        const tx = x + (i + a / (a - b)) * sx;
        const ty = y + j * sy;
        const rx = x + (i + 1) * sx;
        const ry = y + (j + b / (b - e)) * sy;
        const bx = x + (i + d / (d - e)) * sx;
        const by = y + (j + 1) * sy;
        const lx = x + i * sx;
        const ly = y + (j + a / (a - d)) * sy;
        switch (code) {
          case 1:
          case 14:
            line(lx, ly, tx, ty);
            break;
          case 2:
          case 13:
            line(tx, ty, rx, ry);
            break;
          case 3:
          case 12:
            line(lx, ly, rx, ry);
            break;
          case 4:
          case 11:
            line(rx, ry, bx, by);
            break;
          case 6:
          case 9:
            line(tx, ty, bx, by);
            break;
          case 7:
          case 8:
            line(lx, ly, bx, by);
            break;
          case 5:
            line(lx, ly, tx, ty);
            line(rx, ry, bx, by);
            break;
          case 10:
            line(tx, ty, rx, ry);
            line(lx, ly, bx, by);
            break;
        }
      }
    }
  }
  /** the plate as it sounds now: bright nodal lines, a dim contour either side (clip first) */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, gain = 1): void {
    const lv = this.level * gain;
    if (lv < 0.02) return;
    beam(ctx, this.path(0.5, x, y, w, h), V.amber, 0.8, { alpha: 0.3 * lv });
    beam(ctx, this.path(-0.5, x, y, w, h), V.amber, 0.8, { alpha: 0.3 * lv, dash: [3, 4] });
    beam(ctx, this.path(0, x, y, w, h), V.amber, 1.3, { alpha: Math.min(1, 0.25 + 0.75 * lv), hot: lv > 0.55 });
  }
}
