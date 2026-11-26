// Day Studio: the tuba on the 2D stage, in the daylight metals (./horn.ts). Its layout and live state are
// the shared drawer's (ui/tuba-draw.ts).
import type { VisualFrame } from '@piano-model/engine';
import { BRASS_BREATH, brassBreath, INK, rgba } from '../../../ui/stage-draw.ts';
import { type TbLayout, type TbLive, tubaLayout, tubaLive, tubaRecord, type TubaState } from '../../../ui/tuba-draw.ts';
import { BELL_PTS, BELL_TOP_X, bellR, BORE, BUTTON_Y, CASING_R, CASING_Y0, CASING_Y1, lean, MP_DIR, MP_RIM, PISTON_LEAN, RIM_R, RIM_Y, STACK_Y0, TB_X0, TB_X1, TB_Y0, TB_Y1, TRAVEL, TUBES, VALVE_X, VALVE_Y } from '../../../ui/tuba-plan.ts';
import { BRASS, dayTubes, dprOf, floorShadow, type FloorShadow, glowTube, hair, layShadow, metalRod, metalTube, mouthBlue, NICKEL, paintMouthpiece, WAVE_CAP, waveLens } from './horn.ts';
import { breathStream } from './kit.ts';

// ---------------------------------------------------------------- the drawn look
/** The tuba from its valve side, in daylight (./horn.ts: the brass's metals): the body's spiral into the
 *  bell, the leadpipe across the stack's front, the four pistons with their loops, the main tuning slide; the
 *  pistons going down for the engine's fingering (a button held is ink), the standing wave along the air's path
 *  in the blue, the breath going into the mouthpiece. `top`: the file player's px over the box's top. */
export function drawTuba(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TubaState, top = 0): void {
  const L = dayTubes(tubaLayout(W, H, top), TUBES);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const now = performance.now();
  const lv = tubaLive(fr, st, now);
  const onPath = new Set(lv.air.runs.map((r) => r.id));
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- its shadow on the floor
  layShadow(ctx, tubaShadow(ctx, L));
  const hl = hair(BORE * sc);
  // ---- the bell's stack and flare (the body's last lap leads into it), behind everything
  const B = L.bell;
  {
    ctx.fillStyle = BRASS.body;
    ctx.fill(B.flare);
    // (the lacquer brighter towards the rim, where the flare faces the light)
    const g = ctx.createLinearGradient(0, Y(STACK_Y0), 0, Y(RIM_Y));
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
  }
  // ---- the tubes, farthest first; each with the wave along the air's path where it carries it
  for (let layer = 0; layer <= 3; layer++) {
    for (const t of L.tubes) {
      if (t.layer !== layer) continue;
      const rm = t.r[t.r.length >> 1];
      metalTube(ctx, t, rm, BRASS, Math.abs(t.r[t.r.length - 1] - t.r[0]) > 0.15 * rm);
      if (lv.sounding && onPath.has(t.id)) glowTube(ctx, t, lv, WAVE_CAP * BORE * sc);
    }
    // the stays, on the body and under the small tubing
    if (layer === 0) metalRod(ctx, L.braces, Math.max(1, 0.003 * sc), BRASS);
  }
  // the ferrules (nickel silver)
  ctx.fillStyle = NICKEL.body;
  ctx.fill(L.ferrules);
  ctx.strokeStyle = NICKEL.edge;
  ctx.lineWidth = hl;
  ctx.stroke(L.ferrules);
  // ---- the bell's mouth: its inside (the far wall lit along the rim, the bore dark down the throat), the
  // rim's bead
  {
    const gm = ctx.createRadialGradient(X(BELL_TOP_X), Y(RIM_Y - 0.01), 0, X(BELL_TOP_X), Y(RIM_Y), RIM_R * sc * 1.02);
    gm.addColorStop(0, '#5a4117');
    gm.addColorStop(0.35, BRASS.deep);
    gm.addColorStop(0.8, BRASS.shade);
    gm.addColorStop(1, '#e2c26c');
    ctx.fillStyle = gm;
    ctx.fill(B.mouth);
    if (lv.sounding) {
      // the sound leaving the mouth: the blue down the throat, firmer with the wave's level at the rim
      const rg = ctx.createRadialGradient(X(BELL_TOP_X), Y(RIM_Y - 0.01), 0, X(BELL_TOP_X), Y(RIM_Y), RIM_R * sc * 1.02);
      mouthBlue(rg, lv.lvl, lv.ampAt(lv.air.total - 0.001), 0.3, 0.66);
      ctx.fillStyle = rg;
      ctx.fill(B.mouth);
    }
    ctx.strokeStyle = BRASS.edge;
    ctx.lineWidth = Math.max(1.4, 0.005 * sc);
    ctx.stroke(B.mouth);
    ctx.strokeStyle = BRASS.lit;
    ctx.lineWidth = Math.max(0.7, 0.0022 * sc);
    ctx.stroke(B.mouth);
  }
  // ---- the valve block: the knuckles of the main line, the casings (lit down their left), the nickel caps,
  // each piston's stem and pearl button at its travel (ink while it is held down)
  ctx.fillStyle = BRASS.body;
  ctx.fill(L.knuckles);
  ctx.strokeStyle = BRASS.edge;
  ctx.lineWidth = hl;
  ctx.stroke(L.knuckles);
  ctx.fillStyle = BRASS.body;
  ctx.fill(L.casings);
  VALVE_X.forEach((x, k) => {
    // (drawn upright about the main line's passage and leaned with the piston: the plan's lean)
    ctx.save();
    ctx.translate(X(x), Y(VALVE_Y));
    ctx.rotate(-PISTON_LEAN);
    const yy = (y: number) => -(y - VALVE_Y) * sc;
    const g = ctx.createLinearGradient(-CASING_R * sc, 0, CASING_R * sc, 0);
    g.addColorStop(0, '#c9a34f');
    g.addColorStop(0.28, BRASS.lit);
    g.addColorStop(0.55, BRASS.body);
    g.addColorStop(1, BRASS.shade);
    ctx.fillStyle = g;
    ctx.fillRect(-CASING_R * sc, yy(CASING_Y1), 2 * CASING_R * sc, (CASING_Y1 - CASING_Y0) * sc);
    // the stem and the button, down by the piston's travel
    const q = lv.press[k];
    const by = BUTTON_Y - TRAVEL * q;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(0, yy(CASING_Y1 + 0.011));
    ctx.lineTo(0, yy(by));
    metalRod(ctx, null, Math.max(1, 0.0042 * sc), NICKEL);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(0, yy(by), 0.0135 * sc, Math.max(1.2, 0.0045 * sc), 0, 0, 2 * Math.PI);
    ctx.fillStyle = '#f5f2ea';
    ctx.fill();
    if (q > 0.01) {
      ctx.fillStyle = rgba(INK.line, 0.88 * Math.min(1, q));
      ctx.fill();
    }
    ctx.strokeStyle = q > 0.5 ? rgba(INK.line, 0.95) : NICKEL.edge;
    ctx.lineWidth = hl;
    ctx.stroke();
    ctx.restore();
  });
  ctx.strokeStyle = BRASS.edge;
  ctx.lineWidth = hl;
  ctx.stroke(L.casings);
  ctx.fillStyle = NICKEL.body;
  ctx.fill(L.caps);
  ctx.strokeStyle = NICKEL.edge;
  ctx.stroke(L.caps);
  // ---- the mouthpiece (silver plate), the breath going into it
  paintMouthpiece(ctx, L.mp, L.mpHi, 0, Y(MP_RIM[1] + 0.024), 0, Y(MP_RIM[1] - 0.024), sc);
  if (lv.sounding && lv.blow > 0.01) {
    // (the breath comes from the player's side, into the cup: the reeds' streams, pulsing with the lips'
    // opening; drawn 1.7 times the horn's, as the cup is)
    const o = lv.open / Math.max(0.3, lv.swing + 0.2);
    const k = 1.7 * sc;
    breathStream(ctx, (a, w) => [X(MP_RIM[0]) - MP_DIR[0] * a * k, Y(MP_RIM[1]) - w * k], k, BRASS_BREATH, brassBreath(lv.lvl, o), now);
  }
  ctx.restore();
  tubaRecord(L, st, lv);
}

