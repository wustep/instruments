// The volute in plan, drawn from the engine's state: every held key's string swinging under the
// band, its pipe sounding (seen from above: a ring that fills as the air column works), its bar
// flashing under the mallet and ringing down; the hub's modes as a moving figure on the disc; the
// twelve sympathetic strings glowing as they take the sound up. Nothing moves that the engine does
// not move.
import type { VisualFrame } from '@piano-model/engine';
import { AutoScale, INK, rgba } from './stage-draw.ts';
import { hubMode, volutePlan, type P2, type VolutePlan } from './volute-plan.ts';

export interface VoluteState {
  str: AutoScale;
  pipe: AutoScale;
  bar: AutoScale;
  halo: AutoScale;
  hub: AutoScale;
  /** each string's swing, remembered a moment (the blur a real string shows): by note */
  env: Map<number, Float32Array>;
  /** bars and pipes ring down on the picture as they do in the engine: last levels by note */
  barLvl: Float32Array;
  pipeLvl: Float32Array;
  /** the hub's figure: mode shapes over a small square, and the canvas they are summed into */
  shapes?: Float32Array[];
  acc?: Float32Array;
  img?: { cv: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D; data: ImageData };
  /** where the plan was last drawn (stage px): its centre and scale, for the hand and the room */
  at?: { cx: number; cy: number; sc: number };
  /** a hand on the stage: the weave (0..1 across) and swell it holds, while it holds them */
  hand?: { x: number; y: number } | null;
}
export const newVoluteState = (): VoluteState => ({
  str: new AutoScale(1e-5, 0.995),
  pipe: new AutoScale(1e-4, 0.995),
  bar: new AutoScale(1e-3, 0.995),
  halo: new AutoScale(1e-3, 0.998),
  hub: new AutoScale(1e-4, 0.995),
  env: new Map(),
  barLvl: new Float32Array(128),
  pipeLvl: new Float32Array(128),
});

const HUB_PX = 72;
const BRASS = '214,170,96';
const ALU = '176,186,196';

function hubShapes(st: VoluteState, modes: number): Float32Array[] {
  if (st.shapes && st.shapes.length === modes) return st.shapes;
  const out: Float32Array[] = [];
  for (let k = 0; k < modes; k++) {
    const a = new Float32Array(HUB_PX * HUB_PX);
    for (let y = 0; y < HUB_PX; y++)
      for (let x = 0; x < HUB_PX; x++) {
        const u = ((x + 0.5) / HUB_PX) * 2 - 1;
        const v = ((y + 0.5) / HUB_PX) * 2 - 1;
        const rho = Math.hypot(u, v);
        a[y * HUB_PX + x] = rho <= 1 ? hubMode(k, rho, Math.atan2(v, u)) : 0;
      }
    out.push(a);
  }
  st.shapes = out;
  return out;
}

/** the plan's place on a W×H stage: centred, as large as fits */
export function voluteLayout(W: number, H: number, plan: VolutePlan = volutePlan()): { cx: number; cy: number; sc: number } {
  const b = plan.box;
  const sc = Math.min((W * 0.94) / (b.x1 - b.x0), (H * 0.92) / (b.z1 - b.z0));
  return { cx: W / 2 - ((b.x0 + b.x1) / 2) * sc, cy: H / 2 - ((b.z0 + b.z1) / 2) * sc, sc };
}

