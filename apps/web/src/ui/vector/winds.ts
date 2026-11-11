// The flute and the trumpet on the vector display (see kit.ts): the same instruments as the stage's
// own drawings (stage-draw.ts: the same plans in metres, the same fingerings, springs and air path,
// the same standing wave folded from the engine's bore snapshots), as lines. Blue is the tube and its
// mechanism; amber is the bore's standing wave, hatched across the air column and brightest where
// the pressure swings most; the knobs' slots mark where each acts (the flute's breath, lip distance,
// noise and vibrato at the embouchure; the trumpet's breath, lips and vibrato at the mouthpiece).
// The state objects are the stage's, so a change of style carries the keys, pistons and wave over.

import type { VisualFrame } from '@piano-model/engine';
import { fingersFor } from '../flute-fingering.ts';
import {
  AutoScale, D2R, FL_BORE, FL_CORK, FL_EMB, FL_EMB_CORR, FL_FOOT_V, FL_KEYS, FL_LEN, FL_RB, FL_ROD_V, FL_YC, TR_BELL0, TR_BELL_END, TR_BELL_LEN, TR_BELL_R, TR_BOW, TR_CAP_TOP, TR_CY, TR_LEAD,
  TR_MAIN, TR_MP, TR_MPIECE, TR_RC, TR_RIM, TR_RT, TR_SLIDES, TR_SLIDE_TRAVEL, TR_STEM, TR_STROKE, TR_TAIL, TR_VX, TR_XB, TR_ZB, TR_ZL, VALVE_DOWN, boreAt, flHead, fluteLayout, newBoreWave, slowPhase,
  spring01, trAir, trAlong, trBellR, trLeadY, trProj, trackBoreWave, trumpetLayout, v3add, v3lerp, v3len, type FluteState, type TrumpetState, type V3,
} from '../stage-draw.ts';
import { V, beam, breathFlow, dot, handle, heat, label, lipLine, mix, ring, seg } from './kit.ts';

type P2 = [number, number];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** how many brightnesses a hatched wave is drawn in (one path each) */
const LEVELS = 6;
const newBuckets = () => Array.from({ length: LEVELS }, () => new Path2D());
/** stroke the hatching: each level its own heat, the strongest with a core */
function strokeBuckets(ctx: CanvasRenderingContext2D, b: Path2D[], width: number, gain: number): void {
  b.forEach((p, i) => {
    const l = (i + 1) / LEVELS;
    beam(ctx, p, heat(0.25 + 0.75 * l), width, { alpha: Math.min(1, (0.18 + 0.82 * l) * gain), butt: true });
  });
}
/** a repeatable scatter in 0..1 (the turbulence dots keep no state) */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------------------------------------------------------------- flute
/** The flute from above, as lines: the tube, lip plate and mechanism in blue; each key a ring, lit
 *  and crossed when it is seated; the standing wave as hatched lobes either side of the tube over the
 *  sounding length (each lobe brightening on the side its pressure swings to, drawn slowed) and a line
 *  along the axis; at the embouchure the breath's jet (green) from the lips to the edge, the lip-to-edge
 *  distance (red), the jet's turbulence (pink) and the breath's vibrato (white). */
