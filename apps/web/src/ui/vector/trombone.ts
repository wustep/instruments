// The slide trombone on the vector display (see kit.ts): the stage's own drawing (trombone-draw.ts: the same
// plan in metres, the same slide, levers and lips, the same standing wave folded from the engine's bore
// snapshots), as lines. Blue is the brass and its mechanism: every tube its two walls (a nearer tube hides
// what lies behind it), bright along the air's path for the valves held and dim off it; the inner slide
// fixed, the outer slide standing out by the engine's slide over it; the rotors' caps with their passages
// turning a quarter turn, the thumb's hooks bright when pulled; the bell's flare with a few of its sections,
// its mouth. The seven positions are ticked faintly under the slide. Amber is the bore's standing wave,
// hatched across the bore along the air's path (dashed through the rotors) and opening out in the bell. At
// the mouthpiece the knobs' slots mark where each acts, drawn as on the reeds (kit.ts breathFlow,
// lipLine): the breath (green) flowing into the lips, the lips (red) on the rim parted by the engine's lip
// opening, the turbulence in their slit (pink), the vibrato (white) riding the pitch. The state object is
// the stage's, so a change of style carries the slide, levers and wave over.

import type { VisualFrame } from '@piano-model/engine';
import { CRANK, MOUTH_K, crankAngle, leverOf, tromboneLayout, tromboneLive, tromboneRecord, turned, type TbLayout, type TbLive, type TromboneState, type TubePx } from '../trombone-draw.ts';
import type { P } from '../trombone-plan.ts';
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
const pitchTrack = new WeakMap<TromboneState, { mean: number; dev: number; t: number }>();

/** The slide trombone from the player's right, as lines: the tubes' walls (the air's path bright), the bell's
 *  flare and mouth, the rotors (their passages turning) and the thumb's hooks, the inner slide and the outer
 *  slide where the engine has it; the standing wave hatched across the bore along the air's path; the four
 *  slots at the mouthpiece. `top`: the file player's px over the box's top. */
export function drawTromboneV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TromboneState, top = 0): void {
  const now = performance.now();
  const lv = tromboneLive(fr, st, now);
  const L = tromboneLayout(W, H, top, lv.size);
  const { sc, p } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const onPath = new Set(lv.air.runs.map((r) => r.id));
  // (a phone's stage or an ensemble's cell: thinner lines, smaller handles, fewer marks)
  const small = sc < 500;
  const lw = small ? 1 : 1.2;
  ctx.save();
  /** hide what lies behind a shape: lines only, but a nearer part still covers a farther one */
  const mask = (path: Path2D) => {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fill(path);
    ctx.restore();
  };
  const walls = (t: TubePx, on: boolean, color: string = V.blue) => {
    mask(t.body);
    beam(ctx, t.edges, on ? color : V.blueDim, on ? lw : 1, { alpha: on ? 1 : 0.85 });
  };
  const hatch = lv.sounding ? airHatch(L, lv, small) : null;
  const fade = Math.min(1, 3 * lv.lvl);
  const wave = (id: string) => {
    const h = hatch?.get(id);
    if (h) strokeHatch(ctx, h, fade, small, lv.lvl);
  };
  // ---- the bell section, farthest first: the valve loops, the tuning slide
  for (let layer = 0; layer <= 2; layer++)
    for (const t of L.tubes) {
      if (t.layer !== layer) continue;
      const on = onPath.has(t.id);
      walls(t, on);
      if (on) wave(t.id);
    }
  for (const t of L.sleeves) beam(ctx, t.edges, V.blueMid, 1, { alpha: 0.75 });
  beam(ctx, L.stays, V.blueDim, 1);
  // ---- the bell: its flare's edges and sections, the wave in it, the mouth
  const B = L.bell;
  mask(B.flare);
  beam(ctx, B.edges, V.blue, lw);
  beam(ctx, bellSections(L), V.blueDim, 1, { alpha: 0.8 });
  wave('bell');
  mask(B.mouth);
  beam(ctx, B.mouth, V.blue, lw + 0.3, { hot: !small });
  // ---- the bell brace and its flange; the receiver, the rotors, the levers
  beam(ctx, L.flange, V.blueDim, 1);
  walls(L.bellBrace, true, V.blueMid);
  for (const t of L.tubes) {
    if (t.layer !== 3) continue;
    const on = onPath.has(t.id);
    walls(t, on);
    if (on) wave(t.id);
  }
  // the passages through the rotors (dashed: the rotors cover them)
  if (hatch) for (const [, h] of hatch) if (h.hidden) beam(ctx, h.line, V.amber, 1, { alpha: 0.5 * fade, dash: [2, 3] });
  p.rotors.forEach((r, k) => {
    const cx = X(r.c[0]);
    const cy = Y(r.c[1]);
    const q = clamp(lv.press[k], 0, 1);
    const casing = new Path2D();
    casing.arc(cx, cy, r.R * sc, 0, 2 * Math.PI);
    mask(casing);
    beam(ctx, casing, V.blue, lw);
    const rc = r.cap * sc;
    ring(ctx, cx, cy, rc, mix(V.blueMid, V.blue, q), 1);
    const a = (Math.PI / 2) * q;
    const pass = new Path2D();
    for (const sg of [-1, 1]) {
      const ox = sg * rc * 0.95;
      const px = cx + ox * Math.cos(a);
      const py = cy + ox * Math.sin(a);
      const a0 = (sg > 0 ? Math.PI * 0.62 : -Math.PI * 0.38) + a;
      pass.moveTo(px + rc * 0.62 * Math.cos(a0), py + rc * 0.62 * Math.sin(a0));
      pass.arc(px, py, rc * 0.62, a0, a0 + Math.PI * 0.76);
    }
    ctx.save();
    const capClip = new Path2D();
    capClip.arc(cx, cy, rc * 0.98, 0, 2 * Math.PI);
    ctx.clip(capClip);
    beam(ctx, pass, mix(V.blueDim, V.white, 0.6 * q), 1, { alpha: 0.7 + 0.3 * q, hot: q > 0.5 });
    ctx.restore();
  });
  levers(ctx, L, lv, lw);
  // ---- the inner slide (fixed), its brace, the collars and the slide lock's nut
  for (const t of L.inner) walls(t, true, V.blueMid);
  for (const t of [...L.collars, ...L.innerBrace, L.nut]) {
    mask(t.body);
    beam(ctx, t.edges, V.blueMid, 1, { alpha: 0.85 });
  }
  // the seven positions, faint, the one held brighter
  {
    const tl = Math.max(2, 0.006 * sc);
    for (let k = 0; k < 7; k++) {
      const on = lv.sounding && lv.position === k + 1 && (lv.side === 'Bb' || lv.side === 'Eb');
      seg(ctx, L.ticks[k], L.tickY, L.ticks[k], L.tickY + tl, on ? V.amber : V.blueDim, 1, { alpha: on ? 0.9 : 0.55, butt: true });
    }
  }
  // ---- the outer slide where the engine has it: its walls over the inner tubes, its sleeves, the hand brace,
  // the water key, the bumper
  ctx.save();
  ctx.translate(lv.slide * sc, 0);
  walls(L.outer, true);
  for (const t of [...L.outerSleeves, ...L.handBrace, ...L.waterKey]) {
    mask(t.body);
    beam(ctx, t.edges, V.blueMid, 1, { alpha: 0.85 });
  }
  beam(ctx, L.waterCup, V.blueMid, 1);
  beam(ctx, L.bumper, V.blueDim, 1);
  ctx.restore();
  for (const id of ['up', 'crook', 'down']) wave(id);
  // ---- the mouthpiece, and the slots at it
  mask(L.mp);
  beam(ctx, L.mp, V.blue, lw);
  wave('mp');
  slots(ctx, L, lv, st, fr, now, small, lw);
  ctx.restore();
  tromboneRecord(L, st, lv);
}

