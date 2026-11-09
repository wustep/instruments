// The stage: each instrument drawn in plan view and animated from the simulation's own
// state (string shapes, string levels, bow, bore pressure, board/body modes). Nothing
// here is decorative motion: every moving line is read from the audio thread.

import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { CC, CS, EB, GS, L1, L2, L3, R1, R2, R3, RH, TB, TBB, boreNote, fingersFor } from './flute-fingering.ts';

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
export const bodyHalf = (u: number): number => {
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
    // the stopping point: a glowing bar across the string where the finger presses it,
    // rocking with the engine's vibrato (the rocking drawn 6x larger than life)
    if (s && s.stop < 0.995) {
      const now = s.stopNow ?? s.stop;
      const xf = bridge - Ls * s.stop * (1 + 6 * (now / s.stop - 1));
      const y = strY(i, xf);
      const hb = Math.max(5, spread(xf) * 0.22);
      const lit = s.bowing ? 1 : 0.55;
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(INK.amber, 0.22 * lit);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(xf, y - hb);
      ctx.lineTo(xf, y + hb);
      ctx.stroke();
      ctx.strokeStyle = rgba(INK.amber, 0.95 * lit);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xf, y - hb);
      ctx.lineTo(xf, y + hb);
      ctx.stroke();
      ctx.lineCap = 'butt';
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

// ---------------------------------------------------------------- winds: the bore's standing wave
/**
 * The bore's standing wave as the engine computes it, with its sign. Each visual frame carries one
 * snapshot of the pressure along the bore, at a phase that is effectively random at the frame rate;
 * averaging each point's product with the strongest point's gives every point's amplitude with the
 * sign of its lobe (the lobes either side of a node swing in opposite senses), in the engine's units.
 */
export interface BoreWave {
  amp: Float32Array;
  num: Float32Array;
  den: number;
  ref: number;
  last: Float32Array | null;
}
export const newBoreWave = (): BoreWave => ({ amp: new Float32Array(0), num: new Float32Array(0), den: 0, ref: -1, last: null });
/** fold one snapshot (a new frame's shape) into the running standing wave; returns the peak |amp| */
function trackBoreWave(w: BoreWave, s: Float32Array | null): number {
  if (s && s !== w.last && s.length > 1) {
    if (w.num.length !== s.length) {
      w.amp = new Float32Array(s.length);
      w.num = new Float32Array(s.length);
      w.den = 0;
      w.ref = -1;
    }
    w.last = s;
    let k = w.ref;
    if (k < 0 || k >= s.length || w.den < 1e-30) {
      k = 0;
      for (let i = 1; i < s.length; i++) if (Math.abs(s[i]) > Math.abs(s[k])) k = i;
    }
    const c = s[k];
    const a = 0.14;
    w.den = (1 - a) * w.den + a * c * c;
    for (let i = 0; i < s.length; i++) w.num[i] = (1 - a) * w.num[i] + a * s[i] * c;
  } else if (!s) {
    // silence: the wave dies away
    w.den *= 0.9;
    for (let i = 0; i < w.num.length; i++) w.num[i] *= 0.81;
  }
  const d = Math.sqrt(w.den);
  let peak = 0;
  let pk = w.ref;
  for (let i = 0; i < w.num.length; i++) {
    const v = d > 1e-30 ? (Math.SQRT2 * w.num[i]) / d : 0;
    w.amp[i] = v;
    if (Math.abs(v) > peak) {
      peak = Math.abs(v);
      pk = i;
    }
  }
  // follow the strongest point, keeping the sign convention (the new reference's lobe positive)
  if (pk >= 0 && pk !== w.ref && (w.ref < 0 || peak > 1.25 * Math.abs(w.amp[w.ref]))) {
    if (w.amp[pk] < 0) for (let i = 0; i < w.num.length; i++) {
      w.num[i] = -w.num[i];
      w.amp[i] = -w.amp[i];
    }
    w.ref = pk;
  }
  return peak;
}
/** the wave's amplitude at u (0..1 along the bore), linearly interpolated */
const boreAt = (amp: Float32Array, u: number): number => {
  if (amp.length < 2 || u < 0 || u > 1) return 0;
  const f = u * (amp.length - 1);
  const i = Math.min(amp.length - 2, Math.floor(f));
  return amp[i] + (amp[i + 1] - amp[i]) * (f - i);
};
/** a standing wave is drawn slowed: its true period (milliseconds) becomes about a second, a little
 *  quicker for higher notes, so the lobes visibly swing between compression and rarefaction */
const slowPhase = (f1: number, now: number): number => 2 * Math.PI * (0.55 * Math.sqrt(Math.max(0.25, f1 / 262))) * (now / 1000);
/** compression warm, rarefaction cool */
const waveInk = (v: number) => (v >= 0 ? INK.vermilion : INK.steel);

/** a damped spring towards `target` that stops at 0 and 1 with a small bounce (a pad seating, a
 *  piston meeting its felt), in fixed 2 ms steps: the same motion as the 3D keys (winds3d springTo) */
function spring01(pos: Float32Array, vel: Float32Array, i: number, target: number, dt: number, hz: number, zeta: number): number {
  const w = 2 * Math.PI * hz;
  let p = pos[i];
  let v = vel[i];
  const steps = Math.min(60, Math.max(1, Math.ceil(dt / 0.002)));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    v += (w * w * (target - p) - 2 * zeta * w * v) * h;
    p += v * h;
    if (p < 0) {
      p = 0;
      v = -v * 0.22;
    } else if (p > 1) {
      p = 1;
      v = -v * 0.22;
    }
  }
  pos[i] = p;
  vel[i] = v;
  return p;
}

// ---------------------------------------------------------------- flute
export interface FluteState {
  pScale: AutoScale;
  jetScale: AutoScale;
  /** (kept for the stage's state object; unused) */
  env: Float32Array;
  wave?: BoreWave;
  /** each key's spring: 1 open, 0 seated */
  keys?: { pos: Float32Array; vel: Float32Array; t: number; quiet: number };
}
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** sounding tube length for a written note (open–open, end-corrected), m */
export const tubeFor = (m: number) => 343 / (2 * et(m)) - 0.03;

// The flute seen from above, the keys towards the audience (down the page): a Boehm C flute laid
// out as the 3D model is (gl/winds3d.ts: a Yamaha YFL-482H measured off flute-side.jpg, scaled to
// McGee's 670 mm), in metres from the crown's end. `v` is across the tube, towards the audience.
const FL_LEN = 0.67;
const FL_EMB = 0.0705; // the embouchure hole's centre (→ 599.5 mm to the foot's end)
const FL_CORK = FL_EMB - 0.017; // the cork's face (17 mm from the hole's centre, standard)
const FL_RB = 0.0098; // body and foot, outer radius (19 mm bore)
const FL_BORE = 0.0095;
const FL_HEAD = 0.1885; // the head tube enters the body's socket
const FL_FOOT = 0.5355; // the foot's socket ring
const flHead = (x: number) => 0.0089 + 0.0008 * Math.pow(Math.max(0, Math.min(1, (x - 0.012) / (FL_HEAD - 0.012))), 0.65);
const FL_YC = FL_RB + 0.0016; // a closed pad's face from the axis
const FL_ROD_V = 0.0137 * Math.sin((79.5 * Math.PI) / 180); // the main rod, seen from above
const FL_FOOT_V = 0.0148 * Math.sin((10 * Math.PI) / 180); // the foot's rod
const FL_MAIN_POSTS = [0.2965, 0.348, 0.412, 0.4605, 0.5375];
const FL_FOOT_POSTS = [0.5505, 0.608, 0.6455];
/** The total end correction of the 3D model's holes, c/2f less the embouchure-to-hole distance, is
 *  56 mm at the open foot and 59–64 mm at the tone holes (the C♯ vent's small hole 73): an open
 *  pipe end's 0.61·a ≈ 6 mm (Levine & Schwinger) at the far end leaves ≈ 50 mm at the embouchure
 *  (its small, lip-shaded hole and the cork cavity). */