/** the tuba's shadow on the floor: the whole of it as it rests (the pistons up), painted once per layout */
function tubaShadow(ctx: CanvasRenderingContext2D, L: TbLayout): FloorShadow | null {
  const dpr = dprOf(ctx);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  return floorShadow(`tuba|${L.key}|${dpr}`, { x0: X(TB_X0), y0: Y(TB_Y1), x1: X(TB_X1), y1: Y(TB_Y0) }, dpr, 0.043 * sc, 0.014 * sc, 0.024 * sc, (c) => {
    c.fill(L.bell.flare);
    c.fill(L.bell.mouth);
    for (const t of L.tubes) c.fill(t.body);
    c.fill(L.knuckles);
    c.fill(L.casings);
    c.fill(L.caps);
    c.fill(L.ferrules);
    c.fill(L.mp);
    c.lineWidth = Math.max(1, 0.003 * sc);
    c.stroke(L.braces);
    VALVE_X.forEach((x, k) => {
      const a = lean(k, [x, CASING_Y1]);
      const b = lean(k, [x, BUTTON_Y]);
      c.lineWidth = Math.max(1, 0.0042 * sc);
      c.beginPath();
      c.moveTo(X(a[0]), Y(a[1]));
      c.lineTo(X(b[0]), Y(b[1]));
      c.stroke();
      c.beginPath();
      c.ellipse(X(b[0]), Y(b[1]), 0.0135 * sc, Math.max(1.2, 0.0045 * sc), -PISTON_LEAN, 0, 2 * Math.PI);
      c.fill();
    });
  });
}

/** the wave in the bell: up its axis inside the flare (waveLens), spreading as the flare opens and falling to
 *  nothing at the rim */
function bellWave(ctx: CanvasRenderingContext2D, L: TbLayout, lv: TbLive): void {
  const ax = L.bell.ax;
  const n = ax.length / 2;
  const sB = lv.air.starts[lv.air.starts.length - 1];
  const len = lv.air.total - sB;
  // (each point of the axis by its share of the axis's length, the throat to the rim)
  const u = new Float32Array(n);
  for (let i = 1; i < n; i++) u[i] = u[i - 1] + Math.hypot(ax[2 * i] - ax[2 * i - 2], ax[2 * i + 1] - ax[2 * i - 1]);
  const tot = u[n - 1] || 1;
  const cap = WAVE_CAP * BORE * L.sc;
  waveLens(ctx, ax, n, (i) => Math.min(bellR(RIM_Y - BELL_PTS[i][1]) * L.sc, cap), (i) => lv.ampAt(sB + (u[i] / tot) * len), lv.ph);
}
