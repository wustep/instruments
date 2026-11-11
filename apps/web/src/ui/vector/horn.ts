// The horn on the vector display (see kit.ts): the stage's own drawing (horn-draw.ts: the same plan in
// metres, the same fingering, levers and lips, the same standing wave folded from the engine's bore
// snapshots), as lines. Blue is the brass and its mechanism: every tube its two walls (a nearer tube hides
// what lies behind it), bright along the air's path for the fingering held and dim off it; the rotors'
// caps with their two passages turning a quarter turn, the paddles bright under the fingers; the bell's
// flare with a few of its sections, its mouth (no hand in it: the engine has none). Amber is the bore's
// standing wave, hatched across the bore along the air's path (dashed through the valves) and opening out
// in the bell. At the mouthpiece the knobs' slots mark where each acts, drawn as on the reeds (kit.ts
// breathFlow, lipLine): the breath (green) flowing into the lips, the lips (red) on the rim parted by the
// engine's lip opening, the turbulence in their slit (pink), the vibrato (white) riding the pitch. The
// state object is the stage's, so a change of style carries the levers and wave over.

import type { VisualFrame } from '@piano-model/engine';
import { BAR_X, CRANK, HOOK, LEVERS, crankAngle, hornLayout, hornLive, hornRecord, paddle, type HnLayout, type HnLive, type HornState } from '../horn-draw.ts';
import { AXIS, CAP_R, MOUTH_K, MP_DIR, MP_RIM, RIM_C, ROT_R, ROT_X, ROT_Y, bellR, type P } from '../horn-plan.ts';
import { V, beam, breathFlow, dot, handle, heat, lipLine, mix, ring, seg } from './kit.ts';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** how many brightnesses a hatched wave is drawn in (one path each) */
const LEVELS = 6;
/** a repeatable scatter in 0..1 (the turbulence dots keep no state) */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** the vibrato has no place in the visual frame: it is read off the sounding pitch (its deviation from its
 *  own slow mean), kept per state object */
const pitchTrack = new WeakMap<HornState, { mean: number; dev: number; t: number }>();

/** The double horn from its outside, as lines: the tubes' walls (the air's path bright), the bell's flare
 *  and mouth, the rotors (their passages turning), the lever bar and paddles; the standing wave hatched
 *  across the bore along the air's path; the four slots at the mouthpiece. `top`: the file player's px over
 *  the box's top. */
