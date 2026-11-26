// Day Studio: the trombone on the 2D stage, in the daylight metals (./horn.ts). Its layout and live state
// are the shared drawer's (ui/trombone-draw.ts).
import type { VisualFrame } from '@piano-model/engine';
import { INK, rgba } from '../../../ui/stage-draw.ts';
import { CRANK, crankAngle, drawBreath, EXT, leverOf, type TbLayout, type TbLive, tromboneLayout, tromboneLive, tromboneRecord, type TromboneState, type TubePx, turned } from '../../../ui/trombone-draw.ts';
import type { P } from '../../../ui/trombone-plan.ts';
import { BRASS, dprOf, floorShadow, hair, layShadow, metalRod, metalTube, mouthBlue, NICKEL, paintMouthpiece, WAVE_CAP, waveLens } from './horn.ts';

// ---------------------------------------------------------------- the drawn look
/** The slide trombone from the player's right, in daylight (./horn.ts: the brass's metals): the bell
 *  section (the tuning slide, the valve loops, the bell), the rotors and the thumb's levers (ink while held),
 *  the inner slide (nickel silver) and the outer slide standing out by the engine's slide, the mouthpiece with
 *  the breath going into it; the standing wave along the air's path in the blue. `top`: the file player's px
 *  over the box's top. */