export function drawFluteV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: FluteState): void {
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
  // (a phone's stage or an ensemble's cell: thinner lines, smaller handles, fewer marks)
  const small = sc < 900;
  const lw = small ? 1 : 1.25;
  // ---- the fingering, as the stage's own drawing: the engine's note while it sounds and a moment after
  const ks = (st.keys ??= { pos: new Float32Array(FL_KEYS.length).fill(1), vel: new Float32Array(FL_KEYS.length), t: now, quiet: 10 });
  const dt = Math.min(0.1, Math.max(0, (now - ks.t) / 1000));
  ks.t = now;
  ks.quiet = blow > 0.015 ? 0 : ks.quiet + dt;
  const fingers = focus && ks.quiet < 0.8 ? fingersFor(focus.midi) : 0;
  const keyPos = FL_KEYS.map((k, i) => spring01(ks.pos, ks.vel, i, k.open(fingers) ? 1 : 0, dt, 26, 0.62));
  const Leff = focus ? focus.lengthM : 0;
  const xNear = FL_EMB - FL_EMB_CORR;
  const xFar = Math.min(FL_LEN + 0.006, xNear + Leff);

  ctx.save();
  if (vertical) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  }
  // ---- the standing wave, under the instrument's lines: hatched lobes either side of the tube
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const ph = Math.cos(slowPhase(focus?.f1 ?? 440, now));
  const lvl = Math.min(1, peak / scale);
  const sounding = !!focus && Leff > 0 && lvl > 0.02;
  if (sounding) {
    const Hm = Math.min(Cw * 0.14, 0.05 * sc) * Math.min(1, 0.35 + lvl);
    const gap = small ? 4 : 7;
    const n = Math.max(8, Math.round(((xFar - xNear) * sc) / gap));
    const fade = Math.min(1, 3 * lvl);
    for (const sgn of [-1, 1]) {
      const ribs = newBuckets();
      const env = new Path2D();
      env.moveTo(X(xNear), Y(sgn * FL_RB));
      for (let i = 0; i <= n; i++) {
        const x = xNear + ((xFar - xNear) * i) / n;
        const a = boreAt(w.amp, (x - xNear) / Leff) / scale;
        const A = Math.min(1, Math.abs(a));
        const y0 = Y(sgn * FL_RB);
        env.lineTo(X(x), y0 + sgn * Hm * A);
        // (the lobe's pressure swings to this side of the tube, then to the other)
        const e = A * (0.3 + 0.7 * Math.max(0, Math.sign(a) * sgn * ph));
        const lv = Math.round(e * LEVELS);
        if (lv < 1 || A < 0.04) continue;
        ribs[lv - 1].moveTo(X(x), y0 + sgn * 2.5);
        ribs[lv - 1].lineTo(X(x), y0 + sgn * Math.max(3.5, Hm * A));
      }
      env.lineTo(X(xFar), Y(sgn * FL_RB));
      strokeBuckets(ctx, ribs, 1, fade);
      beam(ctx, env, V.amber, 1, { alpha: (0.3 + 0.35 * lvl) * fade });
    }
  }
  // ---- behind the tube: the thumb's key and the G♯ key, on the player's side
  FL_KEYS.forEach((k, i) => {
    if (k.phi >= 0 || Math.cos(k.phi * D2R) > 0) return;
    cupV(ctx, X(k.x), Y(FL_YC * Math.sin(k.phi * D2R)), k.r * sc, k.r * sc * Math.abs(Math.cos(k.phi * D2R)), false, keyPos[i], lw, 0.55);
  });
  // ---- the tube, its joints, the lip plate and the embouchure hole
  beam(ctx, L.seams, V.blueMid, 1, { alpha: 0.7, butt: true });
  beam(ctx, L.tube, V.blue, lw + 0.1);
  beam(ctx, L.plate, V.blue, lw);
  beam(ctx, L.hole, V.blue, lw, { hot: true });
  // ---- the mechanism: rods, hinge tubes, posts, the touches and rollers
  beam(ctx, L.rods, V.blueMid, 1);
  beam(ctx, L.hinges, V.blueDim, 1);
  beam(ctx, L.touches, V.blueMid, 1, { alpha: 0.9 });
  beam(ctx, L.rollers, V.blueMid, 1, { alpha: 0.9 });
  beam(ctx, L.posts, V.blueMid, 1);
  // ---- the keys: each cup a ring on a hairline arm from its hinge tube
  const arms = new Path2D();
  for (let i = 0; i < FL_KEYS.length; i++) {
    const k = FL_KEYS[i];
    const cphi = Math.cos(k.phi * D2R);
    if (cphi < 0) continue;
    const cx = X(k.x);
    const cy = Y(FL_YC * Math.sin(k.phi * D2R));
    const ry = k.r * sc * cphi;
    const rod = Y(k.foot ? FL_FOOT_V : FL_ROD_V);
    arms.moveTo(cx, cy + Math.sign(rod - cy) * ry);
    arms.lineTo(cx, rod);
    cupV(ctx, cx, cy, k.r * sc, ry, k.style === 'open', keyPos[i], lw, 1);
    // the first finger's cup on the C♯ key's lever (one piece with it)
    if (k.note === 73) {
      arms.moveTo(X(0.338), Y(0.0083));
      arms.lineTo(X(0.338), rod);
      cupV(ctx, X(0.338), Y(0), 0.0083 * sc, 0.0083 * sc, false, keyPos[i], lw, 1);
    }
  }
  beam(ctx, arms, V.blueDim, 1);
  // ---- the embouchure: the four slots, each where its knob acts
  const plateR = flHead(FL_EMB) + 0.0011;
  const vL = -plateR; // the lips, at the plate's edge on the player's side
  const vE = 0.0051; // the hole's far edge, which the jet strikes
  const hr = clamp(0.0034 * sc, 2.6, 6);
  const live = Math.min(1, 0.45 + 2 * blow);
  const e = fr?.excite;
  // breath (green): a sheet of air from the lips to the edge, carrying the jet's disturbance
  // downstream (its delay in periods from the engine), slowed
  const t = now / 1000;
  if (blow > 0.02 && e) {
    const periods = Number(/= ([\d.]+) periods/.exec(e.meta)?.[1] ?? 0.42);
    let m = 0;
    for (let i = 0; i < e.trace.length; i += 4) m = Math.max(m, Math.abs(e.trace[i]));
    const swing = Math.min(1, m / st.jetScale.of(m));
    const jet = new Path2D();
    for (let j = -1; j <= 1; j++) {
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const v = vL + (vE - vL) * f;
        const eta = 0.0015 * Math.pow(f, 1.5) * Math.sin(2 * Math.PI * (periods * f - 0.9 * t) + j * 0.4) * (0.4 + 0.6 * swing) * Math.min(1, blow * 1.6);
        const x = FL_EMB + j * 0.002 * (1 - 0.45 * f) + eta;
        if (i) jet.lineTo(X(x), Y(v));
        else jet.moveTo(X(x), Y(v));
      }
    }
    beam(ctx, jet, V.green, small ? 1 : 1.2, { alpha: Math.min(1, 0.4 + blow) * (1 + 2.5 * vib), hot: !small });
    // noise (pink): the jet breaks into turbulence at the edge
    const frame = Math.floor(t * 20);
    const nd = small ? 4 : 7;
    for (let i = 0; i < nd; i++) {
      const hx = hash(frame * 13 + i * 7.3);
      const hv = hash(frame * 5 + i * 3.1 + 40);
      dot(ctx, X(FL_EMB + (hx - 0.5) * 0.011), Y(vE + 0.0008 + hv * 0.0048), small ? 0.9 : 1.2, V.pink, Math.min(1, 0.35 + blow) * (0.5 + 0.5 * hash(frame + i)));
    }
  }
  // the lips' handle (green: the breath) and round it the vibrato's ring (white), breathing with it
  const yLip = Y(vL - 0.0085);
  seg(ctx, X(FL_EMB), yLip + hr, X(FL_EMB), Y(vL), V.green, 1, { alpha: 0.5 * live });
  handle(ctx, X(FL_EMB), yLip, V.green, hr, live);
  ring(ctx, X(FL_EMB), yLip, hr + 3.5 + clamp(vib * 60, -2.5, 6), V.white, 1, { alpha: 0.5 + 0.5 * Math.min(1, Math.abs(vib) * 30 + blow) });
  // the lip-to-edge distance (red): a bracket from the lips to the edge, its handle beyond the plate
  const xr = X(FL_EMB) - Math.max(0.0085 * sc, hr + 5);
  const dim = new Path2D();
  dim.moveTo(xr - 2.5, Y(vL));
  dim.lineTo(xr + 2.5, Y(vL));
  dim.moveTo(xr, Y(vL));
  dim.lineTo(xr, Y(vE));
  dim.moveTo(xr - 2.5, Y(vE));
  dim.lineTo(xr + 2.5, Y(vE));
  beam(ctx, dim, V.red, 1, { alpha: 0.85 * live });
  const yEdge = Y(plateR + 0.0085);
  seg(ctx, X(FL_EMB), Y(vE), X(FL_EMB), yEdge - hr, V.red, 1, { alpha: 0.5 * live });
  handle(ctx, X(FL_EMB), yEdge, V.red, hr, live);
  // ---- the wave's line along the bore's axis, over everything (its nodes stand still)
  if (sounding) {
    const xa = FL_CORK;
    const xb = Math.min(FL_LEN, xFar);
    const axis = new Path2D();
    const n = small ? 60 : 120;
    for (let i = 0; i <= n; i++) {
      const x = xa + ((xb - xa) * i) / n;
      const v = (boreAt(w.amp, (x - xNear) / Leff) / scale) * ph;
      if (i) axis.lineTo(X(x), Y(-v * FL_BORE * 0.7));
      else axis.moveTo(X(x), Y(-v * FL_BORE * 0.7));
    }
    beam(ctx, axis, V.amber, small ? 1.2 : 1.5, { alpha: Math.min(1, 3 * lvl), hot: true });
    // (the sounding length's far end: where the wave leaves the tube, at the first open hole)
    if (!small && !vertical) label(ctx, `${Math.round(Leff * 1000)} mm`, X(xb) + 6, Y(-FL_RB) - 8, { size: 10, color: V.amber, alpha: 0.75 * Math.min(1, 3 * lvl) });
  }
  ctx.restore();
}