export function drawHornV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: HornState, top = 0): void {
  const L = hornLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const now = performance.now();
  const lv = hornLive(fr, st, now);
  const onPath = new Set(lv.air.runs.map((r) => r.id));
  // (a phone's stage or an ensemble's cell: thinner lines, smaller handles, fewer marks)
  const small = sc < 900;
  const lw = small ? 1 : 1.2;
  ctx.save();
  /** hide what lies behind a shape: lines only, but a nearer part still covers a farther one */
  const mask = (path: Path2D) => {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fill(path);
    ctx.restore();
  };
  // ---- the bell: its flare's edges and sections (behind the circle's tubes)
  const B = L.bell;
  mask(B.flare);
  beam(ctx, B.edges, V.blue, lw);
  beam(ctx, bellSections(L), V.blueDim, 1, { alpha: 0.8 });
  // (the standing wave, hatched across the bore along the air's path: each run's drawn with its own tube,
  // so a nearer tube hides it as it hides the tube)
  const hatch = lv.sounding ? airHatch(L, lv, small) : null;
  const fade = Math.min(1, 3 * lv.lvl);
  const wave = (id: string) => {
    const h = hatch?.get(id);
    if (h) strokeHatch(ctx, h, fade, small, lv.lvl);
  };
  wave('bell');
  // ---- the tubes, farthest first: each masks what is behind it, its walls bright on the air's path
  for (let layer = 0; layer <= 5; layer++)
    for (const t of L.tubes) {
      if (t.layer !== layer) continue;
      const on = onPath.has(t.id);
      mask(t.body);
      beam(ctx, t.edges, on ? V.blue : V.blueDim, on ? lw : 1, { alpha: on ? 1 : 0.85 });
      if (on) wave(t.id);
    }
  beam(ctx, L.ferrules, V.blueMid, 1, { alpha: 0.7 });
  beam(ctx, L.braces, V.blueDim, 1);
  // the mouth over everything behind it: its inside masked, the rim
  mask(B.mouth);
  beam(ctx, B.mouth, V.blue, lw + 0.3, { hot: !small });
  // the passages through the valves (dashed: the rotors cover them)
  if (hatch) for (const [, h] of hatch) if (h.hidden) beam(ctx, h.line, V.amber, 1, { alpha: 0.5 * fade, dash: [2, 3] });
  // ---- the rotors: casing and cap rings, the passages (turning), the crank
  ROT_Y.forEach((y, k) => {
    const cx = X(ROT_X);
    const cy = Y(y);
    const q = clamp(lv.press[k], 0, 1);
    const casing = new Path2D();
    casing.arc(cx, cy, ROT_R * sc, 0, 2 * Math.PI);
    mask(casing);
    beam(ctx, casing, V.blue, lw);
    const r = CAP_R * sc;
    ring(ctx, cx, cy, r, mix(V.blueMid, V.blue, q), 1);
    const a = (Math.PI / 2) * q;
    const pass = new Path2D();
    for (const sg of [-1, 1]) {
      // (each passage an arc about a point beside the centre, turned with the rotor)
      const ox = sg * r * 0.95;
      const px = cx + ox * Math.cos(a);
      const py = cy - ox * Math.sin(a);
      const a0 = (sg > 0 ? Math.PI * 0.62 : -Math.PI * 0.38) - a;
      pass.moveTo(px + r * 0.62 * Math.cos(a0), py + r * 0.62 * Math.sin(a0));
      pass.arc(px, py, r * 0.62, a0, a0 + Math.PI * 0.76);
    }
    ctx.save();
    const capClip = new Path2D();
    capClip.arc(cx, cy, r * 0.98, 0, 2 * Math.PI);
    ctx.clip(capClip);
    beam(ctx, pass, mix(V.blueDim, V.white, 0.6 * q), 1, { alpha: 0.7 + 0.3 * q, hot: q > 0.5 });
    ctx.restore();
    const ca = crankAngle(k, lv.press[k]);
    const bx = cx + Math.cos(ca) * CRANK * sc;
    const by = cy - Math.sin(ca) * CRANK * sc;
    seg(ctx, cx, cy, bx, by, mix(V.blueMid, V.white, 0.6 * q), lw, { hot: q > 0.5 });
    ring(ctx, bx, by, Math.max(1.2, 0.0022 * sc), V.blue, 1);
  });
  // ---- the lever bar, the links, the paddles (bright under the fingers)
  seg(ctx, X(BAR_X), Y(LEVERS[0].hub[1]), X(BAR_X), Y(-0.06), V.blue, lw + 0.4, { butt: true });
  LEVERS.forEach((lvr, k) => {
    const q = clamp(lv.press[k], 0, 1);
    const ca = crankAngle(k, lv.press[k]);
    const bx = X(ROT_X) + Math.cos(ca) * CRANK * sc;
    const by = Y(ROT_Y[k]) - Math.sin(ca) * CRANK * sc;
    seg(ctx, X(lvr.hub[0] - 0.006 - 0.003 * q), Y(lvr.hub[1]), bx, by, mix(V.blueDim, V.blue, q), 1);
    const fx = 1 - 0.1 * lv.press[k];
    const tip: P = [lvr.hub[0] + (lvr.tip[0] - lvr.hub[0]) * fx, lvr.hub[1] + (lvr.tip[1] - lvr.hub[1]) * fx];
    const p = paddle(X, Y, lvr.hub, tip, lvr.w0, lvr.w1);
    mask(p);
    beam(ctx, p, mix(V.blueMid, V.white, 0.55 * q), lw + 0.4 * q, { hot: q > 0.5 });
    ring(ctx, X(lvr.hub[0]), Y(lvr.hub[1]), Math.max(1.4, 0.0032 * sc), V.blue, 1);
  });
  {
    const hook = new Path2D();
    HOOK.forEach(([x, y], i) => (i ? hook.lineTo(X(x), Y(y)) : hook.moveTo(X(x), Y(y))));
    beam(ctx, hook, V.blueMid, lw);
  }
  // ---- the mouthpiece, and the slots at it
  mask(L.mp);
  beam(ctx, L.mp, V.blue, lw);
  wave('mp');
  slots(ctx, L, lv, st, fr, now, small, lw);
  ctx.restore();
  hornRecord(L, st, lv);
}

/** the flare's sections: the rim's circle at a few depths back into the bell, seen as the mouth is (only
 *  the half towards us: the far half is inside the flare) */