export function drawTrombone(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TromboneState, top = 0): void {
  const now = performance.now();
  const lv = tromboneLive(fr, st, now);
  const L = tromboneLayout(W, H, top, lv.size);
  const { sc, p } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const onPath = new Set(lv.air.runs.map((r) => r.id));
  const dx = lv.slide * sc;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- its shadow on the floor (the outer slide's where the slide stands)
  layShadows(ctx, L, dx);
  const tube = (t: TubePx) => metalTube(ctx, t, t.r, t.nickel ? NICKEL : BRASS);
  const hl = hair(p.rT * sc);
  // ---- the bell section, farthest first: the valve loops, the tuning slide (and the bell's tail out of it)
  for (let layer = 0; layer <= 2; layer++)
    for (const t of L.tubes) {
      if (t.layer !== layer) continue;
      tube(t);
      // (the farthest in the shade of the nearer)
      if (layer < 1) {
        ctx.fillStyle = 'rgba(125,92,34,0.22)';
        ctx.fill(t.body);
      }
      if (lv.sounding && onPath.has(t.id)) waveRun(ctx, L, lv, t.id, 0);
    }
  for (const t of L.sleeves) tube(t);
  ctx.lineCap = 'butt';
  metalRod(ctx, L.stays, Math.max(1, 0.0045 * sc), BRASS);
  ctx.lineCap = 'round';
  // ---- the bell: its tail and flare, the lacquer's light, the wave inside, the mouth and its rolled rim
  {
    const B = L.bell;
    ctx.fillStyle = BRASS.body;
    ctx.fill(B.flare);
    const n2 = B.ax.length / 2 - 1;
    const g = ctx.createLinearGradient(B.ax[0], B.ax[1], B.ax[2 * n2], B.ax[2 * n2 + 1]);
    g.addColorStop(0, 'rgba(243,220,154,0.5)');
    g.addColorStop(0.6, 'rgba(243,220,154,0.8)');
    g.addColorStop(1, 'rgba(243,220,154,1)');
    ctx.fillStyle = g;
    ctx.fill(B.hi);
    ctx.fillStyle = 'rgba(255,251,236,0.5)';
    ctx.fill(B.spec);
    ctx.fillStyle = 'rgba(176,134,58,0.7)';
    ctx.fill(B.shade);
    ctx.strokeStyle = BRASS.edge;
    ctx.lineWidth = 1.1 * hl;
    ctx.stroke(B.edges);
    if (lv.sounding) bellWave(ctx, L, lv);
    // the inside of the mouth: the far wall lit at its rim, the bore dark down the throat
    const cx = X(p.rimX);
    const cy = Y(p.axisY);
    const gm = ctx.createRadialGradient(cx - p.R * 0.6 * sc, cy, 0, cx, cy, p.R * sc);
    gm.addColorStop(0, '#5a4117');
    gm.addColorStop(0.45, BRASS.deep);
    gm.addColorStop(0.85, BRASS.shade);
    gm.addColorStop(1, '#e2c26c');
    ctx.fillStyle = gm;
    ctx.fill(B.mouth);
    if (lv.sounding) {
      // the sound leaving the mouth: the blue down the throat, firmer with the wave's level at the rim
      const rg = ctx.createRadialGradient(cx - p.R * 0.6 * sc, cy, 0, cx, cy, p.R * sc);
      mouthBlue(rg, lv.lvl, lv.ampAt(lv.air.total - 0.001), 0.45, 0.85);
      ctx.fillStyle = rg;
      ctx.fill(B.mouth);
    }
    ctx.strokeStyle = BRASS.edge;
    ctx.lineWidth = Math.max(1.3, 0.0032 * sc);
    ctx.stroke(B.mouth);
    ctx.strokeStyle = BRASS.lit;
    ctx.lineWidth = Math.max(0.6, 0.0013 * sc);
    ctx.stroke(B.mouth);
  }
  // ---- the bell brace and its flange on the bell's tail
  ctx.fillStyle = NICKEL.body;
  ctx.fill(L.flange);
  ctx.strokeStyle = NICKEL.edge;
  ctx.lineWidth = hl;
  ctx.stroke(L.flange);
  tube(L.bellBrace);
  // ---- the receiver into the rotor (or the alto's neckpipe), the rotors, their cranks, links and levers
  for (const t of L.tubes) {
    if (t.layer !== 3) continue;
    tube(t);
    if (lv.sounding && onPath.has(t.id)) waveRun(ctx, L, lv, t.id, 0);
  }
  p.rotors.forEach((r, k) => drawRotor(ctx, L, r, k, lv));
  drawLevers(ctx, L, lv);
  // ---- the seven positions, ticked under the slide (the hand brace stands over its tick): graphite on the
  // ground, the one the slide is in firm
  {
    const tl = Math.max(2, 0.006 * sc);
    ctx.lineCap = 'butt';
    for (let k = 0; k < 7; k++) {
      const on = lv.sounding && lv.position === k + 1 && (lv.side === 'Bb' || lv.side === 'Eb');
      ctx.strokeStyle = rgba(INK.line, on ? 0.92 : 0.3);
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(L.ticks[k], L.tickY);
      ctx.lineTo(L.ticks[k], L.tickY + (on ? 1.5 * tl : tl));
      ctx.stroke();
    }
    ctx.lineCap = 'round';
  }
  // ---- the inner slide (nickel silver), the outer slide's tubes and crook where the engine has it, and the
  // wave along them (on the tubes as they stand)
  for (const t of L.inner) tube(t);
  ctx.save();
  ctx.translate(dx, 0);
  tube(L.outer);
  ctx.restore();
  if (lv.sounding) for (const id of ['up', 'crook', 'down']) waveRun(ctx, L, lv, id, id === 'up' ? p.rIn : p.rOut);
  // ---- over them: the receiver's ferrule and the cork barrels, the inner slide's brace, the slide lock's nut
  for (const t of L.collars) tube(t);
  for (const t of L.innerBrace) tube(t);
  tube(L.nut);
  ctx.save();
  ctx.clip(L.nut.body);
  ctx.strokeStyle = rgba(INK.line, 0.42);
  ctx.lineWidth = hl;
  ctx.beginPath();
  for (let x = L.nut.xy[0] + 2; x < L.nut.xy[2]; x += 2.5) {
    ctx.moveTo(x, L.nut.xy[1] - L.nut.r);
    ctx.lineTo(x, L.nut.xy[1] + L.nut.r);
  }
  ctx.stroke();
  ctx.restore();
  // ---- and on the outer slide: its sleeves, the hand brace, the bumper, the water key
  ctx.save();
  ctx.translate(dx, 0);
  for (const t of L.outerSleeves) tube(t);
  for (const t of L.handBrace) tube(t);
  ctx.fillStyle = '#3a3531';
  ctx.fill(L.bumper);
  ctx.strokeStyle = rgba(INK.line, 0.7);
  ctx.lineWidth = hl;
  ctx.stroke(L.bumper);
  for (const t of L.waterKey) tube(t);
  ctx.fillStyle = NICKEL.shade;
  ctx.fill(L.waterCup);
  ctx.strokeStyle = NICKEL.edge;
  ctx.lineWidth = hl;
  ctx.stroke(L.waterCup);
  ctx.restore();
  // ---- the mouthpiece (silver plate), the breath going into it
  {
    const x = X(-p.mpVis + 0.012);
    const r = p.mpProfile[3][0];
    paintMouthpiece(ctx, L.mp, L.mpHi, x, Y(r), x, Y(-r), sc);
  }
  drawBreath(ctx, L, lv, now);
  ctx.restore();
  tromboneRecord(L, st, lv);
}

/** The trombone's shadow on the floor, in three parts painted once per layout: the bell section's with the
 *  mouthpiece and the inner slide where it is always bare; the inner slide's tubes beyond, laid only as far
 *  as the outer slide's top (under it they are the outer slide's shadow); the outer slide's, moved with it. */
function layShadows(ctx: CanvasRenderingContext2D, L: TbLayout, dx: number): void {
  const dpr = dprOf(ctx);
  const { sc, p } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const blur = 0.016 * sc;
  const ox = 0.0055 * sc;
  const oy = 0.0095 * sc;
  const e = EXT[L.size];
  const key = `trombone|${L.key}|${dpr}`;
  const fixed = floorShadow(`${key}|bell`, { x0: X(e.x0), y0: Y(e.y1), x1: X(Math.max(p.rimX + 0.03, p.xo)), y1: Y(e.y0) }, dpr, blur, ox, oy, (c) => {
    c.fill(L.bell.flare);
    c.fill(L.bell.mouth);
    for (const t of L.tubes) c.fill(t.body);
    for (const t of L.sleeves) c.fill(t.body);
    c.fill(L.flange);
    c.fill(L.bellBrace.body);
    c.lineWidth = Math.max(1, 0.0045 * sc);
    c.stroke(L.stays);
    p.rotors.forEach((r, k) => {
      c.beginPath();
      c.arc(X(r.c[0]), Y(r.c[1]), r.R * sc, 0, 2 * Math.PI);
      c.fill();
      const lvr = leverOf(p, k);
      c.lineWidth = Math.max(2.4, 0.0046 * sc);
      c.beginPath();
      [lvr.back, lvr.pivot, ...lvr.paddle].forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))));
      c.stroke();
    });
    for (const t of L.collars) c.fill(t.body);
    for (const t of L.innerBrace) c.fill(t.body);
    c.fill(L.nut.body);
    c.fill(L.mp);
    c.fillRect(X(-0.002), Y(p.rIn), (p.xo + 0.002) * sc, 2 * p.rIn * sc);
    c.fillRect(X(p.xl), Y(-p.sp + p.rIn), (p.xo - p.xl) * sc, 2 * p.rIn * sc);
  });
  const inner = floorShadow(`${key}|inner`, { x0: X(p.xo), y0: Y(p.rIn), x1: X(p.xs), y1: Y(-p.sp - p.rIn) }, dpr, blur, ox, oy, (c) => {
    c.fillRect(X(p.xo), Y(p.rIn), (p.xs - p.xo) * sc, 2 * p.rIn * sc);
    c.fillRect(X(p.xo), Y(-p.sp + p.rIn), (p.xs - p.xo) * sc, 2 * p.rIn * sc);
  });
  const outer = floorShadow(`${key}|outer`, { x0: X(p.xo), y0: Y(p.rOut + 0.002), x1: X(p.xc + p.sp / 2 + p.rOut + 0.0085), y1: Y(-p.sp - p.rOut - 0.008) }, dpr, blur, ox, oy, (c) => {
    c.fill(L.outer.body);
    for (const t of L.outerSleeves) c.fill(t.body);
    for (const t of L.handBrace) c.fill(t.body);
    for (const t of L.waterKey) c.fill(t.body);
    c.fill(L.waterCup);
    c.fill(L.bumper);
  });
  layShadow(ctx, fixed);
  if (inner) {
    const sw = Math.min(inner.cv.width, Math.round((X(p.xo) + dx + ox - inner.x) * dpr));
    if (sw >= 1) ctx.drawImage(inner.cv, 0, 0, sw, inner.cv.height, inner.x, inner.y, sw / dpr, inner.h);
  }
  layShadow(ctx, outer, dx);
}