const FL_EMB_CORR = 0.05;
type FlCup = 'open' | 'plain' | 'dome' | 'crown';
interface FlKey {
  x: number;
  /** the note the bore sounds when this is the first open hole */
  note: number;
  r: number;
  style: FlCup;
  /** angle round the tube from the top, towards the audience (deg) */
  phi: number;
  /** closed-standing */
  closed?: boolean;
  open: (f: number) => boolean;
  /** its hinge tube along the rod */
  hinge?: [number, number];
  foot?: boolean;
}
/** the keys and the mechanism that moves them (winds3d FKEYS; OSU flute repair manual fig. 2.2) */
const FL_KEYS: FlKey[] = [
  { x: 0.307, note: 73, r: 0.0062, style: 'plain', phi: 0, open: (f) => !(f & L1), hinge: [0.2987, 0.3458] },
  { x: 0.35, note: 72, r: 0.008, style: 'plain', phi: -140, open: (f) => !(f & (TB | TBB)) },
  { x: 0.3575, note: 71, r: 0.00975, style: 'plain', phi: 0, open: (f) => !(f & (TBB | L2 | R1)), hinge: [0.3502, 0.3678] },
  { x: 0.379, note: 70, r: 0.00975, style: 'open', phi: 0, open: (f) => !(f & L2), hinge: [0.3682, 0.3893] },
  { x: 0.4, note: 69, r: 0.00975, style: 'open', phi: 0, open: (f) => !(f & L3), hinge: [0.3897, 0.4098] },
  { x: 0.4125, note: 68, r: 0.0082, style: 'plain', phi: -108, closed: true, open: (f) => !!(f & GS) },
  { x: 0.424, note: 68, r: 0.00975, style: 'plain', phi: 0, open: (f) => !(f & L3), hinge: [0.4142, 0.4335] },
  { x: 0.4475, note: 67, r: 0.00975, style: 'plain', phi: 0, open: (f) => !(f & RH), hinge: [0.437, 0.4583] },
  { x: 0.474, note: 66, r: 0.00975, style: 'open', phi: 0, open: (f) => !(f & R1), hinge: [0.4627, 0.4868] },
  { x: 0.5, note: 65, r: 0.00975, style: 'open', phi: 0, open: (f) => !(f & R2), hinge: [0.4872, 0.5143] },
  { x: 0.529, note: 64, r: 0.00975, style: 'open', phi: 0, open: (f) => !(f & R3), hinge: [0.5147, 0.5353] },
  { x: 0.558, note: 63, r: 0.00975, style: 'plain', phi: -42, closed: true, open: (f) => !!(f & EB), hinge: [0.5527, 0.5735], foot: true },
  { x: 0.591, note: 62, r: 0.0105, style: 'crown', phi: 62, open: (f) => !(f & (CS | CC)), hinge: [0.5741, 0.6058], foot: true },
  { x: 0.625, note: 61, r: 0.0105, style: 'crown', phi: 62, open: (f) => !(f & CC), hinge: [0.6102, 0.6433], foot: true },
];
/** which of the 2D flute's keys stand open for a note (the test holds them to the 3D model's) */
export const fluteKeysOpen = (m: number): { x: number; open: boolean }[] => FL_KEYS.map((k) => ({ x: k.x, open: k.open(fingersFor(m)) }));
const D2R = Math.PI / 180;
/** the tube's outline, radius against x (the crown's dome, the tapered head, the socket's two rings,
 *  the foot's ring and the end ring; winds3d buildFluteModel's profiles) */
const FL_PROFILE: [number, number][] = (() => {
  const p: [number, number][] = [
    [0, 0], [0.0003, 0.005], [0.0016, 0.0078], [0.0034, 0.009], [0.0046, 0.0093], [0.0052, 0.0096], [0.006, 0.0096], [0.0064, 0.0093],
    [0.0068, 0.0096], [0.0076, 0.0096], [0.008, 0.0093], [0.0112, 0.0093],
  ];
  for (let i = 0; i <= 10; i++) {
    const x = 0.0124 + ((FL_HEAD - 0.0124) * i) / 10;
    p.push([x, flHead(x)]);
  }
  const ring = (x: number): [number, number][] => [[x, 0.0104], [x + 0.0005, 0.011], [x + 0.0018, 0.011], [x + 0.0023, 0.01072], [x + 0.0028, 0.011], [x + 0.0042, 0.011], [x + 0.0048, 0.0104]];
  p.push(...ring(FL_HEAD), [0.2286, 0.0103], ...ring(0.229), [0.2345, FL_RB + 0.0001], [0.235, FL_RB]);
  p.push([FL_FOOT, FL_RB], [FL_FOOT + 0.0006, 0.0106], [FL_FOOT + 0.0016, 0.0108], [FL_FOOT + 0.0042, 0.0108], [FL_FOOT + 0.0047, 0.0105], [FL_FOOT + 0.0052, 0.0108], [FL_FOOT + 0.0094, 0.0108], [FL_FOOT + 0.0104, FL_RB + 0.0001], [FL_FOOT + 0.0108, FL_RB]);
  p.push([FL_LEN - 0.0045, FL_RB], [FL_LEN - 0.0038, 0.0103], [FL_LEN - 0.0012, 0.0104], [FL_LEN, 0.01]);
  return p;
})();
/** the joints' and rings' edges, drawn as hairlines across the tube */
const FL_SEAMS = [0.0052, 0.0076, 0.0112, FL_HEAD, FL_HEAD + 0.0023, FL_HEAD + 0.0048, 0.229, 0.2313, 0.2338, FL_FOOT, FL_FOOT + 0.0047, FL_FOOT + 0.0108, FL_LEN - 0.0045];
/** a superellipse, centre (cx, cy), half-sizes a, b, exponent n */
function superEllipse(p: Path2D | CanvasRenderingContext2D, cx: number, cy: number, a: number, b: number, n: number, seg = 48): void {
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    if (i) p.lineTo(x, y);
    else p.moveTo(x, y);
  }
  p.closePath();
}
/** a teardrop touch lying along x from x0 (its narrow end) to x1 (round), at v, half-width w */
function teardrop(p: Path2D, X: (x: number) => number, Y: (v: number) => number, x0: number, x1: number, v0: number, v1: number, w: number, sc: number): void {
  const n = 14;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const hw = w * Math.pow(Math.sin(Math.PI * Math.max(0.03, Math.min(0.97, 0.1 + 0.9 * f))), 0.6) * (0.45 + 0.55 * f);
    const x = x0 + (x1 - x0) * f;
    const v = v0 + (v1 - v0) * f;
    // the width runs across the touch's own line
    const dx = x1 - x0;
    const dv = v1 - v0;
    const l = Math.hypot(dx, dv) || 1;
    pts.push([X(x) + (-dv / l) * hw * sc, Y(v) + (dx / l) * hw * sc]);
    pts.unshift([X(x) - (-dv / l) * hw * sc, Y(v) - (dx / l) * hw * sc]);
  }
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
}
interface FluteLayout {
  key: string;
  sc: number;
  x0: number;
  c: number;
  tube: Path2D;
  seams: Path2D;
  plate: Path2D;
  hole: Path2D;
  rods: Path2D;
  hinges: Path2D;
  posts: Path2D;
  touches: Path2D;
  rollers: Path2D;
}
let flLayout: FluteLayout | null = null;
function fluteLayout(Lw: number, Cw: number, vertical: boolean): FluteLayout {
  const key = `${Lw}x${Cw}`;
  if (flLayout && flLayout.key === key) return flLayout;
  const sc = (vertical ? 0.86 : 0.9) * Lw / FL_LEN;
  const x0 = (Lw - FL_LEN * sc) / 2;
  // (above the middle on a wide stage: the room's grip sits at its right edge, half way down)
  const c = Cw * (vertical ? 0.5 : 0.4);
  const X = (x: number) => x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  const tube = new Path2D();
  FL_PROFILE.forEach(([x, r], i) => (i ? tube.lineTo(X(x), Y(-r)) : tube.moveTo(X(x), Y(-r))));
  for (let i = FL_PROFILE.length - 1; i >= 0; i--) tube.lineTo(X(FL_PROFILE[i][0]), Y(FL_PROFILE[i][1]));
  tube.closePath();
  const seams = new Path2D();
  for (const x of FL_SEAMS) {
    let r = FL_RB;
    for (let i = 1; i < FL_PROFILE.length; i++) if (FL_PROFILE[i][0] >= x) {
      r = FL_PROFILE[i][1];
      break;
    }
    seams.moveTo(X(x), Y(-r));
    seams.lineTo(X(x), Y(r));
  }
  // the lip plate (45 × 27.6 mm, a superellipse, a little proud of the head) and the embouchure hole
  // (12.4 × 10.2 mm, a rounded rectangle)
  const plate = new Path2D();
  superEllipse(plate, X(FL_EMB), Y(0), 0.0225 * sc, (flHead(FL_EMB) + 0.0011) * sc, 3);
  const hole = new Path2D();
  superEllipse(hole, X(FL_EMB), Y(0), 0.0062 * sc, 0.0051 * sc, 3.6);
  // the rods (main, foot) and their hinge tubes and posts
  const rods = new Path2D();
  rods.moveTo(X(FL_MAIN_POSTS[0] - 0.003), Y(FL_ROD_V));
  rods.lineTo(X(FL_MAIN_POSTS[4] + 0.0005), Y(FL_ROD_V));
  rods.moveTo(X(FL_FOOT_POSTS[0] - 0.003), Y(FL_FOOT_V));
  rods.lineTo(X(FL_FOOT_POSTS[2] + 0.0005), Y(FL_FOOT_V));
  const hinges = new Path2D();
  for (const k of FL_KEYS) {
    if (!k.hinge) continue;
    const v = k.foot ? FL_FOOT_V : FL_ROD_V;
    const hr = 0.002 * sc;
    hinges.roundRect(X(k.hinge[0]), Y(v) - hr, (k.hinge[1] - k.hinge[0]) * sc, 2 * hr, hr);
  }
  const posts = new Path2D();
  for (const x of FL_MAIN_POSTS) {
    posts.moveTo(X(x) + 0.0024 * sc, Y(FL_ROD_V));
    posts.arc(X(x), Y(FL_ROD_V), 0.0024 * sc, 0, 2 * Math.PI);
  }
  for (const x of FL_FOOT_POSTS) {
    posts.moveTo(X(x) + 0.0022 * sc, Y(FL_FOOT_V));
    posts.arc(X(x), Y(FL_FOOT_V), 0.0022 * sc, 0, 2 * Math.PI);
  }
  // the touches: the G♯ key's spatula (the left little finger, on the player's side), the D♯ key's
  // touch on the foot, the D and D♯ trill keys' teardrops between the right hand's cups, the B♭ shake
  // and C♯ trill levers by R1 (winds3d, seen from above: v = r·sin φ)
  const touches = new Path2D();
  const vAt = (r: number, phi: number) => r * Math.sin(phi * D2R);
  teardrop(touches, X, Y, 0.411, 0.3885, vAt(0.0222, -43), vAt(0.0237, -33), 0.0056 * 0.8, sc);
  teardrop(touches, X, Y, 0.5522, 0.5688, vAt(0.0189, 44), vAt(0.0189, 44), 0.0044 * 0.72, sc);
  for (const x of [0.487, 0.5145]) teardrop(touches, X, Y, x, x, vAt(0.0159, 61), vAt(0.0141, 22), 0.0034, sc);
  teardrop(touches, X, Y, 0.46, 0.46, vAt(0.0158, 60), vAt(0.0145, 36), 0.003, sc);
  teardrop(touches, X, Y, 0.4604, 0.4604, vAt(0.0148, 29), vAt(0.0136, 10), 0.0024, sc);
  // the foot's two rollers (the C roller lower, the C♯ roller above it) on their arms
  const rollers = new Path2D();
  for (const [r0, r1, phi, rr, bx] of [
    [0.5525, 0.5655, 90, 0.0184, 0.6112],
    [0.5515, 0.5665, 74, 0.0178, 0.5755],
  ] as const) {
    const v = vAt(rr, phi);
    const hr = 0.0023 * sc;
    rollers.roundRect(X(r0), Y(v) - hr, (r1 - r0) * sc, 2 * hr, hr);
    rollers.moveTo(X(bx), Y(FL_FOOT_V + 0.002));
    rollers.lineTo(X(bx - 0.006), Y(v));
    rollers.lineTo(X(r1 + 0.0012), Y(v));
  }
  flLayout = { key, sc, x0, c, tube, seams, plate, hole, rods, hinges, posts, touches, rollers };
  return flLayout;
}