function bellSections(L: HnLayout): Path2D {
  const p = new Path2D();
  const X = (x: number) => L.ox + x * L.sc;
  const Y = (y: number) => L.oy - y * L.sc;
  const eu: P = [AXIS[1], -AXIS[0]];
  for (const d of [0.025, 0.07, 0.14]) {
    const r = bellR(d);
    const c: P = [RIM_C[0] - AXIS[0] * d, RIM_C[1] - AXIS[1] * d];
    for (let i = 0; i <= 32; i++) {
      const a = -Math.PI / 2 + (i / 32) * Math.PI;
      const x = c[0] + eu[0] * r * Math.sin(a) - AXIS[0] * r * MOUTH_K * Math.cos(a);
      const y = c[1] + eu[1] * r * Math.sin(a) - AXIS[1] * r * MOUTH_K * Math.cos(a);
      if (i) p.lineTo(X(x), Y(y));
      else p.moveTo(X(x), Y(y));
    }
  }
  return p;
}

interface Hatch {
  ribs: Path2D[];
  line: Path2D;
  hidden: boolean;
}
/** the wave along the air's path, run by run: ticks across the bore every few px, as bright as the pressure
 *  there (widening with the flare in the bell), and a line along it */
function airHatch(L: HnLayout, lv: HnLive, small: boolean): Map<string, Hatch> {
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const out = new Map<string, Hatch>();
  const gap = small ? 4 : 6;
  const runs = lv.air.runs;
  const last = runs.length - 1;
  runs.forEach((r, ri) => {
    const s0 = lv.air.starts[ri];
    const tp = L.byId.get(r.id);
    const h: Hatch = { ribs: Array.from({ length: LEVELS }, () => new Path2D()), line: new Path2D(), hidden: !!r.hidden };
    out.set(r.hidden ? `${r.id}:${ri}` : r.id, h);
    // (a passage inside the valves is drawn straight; its length is the passage's own)
    let geo = 0;
    for (let i = 1; i < r.pts.length; i++) geo += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
    const k = geo > 0 ? r.len / geo : 1;
    let acc = gap / 2;
    let s = 0;
    for (let i = 0; i < r.pts.length; i++) {
      const x = X(r.pts[i][0]);
      const y = Y(r.pts[i][1]);
      if (i) h.line.lineTo(x, y);
      else h.line.moveTo(x, y);
      if (!i) continue;
      const ds = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]) * k;
      if (!r.hidden) {
        const px = X(r.pts[i - 1][0]);
        const py = Y(r.pts[i - 1][1]);
        const l = Math.hypot(x - px, y - py);
        if (l > 1e-6) {
          const nx = -(y - py) / l;
          const ny = (x - px) / l;
          while (acc <= l) {
            const f = acc / l;
            const sa = s0 + s + ds * f;
            const A = Math.min(1, Math.abs(lv.ampAt(sa)));
            const level = Math.round(A * (0.3 + 0.7 * Math.abs(lv.ph)) * LEVELS);
            if (level >= 1) {
              const half = ri === last ? Math.max(0.0063, 0.82 * bellR(lv.air.total - sa)) * sc : 0.72 * (tp ? tp.r[i] : 0.0055 * sc);
              const cx = px + (x - px) * f;
              const cy = py + (y - py) * f;
              h.ribs[level - 1].moveTo(cx - nx * half, cy - ny * half);
              h.ribs[level - 1].lineTo(cx + nx * half, cy + ny * half);
            }
            acc += ri === last ? gap * 1.6 : gap;
          }
          acc -= l;
        }
      }
      s += ds;
    }
  });
  return out;
}
function strokeHatch(ctx: CanvasRenderingContext2D, h: Hatch, fade: number, small: boolean, lvl: number): void {
  h.ribs.forEach((p, i) => {
    const l = (i + 1) / LEVELS;
    beam(ctx, p, heat(0.25 + 0.75 * l), 1, { alpha: Math.min(1, (0.18 + 0.82 * l) * fade), butt: true });
  });
  beam(ctx, h.line, V.amber, small ? 1.1 : 1.4, { alpha: (0.45 + 0.4 * lvl) * fade, hot: lvl > 0.5 });
}

/** the four slots at the mouthpiece, drawn as on the reeds: the breath (green) flowing into the lips, the
 *  lips (red) on the rim parted by the engine's opening, the turbulence in their slit (pink), the vibrato
 *  (white) round the breath's handle riding the pitch */