/** a key's cup from above: a ring (an open-hole cup has its hole's ring inside). Seated (`p` 0), it
 *  is bright and crossed; standing open (`p` 1), dim. */
function cupV(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, holed: boolean, p: number, lw: number, alpha: number): void {
  const shut = clamp(1 - p, 0, 1);
  const s = 0.965 + 0.035 * p;
  rx *= s;
  ry *= s;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, Math.max(0.5, ry), 0, 0, 2 * Math.PI);
  beam(ctx, null, mix(V.blueMid, V.blue, shut), lw + 0.5 * shut, { alpha: alpha * (0.75 + 0.25 * shut), hot: shut > 0.5 });
  if (holed) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.4, Math.max(0.4, ry * 0.4), 0, 0, 2 * Math.PI);
    beam(ctx, null, V.blueMid, 1, { alpha: alpha * 0.8 });
  }
  if (shut > 0.05) {
    // seated: a cross on the pad
    const k = 0.5 * Math.SQRT1_2;
    ctx.beginPath();
    ctx.moveTo(cx - rx * k, cy - ry * k);
    ctx.lineTo(cx + rx * k, cy + ry * k);
    ctx.moveTo(cx + rx * k, cy - ry * k);
    ctx.lineTo(cx - rx * k, cy + ry * k);
    beam(ctx, null, V.blue, lw, { alpha: alpha * shut, hot: true });
  }
}