/** The flute from above: the head (crown, lip plate), the body's Boehm keys and the foot, the keys
 *  closing for the engine's note by the standard fingering (through the mechanism's links, each on a
 *  spring), the breath jet crossing the embouchure hole, and the bore's standing wave inside the
 *  tube over its effective length: the pressure nodes just past the first open hole and ~50 mm
 *  above the embouchure (the end corrections), the lobes swinging between compression and
 *  rarefaction (drawn slowed). */
export function drawFlute(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: FluteState): void {
  const vertical = H > W * 1.05;
  const Lw = vertical ? H : W;
  const Cw = vertical ? W : H;
  const L = fluteLayout(Lw, Cw, vertical);
  const { sc, c } = L;
  const X = (x: number) => L.x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  const now = performance.now();
  const focus = fr?.focus ?? null;
  const br = fr?.breath;
  const blow = br ? br.pressure : 0;
  const vib = br ? br.vib : 0;
  // ---- the fingering: the engine's note while it sounds and a moment after, then the keys go back
  const ks = (st.keys ??= { pos: new Float32Array(FL_KEYS.length).fill(1), vel: new Float32Array(FL_KEYS.length), t: now, quiet: 10 });
  const dt = Math.min(0.1, Math.max(0, (now - ks.t) / 1000));
  ks.t = now;
  ks.quiet = blow > 0.015 ? 0 : ks.quiet + dt;
  const fingers = focus && ks.quiet < 0.8 ? fingersFor(focus.midi) : 0;
  const keyPos = FL_KEYS.map((k, i) => spring01(ks.pos, ks.vel, i, k.open(fingers) ? 1 : 0, dt, 26, 0.62));
  // ---- the effective length: from the first open hole (the bore's own note) back over c / 2f
  const bore = focus ? boreNote(focus.lengthM) : null;
  const hole = bore === null ? undefined : FL_KEYS.find((k) => k.note === bore && k.phi === 0) ?? FL_KEYS.find((k) => k.note === bore);
  const xHole = hole ? hole.x : FL_LEN;
  const Leff = focus ? focus.lengthM : 0;
  const farCorr = Math.max(0.004, Math.min(0.03, Leff - (xHole - FL_EMB) - FL_EMB_CORR));
  const xFar = xHole + farCorr;
  const xNear = xFar - Leff;

  ctx.save();
  if (vertical) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const silver = (a: number) => rgba(INK.ivory, a);
  // ---- behind the tube: the thumb's key and the G♯ key on the player's side, their cups' edges
  // showing beyond the tube
  FL_KEYS.forEach((k, i) => {
    if (k.phi >= 0 || Math.cos(k.phi * D2R) > 0) return;
    drawFlCup(ctx, X(k.x), Y(FL_YC * Math.sin(k.phi * D2R)), k.r * sc, k.r * sc * Math.abs(Math.cos(k.phi * D2R)), k.style, keyPos[i]);
  });
  // ---- the tube: an opaque body, brushed silver lit from above the player's side
  ctx.fillStyle = INK.ground;
  ctx.fill(L.tube);
  const g = ctx.createLinearGradient(0, Y(-0.0105), 0, Y(0.0105));
  g.addColorStop(0, silver(0.07));
  g.addColorStop(0.17, silver(0.32));
  g.addColorStop(0.3, silver(0.13));
  g.addColorStop(0.62, silver(0.05));
  g.addColorStop(0.9, silver(0.08));
  g.addColorStop(1, silver(0.03));
  ctx.fillStyle = g;
  ctx.fill(L.tube);
  ctx.strokeStyle = silver(0.18);
  ctx.lineWidth = 1;
  ctx.stroke(L.seams);
  ctx.strokeStyle = silver(0.55);
  ctx.lineWidth = 1.1;
  ctx.stroke(L.tube);
  // ---- the bore's standing wave, inside the tube: compression warm, rarefaction cool, nodes dark
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = st.pScale.of(peak);
  const ph = Math.cos(slowPhase(focus?.f1 ?? 440, now));
  const lvl = Math.min(1, peak / scale);
  if (focus && Leff > 0 && lvl > 0.02) {
    const xa = FL_CORK;
    const xb = Math.min(FL_LEN, xFar);
    // the envelope (where the air's pressure swings most: antinodes glow, nodes stay dark) in a
    // wide soft band, the swing itself (compression warm, rarefaction cool) in a narrower one
    const ge = ctx.createLinearGradient(X(xa), 0, X(xb), 0);
    const gw = ctx.createLinearGradient(X(xa), 0, X(xb), 0);
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const x = xa + ((xb - xa) * i) / N;
      const A = boreAt(w.amp, (x - xNear) / Leff) / scale;
      ge.addColorStop(i / N, rgba(INK.vermilion, 0.22 * Math.min(1, Math.pow(Math.abs(A), 1.5))));
      gw.addColorStop(i / N, rgba(waveInk(A * ph), 0.42 * Math.min(1, Math.pow(Math.abs(A * ph), 1.15))));
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const [h, gr] of [[0.8, ge], [0.42, gw]] as const) {
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.roundRect(X(xa), Y(-FL_BORE * h), (xb - xa) * sc, 2 * FL_BORE * h * sc, FL_BORE * h * sc);
      ctx.fill();
    }
    ctx.restore();
  }
  // ---- the lip plate and the embouchure hole
  ctx.fillStyle = INK.ground;
  ctx.fill(L.plate);
  const gp = ctx.createLinearGradient(0, Y(-0.011), 0, Y(0.011));
  gp.addColorStop(0, silver(0.08));
  gp.addColorStop(0.22, silver(0.26));
  gp.addColorStop(0.5, silver(0.12));
  gp.addColorStop(1, silver(0.04));
  ctx.fillStyle = gp;
  ctx.fill(L.plate);
  ctx.strokeStyle = silver(0.6);
  ctx.lineWidth = 1.1;
  ctx.stroke(L.plate);
  ctx.fillStyle = '#060504';
  ctx.fill(L.hole);
  ctx.strokeStyle = silver(0.7);
  ctx.stroke(L.hole);
  // ---- the mechanism: rods, hinge tubes, the touches and rollers, the posts
  ctx.strokeStyle = silver(0.4);
  ctx.lineWidth = Math.max(1, 0.0011 * sc);
  ctx.stroke(L.rods);
  ctx.fillStyle = '#1b1a18';
  ctx.fill(L.hinges);
  ctx.strokeStyle = silver(0.5);
  ctx.lineWidth = 1;
  ctx.stroke(L.hinges);
  ctx.fillStyle = '#1b1a18';
  ctx.fill(L.touches);
  ctx.fill(L.rollers);
  ctx.strokeStyle = silver(0.45);
  ctx.stroke(L.touches);
  ctx.stroke(L.rollers);
  // ---- the keys (cups and arms), seated or open
  FL_KEYS.forEach((k, i) => {
    const cphi = Math.cos(k.phi * D2R);
    if (cphi < 0) return;
    const cx = X(k.x);
    const cy = Y(FL_YC * Math.sin(k.phi * D2R));
    const ry = k.r * sc * cphi;
    const rod = k.foot ? FL_FOOT_V : FL_ROD_V;
    // the arm from the hinge tube to the cup (a French pointed arm runs on over the cup to its hole)
    const toward = Math.sign(Y(rod) - cy) || 1;
    const tip = k.style === 'open' ? 0.0053 : k.style === 'plain' || k.style === 'crown' ? 0.0011 : k.r * 0.85;
    drawFlCup(ctx, cx, cy, k.r * sc, ry, k.style, keyPos[i]);
    flArm(ctx, cx, Y(rod), cy + toward * tip * sc * cphi, 0.002 * sc);
    // the first finger's cup on the C♯ key's lever (one piece with it)
    if (k.note === 73) {
      drawFlCup(ctx, X(0.338), Y(0), 0.0083 * sc, 0.0083 * sc, 'dome', keyPos[i]);
      flArm(ctx, X(0.338), Y(FL_ROD_V), Y(0.0083 * 0.85), 0.0021 * sc);
    }
  });
  ctx.fillStyle = '#24221f';
  ctx.fill(L.posts);
  ctx.strokeStyle = silver(0.55);
  ctx.lineWidth = 1;
  ctx.stroke(L.posts);
  // ---- the breath: a sheet of air from the lips (the player's side) across the hole to its far
  // edge, carrying the jet's disturbance (its delay in periods from the engine) downstream, slowed
  const e = fr?.excite;
  if (blow > 0.02 && e) {
    const periods = Number(/= ([\d.]+) periods/.exec(e.meta)?.[1] ?? 0.42);
    let m = 0;
    for (let i = 0; i < e.trace.length; i += 4) m = Math.max(m, Math.abs(e.trace[i]));
    const swing = Math.min(1, m / st.jetScale.of(m));
    // from the lips at the plate's edge to the hole's far (blowing) edge, narrowing as it goes
    const vL = -(flHead(FL_EMB) + 0.0011);
    const vE = 0.0051;
    const t = now / 1000;
    const a = Math.min(1, 0.35 + blow) * (1 + 2.5 * vib);
    const gj = ctx.createLinearGradient(0, Y(vL), 0, Y(vE));
    gj.addColorStop(0, rgba(INK.steel, 0));
    gj.addColorStop(0.35, rgba(INK.steel, 0.5 * a));
    gj.addColorStop(1, rgba(INK.steel, 0.75 * a));
    ctx.strokeStyle = gj;
    for (let j = -2; j <= 2; j++) {
      ctx.beginPath();
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const v = vL + (vE - vL) * f;
        const eta = 0.0015 * Math.pow(f, 1.5) * Math.sin(2 * Math.PI * (periods * f - 0.9 * t) + j * 0.4) * (0.4 + 0.6 * swing) * Math.min(1, blow * 1.6);
        const x = FL_EMB + j * 0.0015 * (1 - 0.45 * f) + eta;
        if (i) ctx.lineTo(X(x), Y(v));
        else ctx.moveTo(X(x), Y(v));
      }
      ctx.lineWidth = j === 0 ? 1.2 : 0.8;
      ctx.stroke();
    }
  }
  // ---- the wave's line along the bore's axis, over everything (its nodes stand still)
  if (focus && Leff > 0 && lvl > 0.02) {
    const xa = FL_CORK;
    const xb = Math.min(FL_LEN, xFar);
    ctx.beginPath();
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const x = xa + ((xb - xa) * i) / n;
      const v = (boreAt(w.amp, (x - xNear) / Leff) / scale) * ph;
      if (i) ctx.lineTo(X(x), Y(-v * FL_BORE * 0.62));
      else ctx.moveTo(X(x), Y(-v * FL_BORE * 0.62));
    }
    ctx.strokeStyle = rgba(INK.ivory, 0.75 * Math.min(1, 3 * lvl));
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}
/** a key's cup from above: its rim and shoulder, the open cups' hole and grommet, the plain cups'
 *  pad washer; `p` 1 open (raised), 0 seated: a seated cup sits lower and its finger (or link) lit */
function drawFlCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, style: FlCup, p: number): void {
  const s = 0.965 + 0.035 * p;
  const shut = 1 - p;
  rx *= s;
  ry *= s;
  // the cup: brushed silver, lit from above the player's side; seated, it takes the warm accent
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
  ctx.fillStyle = '#1d1c1a';
  ctx.fill();
  const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
  g.addColorStop(0, rgba(INK.ivory, 0.2));
  g.addColorStop(0.45, rgba(INK.ivory, 0.07));
  g.addColorStop(1, rgba(INK.ivory, 0.03));
  ctx.fillStyle = g;
  ctx.fill();
  if (shut > 0.01) {
    ctx.fillStyle = rgba(INK.amber, 0.14 * shut);
    ctx.fill();
  }
  ctx.strokeStyle = shut > 0.5 ? rgba(INK.amber, 0.5 + 0.3 * shut) : rgba(INK.ivory, 0.5);
  ctx.lineWidth = 1 + 0.5 * shut;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.78, ry * 0.78, 0, 0, 2 * Math.PI);
  ctx.strokeStyle = rgba(INK.ivory, 0.16);
  ctx.lineWidth = 1;
  ctx.stroke();
  if (style === 'open') {
    // the hole through the cup: dark down the bore; a fingertip on it when seated
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.35, ry * 0.35, 0, 0, 2 * Math.PI);
    ctx.fillStyle = '#050403';
    ctx.fill();
    if (shut > 0.01) {
      ctx.fillStyle = rgba(INK.amber, 0.7 * shut);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.43, ry * 0.43, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = rgba(INK.ivory, 0.45);
    ctx.stroke();
  } else if (style !== 'dome') {
    // the pad washer's button
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.13, ry * 0.13, 0, 0, 2 * Math.PI);
    ctx.fillStyle = shut > 0.5 ? rgba(INK.amber, 0.6 * shut) : rgba(INK.ivory, 0.15);
    ctx.fill();
    ctx.strokeStyle = rgba(INK.ivory, 0.35);
    ctx.stroke();
  }
}
/** a key's arm: from its hinge tube (at y0) to its tip on the cup (y1), tapering */
function flArm(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, hw: number): void {
  ctx.beginPath();
  ctx.moveTo(x - hw * 0.55, y0);
  ctx.quadraticCurveTo(x - hw * 0.5, (y0 + y1) / 2, x, y1);
  ctx.quadraticCurveTo(x + hw * 0.5, (y0 + y1) / 2, x + hw * 0.55, y0);
  ctx.closePath();
  ctx.fillStyle = '#2b2925';
  ctx.fill();
  ctx.strokeStyle = rgba(INK.ivory, 0.42);
  ctx.lineWidth = 0.9;
  ctx.stroke();
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
  /** (kept for the stage's state object; unused) */
  env: Float32Array;
  /** where the sound leaves (the bell's mouth), set while drawing */
  src?: { x: number; y: number };
  wave?: BoreWave;
  /** pistons (0 up, 1 down) and the 1st and 3rd slides kicked out (0..1), each on a spring */
  mech?: { valves: Float32Array; valveV: Float32Array; slide: Float32Array; slideV: Float32Array; t: number };
}
export const VALVE_DOWN: Record<string, [boolean, boolean, boolean]> = {
  open: [false, false, false],
  '1': [true, false, false],
  '2': [false, true, false],
  '3': [false, false, true],
  '1+2': [true, true, false],
  '2+3': [false, true, true],
  '1+3': [true, false, true],
  '1+2+3': [true, true, true],
};