/** the flare's sections: the rim's circle at a few depths back into the bell, seen as the mouth is (only the
 *  half towards us: the far half is inside the flare) */
function bellSections(L: TbLayout): Path2D {
  const { p, sc } = L;
  const q = new Path2D();
  for (const d of [0.02, 0.055, 0.11]) {
    const r = p.bellR(d) * sc;
    const cx = L.ox + (p.rimX - d) * sc;
    const cy = L.oy - p.axisY * sc;
    q.moveTo(cx, cy - r);
    q.ellipse(cx, cy, r * MOUTH_K, r, 0, -Math.PI / 2, Math.PI / 2, true);
  }
  return q;
}

interface Hatch {
  ribs: Path2D[];
  line: Path2D;
  hidden: boolean;
}
/** the wave along the air's path, run by run: ticks across the bore every few px, as bright as the pressure
 *  there (widening with the flare in the bell), and a line along it */
function airHatch(L: TbLayout, lv: TbLive, small: boolean): Map<string, Hatch> {
  const { sc, p } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const out = new Map<string, Hatch>();
  const gap = small ? 4 : 6;
  const runs = lv.air.runs;
  const last = runs.length - 1;
  runs.forEach((r, ri) => {
    const s0 = lv.air.starts[ri];
    const h: Hatch = { ribs: Array.from({ length: LEVELS }, () => new Path2D()), line: new Path2D(), hidden: !!r.hidden };
    out.set(r.hidden ? `${r.id}:${ri}` : r.id, h);
    // the bore's half-width there (px): the slide's tubes, the bell section's, the mouthpiece's throat
    const rt = (r.id === 'up' ? p.rIn : r.id === 'crook' || r.id === 'down' ? p.rOut : r.id === 'mp' ? 0.005 : p.rT) * sc * 0.72;
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
              const half = ri === last ? Math.max(p.rT, 0.82 * p.bellR(lv.air.total - sa)) * sc : rt;
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
  h.ribs.forEach((q, i) => {
    const l = (i + 1) / LEVELS;
    beam(ctx, q, heat(0.25 + 0.75 * l), 1, { alpha: Math.min(1, (0.18 + 0.82 * l) * fade), butt: true });
  });
  beam(ctx, h.line, V.amber, small ? 1.1 : 1.4, { alpha: (0.45 + 0.4 * lvl) * fade, hot: lvl > 0.5 });
}

/** the thumb's levers: each crank and link, the lever on its pivot, its hook (bright when pulled) */
function levers(ctx: CanvasRenderingContext2D, L: TbLayout, lv: TbLive, lw: number): void {
  const { sc, p } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  p.rotors.forEach((r, k) => {
    const q = clamp(lv.press[k], 0, 1);
    const lvr = leverOf(p, k);
    const a = lvr.turn * lv.press[k];
    const back = turned(lvr.back, lvr.pivot, a);
    const ca = crankAngle(p, k, lv.press[k]);
    const bx = r.c[0] + Math.cos(ca) * CRANK;
    const by = r.c[1] + Math.sin(ca) * CRANK;
    seg(ctx, X(r.c[0]), Y(r.c[1]), X(bx), Y(by), mix(V.blueMid, V.white, 0.6 * q), lw, { hot: q > 0.5 });
    ring(ctx, X(bx), Y(by), Math.max(1.2, 0.002 * sc), V.blue, 1);
    seg(ctx, X(bx), Y(by), X(back[0]), Y(back[1]), mix(V.blueDim, V.blue, q), 1);
    const hook = new Path2D();
    const pts: P[] = [back, lvr.pivot, ...lvr.paddle.map((x) => turned(x, lvr.pivot, a))];
    pts.forEach(([x, y], i) => (i ? hook.lineTo(X(x), Y(y)) : hook.moveTo(X(x), Y(y))));
    beam(ctx, hook, mix(V.blueMid, V.white, 0.55 * q), lw + 0.4 * q, { hot: q > 0.5 });
    ring(ctx, X(lvr.pivot[0]), Y(lvr.pivot[1]), Math.max(1.4, 0.003 * sc), V.blue, 1);
  });
}

/** the four slots at the mouthpiece, drawn as on the reeds: the breath (green) flowing into the lips, the
 *  lips (red) on the rim parted by the engine's opening, the turbulence in their slit (pink), the vibrato
 *  (white) round the breath's handle riding the pitch */
function slots(ctx: CanvasRenderingContext2D, L: TbLayout, lv: TbLive, st: TromboneState, fr: VisualFrame | null, now: number, small: boolean, lw: number): void {
  const { sc, p } = L;
  const rim: P = [L.ox - p.mpVis * sc, L.oy];
  const playing = lv.sounding && lv.blow > 0.05;
  const o = playing ? Math.min(1.3, lv.open / Math.max(0.3, lv.swing + 0.2)) : 0;
  const live = playing ? 1 : 0.55;
  const hr = clamp(0.0034 * sc, 2.6, 6);
  const t = now / 1000;
  const reach = p.mpProfile[1][0] * 0.95;
  const at = (a: number, w: number): [number, number] => [rim[0] - a * sc, rim[1] + w * sc];
  // the lips: on the rim, parted by the opening
  lipLine(ctx, at, 0.0006 + 0.0032 * o, reach, lw + 0.3, playing ? 0.6 + 0.4 * Math.min(1, o) : 0.6, playing);
  // the handles above the mouthpiece, under the bell's tail (the thumb's hooks are below it, the bell brace
  // behind it): the lips' over the rim, the breath's back towards the player
  const lx = rim[0] + 0.014 * sc;
  const ly = rim[1] - (reach + 0.011) * sc;
  seg(ctx, rim[0] + 0.002 * sc, rim[1] - (reach - 0.002) * sc, lx - hr * 0.7, ly + hr * 0.7, V.red, 1, { alpha: 0.5 * live });
  handle(ctx, lx, ly, V.red, hr, live);
  const gx = rim[0] - 0.02 * sc;
  const gy = rim[1] - (reach + 0.007) * sc;
  // (the breath flows in along the axis, from a little behind the lips, a few px long however small the
  // stage, as on the reeds; its handle's lead down to it)
  const from = Math.max(0.014, 0.0016 + (hr + 8) / sc);
  const f0 = at(from, 0);
  seg(ctx, gx + hr * 0.7, gy + hr * 0.7, f0[0], f0[1], V.green, 1, { alpha: 0.5 * live });
  if (playing) {
    breathFlow(ctx, at, from, [0.0034, 0.0018, 0.0006], 0.0016, small, Math.min(1, 0.4 + lv.lvl) * (0.7 + 0.3 * Math.min(1, o)), now);
    // noise (pink): turbulence in the lips' slit and just inside the cup
    const frame = Math.floor(t * 20);
    const nd = small ? 4 : 7;
    for (let i = 0; i < nd; i++) {
      const a = 0.001 + hash(frame * 13 + i * 7.3) * 0.01;
      const w = (hash(frame * 5 + i * 3.1 + 40) * 2 - 1) * 0.0045;
      dot(ctx, rim[0] + a * sc, rim[1] + w * sc, small ? 0.9 : 1.2, V.pink, Math.min(1, 0.35 + lv.blow / 4) * (0.5 + 0.5 * hash(frame + i)));
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