/** the wave along a run of the air's path (a tube of the bell section, or the slide's runs as they stand),
 *  drawn slowed inside it (./horn.ts waveLens): its envelope pale, the pressure now in the blue (firm where
 *  compressed, lighter where rarefied) */
function waveRun(ctx: CanvasRenderingContext2D, L: TbLayout, lv: TbLive, id: string, rTube: number): void {
  const runs = lv.air.runs;
  const ri = runs.findIndex((r) => r.id === id);
  if (ri < 0) return;
  const run = runs[ri];
  const { sc } = L;
  const s0 = lv.air.starts[ri];
  const rp = Math.max(1, (rTube || L.p.rT) * sc);
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  // (sampled every few px along the run: the slide's tubes are one straight segment each)
  const step = 4 / sc;
  const geo = run.pts.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - run.pts[i - 1][0], q[1] - run.pts[i - 1][1]) : 0), 0);
  const k = geo > 0 ? run.len / geo : 1;
  const xy: number[] = [X(run.pts[0][0]), Y(run.pts[0][1])];
  const sm: number[] = [s0];
  let s = 0;
  for (let i = 1; i < run.pts.length; i++) {
    const a = run.pts[i - 1];
    const b = run.pts[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nseg = Math.max(1, Math.min(400, Math.ceil(l / step)));
    for (let j = 1; j <= nseg; j++) {
      const f = j / nseg;
      xy.push(X(a[0] + (b[0] - a[0]) * f), Y(a[1] + (b[1] - a[1]) * f));
      sm.push(s0 + (s + l * f) * k);
    }
    s += l;
  }
  waveLens(ctx, xy, sm.length, () => rp, (i) => lv.ampAt(sm[i]), lv.ph);
}
/** the wave in the bell: along its axis inside the flare, where the pressure spreads over the widening mouth
 *  (1/r: the lens thins away towards the rim) */