// The B♭ trumpet as the 3D model builds it (gl/winds3d.ts: laid out from trumpet-side.jpg at the Bach
// 180S37's published sizes, docs/3d-reference.md), in metres: x from the valves towards the bell, y up,
// z away from the viewer (the player's left, the leadpipe's side, is nearest). Drawn in an
// orthographic view from a little in front of the bell and above, so the bell's mouth opens as an
// ellipse and the bell pipe shows above the leadpipe.
type V3 = [number, number, number];
const TR_RT = 0.00635; // tubing: 11.66 mm bore, 12.7 mm outside
const TR_VX = [-0.026, 0, 0.026];
const TR_RC = 0.0099; // valve casings Ø19.8
const TR_CY = 0.052; // casing half-length
const TR_ZL = -0.017; // the leadpipe and slides' side
const TR_ZB = 0.017; // the bell section's side
const TR_XR = -0.15; // the receiver's end
const TR_XB = 0.33; // the bell rim, 480 mm from the receiver
const TR_MP = 0.066; // the 7C mouthpiece out of the receiver
const trLeadY = (x: number) => 0.036 + ((x - TR_XR) * 0.011) / 0.255;
const TR_LEAD_END = 0.098;
const TR_CAP_TOP = TR_CY + 0.0104;
const TR_STEM = 0.017;
const TR_STROKE = 0.0155; // piston travel
const TR_SLIDE_TRAVEL = [0.012, 0, 0.017];
const TR_VALVE_PASSAGES = 0.11;
const TR_BOW_C: V3 = [-0.103, 0.0055, TR_ZB];
const TR_BOW_R = 0.0255;
const TR_BELL0: V3 = [-0.103, 0.031, TR_ZB];
const TR_BELL_END: V3 = [TR_XB, 0.0492, TR_ZB];
const TR_MS_TOP = trLeadY(TR_LEAD_END);
const TR_MS_LOW = -0.034;
const TR_MS_X = 0.15;
const TR_RIM = 0.0611; // 122 mm bell
/** the bell's radius by distance from the rim: the side photograph's profile at a Bessel horn's rate */
const TR_BELL_D = [0, 0.002, 0.005, 0.01, 0.016, 0.025, 0.04, 0.06, 0.085, 0.115, 0.15, 0.2, 0.26, 0.33, 0.434];
const TR_BELL_R = [TR_RIM, 0.0585, 0.0538, 0.0466, 0.0405, 0.0345, 0.0262, 0.0195, 0.0152, 0.0125, 0.0108, 0.0094, 0.0083, 0.0075, 0.0068];
/** monotone cubic through the bell's table (Fritsch–Carlson), as the 3D model's */
const trBellR = (() => {
  const xs = TR_BELL_D;
  const ys = TR_BELL_R;
  const n = xs.length;
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) continue;
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    const xc = Math.max(xs[0], Math.min(xs[n - 1], x));
    let i = 0;
    while (i < n - 2 && xc > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (xc - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
})();
const v3add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const v3lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const v3len = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
/** a polyline with its corners rounded (quadratic, radius r), sampled about every `step` m */
function trRound(pts: V3[], r: number, step = 0.003): V3[] {
  const out: V3[] = [];
  const line = (a: V3, b: V3) => {
    const n = Math.max(1, Math.ceil(v3len(a, b) / step));
    for (let i = out.length ? 1 : 0; i <= n; i++) out.push(v3lerp(a, b, i / n));
  };
  let cur = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1];
    const B = pts[i];
    const C2 = pts[i + 1];
    const p1 = v3lerp(B, A, Math.min(0.5, r / v3len(A, B)));
    const p2 = v3lerp(B, C2, Math.min(0.5, r / v3len(B, C2)));
    line(cur, p1);
    const n = 10;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push(v3lerp(v3lerp(p1, B, t), v3lerp(B, p2, t), t));
    }
    cur = p2;
  }
  line(cur, pts[pts.length - 1]);
  return out;
}
/** the view: yaw towards the bell's mouth, pitch from above */
const TR_YAW = 11 * D2R;
const TR_PITCH = 13 * D2R;
const trProj = (p: V3): [number, number] => {
  const depth = -p[0] * Math.sin(TR_YAW) + p[2] * Math.cos(TR_YAW);
  return [p[0] * Math.cos(TR_YAW) + p[2] * Math.sin(TR_YAW), -(p[1] * Math.cos(TR_PITCH) + depth * Math.sin(TR_PITCH))];
};
const trDir = (() => {
  const l = Math.hypot(1, 0.011 / 0.255);
  return [1 / l, 0.011 / 0.255 / l, 0] as V3;
})();
const TR_RECV: V3 = [TR_XR, trLeadY(TR_XR), TR_ZL];
const trAlong = (s: number): V3 => [TR_RECV[0] + trDir[0] * s, TR_RECV[1] + trDir[1] * s, TR_ZL];
/** the main tuning slide's crook: a half turn from the leadpipe's level down to the third valve's */
const TR_CROOK: V3[] = (() => {
  const msR = (TR_MS_TOP - TR_MS_LOW) / 2;
  const c: V3 = [TR_MS_X, (TR_MS_TOP + TR_MS_LOW) / 2, (TR_ZL - 0.002) / 2];
  const u: V3 = [0, msR, TR_ZL - c[2]];
  return Array.from({ length: 41 }, (_, i) => {
    const a = (i / 40) * Math.PI;
    return [c[0] + msR * Math.sin(a), c[1] + u[1] * Math.cos(a), c[2] + u[2] * Math.cos(a)] as V3;
  });
})();
/** each valve's slide: the fixed tubes out of the casing (out, back) and the slide's U, the player's
 *  way to its port order (air out of the lower port, back by the upper) */
interface TrSlide {
  out: V3[];
  back: V3[];
  sleeve: V3[];
  dir: V3;
  group: number;
}
const TR_SLIDES: TrSlide[] = (() => {
  const s: TrSlide[] = [];
  // 1st: back towards the player
  {
    const [y1, y2, xb, xs] = [-0.01, -0.027, -0.0915, -0.052];
    s.push({
      out: trRound([[TR_VX[0], y2, -0.003], [TR_VX[0], y2, TR_ZL], [xs, y2, TR_ZL]], 0.0075),
      back: trRound([[xs, y1, TR_ZL], [TR_VX[0], y1, TR_ZL], [TR_VX[0], y1, -0.003]], 0.0075),
      sleeve: trRound([[xs, y2, TR_ZL], [xb, y2, TR_ZL], [xb, y1, TR_ZL], [xs, y1, TR_ZL]], 0.0085),
      dir: [-1, 0, 0],
      group: 2,
    });
  }
  // 2nd: a short crook out in front. (Tighter than the 3D model's, whose crook, traced with the
  // photograph's perspective, would add 134 mm of tubing: a semitone is 88 mm of the 1.48 m bore.)
  {
    const [a1, a2, z2, xb2] = [-0.008, -0.032, -0.03, -0.021];
    s.push({
      out: trRound([[TR_VX[1], a2, -0.003], [-0.001, a2, -0.019], [-0.008, a2, z2], [-0.0115, a2, z2]], 0.007),
      back: trRound([[-0.0115, a1, z2], [-0.008, a1, z2], [-0.001, a1, -0.019], [TR_VX[1], a1, -0.003]], 0.007),
      sleeve: trRound([[-0.0115, a2, z2], [xb2, a2, z2], [xb2, a1, z2], [-0.0115, a1, z2]], 0.0118),
      dir: [0, 0, 0],
      group: 4,
    });
  }
  // 3rd: forward, inside the main slide's loop
  {
    const [b1, b2, xf, xs3] = [-0.004, -0.02, 0.148, 0.059];
    s.push({
      out: trRound([[TR_VX[2], b2, -0.003], [TR_VX[2], b2, TR_ZL], [xs3, b2, TR_ZL]], 0.0075),
      back: trRound([[xs3, b1, TR_ZL], [TR_VX[2], b1, TR_ZL], [TR_VX[2], b1, -0.003]], 0.0075),
      sleeve: trRound([[xs3, b2, TR_ZL], [xf, b2, TR_ZL], [xf, b1, TR_ZL], [xs3, b1, TR_ZL]], 0.008),
      dir: [1, 0, 0],
      group: 2,
    });
  }
  return s;
})();
const TR_TAIL = trRound([[TR_VX[0], -0.02, 0.003], [TR_VX[0], -0.02, TR_ZB], [TR_BOW_C[0], -0.02, TR_ZB]], 0.009);
const TR_BOW: V3[] = Array.from({ length: 31 }, (_, i) => {
  const t = (i / 30) * Math.PI;
  return [TR_BOW_C[0] - TR_BOW_R * Math.sin(t), TR_BOW_C[1] - TR_BOW_R * Math.cos(t), TR_ZB] as V3;
});
const TR_BELL_LEN = v3len(TR_BELL0, TR_BELL_END);
const TR_LEAD: V3[] = trRound([trAlong(0.024), [TR_LEAD_END, TR_MS_TOP, TR_ZL]], 0, 0.004);
/** the main slide: its top leg from the leadpipe, the crook, the lower leg back into the third valve */
const TR_MAIN: V3[] = [...trRound([[TR_LEAD_END, TR_MS_TOP, TR_ZL], TR_CROOK[0]], 0), ...TR_CROOK.slice(1), ...trRound([TR_CROOK[TR_CROOK.length - 1], [TR_VX[2] + 0.004, TR_MS_LOW, -0.002]], 0).slice(1)];
/** the mouthpiece (Bach 7C) as [radius, distance from its rim]: rim, cup, throat, the shank's taper */
const TR_MPIECE: [number, number][] = [
  [0.0081, 0.0012], [0.0103, 0], [0.0128, 0.0016], [0.013, 0.0038], [0.013, 0.0078], [0.0124, 0.0092], [0.0118, 0.0104], [0.0104, 0.0145], [0.0084, 0.0192],
  [0.0066, 0.0236], [0.0054, 0.0272], [0.0051, 0.03], [0.0055, 0.031], [0.0051, 0.0322], [0.0055, 0.0334], [0.0052, 0.0346], [0.0053, 0.039], [0.006, 0.0402],
  [0.0061, 0.046], [0.0059, 0.0475], [0.0048, 0.088],
];
/** one segment of the air's path: points, the drawing group it is seen in, hidden (inside a casing),
 *  and which slide it rides with (they kick out) */
interface TrRun {
  pts: V3[];
  group: number;
  hidden?: boolean;
  slide?: number;
}
/** the air's path from the lips to the bell's rim for the pistons down: the mouthpiece, the leadpipe,
 *  the main slide, valves 3, 2 and 1 (through a pressed valve's slide, straight through an open one),
 *  the bell tail, the bow, the bell */