// ---------------------------------------------------------------- trumpet
/** the trumpet's vibrato has no place in the visual frame: it is read off the sounding pitch (its
 *  deviation from its own slow mean), kept per state object */
const pitchTrack = new WeakMap<TrumpetState, { mean: number; dev: number }>();

/** The B♭ trumpet in the stage's own view, as lines: every tube its two walls, the valve casings
 *  with their pistons and buttons (lit when down), the slides (kicked out on the notes that need it),
 *  the bell's flare with its mouth and a few sections. The air's path for the fingering is amber: a
 *  line along the bore through the pressed valves' slides (dashed inside the casings), hatched across
 *  by the standing wave and opening out in the bell. At the mouthpiece, drawn as on the reeds (kit.ts
 *  breathFlow, lipLine), the breath (green) flows into the lips (red) on the rim, parted as they buzz;
 *  the vibrato's handle (pink) rides the pitch. */
export function drawTrumpetV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TrumpetState): void {
  const L = trumpetLayout(W, H);
  const { S } = L;
  const P = (q: P2): P2 => [L.ox + q[0] * S, L.oy + q[1] * S];
  const P3 = (p: V3): P2 => P(trProj(p));
  // (the layout's memo is shared with the stage's own drawing: this one's keys are prefixed)
  const memo = <T,>(k: string, f: () => T): T => {
    let v = L.memo.get(`v:${k}`) as T | undefined;
    if (v === undefined) L.memo.set(`v:${k}`, (v = f()));
    return v;
  };
  const shift = (o: V3): P2 => {
    const q = trProj(o);
    return [q[0] * S, q[1] * S];
  };
  const now = performance.now();
  const meta = fr?.excite?.meta ?? '';
  const valves = /valves (\S+)/.exec(meta)?.[1] ?? 'open';
  const down = VALVE_DOWN[valves] ?? VALVE_DOWN.open;
  const focus = fr?.focus ?? null;
  const small = S < 900;
  const lw = small ? 1 : 1.2;
  // ---- the standing wave and the mechanism's springs, as the stage's own drawing keeps them
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const lvl = Math.min(1, peak / scale);
  const mc = (st.mech ??= { valves: new Float32Array(3), valveV: new Float32Array(3), slide: new Float32Array(3), slideV: new Float32Array(3), t: now, quiet: 10 });
  const dt = Math.min(0.1, Math.max(0, (now - mc.t) / 1000));
  mc.t = now;
  mc.quiet = lvl > 0.04 ? 0 : mc.quiet + dt;
  const held = mc.quiet < 0.8;
  const pressed = held ? down : VALVE_DOWN.open;
  const partial = Number(/partial (\d+)/.exec(meta)?.[1] ?? 0);
  const combo = !held ? 0 : valves === '1+3' ? 0.6 : valves === '1+2+3' ? 1 : 0;
  const kickTo = [partial >= 4 ? combo : 0, 0, partial > 0 && partial <= 3 ? combo : 0];
  const press = [0, 1, 2].map((k) => spring01(mc.valves, mc.valveV, k, pressed[k] ? 1 : 0, dt, 22, 0.6));
  const kick = [0, 1, 2].map((k) => spring01(mc.slide, mc.slideV, k, kickTo[k], dt, 6, 0.9) * TR_SLIDE_TRAVEL[k]);
  const slideOff = (k: number): V3 => [TR_SLIDES[k].dir[0] * kick[k], 0, 0];
  const ph = Math.cos(slowPhase(focus?.f1 ?? 392, now));
  const { runs, runLen, total } = trAir(valves, down);
  const ampAt = (s: number) => {
    const d = total - s;
    const taper = d < TR_BELL_LEN ? TR_BELL_R[TR_BELL_R.length - 1] / trBellR(d) : 1;
    return (boreAt(w.amp, s / total) / scale) * taper;
  };
  const sounding = !!focus && lvl > 0.02;

  ctx.save();
  /** hide what lies behind a shape: lines only, but a nearer part still covers a farther one */
  const mask = (path: Path2D, strokeWidth = 0) => {
    ctx.save();
    ctx.setLineDash([]);
    if (strokeWidth) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      ctx.stroke(path);
    } else {
      ctx.fillStyle = '#000';
      ctx.fill(path);
    }
    ctx.restore();
  };
  /** a tube's two walls along 3D polylines (kept per canvas size under `key`); `near` tubes (the
   *  leadpipe's side, towards the viewer) hide the casings and the bell section behind them */
  const walls = (key: string, polys: () => V3[][], color: string, alpha = 1, off?: V3, near = false) => {
    const centre = near
      ? memo(`centre:${key}`, () => {
          const c = new Path2D();
          for (const pl3 of polys()) pl3.map(P3).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
          return c;
        })
      : null;
    const p = memo(`walls:${key}`, () => {
      const p = new Path2D();
      const r = TR_RT * S;
      for (const pl3 of polys()) {
        const pl = pl3.map(P3);
        for (const sg of [-1, 1])
          pl.forEach(([x, y], i) => {
            const a = pl[Math.max(0, i - 1)];
            const b = pl[Math.min(pl.length - 1, i + 1)];
            const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
            const qx = x - (sg * r * (b[1] - a[1])) / l;
            const qy = y + (sg * r * (b[0] - a[0])) / l;
            if (i) p.lineTo(qx, qy);
            else p.moveTo(qx, qy);
          });
      }
      return p;
    });
    const o = off ? shift(off) : null;
    if (o) {
      ctx.save();
      ctx.translate(o[0], o[1]);
    }
    if (centre) mask(centre, 2 * TR_RT * S);
    beam(ctx, p, color, lw, { alpha });
    if (o) ctx.restore();
  };
  // ---- the bell section, farthest: the tail and bow, the flare's two edges, its sections, the mouth
  walls('bellTail', () => [TR_TAIL, TR_BOW], V.blue, 0.85);
  const B = memo('bell', () => {
    const pts = Array.from({ length: 61 }, (_, i) => {
      const t = Math.pow(i / 60, 0.6);
      return { q: P3(v3lerp(TR_BELL0, TR_BELL_END, t)), r: trBellR(TR_BELL_LEN * (1 - t)) * S };
    });
    const ax = [trProj(TR_BELL0), trProj(TR_BELL_END)];
    const l = Math.hypot(ax[1][0] - ax[0][0], ax[1][1] - ax[0][1]);
    const nx = -(ax[1][1] - ax[0][1]) / l;
    const ny = (ax[1][0] - ax[0][0]) / l;
    const edges = new Path2D();
    for (const sg of [-1, 1]) pts.forEach(({ q, r }, i) => (i ? edges.lineTo(q[0] + sg * nx * r, q[1] + sg * ny * r) : edges.moveTo(q[0] + sg * nx * r, q[1] + sg * ny * r)));
    // a circle of the flare, d back from the rim
    const section = (into: Path2D, d: number) => {
      const c = v3lerp(TR_BELL_END, TR_BELL0, d / TR_BELL_LEN);
      const r = trBellR(d);
      for (let i = 0; i <= 48; i++) {
        const t = (i / 48) * 2 * Math.PI;
        const q = P3([c[0], c[1] + r * Math.cos(t), c[2] + r * Math.sin(t)]);
        if (i) into.lineTo(...q);
        else into.moveTo(...q);
      }
    };
    const mouth = new Path2D();
    section(mouth, 0);
    const sections = new Path2D();
    for (const d of [0.012, 0.035, 0.075, 0.14]) section(sections, d);
    return { edges, mouth, sections, nx, ny, c: P3([TR_XB, TR_BELL_END[1], TR_ZB]) };
  });
  beam(ctx, B.sections, V.blueDim, 1, { alpha: 0.9 });
  beam(ctx, B.edges, V.blue, lw);
  beam(ctx, B.mouth, V.blue, lw + 0.3, { hot: true });
  st.src = { x: B.c[0] + 0.012 * S, y: B.c[1] };
  // ---- the valves: casings and caps (the near halves of their rims), pistons, stems, buttons
  TR_VX.forEach((x, k) => {
    const rim = (y: number, r: number, from = 0, to = 40) =>
      memo(`rim:${k}:${y}:${r}:${from}`, () => {
        const p = new Path2D();
        for (let i = from; i <= to; i++) {
          const t = (i / 40) * 2 * Math.PI;
          const q = P3([x + r * Math.cos(t), y, r * Math.sin(t)]);
          if (i > from) p.lineTo(...q);
          else p.moveTo(...q);
        }
        return p;
      });
    const sides = memo(`casing:${k}`, () => {
      const p = new Path2D();
      const body = new Path2D();
      const col = (y0: number, y1: number, r: number) => {
        // the cylinder's silhouette: the widest points of its rim on the screen
        let x0 = Infinity;
        let x1 = -Infinity;
        for (let i = 0; i < 40; i++) {
          const t = (i / 40) * 2 * Math.PI;
          const q = P3([x + r * Math.cos(t), y0, r * Math.sin(t)]);
          x0 = Math.min(x0, q[0]);
          x1 = Math.max(x1, q[0]);
        }
        const ya = P3([x, y0, 0])[1];
        const yb = P3([x, y1, 0])[1];
        p.moveTo(x0, ya);
        p.lineTo(x0, yb);
        p.moveTo(x1, ya);
        p.lineTo(x1, yb);
        body.rect(x0, Math.min(ya, yb), x1 - x0, Math.abs(yb - ya));
      };
      col(-TR_CY - 0.0086, -TR_CY, TR_RC + 0.0018);
      col(-TR_CY, TR_CY, TR_RC);
      col(TR_CY, TR_CY + 0.006, TR_RC + 0.0018);
      return { p, body };
    });
    // the casing hides the bell section's tail behind it (its own piston is drawn after, inside)
    mask(sides.body);
    mask(rim(-TR_CY - 0.0086, TR_RC + 0.0018, 20));
    mask(rim(TR_CY + 0.006, TR_RC + 0.0018));
    beam(ctx, sides.p, V.blue, lw);
    beam(ctx, rim(-TR_CY - 0.0086, TR_RC + 0.0018, 20), V.blue, lw);
    beam(ctx, rim(-TR_CY, TR_RC + 0.0018, 20), V.blueMid, 1);
    beam(ctx, rim(TR_CY, TR_RC + 0.0018, 20), V.blueMid, 1);
    beam(ctx, rim(TR_CY + 0.006, TR_RC + 0.0018), V.blue, lw);
    // the piston inside its casing (its top and bottom faces), the stem and the button, down by the stroke
    const [, dy] = shift([0, -TR_STROKE * press[k], 0]);
    const lit = clamp(press[k], 0, 1);
    ctx.save();
    ctx.translate(0, dy);
    if (!small) {
      beam(ctx, rim(TR_CY - 0.012, TR_RC - 0.0012), V.blueMid, 1, { alpha: 0.5 + 0.5 * lit, dash: [2, 3] });
      beam(ctx, rim(-TR_CY + 0.022, TR_RC - 0.0012), V.blueMid, 1, { alpha: 0.5 + 0.5 * lit, dash: [2, 3] });
    }
    const yb = TR_CAP_TOP + TR_STEM;
    const s1 = P3([x, yb, 0]);
    const s0 = P3([x, TR_CY + 0.006, 0]);
    seg(ctx, s0[0], s0[1] - dy, s1[0], s1[1], V.blue, lw + 0.4, { butt: true });
    const col = mix(V.blue, V.white, 0.6 * lit);
    beam(ctx, rim(yb, 0.0084, 20), col, lw, { alpha: 0.9 });
    beam(ctx, rim(yb + 0.0045, 0.0084), col, lw + 0.4 * lit, { hot: lit > 0.5 });
    if (lit > 0.05) beam(ctx, rim(yb + 0.0045, 0.0045), V.white, 1, { alpha: lit });
    ctx.restore();
  });
  // ---- the slides: the main tuning slide, then each valve's (dim until its piston routes the air
  // through it), the 1st and 3rd riding out when kicked
  walls('main', () => [TR_MAIN], V.blue, 1, undefined, true);
  for (const k of [2, 0, 1]) {
    const sl = TR_SLIDES[k];
    const on = clamp(press[k], 0, 1);
    const col = mix(V.blueDim, V.blue, on);
    walls(`fixed${k}`, () => [sl.out, sl.back], col, 0.9, undefined, true);
    walls(`sleeve${k}`, () => [sl.sleeve], col, 0.9, slideOff(k), true);
    if (kick[k] > 0.0005) {
      // kicked out: the inner tubes show between the fixed tubes and the sleeve
      const [ox, oy] = shift([sl.dir[0] * kick[k], 0, 0]);
      for (const e of [sl.out[sl.out.length - 1], sl.back[0]]) {
        const a = P3(e);
        seg(ctx, a[0], a[1], a[0] + ox, a[1] + oy, V.blueMid, 1, { dash: [2, 2] });
      }
    }
  }
  {
    // the third slide's ring and the first's thumb saddle, riding with them; the finger hook
    const o3 = slideOff(2);
    const c3 = P3(v3add([0.075, 0.0135, TR_ZL - 0.0042], o3));
    const b3 = P3(v3add([0.075, -0.004 + TR_RT, TR_ZL], o3));
    ring(ctx, c3[0], c3[1], 0.0105 * S, V.blueMid, 1);
    seg(ctx, b3[0], b3[1], c3[0], c3[1] + 0.0105 * S, V.blueMid, 1);
    const o1 = slideOff(0);
    ctx.beginPath();
    [[-0.0786, 0.016], [-0.078, 0.003], [-0.0752, -0.0028], [-0.0668, -0.01 + TR_RT - 0.0004], [-0.0584, -0.0028], [-0.0556, 0.003], [-0.055, 0.016]].forEach(([x, y], i) => {
      const q = P3(v3add([x, y, TR_ZL], o1));
      if (i) ctx.lineTo(...q);
      else ctx.moveTo(...q);
    });
    beam(ctx, null, V.blueMid, 1);
    const xb = 0.0545;
    const y0 = trLeadY(xb);
    ctx.beginPath();
    [[xb, y0 + TR_RT - 0.001], [xb - 0.0035, y0 + 0.0095], [xb - 0.0098, y0 + 0.0165], [xb - 0.0098, y0 + 0.0228], [xb - 0.0045, y0 + 0.0262], [xb + 0.0006, y0 + 0.0244], [xb + 0.0016, y0 + 0.0212]].forEach(([x, y], i) => {
      const q = P3([x, y, TR_ZL]);
      if (i) ctx.lineTo(...q);
      else ctx.moveTo(...q);
    });
    beam(ctx, null, V.blueMid, 1);
  }
  // ---- the leadpipe and the mouthpiece (its silhouette along the leadpipe's axis, rim to shank)
  walls('lead', () => [TR_LEAD], V.blue, 1, undefined, true);
  const rimPt = P3(trAlong(-TR_MP));
  const ax1 = P3(trAlong(0));
  const al = Math.hypot(ax1[0] - rimPt[0], ax1[1] - rimPt[1]);
  const ux = (ax1[0] - rimPt[0]) / al;
  const uy = (ax1[1] - rimPt[1]) / al;
  const mp = memo('mouthpiece', () => {
    const at = (s: number, r: number): P2 => {
      const q = P3(trAlong(-TR_MP + s));
      return [q[0] - uy * r * S, q[1] + ux * r * S];
    };
    const p = new Path2D();
    TR_MPIECE.forEach(([r, s], i) => (i ? p.lineTo(...at(s, r)) : p.moveTo(...at(s, r))));
    for (let i = TR_MPIECE.length - 1; i >= 0; i--) p.lineTo(...at(TR_MPIECE[i][1], -TR_MPIECE[i][0]));
    p.closePath();
    return p;
  });
  mask(mp);
  beam(ctx, mp, V.blue, lw);

  // ---- the air: its path for this fingering (lips to rim), hatched across by the standing wave
  if (sounding) {
    // the runs on the screen, with each point's distance from the lips (kept per fingering)
    const proj = memo(`air:${valves}`, () => {
      let s0 = 0;
      return runs.map((r, ri) => {
        const xy = new Float32Array(2 * r.pts.length);
        const sm = new Float32Array(r.pts.length);
        let s = s0;
        let geo = 0;
        for (let i = 1; i < r.pts.length; i++) geo += v3len(r.pts[i - 1], r.pts[i]);
        // (a hidden run's length is the passage's share of the valve block, not its drawn length)
        const k = geo > 0 ? runLen[ri] / geo : 1;
        r.pts.forEach((p3, i) => {
          if (i) s += v3len(r.pts[i - 1], p3) * k;
          const q = P3(p3);
          xy[2 * i] = q[0];
          xy[2 * i + 1] = q[1];
          sm[i] = s;
        });
        s0 += runLen[ri];
        return { xy, sm };
      });
    });
    const fade = Math.min(1, 3 * lvl);
    const line = new Path2D();
    const inside = new Path2D();
    const ribs = newBuckets();
    const gap = small ? 4 : 6;
    const last = runs.length - 1;
    runs.forEach((r, ri) => {
      const { xy, sm } = proj[ri];
      const o = r.slide !== undefined ? shift(slideOff(r.slide)) : [0, 0];
      const into = r.hidden ? inside : line;
      let acc = gap / 2;
      for (let i = 0; i < sm.length; i++) {
        const x = xy[2 * i] + o[0];
        const y = xy[2 * i + 1] + o[1];
        if (i) into.lineTo(x, y);
        else into.moveTo(x, y);
        if (!i || r.hidden) continue;
        // ticks across the bore every few pixels along it, as bright as the pressure there
        const px = xy[2 * i - 2] + o[0];
        const py = xy[2 * i - 1] + o[1];
        const l = Math.hypot(x - px, y - py);
        if (l < 1e-6) continue;
        const nx = ri === last ? B.nx : -(y - py) / l;
        const ny = ri === last ? B.ny : (x - px) / l;
        while (acc <= l) {
          const f = acc / l;
          const s = sm[i - 1] + (sm[i] - sm[i - 1]) * f;
          const A = Math.min(1, Math.abs(ampAt(s)));
          const lv = Math.round(A * (0.3 + 0.7 * Math.abs(ph)) * LEVELS);
          if (lv >= 1) {
            // (in the bell the wave fills the flare: its ticks widen with it)
            const half = ri === last ? Math.max(TR_RT, 0.82 * trBellR(total - s)) * S : 0.72 * TR_RT * S;
            const cx = px + (x - px) * f;
            const cy = py + (y - py) * f;
            ribs[lv - 1].moveTo(cx - nx * half, cy - ny * half);
            ribs[lv - 1].lineTo(cx + nx * half, cy + ny * half);
          }
          acc += ri === last ? gap * 1.6 : gap;
        }
        acc -= l;
      }
    });
    strokeBuckets(ctx, ribs, 1, fade);
    beam(ctx, inside, V.amber, 1, { alpha: 0.5 * fade, dash: [2, 3] });
    beam(ctx, line, V.amber, small ? 1.1 : 1.4, { alpha: (0.45 + 0.4 * lvl) * fade, hot: lvl > 0.5 });
  }

  // ---- the mouthpiece's slots: the breath (green) into the lips (red), the vibrato (pink)
  {
    const tr = fr?.excite?.trace;
    let lo = 1;
    let hi = 0;
    if (tr)
      for (let i = 0; i < tr.length; i += 4) {
        lo = Math.min(lo, tr[i]);
        hi = Math.max(hi, tr[i]);
      }
    const swing = tr && hi > lo ? Math.sqrt(hi) - Math.sqrt(Math.max(0, lo)) : 0;
    const playing = swing > 0.02 && lvl > 0.02;
    const t = now / 1000;
    // (the buzz drawn slowed, a little quicker for higher notes: the true buzz is the note itself)
    const open01 = playing ? 0.5 - 0.5 * Math.cos(2 * Math.PI * 4.5 * Math.sqrt((focus?.f1 ?? 392) / 392) * t) : 0;
    const nx = uy;
    const ny = -ux;
    const at = (a: number, w: number): [number, number] => [rimPt[0] - ux * a * S + nx * w * S, rimPt[1] - uy * a * S + ny * w * S];
    const live = playing ? 1 : 0.55;
    const hr = clamp(0.0036 * S, 2.6, 6);
    // the lips: on the rim, parted by the opening (drawn as the reeds' pinch: kit.ts lipLine)
    lipLine(ctx, at, 0.0006 + 0.0034 * Math.min(1, swing * 1.6) * open01, 0.0125, lw + 0.3, playing ? 0.6 + 0.4 * open01 : 0.6, playing);
    // the lips' handle, above the rim
    const rx = rimPt[0] - ux * 0.004 * S + nx * 0.027 * S;
    const ry = rimPt[1] - uy * 0.004 * S + ny * 0.027 * S;
    seg(ctx, rimPt[0] - ux * 0.004 * S + nx * 0.016 * S, rimPt[1] - uy * 0.004 * S + ny * 0.016 * S, rx - nx * hr, ry - ny * hr, V.red, 1, { alpha: 0.5 * live });
    handle(ctx, rx, ry, V.red, hr, live);
    // the breath: its handle before the lips, the air flowing from it into the aperture (as on the reeds:
    // kit.ts breathFlow)
    const blow = fr?.breath?.pressure ?? (playing ? Math.min(1, 0.4 + lvl) : 0);
    // (nearer on a small stage, whose margin is a few pixels)
    const gd = small ? 0.015 : 0.021;
    const gx = rimPt[0] - ux * gd * S;
    const gy = rimPt[1] - uy * gd * S;
    // (from the handle's ring, and a few px long however small the stage)
    if (playing) breathFlow(ctx, at, Math.max(gd - (hr + 2) / S, 0.0016 + 6 / S), [0.0034, 0.0018, 0.0006], 0.0016, small, Math.min(1, 0.35 + blow) * (0.7 + 0.3 * open01), now);
    handle(ctx, gx, gy, V.green, hr, live);
    // the vibrato: below the rim, riding the pitch about its own mean
    const pt = pitchTrack.get(st) ?? { mean: 0, dev: 0 };
    pitchTrack.set(st, pt);
    if (focus && playing) {
      if (!pt.mean || Math.abs(focus.f1 / pt.mean - 1) > 0.04) pt.mean = focus.f1;
      pt.mean += (focus.f1 - pt.mean) * Math.min(1, dt / 0.6);
      pt.dev = focus.f1 / pt.mean - 1;
    } else pt.dev *= 0.85;
    const wob = clamp(pt.dev * 400, -1, 1) * 0.006 * S;
    const vx = rimPt[0] - ux * 0.004 * S - nx * 0.027 * S;
    const vy = rimPt[1] - uy * 0.004 * S - ny * 0.027 * S;
    seg(ctx, vx - ux * 0.007 * S, vy - uy * 0.007 * S, vx + ux * 0.007 * S, vy + uy * 0.007 * S, V.pink, 1, { alpha: 0.45 * live });
    handle(ctx, vx + ux * wob, vy + uy * wob, V.pink, hr, live);
  }
  ctx.restore();
}