export function drawVolute(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: VoluteState, now: number): void {
  const plan = volutePlan();
  const L = voluteLayout(W, H, plan);
  st.at = L;
  const { cx, cy, sc } = L;
  const X = (p: P2) => cx + p[0] * sc;
  const Y = (p: P2) => cy + p[1] * sc;
  const v = fr?.volute ?? null;
  const live = new Map<number, NonNullable<VisualFrame['volute']>['notes'][number]>();
  if (v) for (const n of v.notes) live.set(n.midi, n);
  const weave = v ? v.weave : 0.5;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const hair = Math.max(0.8, Math.min(1.2, sc / 260));

  // ---- the bars on their two rails
  ctx.strokeStyle = rgba(INK.ivory, 0.16);
  ctx.lineWidth = hair;
  for (const rail of plan.rails) {
    ctx.beginPath();
    rail.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))));
    ctx.stroke();
  }
  let barPk = 0;
  for (const b of plan.bars) {
    let lv = 0;
    for (const n of live.values()) if (n.pipeMidi === b.midi) lv = Math.max(lv, n.bar);
    // (a bar released rings down in the engine; the picture follows its last level down)
    st.barLvl[b.midi] = lv = Math.max(lv, st.barLvl[b.midi] * 0.9);
    barPk = Math.max(barPk, lv);
  }
  const barRef = st.bar.of(barPk);
  for (const b of plan.bars) {
    const dx = b.b[0] - b.a[0];
    const dz = b.b[1] - b.a[1];
    const len = Math.hypot(dx, dz);
    const lv = Math.min(1, Math.sqrt(st.barLvl[b.midi] / barRef));
    ctx.save();
    ctx.translate(X(b.a), Y(b.a));
    ctx.rotate(Math.atan2(dz, dx));
    const w = b.w * sc;
    const r = Math.min(w * 0.3, 3);
    ctx.beginPath();
    ctx.roundRect(0, -w / 2, len * sc, w, r);
    ctx.fillStyle = 'rgb(44,48,52)';
    ctx.fill();
    if (lv > 0.02) {
      // the bar's first mode: it swings most at its middle and ends, not at all on the rails
      const g = ctx.createLinearGradient(0, 0, len * sc, 0);
      for (const [u, a] of [[0, 0.55], [0.224, 0.04], [0.5, 1], [0.776, 0.04], [1, 0.55]] as const) g.addColorStop(u, rgba(INK.vermilion, 0.75 * lv * a));
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.strokeStyle = rgba(ALU, 0.5 + 0.4 * lv);
    ctx.lineWidth = hair;
    ctx.stroke();
    ctx.restore();
  }

  // ---- the frame and its column
  ctx.beginPath();
  plan.frame.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))));
  ctx.closePath();
  ctx.fillStyle = 'rgb(46,32,21)';
  ctx.fill();
  ctx.strokeStyle = rgba(INK.ivory, 0.42);
  ctx.lineWidth = hair;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(X(plan.column[0]), Y(plan.column[0]));
  ctx.lineTo(X(plan.column[1]), Y(plan.column[1]));
  ctx.strokeStyle = rgba(INK.ivory, 0.42);
  ctx.lineWidth = plan.columnW * sc + 2 * hair;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.strokeStyle = 'rgb(46,32,21)';
  ctx.lineWidth = plan.columnW * sc;
  ctx.stroke();
  ctx.lineCap = 'round';

  // ---- the pipes, from above: a brass ring; the air inside glows as it sounds
  let pipePk = 0;
  for (const p of plan.pipes) {
    let lv = 0;
    for (const n of live.values()) if (n.pipeMidi === p.midi) lv = Math.max(lv, n.pLevel);
    st.pipeLvl[p.midi] = lv = Math.max(lv, st.pipeLvl[p.midi] * 0.85);
    pipePk = Math.max(pipePk, lv);
  }
  const pipeRef = st.pipe.of(pipePk);
  for (const p of plan.pipes) {
    const x = X(p.c);
    const y = Y(p.c);
    const r = Math.max(1.6, p.r * sc);
    const lv = Math.min(1, st.pipeLvl[p.midi] / pipeRef);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgb(18,15,11)';
    ctx.fill();
    if (lv > 0.02) {
      ctx.fillStyle = rgba(INK.amber, 0.9 * lv);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r + 2 + 5 * lv, 0, 2 * Math.PI);
      ctx.strokeStyle = rgba(INK.amber, 0.22 * lv);
      ctx.lineWidth = 2 + 3 * lv;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
    }
    ctx.strokeStyle = rgba(BRASS, 0.5 + 0.3 * weave + 0.2 * lv);
    ctx.lineWidth = Math.max(hair, r * 0.22);
    ctx.stroke();
  }

  // ---- the hub: the spruce disc and the figure its modes make
  const hx = cx;
  const hy = cy;
  const hr = plan.hubR * sc;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgb(58,43,27)';
  ctx.fill();
  const modes = fr?.modes;
  if (modes && modes.length) {
    const shapes = hubShapes(st, modes.length);
    let pk = 0;
    for (let k = 0; k < modes.length; k++) pk = Math.max(pk, modes[k]);
    const ref = st.hub.of(pk);
    if (pk > ref * 0.01) {
      if (!st.img) {
        const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(HUB_PX, HUB_PX) : Object.assign(document.createElement('canvas'), { width: HUB_PX, height: HUB_PX });
        const c2 = cv.getContext('2d') as CanvasRenderingContext2D;
        st.img = { cv, ctx: c2, data: c2.createImageData(HUB_PX, HUB_PX) };
      }
      const d = st.img.data.data;
      const N = HUB_PX * HUB_PX;
      const acc = (st.acc ??= new Float32Array(N));
      acc.fill(0);
      for (let k = 0; k < modes.length; k++) {
        // each mode swings at its own (slowed) rate: the true ones are tens to thousands of hertz
        const a = (modes[k] / ref) * Math.cos((now / 1000) * (1.1 + 0.37 * k) + k);
        if (Math.abs(a) < 0.004) continue;
        const s = shapes[k];
        for (let i = 0; i < N; i++) acc[i] += a * s[i];
      }
      for (let i = 0; i < N; i++) {
        const q = acc[i];
        const m = Math.min(1, Math.abs(q) * 1.6);
        // up warm, down cool
        d[i * 4] = q >= 0 ? 255 : 150;
        d[i * 4 + 1] = q >= 0 ? 120 : 182;
        d[i * 4 + 2] = q >= 0 ? 70 : 210;
        d[i * 4 + 3] = 150 * m;
      }
      st.img.ctx.putImageData(st.img.data, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy, hr - 1, 0, 2 * Math.PI);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(st.img.cv as CanvasImageSource, hx - hr, hy - hr, 2 * hr, 2 * hr);
      ctx.restore();
    }
  }
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, 2 * Math.PI);
  ctx.strokeStyle = rgba(INK.ivory, 0.5);
  ctx.lineWidth = hair;
  ctx.stroke();
  // the sympathetic strings: a star on the hub, cool when they ring
  const halo = v?.halo;
  let hpk = 0;
  if (halo) for (let j = 0; j < halo.length; j++) hpk = Math.max(hpk, halo[j]);
  const href = st.halo.of(hpk);
  plan.halo.forEach((s, j) => {
    const lv = halo ? Math.min(1, Math.sqrt(halo[j] / href)) : 0;
    if (lv > 0.03) {
      ctx.beginPath();
      ctx.moveTo(X(s.a), Y(s.a));
      ctx.lineTo(X(s.b), Y(s.b));
      ctx.strokeStyle = rgba(INK.steel, 0.3 * lv);
      ctx.lineWidth = 2 + 5 * lv;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(X(s.a), Y(s.a));
    ctx.lineTo(X(s.b), Y(s.b));
    ctx.strokeStyle = lv > 0.03 ? rgba(INK.steel, 0.45 + 0.55 * lv) : rgba(INK.ivory, 0.22);
    ctx.lineWidth = hair;
    ctx.stroke();
  });
  // the bridge (maple) and the band just outside it: brighter the more the weave gives the strings
  ctx.beginPath();
  ctx.arc(hx, hy, plan.bridgeR * sc, 0, 2 * Math.PI);
  ctx.strokeStyle = rgba(INK.felt, 0.75);
  ctx.lineWidth = Math.max(1.4, 0.008 * sc);
  ctx.stroke();
  ctx.beginPath();
  plan.strings.forEach((s, i) => (i ? ctx.lineTo(X(s.band), Y(s.band)) : ctx.moveTo(X(s.band), Y(s.band))));
  ctx.strokeStyle = rgba(INK.amber, 0.25 + 0.5 * (1 - weave));
  ctx.lineWidth = Math.max(1.2, 0.006 * sc);
  ctx.stroke();

  // ---- the strings: at rest a hairline; held, the engine's own shape and the blur of its swing
  let spk = 0;
  for (const n of live.values()) if (n.string) for (let i = 0; i < n.string.length; i++) spk = Math.max(spk, Math.abs(n.string[i]));
  const sref = st.str.of(spk);
  const step = plan.strings.length > 1 ? Math.hypot(plan.strings[1].b[0] - plan.strings[0].b[0], plan.strings[1].b[1] - plan.strings[0].b[1]) : 0.1;
  for (const s of plan.strings) {
    const n = live.get(s.midi);
    const x0 = X(s.a);
    const y0 = Y(s.a);
    const x1 = X(s.b);
    const y1 = Y(s.b);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = s.wound ? rgba(INK.copper, n?.string ? 0.3 : 0.55) : rgba(INK.ivory, n?.string ? 0.18 : 0.4);
    ctx.lineWidth = s.wound ? hair * 1.5 : hair;
    ctx.stroke();
    let env = st.env.get(s.midi);
    if (n?.string) {
      const sh = n.string;
      if (!env || env.length !== sh.length) st.env.set(s.midi, (env = new Float32Array(sh.length)));
      for (let i = 0; i < sh.length; i++) env[i] = Math.max(Math.abs(sh[i]), env[i] * 0.86);
    } else if (env) {
      let any = false;
      for (let i = 0; i < env.length; i++) {
        env[i] *= 0.8;
        if (env[i] > sref * 0.004) any = true;
      }
      if (!any) {
        st.env.delete(s.midi);
        env = undefined;
      }
    }
    if (!env) continue;
    // across the string, in the plan: at most a little under half the gap to the next string
    const amp = (Math.min(0.5 * step, 0.03) * sc) / sref;
    const nx = -(y1 - y0) / Math.hypot(x1 - x0, y1 - y0);
    const ny = (x1 - x0) / Math.hypot(x1 - x0, y1 - y0);
    const P = env.length;
    ctx.beginPath();
    for (let i = 0; i < P; i++) {
      const u = i / (P - 1);
      ctx.lineTo(x0 + (x1 - x0) * u + nx * env[i] * amp, y0 + (y1 - y0) * u + ny * env[i] * amp);
    }
    for (let i = P - 1; i >= 0; i--) {
      const u = i / (P - 1);
      ctx.lineTo(x0 + (x1 - x0) * u - nx * env[i] * amp, y0 + (y1 - y0) * u - ny * env[i] * amp);
    }
    ctx.closePath();
    ctx.fillStyle = rgba(INK.vermilion, 0.2);
    ctx.fill();
    if (n?.string) {
      const sh = n.string;
      ctx.beginPath();
      for (let i = 0; i < P; i++) {
        const u = i / (P - 1);
        const x = x0 + (x1 - x0) * u + nx * sh[i] * amp;
        const y = y0 + (y1 - y0) * u + ny * sh[i] * amp;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = rgba(INK.vermilion, 0.95);
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
    // the key is down: its hitch pin is lit
    if (n?.held) {
      ctx.beginPath();
      ctx.arc(x1, y1, 2.2, 0, 2 * Math.PI);
      ctx.fillStyle = rgba(INK.vermilion, 0.95);
      ctx.fill();
    }
  }
  // hitch pins
  ctx.fillStyle = rgba(INK.ivory, 0.5);
  for (const s of plan.strings) if (!live.get(s.midi)?.held) ctx.fillRect(X(s.b) - 0.8, Y(s.b) - 0.8, 1.6, 1.6);

  // ---- a hand on the stage: across turns from the strings to the pipes, up swells
  if (st.hand) {
    ctx.beginPath();
    ctx.arc(st.hand.x, st.hand.y, 11, 0, 2 * Math.PI);
    ctx.strokeStyle = rgba(INK.ivory, 0.8);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W * 0.06, st.hand.y);
    ctx.lineTo(st.hand.x - 15, st.hand.y);
    ctx.strokeStyle = rgba(INK.vermilion, 0.2 + 0.6 * (1 - weave));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(st.hand.x + 15, st.hand.y);
    ctx.lineTo(W * 0.94, st.hand.y);
    ctx.strokeStyle = rgba(INK.amber, 0.2 + 0.6 * weave);
    ctx.stroke();
  }
  ctx.restore();
}