function trAirRuns(down: readonly boolean[]): TrRun[] {
  const runs: TrRun[] = [];
  const rim = trAlong(-TR_MP);
  runs.push({ pts: trRound([rim, trAlong(0.024)], 0), group: 3 });
  runs.push({ pts: TR_LEAD, group: 3 });
  runs.push({ pts: TR_MAIN, group: 2 });
  let at: V3 = [TR_VX[2], TR_MS_LOW, 0];
  runs.push({ pts: [TR_MAIN[TR_MAIN.length - 1], at], group: 1, hidden: true });
  for (const k of [2, 1, 0]) {
    const sl = TR_SLIDES[k];
    const exitY = k === 0 ? -0.02 : [-0.02, -0.018, -0.016][k];
    if (down[k]) {
      runs.push({ pts: [at, [TR_VX[k], sl.out[0][1], 0], sl.out[0]], group: 1, hidden: true });
      runs.push({ pts: sl.out, group: sl.group });
      runs.push({ pts: sl.sleeve, group: sl.group, slide: k });
      runs.push({ pts: sl.back, group: sl.group });
      at = [TR_VX[k], sl.back[sl.back.length - 1][1], 0];
      runs.push({ pts: [sl.back[sl.back.length - 1], at], group: 1, hidden: true });
    } else {
      // through the piston's straight port
      const nx: V3 = [TR_VX[k], exitY, 0];
      runs.push({ pts: [at, nx], group: 1, hidden: true });
      at = nx;
    }
    if (k > 0) {
      const nx: V3 = [TR_VX[k - 1], exitY, 0];
      runs.push({ pts: [at, nx], group: 1, hidden: true });
      at = nx;
    }
  }
  runs.push({ pts: [at, TR_TAIL[0]], group: 1, hidden: true });
  runs.push({ pts: TR_TAIL, group: 0 });
  runs.push({ pts: TR_BOW, group: 0 });
  runs.push({ pts: Array.from({ length: 41 }, (_, i) => v3lerp(TR_BELL0, TR_BELL_END, i / 40)), group: 0 });
  return runs;
}
const trAirCache = new Map<string, { runs: TrRun[]; runLen: number[]; total: number }>();
/** the air's path for a fingering, with each run's length and the whole (cached per fingering) */
function trAir(key: string, down: readonly boolean[]): { runs: TrRun[]; runLen: number[]; total: number } {
  let a = trAirCache.get(key);
  if (!a) {
    const runs = trAirRuns(down);
    const geo = runs.map((r) => {
      let l = 0;
      for (let i = 1; i < r.pts.length; i++) l += v3len(r.pts[i - 1], r.pts[i]);
      return l;
    });
    // the passages inside the casings are the same length whichever way a piston routes the air
    // (110 mm through the valve block, as the 3D model's air path counts them)
    const hid = runs.reduce((a, r, i) => a + (r.hidden ? geo[i] : 0), 0);
    const runLen = runs.map((r, i) => (r.hidden ? (geo[i] * TR_VALVE_PASSAGES) / hid : geo[i]));
    const total = runLen.reduce((a, b) => a + b, 0);
    trAirCache.set(key, (a = { runs, runLen, total }));
  }
  return a;
}
/** the air path's length for a fingering (lips to rim, m) */
export const trumpetAirLength = (valves: string): number => trAir(valves, VALVE_DOWN[valves] ?? VALVE_DOWN.open).total;
/** a projected strip of tube: the screen polyline (unit metres) for a 3D one */
const trPoly = (pts: V3[], off: V3 = [0, 0, 0]) => pts.map((p) => trProj(v3add(p, off)));
interface TrLayout {
  key: string;
  S: number;
  ox: number;
  oy: number;
}
let trLayout: TrLayout | null = null;
/** the fit: the instrument's projected extent (mouthpiece rim to bell rim, bottom caps to buttons) */
const TR_BOUNDS = (() => {
  const pts: [number, number][] = [];
  const add = (p: V3) => pts.push(trProj(p));
  add(trAlong(-TR_MP - 0.014));
  for (const t of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) add([TR_XB, TR_BELL_END[1] + TR_RIM * Math.cos(t), TR_ZB + TR_RIM * Math.sin(t)]);
  for (const x of TR_VX) {
    add([x, TR_CAP_TOP + TR_STEM + 0.006, 0]);
    add([x, -TR_CY - 0.012, -TR_RC]);
  }
  add([-0.0915 - 0.008, -0.03, TR_ZL]);
  add([-0.021 - 0.008, -0.04, -0.03]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
})();
function trumpetLayout(W: number, H: number): TrLayout {
  const key = `${W}x${H}`;
  if (trLayout && trLayout.key === key) return trLayout;
  const b = TR_BOUNDS;
  const portrait = H > W * 1.05;
  const S = Math.min(((portrait ? 0.9 : 0.84) * W) / (b.x1 - b.x0), ((portrait ? 0.5 : 0.62) * H) / (b.y1 - b.y0));
  const ox = W / 2 - ((b.x0 + b.x1) / 2) * S;
  const oy = H * (portrait ? 0.46 : 0.47) - ((b.y0 + b.y1) / 2) * S;
  trLayout = { key, S, ox, oy };
  return trLayout;
}
const BRASS_BODY = '#22180f';
const BRASS_DEEP = '#120d08';

/** Side view of a B♭ trumpet from the player's left, a little in front of the bell and above: the
 *  mouthpiece and leadpipe, the main tuning slide, three piston valves (the pistons going down with the
 *  engine's fingering, on springs), the first and third slides (kicked out on the notes that need it)
 *  and the second's crook, the bell tail, bow and the flare to the rim. The air's path through the
 *  pressed valves' slides glows faintly, and the bore's standing wave (the engine's, with its sign;
 *  drawn slowed) runs along that path from the lips to the bell; the lips buzz at the rim. */
export function drawTrumpet(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TrumpetState): void {
  const L = trumpetLayout(W, H);
  const { S } = L;
  const P = (q: [number, number]): [number, number] => [L.ox + q[0] * S, L.oy + q[1] * S];
  const now = performance.now();
  const meta = fr?.excite?.meta ?? '';
  const valves = /valves (\S+)/.exec(meta)?.[1] ?? 'open';
  const down = VALVE_DOWN[valves] ?? VALVE_DOWN.open;
  const focus = fr?.focus ?? null;
  // ---- the mechanism's springs (the 3D model's: pistons 22 Hz, slides 6 Hz)
  const mc = (st.mech ??= { valves: new Float32Array(3), valveV: new Float32Array(3), slide: new Float32Array(3), slideV: new Float32Array(3), t: now });
  const dt = Math.min(0.1, Math.max(0, (now - mc.t) / 1000));
  mc.t = now;
  const partial = Number(/partial (\d+)/.exec(meta)?.[1] ?? 0);
  const combo = valves === '1+3' ? 0.6 : valves === '1+2+3' ? 1 : 0;
  const kickTo = [partial >= 4 ? combo : 0, 0, partial > 0 && partial <= 3 ? combo : 0];
  const press = [0, 1, 2].map((k) => spring01(mc.valves, mc.valveV, k, down[k] ? 1 : 0, dt, 22, 0.6));
  const kick = [0, 1, 2].map((k) => spring01(mc.slide, mc.slideV, k, kickTo[k], dt, 6, 0.9) * TR_SLIDE_TRAVEL[k]);
  const slideOff = (k: number): V3 => [TR_SLIDES[k].dir[0] * kick[k], 0, 0];
  // ---- the standing wave along the air's path
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = st.pScale.of(peak);
  const lvl = Math.min(1, peak / scale);
  const ph = Math.cos(slowPhase(focus?.f1 ?? 392, now));
  const { runs, runLen, total } = trAir(valves, down);
  // the pressure at s along the path (m from the lips): the engine's wave, and in the bell's flare the
  // Webster horn's 1/r (p = ψ/r: the loop's wave is ψ, spreading over the widening mouth)
  const ampAt = (s: number) => {
    const d = total - s;
    const taper = d < TR_BELL_LEN ? TR_BELL_R[TR_BELL_R.length - 1] / trBellR(d) : 1;
    return (boreAt(w.amp, s / total) / scale) * taper;
  };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const D = 2 * TR_RT * S;
  const tubes = (polys: [number, number][][], d = D, edge = rgba(INK.amber, 0.7), body = BRASS_BODY) => {
    const p = new Path2D();
    for (const pl of polys) pl.forEach((q, i) => (i ? p.lineTo(...P(q)) : p.moveTo(...P(q))));
    ctx.strokeStyle = edge;
    ctx.lineWidth = d + 2.2;
    ctx.stroke(p);
    ctx.strokeStyle = body;
    ctx.lineWidth = d;
    ctx.stroke(p);
    // a lacquer highlight along the side towards the light (above, a little behind)
    const hp = new Path2D();
    for (const pl of polys)
      pl.forEach((q, i) => {
        const a = pl[Math.max(0, i - 1)];
        const b = pl[Math.min(pl.length - 1, i + 1)];
        const tx = b[0] - a[0];
        const ty = b[1] - a[1];
        const l = Math.hypot(tx, ty) || 1;
        const nx = -ty / l;
        const ny = tx / l;
        const k = nx * -0.3 + ny * -0.95; // the light, up and to the left
        const [x, y] = P(q);
        const o = 0.26 * d * k;
        if (i) hp.lineTo(x + nx * o, y + ny * o);
        else hp.moveTo(x + nx * o, y + ny * o);
      });
    ctx.strokeStyle = rgba(INK.amber, 0.26);
    ctx.lineWidth = Math.max(1, 0.16 * d);
    ctx.stroke(hp);
  };
  // the air's glow inside the tubes of group g: the path faintly, then the wave's lobes by strength
  const glow = (g: number) => {
    if (!focus || lvl < 0.02) return;
    let s0 = 0;
    const base = new Path2D();
    const buckets = new Map<number, Path2D>();
    const envB = new Map<number, Path2D>();
    runs.forEach((r, ri) => {
      const l = runLen[ri];
      if (r.group !== g || r.hidden || g === 0 && ri === runs.length - 1) {
        s0 += l;
        return;
      }
      const off = r.slide !== undefined ? slideOff(r.slide) : ([0, 0, 0] as V3);
      let s = s0;
      let last = -1;
      let lastE = -1;
      let prev = P(trProj(v3add(r.pts[0], off)));
      base.moveTo(...prev);
      for (let i = 1; i < r.pts.length; i++) {
        const sl = v3len(r.pts[i - 1], r.pts[i]);
        const A = ampAt(s + sl / 2);
        const v = A * ph;
        s += sl;
        const q = P(trProj(v3add(r.pts[i], off)));
        base.lineTo(...q);
        const e = Math.round(Math.min(10, 10 * Math.pow(Math.abs(A), 1.5)));
        if (e) {
          let bp = envB.get(e);
          if (!bp) envB.set(e, (bp = new Path2D()));
          if (e !== lastE) bp.moveTo(...prev);
          bp.lineTo(...q);
        }
        lastE = e;
        const a = Math.round(Math.min(10, 10 * Math.pow(Math.abs(v), 1.2)));
        const key = a > 0 ? (v >= 0 ? a : -a) : 0;
        if (key) {
          let bp = buckets.get(key);
          if (!bp) buckets.set(key, (bp = new Path2D()));
          if (key !== last) bp.moveTo(...prev);
          bp.lineTo(...q);
        }
        last = key;
        prev = q;
      }
      s0 += l;
    });
    ctx.lineCap = 'butt';
    ctx.strokeStyle = rgba(INK.amber, 0.06 + 0.05 * lvl);
    ctx.lineWidth = 0.56 * D;
    ctx.stroke(base);
    for (const [e, bp] of envB) {
      ctx.strokeStyle = rgba(INK.vermilion, (e / 10) * 0.24);
      ctx.stroke(bp);
    }
    ctx.lineWidth = 0.32 * D;
    for (const [key, bp] of buckets) {
      ctx.strokeStyle = rgba(key > 0 ? INK.vermilion : INK.steel, (Math.abs(key) / 10) * 0.5);
      ctx.stroke(bp);
    }
    ctx.lineCap = 'round';
  };

  // ---- group 0: the bell section (tail, bow, the bell pipe flaring to the rim), farthest
  tubes([trPoly(TR_TAIL), trPoly(TR_BOW)]);
  const bellPts = Array.from({ length: 61 }, (_, i) => {
    const t = Math.pow(i / 60, 0.6);
    const p = v3lerp(TR_BELL0, TR_BELL_END, t);
    return { p, r: trBellR(TR_BELL_LEN * (1 - t)), t };
  });
  {
    const ax = trPoly([TR_BELL0, TR_BELL_END]);
    const dx = ax[1][0] - ax[0][0];
    const dy = ax[1][1] - ax[0][1];
    const l = Math.hypot(dx, dy);
    const nx = -dy / l;
    const ny = dx / l;
    const side = (sg: number) => bellPts.map(({ p, r }) => {
      const q = P(trProj(p));
      return [q[0] + sg * nx * r * S, q[1] + sg * ny * r * S] as [number, number];
    });
    const up = side(-1);
    const lo = side(1);
    const bell = new Path2D();
    up.forEach((q, i) => (i ? bell.lineTo(...q) : bell.moveTo(...q)));
    for (let i = lo.length - 1; i >= 0; i--) bell.lineTo(...lo[i]);
    bell.closePath();
    ctx.fillStyle = BRASS_BODY;
    ctx.fill(bell);
    // burnished lacquer: brighter along the upper flank
    const a0 = P(trProj(TR_BELL0));
    const g = ctx.createLinearGradient(a0[0] + nx * -0.06 * S, a0[1] + ny * -0.06 * S, a0[0] + nx * 0.06 * S, a0[1] + ny * 0.06 * S);
    g.addColorStop(0, rgba(INK.amber, 0.04));
    g.addColorStop(0.3, rgba(INK.amber, 0.22));
    g.addColorStop(0.5, rgba(INK.amber, 0.06));
    g.addColorStop(0.75, rgba(INK.amber, 0.12));
    g.addColorStop(1, rgba(INK.amber, 0.02));
    ctx.fillStyle = g;
    ctx.fill(bell);
    ctx.strokeStyle = rgba(INK.amber, 0.7);
    ctx.lineWidth = 1.1;
    const edges = new Path2D();
    up.forEach((q, i) => (i ? edges.lineTo(...q) : edges.moveTo(...q)));
    lo.forEach((q, i) => (i ? edges.lineTo(...q) : edges.moveTo(...q)));
    ctx.stroke(edges);
    // the wave inside the bell: a gradient along its axis, as wide as the flare lets it be
    if (focus && lvl > 0.02) {
      const sBell = total - runLen[runs.length - 1];
      const e0 = P(trProj(TR_BELL0));
      const e1 = P(trProj(TR_BELL_END));
      const gw = ctx.createLinearGradient(e0[0], e0[1], e1[0], e1[1]);
      const ge = ctx.createLinearGradient(e0[0], e0[1], e1[0], e1[1]);
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        const A = ampAt(sBell + u * TR_BELL_LEN);
        ge.addColorStop(u, rgba(INK.vermilion, 0.24 * Math.min(1, Math.pow(Math.abs(A), 1.5))));
        gw.addColorStop(u, rgba(waveInk(A * ph), 0.5 * Math.min(1, Math.pow(Math.abs(A * ph), 1.2))));
      }
      const inner = new Path2D();
      const k = 0.3;
      bellPts.forEach(({ p, r }, i) => {
        const q = P(trProj(p));
        if (i) inner.lineTo(q[0] - nx * r * S * k, q[1] - ny * r * S * k);
        else inner.moveTo(q[0] - nx * r * S * k, q[1] - ny * r * S * k);
      });
      for (let i = bellPts.length - 1; i >= 0; i--) {
        const q = P(trProj(bellPts[i].p));
        const r = bellPts[i].r;
        inner.lineTo(q[0] + nx * r * S * k, q[1] + ny * r * S * k);
      }
      ctx.fillStyle = rgba(INK.amber, 0.05 + 0.04 * lvl);
      ctx.fill(inner);
      ctx.fillStyle = ge;
      ctx.fill(inner);
      ctx.fillStyle = gw;
      ctx.fill(inner);
    }
    // the rim: the bell's mouth as an ellipse, its rolled bead, the dark throat inside
    const rimPts: [number, number][] = [];
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * 2 * Math.PI;
      rimPts.push(P(trProj([TR_XB, TR_BELL_END[1] + TR_RIM * Math.cos(t), TR_ZB + TR_RIM * Math.sin(t)])));
    }
    const mouth = new Path2D();
    rimPts.forEach((q, i) => (i ? mouth.lineTo(...q) : mouth.moveTo(...q)));
    mouth.closePath();
    const c = P(trProj([TR_XB, TR_BELL_END[1], TR_ZB]));
    const tg = ctx.createRadialGradient(c[0] - 0.01 * S, c[1], 0, c[0], c[1], TR_RIM * S);
    tg.addColorStop(0, BRASS_DEEP);
    tg.addColorStop(0.55, '#1e150c');
    tg.addColorStop(1, rgba(INK.amber, 0.3));
    ctx.fillStyle = tg;
    ctx.fill(mouth);
    ctx.strokeStyle = rgba(INK.amber, 0.85);
    ctx.lineWidth = 1.6;
    ctx.stroke(mouth);
    st.src = { x: c[0] + 0.012 * S, y: c[1] };
  }
  glow(0);
  // ---- group 1: the valve casings, their caps, the pistons
  TR_VX.forEach((x, k) => {
    const ring = (y: number, r: number) => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 40; i++) {
        const t = (i / 40) * 2 * Math.PI;
        pts.push(P(trProj([x + r * Math.cos(t), y, r * Math.sin(t)])));
      }
      return pts;
    };
    const cyl = (y0: number, y1: number, r: number, fill: string, edge: string, top = true) => {
      const a = ring(y0, r);
      const b = ring(y1, r);
      const sx0 = Math.min(...a.map((q) => q[0]));
      const sx1 = Math.max(...a.map((q) => q[0]));
      const yb0 = P(trProj([x, y0, 0]))[1];
      const yb1 = P(trProj([x, y1, 0]))[1];
      const body = new Path2D();
      body.rect(sx0, yb1, sx1 - sx0, yb0 - yb1);
      const ell = (pts: [number, number][]) => {
        const e = new Path2D();
        pts.forEach((q, i) => (i ? e.lineTo(...q) : e.moveTo(...q)));
        e.closePath();
        return e;
      };
      ctx.fillStyle = fill;
      ctx.fill(body);
      ctx.fill(ell(a));
      const gx = ctx.createLinearGradient(sx0, 0, sx1, 0);
      gx.addColorStop(0, rgba(INK.amber, 0.04));
      gx.addColorStop(0.28, rgba(INK.amber, 0.22));
      gx.addColorStop(0.45, rgba(INK.amber, 0.06));
      gx.addColorStop(1, rgba(INK.amber, 0.02));
      ctx.fillStyle = gx;
      ctx.fill(body);
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(sx0, yb1);
      ctx.lineTo(sx0, yb0);
      ctx.moveTo(sx1, yb1);
      ctx.lineTo(sx1, yb0);
      ctx.stroke();
      const lower = new Path2D();
      a.slice(20, 41).forEach((q, i) => (i ? lower.lineTo(...q) : lower.moveTo(...q)));
      ctx.stroke(lower);
      if (top) {
        const e = ell(b);
        ctx.fillStyle = fill;
        ctx.fill(e);
        ctx.stroke(e);
      }
    };
    const edge = rgba(INK.amber, 0.7);
    const nickel = rgba(INK.ivory, 0.6);
    // bottom cap (nickel, knurled), the casing, the top cap
    cyl(-TR_CY - 0.0086, -TR_CY, TR_RC + 0.0018, '#1c1a17', nickel, false);
    cyl(-TR_CY, TR_CY, TR_RC, BRASS_BODY, edge);
    cyl(TR_CY, TR_CY + 0.006, TR_RC + 0.0018, '#1c1a17', nickel);
    // the casing's collars (the knuckles' bands, the guide ring): their near halves
    ctx.strokeStyle = rgba(INK.amber, 0.38);
    ctx.lineWidth = 1;
    for (const y of [-TR_CY + 0.0062, 0.0129, TR_CY - 0.0072]) {
      ctx.beginPath();
      ring(y, TR_RC + 0.0005).slice(20, 41).forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
      ctx.stroke();
    }
    // the piston: stem and button (pearl in a polished bezel), down by the stroke when pressed
    const yb = TR_CAP_TOP + TR_STEM - TR_STROKE * press[k];
    const s0 = P(trProj([x, TR_CY + 0.006, 0]));
    const s1 = P(trProj([x, yb, 0]));
    ctx.strokeStyle = rgba(INK.ivory, 0.55);
    ctx.lineWidth = Math.max(1.5, 0.005 * S);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(...s0);
    ctx.lineTo(...s1);
    ctx.stroke();
    ctx.strokeStyle = '#1c1a17';
    ctx.lineWidth = Math.max(0.5, 0.005 * S - 2);
    ctx.stroke();
    ctx.lineCap = 'round';
    cyl(yb, yb + 0.0045, 0.0084, '#1c1a17', nickel);
    const pearl: [number, number][] = [];
    for (let i = 0; i <= 32; i++) {
      const t = (i / 32) * 2 * Math.PI;
      pearl.push(P(trProj([x + 0.0053 * Math.cos(t), yb + 0.0045, 0.0053 * Math.sin(t)])));
    }
    ctx.beginPath();
    pearl.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    ctx.closePath();
    ctx.fillStyle = down[k] ? rgba(INK.amber, 0.75) : rgba(INK.ivory, 0.32);
    ctx.fill();
  });
  // ---- group 2: the main tuning slide, the third slide (inside its loop), the first slide
  const slideTubes = (k: number) => {
    const sl = TR_SLIDES[k];
    const on = down[k];
    tubes([trPoly(sl.out), trPoly(sl.back)], D, rgba(INK.amber, on ? 0.8 : 0.5));
    // kicked out, the slide shows its nickel-silver inner tubes between the fixed tubes and its sleeve
    if (kick[k] > 0.0005) {
      const ends = [sl.out[sl.out.length - 1], sl.back[0]];
      tubes(ends.map((e) => trPoly([e, v3add(e, [sl.dir[0] * (kick[k] + 0.003), 0, 0])])), D * 0.9, rgba(INK.ivory, 0.55), '#1c1a17');
    }
    tubes([trPoly(sl.sleeve, slideOff(k))], D, rgba(INK.amber, on ? 0.8 : 0.5));
  };
  tubes([trPoly(TR_MAIN)]);
  slideTubes(2);
  slideTubes(0);
  // the third slide's ring and the first's thumb saddle, riding with them
  {
    const o3 = slideOff(2);
    const c3 = P(trProj(v3add([0.075, 0.0135, TR_ZL - 0.0042], o3)));
    const b3 = P(trProj(v3add([0.075, -0.004 + TR_RT, TR_ZL], o3)));
    ctx.strokeStyle = rgba(INK.amber, 0.55);
    ctx.lineWidth = Math.max(1, 0.0022 * S);
    ctx.beginPath();
    ctx.ellipse(c3[0], c3[1], 0.0105 * S, 0.0105 * S * 0.96, 0, 0, 2 * Math.PI);
    ctx.moveTo(b3[0], b3[1]);
    ctx.lineTo(c3[0], c3[1] + 0.0101 * S);
    ctx.stroke();
    const o1 = slideOff(0);
    const sad = [[-0.0786, 0.016], [-0.078, 0.003], [-0.0752, -0.0028], [-0.0668, -0.01 + TR_RT - 0.0004], [-0.0584, -0.0028], [-0.0556, 0.003], [-0.055, 0.016]].map(([x, y]) => P(trProj(v3add([x, y, TR_ZL], o1))));
    ctx.beginPath();
    sad.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    ctx.stroke();
  }
  glow(2);
  // ---- group 3: the leadpipe, the receiver, the finger hook and the mouthpiece
  tubes([trPoly(TR_LEAD)]);
  {
    // the finger hook past the third valve, leaning back, its tip curled
    const xb = 0.0545;
    const y0 = trLeadY(xb);
    const hook = [[xb, y0 + TR_RT - 0.001], [xb - 0.0035, y0 + 0.0095], [xb - 0.0098, y0 + 0.0165], [xb - 0.0098, y0 + 0.0228], [xb - 0.0045, y0 + 0.0262], [xb + 0.0006, y0 + 0.0244], [xb + 0.0016, y0 + 0.0212]].map(([x, y]) => P(trProj([x, y, TR_ZL])));
    ctx.strokeStyle = rgba(INK.amber, 0.55);
    ctx.lineWidth = Math.max(1, 0.0026 * S);
    ctx.beginPath();
    hook.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    ctx.stroke();
  }
  // the mouthpiece: its silhouette along the leadpipe's axis (silver plate), rim to shank
  {
    const ax0 = P(trProj(trAlong(-TR_MP)));
    const ax1 = P(trProj(trAlong(0)));
    const dx = ax1[0] - ax0[0];
    const dy = ax1[1] - ax0[1];
    const l = Math.hypot(dx, dy);
    const ux = dx / l;
    const uy = dy / l;
    const at = (s: number, r: number): [number, number] => {
      const q = P(trProj(trAlong(-TR_MP + s)));
      return [q[0] - uy * r * S, q[1] + ux * r * S];
    };
    const mp = new Path2D();
    TR_MPIECE.forEach(([r, s], i) => (i ? mp.lineTo(...at(s, r)) : mp.moveTo(...at(s, r))));
    for (let i = TR_MPIECE.length - 1; i >= 0; i--) mp.lineTo(...at(TR_MPIECE[i][1], -TR_MPIECE[i][0]));
    mp.closePath();
    ctx.fillStyle = '#1c1a17';
    ctx.fill(mp);
    const gm = ctx.createLinearGradient(...at(0.03, 0.013), ...at(0.03, -0.013));
    gm.addColorStop(0, rgba(INK.ivory, 0.05));
    gm.addColorStop(0.3, rgba(INK.ivory, 0.22));
    gm.addColorStop(0.55, rgba(INK.ivory, 0.07));
    gm.addColorStop(1, rgba(INK.ivory, 0.03));
    ctx.fillStyle = gm;
    ctx.fill(mp);
    ctx.strokeStyle = rgba(INK.ivory, 0.6);
    ctx.lineWidth = 1.1;
    ctx.stroke(mp);
  }
  glow(3);
  // ---- group 4: the second valve's crook, nearest
  slideTubes(1);
  glow(4);
  // ---- the lips at the rim: closed at rest; buzzing (drawn slowed) with the engine's lip opening
  {
    const tr = fr?.excite?.trace;
    let lo = 1;
    let hi = 0;
    if (tr) for (let i = 0; i < tr.length; i += 4) {
      lo = Math.min(lo, tr[i]);
      hi = Math.max(hi, tr[i]);
    }
    const swing = tr && hi > lo ? Math.sqrt(hi) - Math.sqrt(Math.max(0, lo)) : 0;
    const playing = swing > 0.02 && lvl > 0.02;
    const t = now / 1000;
    const open01 = playing ? 0.5 - 0.5 * Math.cos(2 * Math.PI * 5 * t) : 0;
    const gap = (0.0004 + 0.0032 * Math.min(1, swing * 1.6) * open01) * S;
    const rim = P(trProj(trAlong(-TR_MP)));
    const dx = P(trProj(trAlong(0)))[0] - rim[0];
    const dy = P(trProj(trAlong(0)))[1] - rim[1];
    const l = Math.hypot(dx, dy);
    const ux = dx / l;
    const uy = dy / l;
    const nx = uy;
    const ny = -ux;
    for (const sg of [-1, 1]) {
      // each lip: a soft cushion against the rim, from the aperture out past the rim's edge
      ctx.beginPath();
      for (let i = 0; i <= 18; i++) {
        const f = i / 18;
        const across = gap / 2 + f * 0.0135 * S;
        const bulge = (0.0014 + 0.0085 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + 0.98 * f)), 0.7)) * S;
        const q: [number, number] = [rim[0] - ux * bulge + sg * nx * across, rim[1] - uy * bulge + sg * ny * across];
        if (i) ctx.lineTo(...q);
        else ctx.moveTo(...q);
      }
      ctx.fillStyle = rgba(INK.felt, playing ? 0.14 + 0.08 * open01 : 0.12);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.felt, 0.7);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // the lip's inner edge, where it buzzes against the other
      ctx.beginPath();
      ctx.moveTo(rim[0] - ux * 0.0012 * S + sg * nx * gap / 2, rim[1] - uy * 0.0012 * S + sg * ny * gap / 2);
      ctx.lineTo(rim[0] - ux * 0.0075 * S + sg * nx * (gap / 2 + 0.0016 * S), rim[1] - uy * 0.0075 * S + sg * ny * (gap / 2 + 0.0016 * S));
      ctx.strokeStyle = playing ? rgba(INK.vermilion, 0.5 + 0.45 * open01) : rgba(INK.felt, 0.4);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    if (playing) {
      // the puff through the aperture into the cup
      ctx.strokeStyle = rgba(INK.steel, 0.15 + 0.45 * open01);
      ctx.lineWidth = Math.max(1, gap * 0.7);
      ctx.beginPath();
      ctx.moveTo(rim[0] - ux * 0.002 * S, rim[1] - uy * 0.002 * S);
      ctx.lineTo(rim[0] + ux * 0.007 * S, rim[1] + uy * 0.007 * S);
      ctx.stroke();
    }
  }
  ctx.restore();
}