function slots(ctx: CanvasRenderingContext2D, L: HnLayout, lv: HnLive, st: HornState, fr: VisualFrame | null, now: number, small: boolean, lw: number): void {
  const { sc } = L;
  const rim: P = [L.ox + MP_RIM[0] * sc, L.oy - MP_RIM[1] * sc];
  // (the axis into the cup on the screen, and across it)
  const ux = MP_DIR[0];
  const uy = -MP_DIR[1];
  const nx = uy;
  const ny = -ux;
  const at = (a: number, w: number): [number, number] => [rim[0] - ux * a * sc + nx * w * sc, rim[1] - uy * a * sc + ny * w * sc];
  const playing = lv.sounding && lv.blow > 0.01;
  const o = playing ? Math.min(1.3, lv.open / Math.max(0.3, lv.swing + 0.2)) : 0;
  const live = playing ? 1 : 0.55;
  const hr = clamp(0.0034 * sc, 2.6, 6);
  const t = now / 1000;
  // the lips: on the rim, parted by the opening
  lipLine(ctx, at, 0.0006 + 0.0032 * o, 0.0125, lw + 0.3, playing ? 0.6 + 0.4 * Math.min(1, o) : 0.6, playing);
  // the lips' handle beside the rim (towards the bell's side, where the stage has room)
  const lx = rim[0] - ux * 0.006 * sc - nx * 0.026 * sc;
  const ly = rim[1] - uy * 0.006 * sc - ny * 0.026 * sc;
  seg(ctx, rim[0] - ux * 0.006 * sc - nx * 0.016 * sc, rim[1] - uy * 0.006 * sc - ny * 0.016 * sc, lx + nx * hr, ly + ny * hr, V.red, 1, { alpha: 0.5 * live });
  handle(ctx, lx, ly, V.red, hr, live);
  // the breath: its handle out past the lips along the axis (kept inside the box), the air flowing from it
  const room = (rim[1] - (L.top + hr + 6)) / Math.max(0.2, -uy) / sc;
  const gd = clamp(Math.max(small ? 0.016 : 0.022, (hr + 10) / sc), 0.006, Math.max(0.006, room));
  const gx = rim[0] - ux * gd * sc;
  const gy = rim[1] - uy * gd * sc;
  if (playing) {
    // (from the handle's ring, and a few px long however small the stage)
    breathFlow(ctx, at, Math.max(gd - (hr + 2) / sc, 0.0016 + 6 / sc), [0.0034, 0.0018, 0.0006], 0.0016, small, Math.min(1, 0.4 + lv.lvl) * (0.7 + 0.3 * Math.min(1, o)), now);
    // noise (pink): turbulence in the lips' slit and just inside the cup
    const frame = Math.floor(t * 20);
    const nd = small ? 4 : 7;
    for (let i = 0; i < nd; i++) {
      const a = 0.001 + hash(frame * 13 + i * 7.3) * 0.009;
      const w = (hash(frame * 5 + i * 3.1 + 40) * 2 - 1) * 0.004;
      dot(ctx, rim[0] + ux * a * sc + nx * w * sc, rim[1] + uy * a * sc + ny * w * sc, small ? 0.9 : 1.2, V.pink, Math.min(1, 0.35 + lv.blow) * (0.5 + 0.5 * hash(frame + i)));
    }
  }
  handle(ctx, gx, gy, V.green, hr, live);
  // the vibrato (white): a ring round the breath's handle, wider as the pitch swings about its mean
  const focus = fr?.focus ?? null;
  const pt = pitchTrack.get(st) ?? { mean: 0, dev: 0, t: now };
  pitchTrack.set(st, pt);
  const dt = Math.min(0.1, Math.max(0, (now - pt.t) / 1000));
  pt.t = now;
  if (focus && playing) {
    if (!pt.mean || Math.abs(focus.f1 / pt.mean - 1) > 0.04) pt.mean = focus.f1;
    pt.mean += (focus.f1 - pt.mean) * Math.min(1, dt / 0.6);
    pt.dev = focus.f1 / pt.mean - 1;
  } else pt.dev *= 0.85;
  ring(ctx, gx, gy, hr + 3.5 + clamp(Math.abs(pt.dev) * 900, 0, 6), V.white, 1, { alpha: 0.4 + 0.5 * Math.min(1, Math.abs(pt.dev) * 300 + (playing ? 0.3 : 0)) });
}