function bellWave(ctx: CanvasRenderingContext2D, L: TbLayout, lv: TbLive): void {
  const B = L.bell;
  const n = B.d.length;
  const sB = lv.air.starts[lv.air.starts.length - 1];
  const len = lv.air.total - sB;
  const d0 = B.d[0] || 1;
  const cap = WAVE_CAP * L.p.rT * L.sc;
  waveLens(ctx, B.ax, n, (i) => Math.min(L.p.bellR(B.d[i]) * L.sc, cap), (i) => lv.ampAt(sB + (1 - B.d[i] / d0) * len), lv.ph);
}
/** a rotor seen end on: its brass casing, the nickel cap with its bevel and centre screw, the rotor's two
 *  passages engraved (turned a quarter turn by its lever; in the blue while the wave goes round the loop) */
function drawRotor(ctx: CanvasRenderingContext2D, L: TbLayout, r: { c: P; R: number; cap: number }, k: number, lv: TbLive): void {
  const { sc } = L;
  const cx = L.ox + r.c[0] * sc;
  const cy = L.oy - r.c[1] * sc;
  const R = r.R * sc;
  const rc = r.cap * sc;
  const press = lv.press[k];
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.fillStyle = BRASS.body;
  ctx.fill();
  ctx.strokeStyle = BRASS.edge;
  ctx.lineWidth = hair(rc / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rc, 0, 2 * Math.PI);
  const g = ctx.createRadialGradient(cx - rc * 0.35, cy - rc * 0.4, rc * 0.1, cx, cy, rc);
  g.addColorStop(0, NICKEL.lit);
  g.addColorStop(0.55, NICKEL.body);
  g.addColorStop(1, NICKEL.shade);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = NICKEL.edge;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rc * 0.74, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(95,104,114,0.45)';
  ctx.stroke();
  // the passages: two arcs across the rotor, turned with it (the blue while the wave goes round the loop)
  const a = (Math.PI / 2) * press;
  const lit = lv.sounding && lv.down[k] ? 0.55 + 0.4 * lv.lvl : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.lineWidth = Math.max(1, rc * 0.13);
  ctx.strokeStyle = lit ? rgba(INK.sound, lit) : rgba(INK.line, 0.5);
  for (const sg of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sg * rc * 0.95, 0, rc * 0.62, sg > 0 ? Math.PI * 0.62 : -Math.PI * 0.38, sg > 0 ? Math.PI * 1.38 : Math.PI * 0.38);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, rc * 0.2, 0, 2 * Math.PI);
  ctx.fillStyle = NICKEL.shade;
  ctx.fill();
}
/** each valve's lever: the link from its back arm to the rotor's crank, the crank, the lever on its pivot on
 *  the bell brace with its spring, the hook the thumb pulls: nickel silver at rest, ink while held down */
