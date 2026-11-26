// Day Studio: the flute on the 2D stage, polished silver in daylight with its shadow on the floor, the
// bore's standing wave in the blue, a key held down in ink. Its plan and its fingering are the shared
// drawer's (ui/stage-draw.ts); the layout is kept here too, because this one strokes the foot's levers
// apart from their rollers.
import type { VisualFrame } from '@piano-model/engine';
import { fingersFor } from '../../../ui/flute-fingering.ts';
import { AutoScale, boreAt, D2R, FL_BORE, FL_CORK, FL_EMB, FL_EMB_CORR, FL_FOOT_POSTS, FL_FOOT_V, FL_KEYS, FL_LEN, FL_MAIN_POSTS, FL_PROFILE, FL_RB, FL_ROD_V, FL_SEAMS, FL_YC, type FlCup, flHead, type FlKey, type FluteState, INK, newBoreWave, rgba, slowPhase, spring01, superEllipse, teardrop, trackBoreWave, waveInk } from '../../../ui/stage-draw.ts';
import { floorShadow, type FloorShadow, LIGHT, SILVER } from './kit.ts';

export interface FluteLayout {
  key: string;
  sc: number;
  x0: number;
  c: number;
  tube: Path2D;
  /** the tube's upper (lit) edge alone */
  rim: Path2D;
  seams: Path2D;
  plate: Path2D;
  hole: Path2D;
  rods: Path2D;
  hinges: Path2D;
  posts: Path2D;
  touches: Path2D;
  rollers: Path2D;
  /** the rollers' levers: bent arms (stroked) */
  levers: Path2D;
}
let flLayout: FluteLayout | null = null;
/** the flute's shadow on the floor, by its box on the stage (a few kept: an ensemble's flutes, a phone turned) */
const flShadows = new Map<string, FloorShadow | null>();
export function fluteLayout(Lw: number, Cw: number, vertical: boolean): FluteLayout {
  const key = `${Lw}x${Cw}`;
  if (flLayout && flLayout.key === key) return flLayout;
  const sc = (vertical ? 0.86 : 0.9) * Lw / FL_LEN;
  const x0 = (Lw - FL_LEN * sc) / 2;
  // (above the middle on a wide stage: where the room's grip sat, at its right edge half way down)
  const c = Cw * (vertical ? 0.5 : 0.4);
  const X = (x: number) => x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  const tube = new Path2D();
  FL_PROFILE.forEach(([x, r], i) => (i ? tube.lineTo(X(x), Y(-r)) : tube.moveTo(X(x), Y(-r))));
  for (let i = FL_PROFILE.length - 1; i >= 0; i--) tube.lineTo(X(FL_PROFILE[i][0]), Y(FL_PROFILE[i][1]));
  tube.closePath();
  const rim = new Path2D();
  FL_PROFILE.forEach(([x, r], i) => (i ? rim.lineTo(X(x), Y(-r)) : rim.moveTo(X(x), Y(-r))));
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
  const levers = new Path2D();
  for (const [r0, r1, phi, rr, bx] of [
    [0.5525, 0.5655, 90, 0.0184, 0.6112],
    [0.5515, 0.5665, 74, 0.0178, 0.5755],
  ] as const) {
    const v = vAt(rr, phi);
    const hr = 0.0023 * sc;
    rollers.roundRect(X(r0), Y(v) - hr, (r1 - r0) * sc, 2 * hr, hr);
    // the lever: out from its hinge tube, round, and back along the foot to the roller
    levers.moveTo(X(bx), Y(FL_FOOT_V + 0.002));
    levers.lineTo(X(bx), Y(v - 0.004));
    levers.quadraticCurveTo(X(bx), Y(v), X(bx - 0.004), Y(v));
    levers.lineTo(X(r1 + 0.0012), Y(v));
  }
  flLayout = { key, sc, x0, c, tube, rim, seams, plate, hole, rods, hinges, posts, touches, rollers, levers };
  return flLayout;
}

/** The flute from above: the head (crown, lip plate), the body's Boehm keys and the foot, the keys
 *  closing for the engine's note by the standard fingering (through the mechanism's links, each on a
 *  spring), the breath jet crossing the embouchure hole, and the bore's standing wave inside the
 *  tube over its effective length: the pressure nodes just past the first open hole and ~50 mm
 *  above the embouchure (the end corrections), the lobes swinging between compression and
 *  rarefaction (drawn slowed). */
