// The stage: each instrument drawn in plan view and animated from the simulation's own
// state (string shapes, string levels, bow, bore pressure, board/body modes). Nothing
// here is decorative motion: every moving line is read from the audio thread.

import type { KeySummary, VisualFrame } from '@piano-model/engine';

export const INK = {
  ground: '#0e0d0b',
  ivory: '236,226,206',
  vermilion: '255,94,56',
  amber: '242,166,70',
  copper: '196,128,82',
  steel: '150,182,210',
  felt: '205,181,146',
  wood: '58,42,28',
  ebony: '22,19,16',
};
export const rgba = (c: string, a: number) => `rgba(${c},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

// ---------------------------------------------------------------- mode field
/**
 * A Chladni-style picture of a vibrating plate: the instrument's own modes (board or
 * body), each given a plausible plate shape sin(mπu)·sin(nπv) in order of frequency,
 * weighted by its live amplitude. Bright "sand" collects where the plate is still
 * (nodal lines), a warm glow where it moves most. Phases drift slowly because the true
 * oscillation (tens to thousands of Hz) cannot be shown at 60 frames per second.
 */
export class ModeField {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private field: Float32Array;
  private SU: Float32Array[] = [];
  private SV: Float32Array[] = [];
  private pairs: [number, number][] = [];
  private level = 0;
  private peak = 1e-30;
  constructor(
    readonly gw: number,
    readonly gh: number,
    aspect: number,
    stiffRatio = 1,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = gw;
    this.canvas.height = gh;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(gw, gh);
    this.field = new Float32Array(gw * gh);
    // plate modes in order of frequency (orthotropic plate, along-grain stiffer)
    const cand: { m: number; n: number; f: number }[] = [];
    for (let m = 1; m <= 14; m++)
      for (let n = 1; n <= 10; n++) {
        const a = m / aspect;
        cand.push({ m, n, f: Math.sqrt(stiffRatio * a ** 4 + n ** 4 + 2 * Math.sqrt(stiffRatio) * 0.6 * a * a * n * n) });
      }
    cand.sort((x, y) => x.f - y.f);
    this.pairs = cand.map((c) => [c.m, c.n]);
    for (let m = 0; m <= 14; m++) {
      const su = new Float32Array(gw);
      for (let i = 0; i < gw; i++) su[i] = Math.sin((m * Math.PI * (i + 0.5)) / gw);
      this.SU.push(su);
    }
    for (let n = 0; n <= 10; n++) {
      const sv = new Float32Array(gh);
      for (let j = 0; j < gh; j++) sv[j] = Math.sin((n * Math.PI * (j + 0.5)) / gh);
      this.SV.push(sv);
    }
  }
  /** returns 0..1, how strongly the plate is moving overall */
  update(amps: Float32Array | null, t: number): number {
    const f = this.field;
    f.fill(0);
    let total = 0;
    if (amps) for (let k = 0; k < amps.length; k++) total += amps[k];
    this.peak = Math.max(total, this.peak * 0.995);
    const target = total > 0 ? Math.min(1, Math.pow(total / this.peak, 0.6)) : 0;
    this.level += (target - this.level) * 0.25;
    if (!amps || this.level < 0.01) {
      this.ctx.clearRect(0, 0, this.gw, this.gh);
      return this.level;
    }
    // strongest modes only
    const idx: number[] = [];
    for (let k = 0; k < Math.min(amps.length, this.pairs.length); k++) if (amps[k] > 0) idx.push(k);
    idx.sort((a, b) => amps[b] - amps[a]);
    const use = idx.slice(0, 36);
    const top = use.length ? amps[use[0]] : 1;
    const { gw, gh } = this;
    for (const k of use) {
      const [m, n] = this.pairs[k];
      const w = (amps[k] / top) * Math.cos(t * (0.7 + (k % 7) * 0.23) + k * 1.7);
      const su = this.SU[m];
      const sv = this.SV[n];
      for (let j = 0; j < gh; j++) {
        const a = w * sv[j];
        const row = j * gw;
        for (let i = 0; i < gw; i++) f[row + i] += a * su[i];
      }
    }
    let mx = 1e-9;
    for (let i = 0; i < f.length; i++) mx = Math.max(mx, Math.abs(f[i]));
    const d = this.img.data;
    const lv = this.level;
    for (let i = 0; i < f.length; i++) {
      const x = Math.abs(f[i]) / mx;
      const sand = Math.exp(-(x * x) / 0.0018); // nodal lines
      const glow = Math.pow(x, 1.6);
      const o = i * 4;
      d[o] = 242 * glow + 236 * sand;
      d[o + 1] = 150 * glow + 226 * sand;
      d[o + 2] = 60 * glow + 206 * sand;
      d[o + 3] = 255 * lv * Math.min(1, 0.32 * glow + 0.55 * sand);
    }
    this.ctx.putImageData(this.img, 0, 0);
    return lv;
  }
}

/** Running maximum with slow release, for auto-scaling live traces. */
export class AutoScale {
  v: number;
  constructor(
    private floor: number,
    private release = 0.97,
  ) {
    this.v = floor;
  }
  of(x: number): number {
    this.v = Math.max(x, this.v * this.release, this.floor);
    return this.v;
  }
}

// ---------------------------------------------------------------- violin family
export interface BowedGeom {
  id: 'violin' | 'viola' | 'cello';
  L: number;
  bowLength: number;
  strings: { name: string; open: number }[];
}
export interface BowedState {
  strScale: AutoScale;
  lvlScale: AutoScale;
}

// half-width of the body against position along it (0 = neck end, 1 = tail), fractions of body length
const BODY: [number, number][] = [
  [0, 0], [0.012, 0.13], [0.04, 0.19], [0.1, 0.228], [0.19, 0.236], [0.28, 0.215], [0.35, 0.17], [0.4, 0.155],
  [0.47, 0.152], [0.55, 0.168], [0.62, 0.24], [0.7, 0.278], [0.79, 0.292], [0.88, 0.27], [0.95, 0.2], [0.985, 0.12], [1, 0],
];
const bodyHalf = (u: number): number => {
  for (let i = 1; i < BODY.length; i++)
    if (u <= BODY[i][0]) {
      const [u0, w0] = BODY[i - 1];
      const [u1, w1] = BODY[i];
      const t = (u - u0) / (u1 - u0);
      const s = t * t * (3 - 2 * t);
      return w0 + (w1 - w0) * s;
    }
  return 0;
};

export function drawBowed(ctx: CanvasRenderingContext2D, W: number, H: number, g: BowedGeom, fr: VisualFrame | null, st: BowedState, field: ModeField, now: number): void {
  const vertical = H > W * 1.05;
  const Lw = vertical ? H : W;
  const Cw = vertical ? W : H;
  // proportions in string lengths: scroll 0.32 | neck 0.40 | body 1.09 (bridge at 0.60 into it)
  const fill = vertical ? (g.id === 'violin' ? 0.82 : g.id === 'viola' ? 0.88 : 0.95) : g.id === 'violin' ? 0.6 : g.id === 'viola' ? 0.68 : 0.86;
  const total = 0.32 + 0.4 + 1.09 + (g.id === 'cello' ? 0.12 : 0);
  let sc = (fill * Lw) / (total * g.L);
  sc = Math.min(sc, (0.86 * Cw) / (2 * 0.292 * 1.09 * g.L));
  const Ls = g.L * sc;
  const u0 = (Lw - total * Ls) / 2 + 0.32 * Ls; // nut
  const nut = u0;
  const bodyStart = nut + 0.4 * Ls;
  const bodyLen = 1.09 * Ls;
  const bridge = nut + Ls;
  const c = Cw / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  if (vertical) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  }
  // body outline
  const body = new Path2D();
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = bodyStart + u * bodyLen;
    const y = c - bodyHalf(u) * bodyLen;
    if (i) body.lineTo(x, y);
    else body.moveTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const u = i / N;
    body.lineTo(bodyStart + u * bodyLen, c + bodyHalf(u) * bodyLen);
  }
  body.closePath();
  ctx.fillStyle = rgba(INK.wood, 0.45);
  ctx.fill(body);
  const lv = field.update(fr?.modes ?? null, now / 1000);
  if (lv > 0.01) {
    ctx.save();
    ctx.clip(body);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(field.canvas, bodyStart, c - 0.3 * bodyLen, bodyLen, 0.6 * bodyLen);
    ctx.restore();
  }
  ctx.strokeStyle = rgba(INK.ivory, 0.4);
  ctx.lineWidth = 1.5;
  ctx.stroke(body);
  // purfling
  ctx.save();
  ctx.translate(bodyStart + bodyLen / 2, c);
  ctx.scale(0.965, 0.94);
  ctx.translate(-(bodyStart + bodyLen / 2), -c);
  ctx.strokeStyle = rgba(INK.ivory, 0.12);
  ctx.lineWidth = 1;
  ctx.stroke(body);
  ctx.restore();
  // f-holes
  ctx.strokeStyle = rgba(INK.ivory, 0.45);
  ctx.lineWidth = 1.6;
  for (const side of [-1, 1]) {
    const y = c + side * 0.105 * bodyLen;
    ctx.beginPath();
    ctx.moveTo(bridge - 0.1 * Ls, y - side * 0.012 * bodyLen);
    ctx.bezierCurveTo(bridge - 0.03 * Ls, y + side * 0.03 * bodyLen, bridge + 0.03 * Ls, y - side * 0.03 * bodyLen, bridge + 0.1 * Ls, y + side * 0.012 * bodyLen);
    ctx.stroke();
    for (const e of [-0.1, 0.1]) {
      ctx.beginPath();
      ctx.arc(bridge + e * Ls, y + side * (e < 0 ? -1 : 1) * 0.012 * bodyLen, 2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(INK.ivory, 0.45);
      ctx.fill();
    }
  }
  // fingerboard, neck, scroll
  const spread = (x: number) => {
    const t = (x - nut) / Ls;
    return (0.016 + (0.034 - 0.016) * t) * sc * (g.L / 0.328);
  };
  ctx.fillStyle = rgba(INK.ebony, 0.95);
  ctx.strokeStyle = rgba(INK.ivory, 0.18);
  ctx.beginPath();
  const fbEnd = nut + 0.82 * Ls;
  ctx.moveTo(nut, c - spread(nut) * 0.8);
  ctx.lineTo(fbEnd, c - spread(fbEnd) * 0.75);
  ctx.lineTo(fbEnd, c + spread(fbEnd) * 0.75);
  ctx.lineTo(nut, c + spread(nut) * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // pegbox and scroll
  const sw = spread(nut) * 0.7;
  ctx.strokeStyle = rgba(INK.ivory, 0.35);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(nut, c - sw);
  ctx.lineTo(nut - 0.2 * Ls, c - sw * 0.8);
  ctx.moveTo(nut, c + sw);
  ctx.lineTo(nut - 0.2 * Ls, c + sw * 0.8);
  ctx.stroke();
  const sx = nut - 0.26 * Ls;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.15) {
    const r = sw * 1.15 * (1 - a / (Math.PI * 6));
    const x = sx + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (a) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const x = nut - 0.04 * Ls - i * 0.04 * Ls;
    const sgn = i % 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x, c);
    ctx.lineTo(x, c + sgn * sw * 2.6);
    ctx.stroke();
  }
  // tailpiece and endpin
  const tpEnd = bodyStart + bodyLen * 0.985;
  ctx.fillStyle = rgba(INK.ebony, 0.95);
  ctx.beginPath();
  ctx.moveTo(bridge + 0.09 * Ls, c - spread(bridge) * 0.6);
  ctx.lineTo(tpEnd - 0.06 * Ls, c - spread(bridge) * 0.22);
  ctx.lineTo(tpEnd - 0.06 * Ls, c + spread(bridge) * 0.22);
  ctx.lineTo(bridge + 0.09 * Ls, c + spread(bridge) * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (g.id === 'cello') {
    ctx.strokeStyle = rgba(INK.steel, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bodyStart + bodyLen, c);
    ctx.lineTo(bodyStart + bodyLen + 0.12 * Ls, c);
    ctx.stroke();
  }
  // strings (lowest at the top), nut to tailpiece
  const strY = (i: number, x: number) => c + (i - 1.5) * (spread(Math.min(x, bridge)) / 3) * 1.0;
  const strs = fr?.strings;
  let mx = 0;
  if (strs) for (const s of strs) mx = Math.max(mx, s.level);
  const norm = st.lvlScale.of(mx);
  const focus = fr?.focus ?? null;
  const bowedIdx = strs ? strs.findIndex((s) => s.bowing) : -1;
  g.strings.forEach((sd, i) => {
    const s = strs?.[i];
    const l = s ? Math.sqrt(s.level / norm) : 0;
    ctx.strokeStyle = rgba(i === 0 && g.id !== 'violin' ? INK.steel : INK.ivory, 0.5);
    ctx.lineWidth = 1.6 - i * 0.25;
    ctx.beginPath();
    ctx.moveTo(nut, strY(i, nut));
    ctx.lineTo(bridge, strY(i, bridge));
    ctx.lineTo(bridge + 0.08 * Ls, strY(i, bridge) * 0.85 + c * 0.15);
    ctx.stroke();
    if (l > 0.03 && !(focus && i === bowedIdx)) {
      ctx.strokeStyle = rgba(s?.bowing ? INK.vermilion : INK.amber, 0.2 + 0.7 * l);
      ctx.lineWidth = 1 + 2 * l;
      const xf = bridge - (s?.stop ?? 1) * Ls;
      ctx.beginPath();
      ctx.moveTo(xf, strY(i, xf));
      ctx.lineTo(bridge, strY(i, bridge));
      ctx.stroke();
    }
    // finger stopping the string
    if (s && s.stop < 0.995) {
      const xf = bridge - s.stop * Ls;
      ctx.fillStyle = rgba(INK.felt, 0.85);
      ctx.beginPath();
      ctx.arc(xf, strY(i, xf), 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    void sd;
  });
  // bridge
  ctx.strokeStyle = rgba(INK.felt, 0.9);
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(bridge, c - spread(bridge) * 0.62);
  ctx.quadraticCurveTo(bridge - 3, c, bridge, c + spread(bridge) * 0.62);
  ctx.stroke();
  // the bowed string's live shape, finger (0) to bridge (1)
  let contactX = bridge - 0.11 * Ls;
  let contactY = c - spread(bridge) * 0.1;
  if (focus && bowedIdx >= 0 && strs) {
    const s = strs[bowedIdx];
    const shape = focus.shapes[0];
    const xf = bridge - s.stop * Ls;
    let m = 0;
    for (let i = 0; i < shape.length; i++) m = Math.max(m, Math.abs(shape[i]));
    const scale = st.strScale.of(m);
    const amp = Math.max(8, spread(bridge) * 0.55) / scale;
    for (const [wid, a] of [
      [4, 0.2],
      [1.5, 0.95],
    ] as const) {
      ctx.strokeStyle = rgba(INK.vermilion, a);
      ctx.lineWidth = wid;
      ctx.beginPath();
      for (let i = 0; i < shape.length; i++) {
        const x = xf + (i / (shape.length - 1)) * (bridge - xf);
        const y = strY(bowedIdx, x) + shape[i] * amp;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    contactX = xf + focus.hammerAt * (bridge - xf);
    contactY = strY(bowedIdx, contactX);
  }
  // the bow crosses the strings at the contact point; it slides along its length
  const bow = fr?.bow;
  const playing = bowedIdx >= 0;
  const bl = g.bowLength * sc;
  const pos = bow ? bow.pos : 0.5;
  const yFrog = contactY - pos * bl;
  const yTip = yFrog + bl;
  const xs = contactX + 9;
  ctx.globalAlpha = playing ? 1 : 0.35;
  ctx.strokeStyle = rgba(INK.ivory, 0.6);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(contactX, yFrog);
  ctx.lineTo(contactX, yTip);
  ctx.stroke();
  ctx.strokeStyle = rgba(INK.copper, 0.95);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xs + 2, yFrog - 6);
  ctx.quadraticCurveTo(xs - 4, (yFrog + yTip) / 2, xs + 3, yTip + 4);
  ctx.stroke();
  ctx.fillStyle = rgba(INK.ebony, 1);
  ctx.strokeStyle = rgba(INK.ivory, 0.5);
  ctx.lineWidth = 1;
  ctx.fillRect(contactX - 3, yFrog - 22, 12, 22);
  ctx.strokeRect(contactX - 3, yFrog - 22, 12, 22);
  ctx.beginPath();
  ctx.moveTo(contactX, yTip);
  ctx.lineTo(xs + 6, yTip + 10);
  ctx.lineTo(xs + 6, yTip - 2);
  ctx.closePath();
  ctx.fillStyle = rgba(INK.ivory, 0.8);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (playing && bow && !bow.changing && Math.abs(bow.speed) > 1e-3) {
    // direction of the bow's travel: down-bow pulls the frog away (contact point moves to the tip)
    const d = bow.dir > 0 ? -1 : 1;
    ctx.fillStyle = rgba(INK.vermilion, 0.95);
    ctx.beginPath();
    ctx.moveTo(contactX - 14, contactY + d * 22);
    ctx.lineTo(contactX - 19, contactY + d * 12);
    ctx.lineTo(contactX - 9, contactY + d * 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- flute
export interface FluteState {
  pScale: AutoScale;
  jetScale: AutoScale;
  /** standing-wave envelope: running max of |p| along the sounding length */
  env: Float32Array;
}
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** sounding tube length for a written note (open–open, end-corrected), m */
const tubeFor = (m: number) => 343 / (2 * et(m)) - 0.03;

export function drawFlute(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: FluteState): void {
  const vertical = H > W * 1.05;
  const Lw = vertical ? H : W;
  const Cw = vertical ? W : H;
  const cork = 0.02;
  const emb = 0.037;
  const full = emb + tubeFor(60) + 0.01;
  const sc = (0.9 * Lw) / (full + 0.02);
  const x0 = (Lw - (full + 0.02) * sc) / 2;
  const X = (m: number) => x0 + m * sc;
  const c = Cw * (vertical ? 0.5 : 0.46);
  const r = Math.max(9, 0.0095 * sc);
  ctx.save();
  if (vertical) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  }
  // tube body
  const tube = new Path2D();
  tube.rect(X(0), c - r, X(full) - X(0), 2 * r);
  ctx.fillStyle = rgba(INK.steel, 0.06);
  ctx.fill(tube);
  ctx.strokeStyle = rgba(INK.ivory, 0.45);
  ctx.lineWidth = 1.4;
  ctx.stroke(tube);
  // crown and cork
  ctx.fillStyle = rgba(INK.ivory, 0.25);
  ctx.fillRect(X(0) - 6, c - r * 1.1, 6, r * 2.2);
  ctx.fillStyle = rgba(INK.felt, 0.6);
  ctx.fillRect(X(cork) - 2, c - r, 4, 2 * r);
  // joints
  ctx.strokeStyle = rgba(INK.ivory, 0.18);
  for (const j of [0.2, full - 0.12]) {
    ctx.beginPath();
    ctx.moveTo(X(j), c - r * 1.08);
    ctx.lineTo(X(j), c + r * 1.08);
    ctx.stroke();
  }
  const focus = fr?.focus ?? null;
  const Lsound = focus ? focus.lengthM : tubeFor(60);
  const end = emb + Lsound;
  // tone holes: open beyond the sounding end, closed (covered) before it
  for (let m = 61; m <= 73; m++) {
    const at = emb + tubeFor(m) + 0.006;
    if (at > full - 0.005) continue;
    const open = at >= end - 0.004;
    ctx.beginPath();
    ctx.arc(X(at), c - r * 0.15, r * 0.55, 0, Math.PI * 2);
    if (open) {
      ctx.strokeStyle = rgba(INK.ivory, 0.55);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      ctx.fillStyle = rgba(INK.ivory, 0.75);
      ctx.fill();
    }
  }
  // the standing pressure wave inside the bore (embouchure → sounding end)
  if (focus && focus.shapes[0]) {
    const s = focus.shapes[0];
    let m = 0;
    for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i]));
    const scale = st.pScale.of(m);
    ctx.save();
    ctx.beginPath();
    ctx.rect(X(emb), c - r + 1, X(end) - X(emb), 2 * r - 2);
    ctx.clip();
    const g = ctx.createLinearGradient(X(emb), 0, X(end), 0);
    for (let i = 0; i < s.length; i += 4) g.addColorStop(i / (s.length - 1), rgba(INK.vermilion, 0.1 + 0.75 * Math.abs(s[i]) / scale));
    ctx.fillStyle = g;
    ctx.fillRect(X(emb), c - r, X(end) - X(emb), 2 * r);
    ctx.strokeStyle = rgba(INK.ivory, 0.9);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < s.length; i++) {
      const x = X(emb) + (i / (s.length - 1)) * (X(end) - X(emb));
      const y = c - (s[i] / scale) * (r - 3);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    // standing-wave envelope around the tube: nodes pinch, antinodes swell
    const env = st.env;
    if (env.length !== s.length) st.env = new Float32Array(s.length);
    const A = Math.min(150, Cw * 0.3);
    for (let i = 0; i < s.length; i++) st.env[i] = Math.max(Math.abs(s[i]) / scale, st.env[i] * 0.94);
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i < s.length; i++) {
        const x = X(emb) + (i / (s.length - 1)) * (X(end) - X(emb));
        const y = c + sgn * (r + 4 + st.env[i] * A);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.lineTo(X(end), c + sgn * (r + 4));
      ctx.lineTo(X(emb), c + sgn * (r + 4));
      ctx.closePath();
      ctx.fillStyle = rgba(INK.vermilion, 0.07);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.vermilion, 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // sounding end marker
    ctx.strokeStyle = rgba(INK.vermilion, 0.6);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(X(end), c - r * 1.6);
    ctx.lineTo(X(end), c + r * 1.6);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // lip plate, embouchure hole and the jet
  ctx.strokeStyle = rgba(INK.ivory, 0.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(X(emb), c, r * 1.6, r * 1.25, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = rgba(INK.ebony, 1);
  ctx.beginPath();
  ctx.ellipse(X(emb), c, r * 0.62, r * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const e = fr?.excite;
  const jetLen = r * 2.6;
  const jx0 = X(emb) - r * 1.5;
  const jy = c - r * 1.9;
  if (e && e.trace.length > 8) {
    // the jet's transverse wave: perturbations from the edge ride the jet at its convection speed
    const tr = e.trace;
    let m = 0;
    for (let i = 0; i < tr.length; i++) m = Math.max(m, Math.abs(tr[i]));
    const sc2 = st.jetScale.of(m);
    const n = Math.min(48, tr.length);
    ctx.strokeStyle = rgba(INK.steel, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const v = tr[tr.length - 1 - Math.round(f * (tr.length / 4))] / sc2;
      const x = jx0 + f * jetLen;
      const y = jy + f * (c - jy) * 0.92 + v * f * r * 0.9;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  } else {
    ctx.strokeStyle = rgba(INK.steel, 0.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(jx0, jy);
    ctx.lineTo(jx0 + jetLen, c - 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- spectrum hairline
export function drawSpectrum(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, an: AnalyserNode | null, buf: Float32Array, focus: VisualFrame['focus'] | null, family: string): void {
  const f0 = 30;
  const f1 = 12000;
  const X = (f: number) => x0 + (w * Math.log(f / f0)) / Math.log(f1 / f0);
  const dbLo = -115;
  const dbHi = -25;
  const Y = (db: number) => y0 + h * (1 - (db - dbLo) / (dbHi - dbLo));
  ctx.font = '9px "IBM Plex Mono", monospace';
  ctx.fillStyle = rgba(INK.ivory, 0.3);
  for (const [f, t] of [
    [100, '100'],
    [1000, '1k'],
    [10000, '10k'],
  ] as const)
    ctx.fillText(t, X(f) + 3, y0 + h - 2);
  if (an) {
    const bins = an.frequencyBinCount;
    const data = (bins <= buf.length ? buf.subarray(0, bins) : new Float32Array(bins)) as Float32Array<ArrayBuffer>;
    an.getFloatFrequencyData(data);
    const binHz = an.context.sampleRate / an.fftSize;
    ctx.strokeStyle = rgba(INK.ivory, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    let lastX = -1;
    let acc = -Infinity;
    for (let i = 1; i < bins; i++) {
      const f = i * binHz;
      if (f < f0) continue;
      if (f > f1) break;
      const x = Math.round(X(f));
      acc = Math.max(acc, data[i]);
      if (x === lastX) continue;
      const y = Y(Math.max(dbLo, Math.min(dbHi, acc)));
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
      lastX = x;
      acc = -Infinity;
    }
    ctx.stroke();
  }
  if (focus) {
    // where the partials should be: stiff-string series (vermilion) vs ideal harmonics (steel)
    const fz = focus.f1 / Math.sqrt(1 + focus.B);
    for (let k = 1; k <= 60; k++) {
      const fk = k * fz * Math.sqrt(1 + focus.B * k * k);
      const fh = k * focus.f1;
      if (fh < f1 && family === 'piano') {
        ctx.fillStyle = rgba(INK.steel, 0.5);
        ctx.fillRect(X(fh) - 0.5, y0 - 2, 1, 4);
      }
      if (fk > f1) break;
      ctx.fillStyle = rgba(INK.vermilion, 0.9);
      ctx.fillRect(X(fk) - 0.75, y0 + 3, 1.5, 6);
    }
  }
}

// ---------------------------------------------------------------- trumpet
export interface TrumpetState {
  pScale: AutoScale;
  env: Float32Array;
}
const VALVE_DOWN: Record<string, [boolean, boolean, boolean]> = {
  open: [false, false, false],
  '1': [true, false, false],
  '2': [false, true, false],
  '3': [false, false, true],
  '1+2': [true, true, false],
  '2+3': [false, true, true],
  '1+3': [true, false, true],
  '1+2+3': [true, true, true],
};

/** side view of a B♭ trumpet (mouthpiece left, bell right), and above it the bore unrolled:
 *  the standing pressure wave between the lips (0) and the bell (1), its envelope, the
 *  valves that are down and the partial that sounds */
export function drawTrumpet(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TrumpetState): void {
  const portrait = H > W * 1.05;
  const w = Math.min(W * 0.86, portrait ? W * 0.92 : H * 2.4);
  const x0 = (W - w) / 2;
  const u = w / 100; // drawing unit
  const yAx = portrait ? H * 0.62 : H * 0.6; // leadpipe axis
  const yBore = portrait ? H * 0.22 : H * 0.19;
  const meta = fr?.excite?.meta ?? '';
  const valves = /valves (\S+)/.exec(meta)?.[1] ?? 'open';
  const down = VALVE_DOWN[valves] ?? VALVE_DOWN.open;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const brass = (a: number) => rgba(INK.amber, a);
  // ---- the instrument
  ctx.strokeStyle = brass(0.75);
  ctx.lineWidth = Math.max(2, u * 0.9);
  // mouthpiece and leadpipe
  ctx.beginPath();
  ctx.moveTo(x0 + 2 * u, yAx);
  ctx.lineTo(x0 + 46 * u, yAx);
  ctx.stroke();
  ctx.fillStyle = brass(0.6);
  ctx.beginPath();
  ctx.moveTo(x0, yAx - 2.2 * u);
  ctx.quadraticCurveTo(x0 + 3 * u, yAx - 1.4 * u, x0 + 4 * u, yAx - 0.5 * u);
  ctx.lineTo(x0 + 4 * u, yAx + 0.5 * u);
  ctx.quadraticCurveTo(x0 + 3 * u, yAx + 1.4 * u, x0, yAx + 2.2 * u);
  ctx.closePath();
  ctx.fill();
  // main tuning slide (loop below) and the bell section returning to the bell
  ctx.beginPath();
  ctx.moveTo(x0 + 30 * u, yAx);
  ctx.lineTo(x0 + 30 * u, yAx + 9 * u);
  ctx.quadraticCurveTo(x0 + 30 * u, yAx + 12 * u, x0 + 34 * u, yAx + 12 * u);
  ctx.lineTo(x0 + 56 * u, yAx + 12 * u);
  ctx.quadraticCurveTo(x0 + 60 * u, yAx + 12 * u, x0 + 60 * u, yAx + 9 * u);
  ctx.lineTo(x0 + 60 * u, yAx - 6 * u);
  ctx.stroke();
  // bell
  ctx.beginPath();
  ctx.moveTo(x0 + 60 * u, yAx - 6 * u);
  ctx.lineTo(x0 + 66 * u, yAx - 6 * u);
  ctx.bezierCurveTo(x0 + 82 * u, yAx - 6.5 * u, x0 + 92 * u, yAx - 9 * u, x0 + 98 * u, yAx - 15 * u);
  ctx.moveTo(x0 + 66 * u, yAx - 6 * u);
  ctx.bezierCurveTo(x0 + 82 * u, yAx - 5.5 * u, x0 + 92 * u, yAx - 3 * u, x0 + 98 * u, yAx + 3 * u);
  ctx.stroke();
  ctx.strokeStyle = brass(0.55);
  ctx.beginPath();
  ctx.ellipse(x0 + 98 * u, yAx - 6 * u, 1.6 * u, 9 * u, 0, 0, Math.PI * 2);
  ctx.stroke();
  // three valves: casings, pistons pressed down for the fingering
  for (let i = 0; i < 3; i++) {
    const vx = x0 + (38 + i * 6) * u;
    ctx.fillStyle = rgba(INK.ebony, 0.9);
    ctx.strokeStyle = brass(0.75);
    ctx.lineWidth = Math.max(1.2, u * 0.4);
    ctx.beginPath();
    ctx.roundRect(vx - 1.8 * u, yAx - 7 * u, 3.6 * u, 14 * u, 1.2 * u);
    ctx.fill();
    ctx.stroke();
    const dn = down[i];
    ctx.fillStyle = dn ? rgba(INK.vermilion, 0.95) : rgba(INK.ivory, 0.75);
    ctx.beginPath();
    ctx.arc(vx, yAx - (dn ? 8.5 : 11) * u, 1.6 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK.ivory, 0.5);
    ctx.beginPath();
    ctx.moveTo(vx, yAx - 7 * u);
    ctx.lineTo(vx, yAx - (dn ? 8.5 : 11) * u);
    ctx.stroke();
    // the valve's extra loop of tubing, lit when it is in the path
    ctx.strokeStyle = dn ? rgba(INK.vermilion, 0.7) : brass(0.35);
    ctx.lineWidth = Math.max(1.5, u * 0.6);
    const loop = [1.6, 1, 2.6][i];
    ctx.beginPath();
    ctx.moveTo(vx - 0.9 * u, yAx + 7 * u);
    ctx.lineTo(vx - 0.9 * u, yAx + 7 * u + loop * 3 * u);
    ctx.lineTo(vx + 0.9 * u, yAx + 7 * u + loop * 3 * u);
    ctx.lineTo(vx + 0.9 * u, yAx + 7 * u);
    ctx.stroke();
  }
  // ---- the bore unrolled: lips (left) to bell (right), the standing wave inside
  const bx0 = x0;
  const bx1 = x0 + w;
  const r = Math.max(5, u * 1.1);
  ctx.strokeStyle = rgba(INK.ivory, 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx0, yBore - r);
  ctx.lineTo(bx1 - 10 * u, yBore - r);
  ctx.quadraticCurveTo(bx1 - 3 * u, yBore - r, bx1, yBore - r * 3.2);
  ctx.moveTo(bx0, yBore + r);
  ctx.lineTo(bx1 - 10 * u, yBore + r);
  ctx.quadraticCurveTo(bx1 - 3 * u, yBore + r, bx1, yBore + r * 3.2);
  ctx.stroke();
  const focus = fr?.focus ?? null;
  if (focus && focus.shapes[0]) {
    const s = focus.shapes[0];
    let m = 0;
    for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i]));
    const sc = st.pScale.of(m);
    if (st.env.length !== s.length) st.env = new Float32Array(s.length);
    for (let i = 0; i < s.length; i++) st.env[i] = Math.max(Math.abs(s[i]) / sc, st.env[i] * 0.94);
    const A = Math.min(46, H * 0.1);
    const X = (i: number) => bx0 + (i / (s.length - 1)) * (bx1 - bx0);
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i < s.length; i++) {
        const y = yBore + sgn * (r + 3 + st.env[i] * A);
        if (i) ctx.lineTo(X(i), y);
        else ctx.moveTo(X(i), y);
      }
      ctx.lineTo(bx1, yBore + sgn * (r + 3));
      ctx.lineTo(bx0, yBore + sgn * (r + 3));
      ctx.closePath();
      ctx.fillStyle = rgba(INK.vermilion, 0.07);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.vermilion, 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(INK.ivory, 0.9);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < s.length; i++) {
      const y = yBore - (s[i] / sc) * (r - 1);
      if (i) ctx.lineTo(X(i), y);
      else ctx.moveTo(X(i), y);
    }
    ctx.stroke();
  }
  ctx.restore();
}