function drawLevers(ctx: CanvasRenderingContext2D, L: TbLayout, lv: TbLive): void {
  const { sc, p } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const hl = hair(0.004 * sc);
  p.rotors.forEach((r, k) => {
    const q = lv.press[k];
    const held = q > 0.5;
    const lvr = leverOf(p, k);
    const a = lvr.turn * q;
    const back = turned(lvr.back, lvr.pivot, a);
    const ca = crankAngle(p, k, q);
    const bx = r.c[0] + Math.cos(ca) * CRANK;
    const by = r.c[1] + Math.sin(ca) * CRANK;
    // the crank and the link
    ctx.strokeStyle = q > 0.05 ? rgba(INK.line, 0.55 + 0.4 * q) : NICKEL.edge;
    ctx.lineWidth = Math.max(1.2, 0.0024 * sc);
    ctx.beginPath();
    ctx.moveTo(X(r.c[0]), Y(r.c[1]));
    ctx.lineTo(X(bx), Y(by));
    ctx.stroke();
    ctx.lineWidth = Math.max(1, 0.0016 * sc);
    ctx.beginPath();
    ctx.moveTo(X(bx), Y(by));
    ctx.lineTo(X(back[0]), Y(back[1]));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(bx), Y(by), Math.max(1.2, 0.002 * sc), 0, 2 * Math.PI);
    ctx.fillStyle = q > 0.05 ? rgba(INK.line, 0.9) : NICKEL.shade;
    ctx.fill();
    // the lever: its back arm, the pivot, the arm out and the hook, its spoon under the thumb
    const hook = lvr.paddle.map((x) => turned(x, lvr.pivot, a));
    const pts = [back, lvr.pivot, ...hook];
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.strokeStyle = held ? rgba(INK.line, 0.95) : NICKEL.edge;
    ctx.lineWidth = Math.max(2.4, 0.0046 * sc);
    ctx.stroke();
    if (!held) {
      ctx.strokeStyle = NICKEL.body;
      ctx.lineWidth = Math.max(1.2, 0.0046 * sc - 1.6);
      ctx.stroke();
      ctx.strokeStyle = NICKEL.lit;
      ctx.lineWidth = Math.max(0.6, 0.0011 * sc);
      ctx.stroke();
    }
    {
      const e = hook[hook.length - 1];
      const f = hook[hook.length - 2];
      ctx.save();
      ctx.translate(X(e[0]), Y(e[1]));
      ctx.rotate(Math.atan2(-(e[1] - f[1]), e[0] - f[0]));
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.0052 * sc, 0.0026 * sc, 0, 0, 2 * Math.PI);
      ctx.fillStyle = held ? rgba(INK.line, 0.95) : NICKEL.body;
      ctx.fill();
      ctx.strokeStyle = held ? rgba(INK.line, 0.95) : NICKEL.edge;
      ctx.lineWidth = hl;
      ctx.stroke();
      ctx.restore();
    }
    // the spring's coil at the pivot, the pivot screw
    ctx.beginPath();
    ctx.arc(X(lvr.pivot[0]), Y(lvr.pivot[1]), Math.max(1.6, 0.0034 * sc), 0, 2 * Math.PI);
    ctx.fillStyle = NICKEL.shade;
    ctx.fill();
    ctx.strokeStyle = NICKEL.edge;
    ctx.lineWidth = hl;
    ctx.stroke();
  });
}