export function drawFlute(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: FluteState, top = 0): void {
  const vertical = H > W * 1.05;
  // (standing on a phone: in the box under the file player, as the reeds are)
  const under = vertical ? top : 0;
  const Lw = vertical ? Math.max(1, H - under) : W;
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
  // ---- the effective length (c / 2f of the bore's note, from the engine), from its node above the
  // embouchure: its far node falls just past the first open hole (or among the vents of a
  // cross-fingered third-octave note), at most an end correction past the foot
  const Leff = focus ? focus.lengthM : 0;
  const xNear = FL_EMB - FL_EMB_CORR;
  const xFar = Math.min(FL_LEN + 0.006, xNear + Leff);

  /** the stage's frame into the flute's (it stands on a phone) */
  const place = (c2: CanvasRenderingContext2D) => {
    if (!vertical) return;
    c2.translate(W, 0);
    c2.rotate(Math.PI / 2);
    c2.translate(under, 0);
  };
  // ---- its shadow on the floor (kept: the tube, the lip plate and the keys as one silhouette)
  {
    const key = `${W}|${H}|${under}`;
    let sh = flShadows.get(key);
    if (sh === undefined) {
      const k = sc / 1934;
      const [a0, a1, v0, v1] = [X(0), X(FL_LEN), Y(-0.02), Y(0.024)];
      const box = vertical ? { x0: W - v1, x1: W - v0, y0: under + a0, y1: under + a1 } : { x0: a0, x1: a1, y0: v0, y1: v1 };
      sh = floorShadow(box, Math.max(2, 10 * k), 3 * k, 6 * k, (c2) => {
        place(c2);
        c2.fill(L.tube);
        c2.fill(L.plate);
        c2.fill(L.hinges);
        c2.fill(L.touches);
        c2.fill(L.rollers);
        for (const q of FL_KEYS) {
          c2.beginPath();
          c2.ellipse(X(q.x), Y(FL_YC * Math.sin(q.phi * D2R)), q.r * sc, q.r * sc * Math.abs(Math.cos(q.phi * D2R)), 0, 0, 2 * Math.PI);
          c2.fill();
        }
      });
      if (flShadows.size > 6) flShadows.clear();
      flShadows.set(key, sh);
    }
    if (sh) ctx.drawImage(sh.cv, sh.x, sh.y, sh.w, sh.h);
  }
  ctx.save();
  place(ctx);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- behind the tube: the thumb's key and the G♯ key on the player's side, their cups' edges
  // showing beyond the tube
  FL_KEYS.forEach((k, i) => {
    if (k.phi >= 0 || Math.cos(k.phi * D2R) > 0) return;
    drawFlCup(ctx, X(k.x), Y(FL_YC * Math.sin(k.phi * D2R)), k.r * sc, k.r * sc * Math.abs(Math.cos(k.phi * D2R)), k.style, keyPos[i]);
  });
  // ---- the tube: an opaque body, polished silver in daylight, lit from above the player's side (the lit
  // band, the body, the side in shade, the floor's light back along its underside), an edge on the plaster
  const g = ctx.createLinearGradient(0, Y(-0.0105), 0, Y(0.0105));
  g.addColorStop(0, '#b4bbc2');
  g.addColorStop(0.14, SILVER.lit);
  g.addColorStop(0.36, SILVER.body);
  g.addColorStop(0.66, SILVER.shade);
  g.addColorStop(0.88, '#b9c0c7');
  g.addColorStop(1, SILVER.deep);
  ctx.fillStyle = g;
  ctx.fill(L.tube);
  ctx.strokeStyle = 'rgba(95,104,114,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke(L.seams);
  // (polished: a line of light just inside its upper edge)
  ctx.save();
  ctx.translate(0, 1.7);
  ctx.strokeStyle = rgba(LIGHT, 0.7);
  ctx.stroke(L.rim);
  ctx.restore();
  ctx.strokeStyle = SILVER.edge;
  ctx.lineWidth = 1.1;
  ctx.stroke(L.tube);
  // ---- the bore's standing wave, inside the tube: compression in the blue, rarefaction in slate, nothing at
  // the nodes
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const ph = Math.cos(slowPhase(focus?.f1 ?? 440, now));
  const lvl = Math.min(1, peak / scale);
  if (focus && Leff > 0 && lvl > 0.02) {
    const xa = FL_CORK;
    const xb = Math.min(FL_LEN, xFar);
    // the envelope (where the air's pressure swings most: a wash of the blue at the antinodes, nothing
    // at the nodes) in a wide band, the swing itself (compression in the blue, rarefaction in slate) in
    // a narrower one
    // around the tube: the pressure's standing-wave envelope (|p| along the air column, pinched at
    // the nodes), quiet, as lobes above and below: where the air works hardest is readable at a glance
    {
      const Hm = Math.min(Cw * 0.14, 0.05 * sc) * Math.min(1, 0.35 + lvl);
      const M = 64;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(X(xNear), Y(sgn * FL_RB));
        for (let i = 0; i <= M; i++) {
          const x = xNear + ((xFar - xNear) * i) / M;
          const A = Math.min(1, Math.abs(boreAt(w.amp, (x - xNear) / Leff) / scale));
          ctx.lineTo(X(x), Y(sgn * FL_RB) + sgn * Hm * A);
        }
        ctx.lineTo(X(xFar), Y(sgn * FL_RB));
        ctx.closePath();
        ctx.fillStyle = rgba(INK.sound, 0.07 * lvl + 0.03);
        ctx.fill();
        ctx.strokeStyle = rgba(INK.sound, 0.16 + 0.22 * lvl);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    const ge = ctx.createLinearGradient(X(xa), 0, X(xb), 0);
    const gw = ctx.createLinearGradient(X(xa), 0, X(xb), 0);
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const x = xa + ((xb - xa) * i) / N;
      const A = boreAt(w.amp, (x - xNear) / Leff) / scale;
      ge.addColorStop(i / N, rgba(INK.sound, 0.2 * Math.min(1, Math.pow(Math.abs(A), 1.5))));
      gw.addColorStop(i / N, rgba(waveInk(A * ph), 0.46 * Math.min(1, Math.pow(Math.abs(A * ph), 1.15))));
    }
    // (laid over the silver, not added to it)
    for (const [h, gr] of [[0.8, ge], [0.42, gw]] as const) {
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.roundRect(X(xa), Y(-FL_BORE * h), (xb - xa) * sc, 2 * FL_BORE * h * sc, FL_BORE * h * sc);
      ctx.fill();
    }
  }
  // ---- the lip plate and the embouchure hole
  const gp = ctx.createLinearGradient(0, Y(-0.011), 0, Y(0.011));
  gp.addColorStop(0, '#c3c9cf');
  gp.addColorStop(0.2, SILVER.lit);
  gp.addColorStop(0.55, SILVER.body);
  gp.addColorStop(1, SILVER.shade);
  ctx.fillStyle = gp;
  ctx.fill(L.plate);
  ctx.strokeStyle = SILVER.edge;
  ctx.lineWidth = 1.1;
  ctx.stroke(L.plate);
  ctx.fillStyle = '#262c34';
  ctx.fill(L.hole);
  ctx.strokeStyle = SILVER.edge;
  ctx.stroke(L.hole);
  // ---- the mechanism, silver as the tube: rods, hinge tubes, the touches and rollers, the posts
  const rodW = Math.max(1, 0.0011 * sc);
  ctx.strokeStyle = SILVER.edge;
  ctx.lineWidth = rodW + 1.4;
  ctx.stroke(L.rods);
  ctx.stroke(L.levers);
  ctx.strokeStyle = SILVER.body;
  ctx.lineWidth = rodW;
  ctx.stroke(L.rods);
  ctx.stroke(L.levers);
  ctx.fillStyle = '#c9cfd5';
  ctx.fill(L.hinges);
  ctx.fill(L.touches);
  ctx.fill(L.rollers);
  ctx.strokeStyle = SILVER.edge;
  ctx.lineWidth = 1;
  ctx.stroke(L.hinges);
  ctx.stroke(L.touches);
  ctx.stroke(L.rollers);
  // (the light along the hinge tubes, the rod's line a little towards it)
  ctx.save();
  ctx.translate(0, -0.0007 * sc);
  ctx.strokeStyle = rgba(LIGHT, 0.85);
  ctx.lineWidth = Math.max(0.8, 0.0006 * sc);
  ctx.stroke(L.rods);
  ctx.restore();
  // ---- the keys, seated or open: each cup on its arm's neck from the hinge tube (a French cup's
  // pointed arm runs on over the cup to its hole)
  const seen = FL_KEYS.map((k, i) => ({ k, i, cphi: Math.cos(k.phi * D2R) })).filter((q) => q.cphi >= 0);
  const cupAt = (k: FlKey, cphi: number) => ({ cx: X(k.x), cy: Y(FL_YC * Math.sin(k.phi * D2R)), ry: k.r * sc * cphi, rod: Y(k.foot ? FL_FOOT_V : FL_ROD_V) });
  for (const { k, cphi } of seen) {
    const { cx, cy, ry, rod } = cupAt(k, cphi);
    flNeck(ctx, cx, cy + Math.sign(rod - cy) * ry * 0.82, rod, k.r * sc * 0.36, 0.0017 * sc);
    if (k.note === 73) flNeck(ctx, X(0.338), Y(0.0083 * 0.82), rod, 0.0083 * sc * 0.36, 0.0017 * sc);
  }
  for (const { k, i, cphi } of seen) {
    const { cx, cy, ry, rod } = cupAt(k, cphi);
    drawFlCup(ctx, cx, cy, k.r * sc, ry, k.style, keyPos[i]);
    // the first finger's cup on the C♯ key's lever (one piece with it)
    if (k.note === 73) drawFlCup(ctx, X(0.338), Y(0), 0.0083 * sc, 0.0083 * sc, 'dome', keyPos[i]);
    if (k.style === 'open') flArm(ctx, cx, cy + Math.sign(rod - cy) * ry * 0.98, cy + Math.sign(rod - cy) * 0.0045 * sc * cphi, 0.0016 * sc);
  }
  ctx.fillStyle = '#aeb5bc';
  ctx.fill(L.posts);
  ctx.strokeStyle = SILVER.edge;
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
    gj.addColorStop(0, rgba(INK.cool, 0));
    gj.addColorStop(0.35, rgba(INK.cool, 0.5 * a));
    gj.addColorStop(1, rgba(INK.cool, 0.75 * a));
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
      ctx.lineWidth = j === 0 ? 1.4 : 1;
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
    ctx.strokeStyle = rgba(INK.sound, 0.9 * Math.min(1, 3 * lvl));
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}
/** a key's cup from above: its rim and shoulder, the open cups' hole and grommet, the plain cups'
 *  pad washer; `p` 1 open (raised), 0 seated. Silver in daylight; a seated cup sits lower and is drawn in
 *  ink (a pad shut is a mechanical fact): a firm outline, its hole or its washer filled */
function drawFlCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, style: FlCup, p: number): void {
  const s = 0.965 + 0.035 * p;
  const shut = 1 - p;
  rx *= s;
  ry *= s;
  // the cup: polished silver, a bright crown towards the light (above the player's side), a skirt in shade
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
  const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
  g.addColorStop(0, SILVER.lit);
  g.addColorStop(0.45, SILVER.body);
  g.addColorStop(1, SILVER.shade);
  ctx.fillStyle = g;
  ctx.fill();
  if (shut > 0.01) {
    ctx.fillStyle = rgba(INK.line, 0.16 * shut);
    ctx.fill();
  }
  ctx.strokeStyle = shut > 0.5 ? rgba(INK.line, 0.6 + 0.4 * shut) : SILVER.edge;
  ctx.lineWidth = 1 + 0.9 * shut;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.78, ry * 0.78, 0, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(95,104,114,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (style === 'open') {
    // the hole through the cup, down the bore (a slate, in daylight); seated, a fingertip is on it: ink
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.35, ry * 0.35, 0, 0, 2 * Math.PI);
    ctx.fillStyle = '#6f7882';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.43, ry * 0.43, 0, 0, 2 * Math.PI);
    if (shut > 0.01) {
      ctx.fillStyle = rgba(INK.line, shut);
      ctx.fill();
    }
    ctx.strokeStyle = SILVER.edge;
    ctx.stroke();
  } else if (style !== 'dome') {
    // the pad washer's button
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.13, ry * 0.13, 0, 0, 2 * Math.PI);
    ctx.fillStyle = SILVER.body;
    ctx.fill();
    ctx.strokeStyle = SILVER.edge;
    ctx.stroke();
    if (shut > 0.01) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.3, ry * 0.3, 0, 0, 2 * Math.PI);
      ctx.fillStyle = rgba(INK.line, shut);
      ctx.fill();
    }
  } else if (shut > 0.01) {
    // (a domed cup has no washer to show: the same mark, on its crown)
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.3, ry * 0.3, 0, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(INK.line, shut);
    ctx.fill();
  }
}
/** a key's neck: from the cup's edge (at y0, half-width w0) narrowing to its hinge tube (y1, w1) */
function flNeck(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, w0: number, w1: number): void {
  const m = (y0 + y1) / 2;
  ctx.beginPath();
  ctx.moveTo(x - w0, y0);
  ctx.bezierCurveTo(x - w0 * 0.55, m, x - w1, m, x - w1, y1);
  ctx.lineTo(x + w1, y1);
  ctx.bezierCurveTo(x + w1, m, x + w0 * 0.55, m, x + w0, y0);
  ctx.closePath();
  ctx.fillStyle = '#bcc3ca';
  ctx.fill();
  ctx.strokeStyle = SILVER.edge;
  ctx.lineWidth = 0.9;
  ctx.stroke();
}
/** a key's arm: from its hinge tube (at y0) to its tip on the cup (y1), tapering */
function flArm(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, hw: number): void {
  ctx.beginPath();
  ctx.moveTo(x - hw * 0.55, y0);
  ctx.quadraticCurveTo(x - hw * 0.5, (y0 + y1) / 2, x, y1);
  ctx.quadraticCurveTo(x + hw * 0.5, (y0 + y1) / 2, x + hw * 0.55, y0);
  ctx.closePath();
  ctx.fillStyle = '#e4e7ea';
  ctx.fill();
  ctx.strokeStyle = SILVER.edge;
  ctx.lineWidth = 0.9;
  ctx.stroke();
}
