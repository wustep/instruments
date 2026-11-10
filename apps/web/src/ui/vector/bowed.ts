// The violin, viola and cello on the vector display (kit.ts): the same plan as stage-draw.ts's
// drawBowed (the same figures, the same layout, the same live state), drawn as its lines. Blue is the
// instrument: the plate's traced outline and f-holes, the fingerboard, head, pegs, tailpiece and
// bridge, the strings at rest, the bow. Amber is the sound: the body's modes as nodal lines on the
// plate, the ringing strings, the bowed string's Helmholtz shape and its travelling corner.
// The knobs' slots: the contact point (green) is a handle where the hair crosses the string; the
// bow force (red) a ring round it that grows with the force, and the hair's give under the string;
// the vibrato (pink) the finger's handle and the range it rocks over; the body's damping (white) the
// bass bar and soundpost that carry the bridge's motion into the plates.

import type { VisualFrame } from '@piano-model/engine';
import { BOWED_PLAN, HEAD_EAR, HEAD_PROJ, MM, PEG_A, PEG_OF, PEG_SIDE, bowedLayout, bowedShapes, bwClamp, bwForce, bwHeadParts, bwPegboxW, bwPlace, bwPoly, bwSstep, type BowedGeom, type BowedLayout, type BowedState } from '../stage-draw.ts';
import { SLOTS, V, beam, dot, handle, label, ring, seg, type Contours, type Pt } from './kit.ts';

const [GREEN, RED, PINK, WHITE] = SLOTS;

/** the still parts as paths (px, in the local frame bwPlace sets: x along the strings from the body's
 *  neck end, y towards the bass side) */
interface Statics {
  lay: BowedLayout;
  body: Path2D;
  /** the plate less its f-holes (even-odd), where the modes are drawn */
  plate: Path2D;
  holes: Path2D;
  board: Path2D;
  head: Path2D;
  scroll: Path2D;
  pegs: Path2D;
  tail: Path2D;
  bridge: Path2D;
  inside: Path2D;
  strings: Path2D;
}
const statics = new Map<string, Statics>();

function build(g: BowedGeom, W: number, H: number, scale?: number): Statics {
  const p = BOWED_PLAN[g.id];
  const sh = bowedShapes(g.id, p, g.L);
  const lay = bowedLayout(g, p, sh, W, H, scale);
  const sc = lay.sc;
  const X = (x: number) => x * sc;
  const B = p.body;
  const S = B / 0.356;
  const L = g.L;
  const xb = L - p.neck;
  const xn = -p.neck;
  const body = bwPoly(sh.body, sc);
  const holes = new Path2D();
  for (const f of sh.fholes) holes.addPath(bwPoly(f, sc));
  const plate = new Path2D();
  plate.addPath(body);
  plate.addPath(holes);

  // the fingerboard and the nut
  const fbEnd = xn + p.fbLen;
  const fbw = (x: number) => p.fbW[0] + ((p.fbW[1] - p.fbW[0]) * (x - xn)) / p.fbLen;
  const board = bwPoly([[xn, -fbw(xn) / 2], [fbEnd, -fbw(fbEnd) / 2], [fbEnd, fbw(fbEnd) / 2], [xn, fbw(xn) / 2]], sc);

  // the head, front view: the pegbox's cheeks running into the crown as one silhouette; the volutes
  // as ears either side, each turn winding in to its eye
  const Lh = p.head;
  const e = p.eyeW / 2;
  const hp = bwHeadParts(p);
  const HX = (a: number) => X(xn - a * Lh * HEAD_PROJ);
  const side: Pt[] = [...hp.box.filter(([a]) => a < 0.6), ...hp.crown];
  const head = new Path2D();
  side.forEach(([a, w], i) => (i ? head.lineTo(HX(a), X(w)) : head.moveTo(HX(a), X(w))));
  for (let i = side.length - 1; i >= 0; i--) head.lineTo(HX(side[i][0]), X(-side[i][1]));
  head.closePath();
  const scroll = new Path2D();
  for (const sg of [1, -1]) {
    const ew = sg * (HEAD_EAR.w + 0.1) * e;
    for (let j = 0; j <= 56; j++) {
      const th = (j / 56) * 2.6 * Math.PI;
      const r = HEAD_EAR.r * e * 1.05 * Math.exp(-0.3 * th);
      const a = HEAD_EAR.a + (Math.cos(th) * r) / (Lh * HEAD_PROJ);
      const w = ew + sg * Math.sin(th) * r;
      if (j) scroll.lineTo(HX(a), X(w));
      else scroll.moveTo(HX(a), X(w));
    }
  }
  // the pegbox's cavity between the cheeks
  const cheek = 4.2 * MM * S ** 0.85;
  const cav: Pt[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = 0.025 + (0.6 * k) / 16;
    cav.push([a, bwPegboxW(p, a) - cheek]);
  }
  cav.forEach(([a, w], i) => (i ? scroll.lineTo(HX(a), X(w)) : scroll.moveTo(HX(a), X(w))));
  const aT = 0.625;
  const wT = bwPegboxW(p, aT) - cheek;
  scroll.bezierCurveTo(HX(aT + 0.05), X(wT), HX(aT + 0.06), X(-wT), HX(aT), X(-wT));
  for (let k = 16; k >= 0; k--) scroll.lineTo(HX(cav[k][0]), X(-cav[k][1]));
  scroll.closePath();

  // pegs: the shaft across the box, the collar, the thumb-piece (a paddle, seen face on)
  const pegs = new Path2D();
  const sR = 0.0031 * S ** 0.6;
  for (let i = 0; i < 4; i++) {
    const a = PEG_A[PEG_OF[i]];
    const s = PEG_SIDE[i];
    const w0 = bwPegboxW(p, a);
    const ax = HX(a);
    const zc0 = w0 + 0.004 * S ** 0.6;
    const z0 = zc0 + 0.0058 * S ** 0.6;
    const hl = 0.021 * S ** 0.62;
    const hwid = 0.019 * S ** 0.62;
    pegs.moveTo(ax, X(-s * (w0 - cheek * 0.5)));
    pegs.lineTo(ax, X(s * zc0));
    pegs.rect(ax - 1.45 * sR * sc, X(s > 0 ? zc0 : -z0), 2.9 * sR * sc, X(z0 - zc0));
    const N = 18;
    const up: Pt[] = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const end = Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.55) / 0.45, 2.8)), 1 / 2.8);
      up.push([z0 + t * hl, 0.5 * hwid * (0.42 + 0.58 * bwSstep(0, 0.32, t)) * (0.94 + 0.06 * Math.sin(Math.PI * t)) * end]);
    }
    up.forEach(([z, a0], k) => (k ? pegs.lineTo(ax - X(a0), X(s * z)) : pegs.moveTo(ax - X(a0), X(s * z))));
    for (let k = N; k >= 0; k--) pegs.lineTo(ax + X(up[k][1]), X(s * up[k][0]));
    pegs.closePath();
  }

  // the tailpiece (broad at its fret, waisted towards the tail), saddle, tailgut, the end button or
  // the cello's endpin
  const tail = new Path2D();
  const tpTop = xb + L / 6;
  const tpEnd = B - 0.012 * S;
  const wTop = p.spreadB * 3.7;
  const wBot = p.spreadB * 1.55;
  const tpW = (s: number) => {
    const w = wBot + (wTop - wBot) * Math.pow(1 - s, 1.35);
    const round = s < 0.06 ? Math.sqrt(Math.max(0, 1 - ((0.06 - s) / 0.06) ** 2)) : 1;
    return w * (0.75 + 0.25 * round);
  };
  const NT = 30;
  for (let k = 0; k <= NT; k++) {
    const s = k / NT;
    const x = X(tpTop + s * (tpEnd - tpTop));
    if (k) tail.lineTo(x, X(-tpW(s) / 2));
    else tail.moveTo(x, X(-tpW(s) / 2));
  }
  for (let k = NT; k >= 0; k--) tail.lineTo(X(tpTop + (k / NT) * (tpEnd - tpTop)), X(tpW(k / NT) / 2));
  tail.closePath();
  const xf = tpTop + 0.008 * S ** 0.7;
  tail.moveTo(X(xf), X(-wTop * 0.43));
  tail.lineTo(X(xf), X(wTop * 0.43));
  const sadX = B - 0.006 * S;
  const sadW = 0.034 * S ** 0.8;
  tail.rect(X(sadX - 0.0035 * S ** 0.6), X(-sadW / 2), X(0.007 * S ** 0.6), X(sadW));
  for (const sg of [-1, 1]) {
    tail.moveTo(X(tpEnd), X(sg * 0.0035 * S ** 0.7));
    tail.lineTo(X(B + 0.003 * S), X(sg * 0.0015 * S));
  }
  if (g.id === 'cello') {
    const sock: Pt[] = [[0, 0.0175], [0.004, 0.019], [0.012, 0.017], [0.016, 0.0185], [0.022, 0.0185], [0.028, 0.012], [0.042, 0.009], [0.044, 0.0105], [0.05, 0.0105]];
    sock.forEach(([d, r], i) => (i ? tail.lineTo(X(B + d), X(-r)) : tail.moveTo(X(B + d), X(-r))));
    for (let i = sock.length - 1; i >= 0; i--) tail.lineTo(X(B + sock[i][0]), X(sock[i][1]));
    tail.closePath();
    // the steel rod, on towards the floor
    const rod = 0.32;
    tail.moveTo(X(B + 0.05), X(-0.0048));
    tail.lineTo(X(B + 0.05 + rod), X(-0.0048));
    tail.lineTo(X(B + 0.05 + rod + 0.012), 0);
    tail.lineTo(X(B + 0.05 + rod), X(0.0048));
    tail.lineTo(X(B + 0.05), X(0.0048));
  } else {
    tail.moveTo(X(B + 0.0035 * S + 0.004 * S), 0);
    tail.ellipse(X(B + 0.0035 * S), 0, X(0.004 * S), X(0.0052 * S), 0, 0, Math.PI * 2);
  }

  // the bridge from above: its top edge across the strings, a foot at each end
  const bridge = new Path2D();
  const bW = p.bridgeW;
  const foot = 0.0042 * S ** 0.7;
  const footL = 0.0105 * S ** 0.8;
  bridge.moveTo(X(xb), X(-bW * 0.44));
  bridge.lineTo(X(xb), X(bW * 0.44));
  for (const sg of [-1, 1]) bridge.rect(X(xb - foot / 2), X(sg > 0 ? bW / 2 - footL : -bW / 2), X(foot), X(footL));

  // inside, seen as through the top: the bass bar under the bass foot, the soundpost behind the
  // treble foot (Strobel's figures, as stage-draw.ts)
  const inside = new Path2D();
  const zBar = 0.4 * p.bridgeW;
  const xBar = (B - p.bar[1]) / 2;
  for (const sg of [-1, 1]) {
    inside.moveTo(X(xBar), X(zBar - 0.002 * S + (sg * p.bar[0]) / 2));
    inside.quadraticCurveTo(X(B / 2), X(zBar + (sg * p.bar[0]) / 2), X(xBar + p.bar[1]), X(zBar + 0.0015 * S + (sg * p.bar[0]) / 2));
  }
  const px = X(xb + 0.003 * S);
  const pz = X(-(p.bridgeW / 2 - 0.0045 * S));
  const pr = Math.max(2, (p.post / 2) * sc);
  inside.moveTo(px + pr, pz);
  inside.arc(px, pz, pr, 0, Math.PI * 2);

  // the strings at rest: nut to bridge, on to the tailpiece, and back into the pegbox to their pegs
  const strings = new Path2D();
  const tailEnd = (i: number): Pt => [tpTop + 0.012 * S ** 0.7 + (i === 3 ? 0.012 * S ** 0.7 : 0), (1.5 - i) * p.spreadB * 0.62];
  for (let i = 0; i < 4; i++) {
    const a = PEG_A[PEG_OF[i]];
    const wIn = bwPegboxW(p, a) - cheek;
    strings.moveTo(HX(a), X(bwClamp((1.5 - i) * p.spreadN * 1.3, -wIn * 0.6, wIn * 0.6)));
    strings.lineTo(X(xn), X((1.5 - i) * p.spreadN));
    strings.lineTo(X(xb), X((1.5 - i) * p.spreadB));
    const [tx, tz] = tailEnd(i);
    strings.lineTo(X(tx), X(tz));
  }
  // the nut
  board.moveTo(X(xn), X(-fbw(xn) * 0.51));
  board.lineTo(X(xn), X(fbw(xn) * 0.51));
  return { lay, body, plate, holes, board, head, scroll, pegs, tail, bridge, inside, strings };
}

/** (`bowLater` and `scale`, as the stage's own drawBowed: the bow is handed back, to be drawn with no
 *  clip after every instrument of an ensemble, all drawn at the ensemble's one scale) */
export function drawBowedV(ctx: CanvasRenderingContext2D, W: number, H: number, g: BowedGeom, fr: VisualFrame | null, st: BowedState, field: Contours, now: number, bowLater = false, scale?: number): (() => void) | null {
  const p = BOWED_PLAN[g.id];
  const sh = bowedShapes(g.id, p, g.L);
  const key = `${g.id}|${g.L}|${W}|${H}|${scale ?? ''}`;
  let s = statics.get(key);
  if (!s) {
    s = build(g, W, H, scale);
    statics.set(key, s);
    for (const k of statics.keys()) {
      if (statics.size <= 8) break;
      statics.delete(k);
    }
  }
  const { sc } = s.lay;
  const B = p.body;
  const L = g.L;
  const xb = L - p.neck;
  const xn = -p.neck;
  const X = (x: number) => x * sc;
  // (small in an ensemble's cell: the fine parts are left out and the lines drawn finer)
  const small = sc * B < 150;
  const lw = small ? 0.8 : 1;
  const zAt = (i: number, x: number) => (1.5 - i) * (p.spreadN + ((p.spreadB - p.spreadN) * (x - xn)) / L);

  // between frames (the same state the stage's own drawing keeps, so the two styles can swap mid-note)
  let lv = st.live;
  if (!lv || lv.id !== g.id) lv = st.live = { id: g.id, t: 0, cx: xb - 0.1 * L, cz: zAt(1.5, xb), incl: 0, lift: 1, bi: 1, beta: 0.1, fx: [0, 0, 0, 0], fa: [0, 0, 0, 0], vlo: [0, 0, 0, 0], vhi: [0, 0, 0, 0], env: new Float32Array(0) };
  const dt = lv.t ? bwClamp((now - lv.t) / 1000, 0, 0.1) : 0;
  lv.t = now;
  const ease = (tau: number) => (dt > 0 ? 1 - Math.exp(-dt / tau) : 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  const base = ctx.getTransform();
  bwPlace(ctx, s.lay);

  // ---- the body's modes: nodal lines on the plate, out of the f-holes
  const lvl = field.update(fr?.modes ?? null, now / 1000);
  if (lvl > 0.02) {
    ctx.save();
    ctx.clip(s.plate, 'evenodd');
    field.draw(ctx, 0, X(-sh.hwMax), X(B), X(2 * sh.hwMax), small ? 0.8 : 1);
    ctx.restore();
  }
  // the bass bar and soundpost (white: the body's damping), warming with the body's level
  if (!small) beam(ctx, s.inside, WHITE, 0.9, { alpha: 0.22 + 0.5 * lvl, dash: [2, 3] });

  // ---- the instrument
  beam(ctx, s.board, V.blueMid, 0.9 * lw, { alpha: 0.75 });
  beam(ctx, s.tail, V.blueMid, 0.9 * lw, { alpha: 0.85 });
  beam(ctx, s.pegs, V.blueMid, 0.9 * lw, { alpha: 0.9 });
  if (!small) beam(ctx, s.scroll, V.blueMid, 0.8, { alpha: 0.8 });
  beam(ctx, s.head, V.blue, 1.3 * lw);
  beam(ctx, s.holes, V.blue, 1.1 * lw);
  beam(ctx, s.body, V.blue, 1.7 * lw, { hot: true });
  beam(ctx, s.strings, V.blueMid, 0.8 * lw, { alpha: 0.8 });
  beam(ctx, s.bridge, V.blue, 1.4 * lw, { hot: true });

  // ---- the strings as they sound, the fingers, the bowed string's shape
  const strs = fr?.strings;
  const focus = fr?.focus ?? null;
  const bowedIdx = strs ? strs.findIndex((q) => q.bowing) : -1;
  let mxl = 0;
  if (strs) for (const q of strs) mxl = Math.max(mxl, q.level);
  const norm = st.lvlScale.of(mxl);
  const fingerX: number[] = [xn, xn, xn, xn];
  for (let i = 0; i < 4; i++) {
    const q = strs?.[i];
    // the finger: its place eased so a shift slides (τ 35 ms) while vibrato goes straight through,
    // drawn four times larger than life (as the stage's own drawing)
    const stopped = !!q && q.stop < 0.995;
    const at = q ? xb - q.stop * L : xn;
    if (stopped) {
      if (lv.fa[i] < 0.05) lv.fx[i] = at;
      else lv.fx[i] += (at - lv.fx[i]) * ease(0.035);
    }
    lv.fa[i] += ((stopped ? 1 : 0) - lv.fa[i]) * ease(stopped ? 0.03 : 0.09);
    const dev = q && stopped ? -(q.stopNow ?? q.stop) * L + q.stop * L : 0;
    const decay = Math.exp(-dt / 0.45);
    lv.vlo[i] = Math.min(4 * dev, lv.vlo[i] * decay);
    lv.vhi[i] = Math.max(4 * dev, lv.vhi[i] * decay);
    fingerX[i] = lv.fa[i] > 0.02 ? lv.fx[i] + 4 * dev : xn;
    const l = q ? Math.sqrt(q.level / norm) : 0;
    // a ringing string, lit between its finger and the bridge (the bowed one shows its shape instead)
    if (l > 0.03 && !(focus && i === bowedIdx)) {
      const x0 = Math.max(xn, fingerX[i]);
      seg(ctx, X(x0), X(zAt(i, x0)), X(xb), X(zAt(i, xb)), V.amber, 1.5 * lw, { alpha: 0.25 + 0.75 * l, hot: l > 0.6 });
    }
  }
  // the fingers (pink: the vibrato rocks them): a handle on the string, the range it rocks over
  for (let i = 0; i < 4; i++) {
    const a = lv.fa[i];
    if (a < 0.02) continue;
    const lit = strs?.[i]?.bowing ? 1 : 0.55;
    const x = fingerX[i];
    const z = zAt(i, x);
    if (lv.vhi[i] - lv.vlo[i] > 0.0004) {
      const zr = X(z) + (small ? 7 : 11);
      seg(ctx, X(lv.fx[i] + lv.vlo[i]), zr, X(lv.fx[i] + lv.vhi[i]), zr, PINK, 1.2, { alpha: 0.8 * a * lit });
      for (const e of [lv.vlo[i], lv.vhi[i]]) seg(ctx, X(lv.fx[i] + e), zr - 3, X(lv.fx[i] + e), zr + 3, PINK, 1.2, { alpha: 0.8 * a * lit });
    }
    handle(ctx, X(x), X(z), PINK, small ? 3.5 : 5.5, a * lit);
  }
  // the bowed string's Helmholtz motion (sideways, in the bowing direction): the envelope it has
  // swept lately, its shape now, and the travelling corner
  if (focus && bowedIdx >= 0 && focus.shapes[0]) {
    const shp = focus.shapes[0];
    const n = shp.length;
    const x0 = Math.max(xn, fingerX[bowedIdx]);
    let m = 0;
    for (let k = 0; k < n; k++) m = Math.max(m, Math.abs(shp[k]));
    const scale = st.strScale.of(m);
    const amp = (0.9 * p.spreadB) / scale;
    if (lv.env.length !== n) lv.env = new Float32Array(n);
    const decay = Math.exp(-dt / 0.3);
    for (let k = 0; k < n; k++) lv.env[k] = Math.max(Math.abs(shp[k]) / scale, lv.env[k] * decay);
    const xk = (k: number) => x0 + (k / (n - 1)) * (xb - x0);
    ctx.beginPath();
    for (let k = 0; k < n; k++) ctx.lineTo(X(xk(k)), X(zAt(bowedIdx, xk(k)) - lv.env[k] * 0.9 * p.spreadB));
    for (let k = n - 1; k >= 0; k--) ctx.lineTo(X(xk(k)), X(zAt(bowedIdx, xk(k)) + lv.env[k] * 0.9 * p.spreadB));
    ctx.closePath();
    beam(ctx, null, V.amber, 0.8, { alpha: 0.45 });
    let kc = 1;
    let best = -1;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      if (k > 0 && k < n - 1) {
        const d2 = Math.abs(shp[k - 1] - 2 * shp[k] + shp[k + 1]);
        if (d2 > best) {
          best = d2;
          kc = k;
        }
      }
      ctx.lineTo(X(xk(k)), X(zAt(bowedIdx, xk(k)) - shp[k] * amp));
    }
    beam(ctx, null, V.amber, 1.8 * lw, { hot: true });
    const cxk = xk(kc);
    const czk = zAt(bowedIdx, cxk) - shp[kc] * amp;
    ring(ctx, X(cxk), X(czk), small ? 3 : 4.5, V.amber, 1.1);
    dot(ctx, X(cxk), X(czk), 1.8, '#fff8ec');
  }

  // ---- the bow (its pose as the stage's own drawing: stage-draw.ts has the sources)
  const bow = fr?.bow;
  const playing = bowedIdx >= 0;
  if (playing) {
    lv.bi = bowedIdx;
    if (focus) lv.beta = bwClamp(1 - focus.hammerAt, 0.02, 0.45);
  }
  const sb = strs?.[lv.bi];
  const cxT = xb - lv.beta * (sb ? (sb.stopNow ?? sb.stop) : 1) * L;
  const czT = zAt(lv.bi, cxT);
  const inclT = Math.atan(((1.5 - lv.bi) * p.spreadB) / p.bridgeR);
  const snap = playing && lv.lift > 0.9;
  lv.cx += (cxT - lv.cx) * (snap ? 1 : ease(0.05));
  lv.cz += (czT - lv.cz) * (snap ? 1 : ease(0.06));
  lv.incl += (inclT - lv.incl) * (snap ? 1 : ease(0.06));
  lv.lift += ((playing ? 0 : 1) - lv.lift) * ease(0.15);
  const Hh = g.bowLength;
  const S2 = Hh / 0.65;
  const pos = bow ? bwClamp(bow.pos, 0, 1) : 0.5;
  const ci = Math.cos(lv.incl);
  const tilt = Math.sin(0.7);
  const tiltC = Math.cos(0.7);
  const hgt = (q: number) => 0.0175 * S2 - 0.0095 * S2 * Math.sin(Math.PI * bwClamp(q / Hh, 0, 1)) + 0.004 * S2 * bwSstep(0.94, 1.01, q / Hh);
  const Zs = (q: number) => lv.cz + (pos * Hh - q) * ci;
  const { ox, oy, vertical } = s.lay;
  /** local (x along the strings, z across) to the stage, as bwPlace turns it */
  const P = (x: number, z: number): Pt => (vertical ? [ox - X(z), oy + X(x)] : [ox + X(x), oy + X(z)]);
  {
    const [fx, fy] = P(lv.cx, Zs(0));
    const [tx, ty] = P(lv.cx, Zs(Hh));
    st.bowLine = { fx, fy, tx, ty, pos };
  }
  // the hair gives under the string: δ = F·a·(H − a)/(T·H) for hair tension T ≈ 60 N, drawn 3× larger
  const F = bwForce(fr?.excite?.meta);
  const s0 = 0.003 * S2;
  const s1 = Hh - 0.002 * S2;
  const ac = bwClamp(pos * Hh, s0 + 1e-4, s1 - 1e-4);
  const d0 = playing ? Math.min(0.6 * p.hairW, (3 * F * ac * (Hh - ac)) / (60 * Hh)) : 0;
  const defl = (q: number) => (q <= ac ? (d0 * q) / Math.max(1e-6, ac) : (d0 * (Hh - q)) / Math.max(1e-6, Hh - ac));
  const Xh = (q: number, h: number) => X(lv.cx - h * tilt - defl(bwClamp(q, 0, Hh)));
  /** the bow, the contact, which way it goes and its two readings (in the local frame bwPlace sets) */
  const drawBow = () => {
    const up = 1 - 0.6 * lv.lift;
    // the hair: a ribbon, its two edges (red while it bends under the bow's force)
    const hw = (p.hairW * tiltC) / 2;
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      for (const q of [s0, ac, s1]) ctx.lineTo(Xh(q, 0) + sg * X(hw), X(Zs(q)));
      beam(ctx, null, playing ? RED : V.blueMid, 0.9 * lw, { alpha: (playing ? 0.85 : 0.7) * up });
    }
    // the stick, round and tapering (Tourte's taper), seen beside the hair as the player tilts it
    const sBack = -0.085 * S2;
    const sHead = Hh + 0.006 * S2;
    const dia = (q: number) => {
      const t = bwClamp((q - (sBack + 0.11 * S2)) / (sHead - sBack - 0.11 * S2), 0, 1);
      return p.stick[0] * Math.pow(p.stick[1] / p.stick[0], Math.pow(t, 1.2));
    };
    const NS = 28;
    ctx.beginPath();
    for (let k = 0; k <= NS; k++) {
      const q = sBack + ((sHead - sBack) * k) / NS;
      const x = X(lv.cx - hgt(q) * tilt) - X(dia(q) / 2);
      if (k) ctx.lineTo(x, X(Zs(q)));
      else ctx.moveTo(x, X(Zs(q)));
    }
    for (let k = NS; k >= 0; k--) {
      const q = sBack + ((sHead - sBack) * k) / NS;
      ctx.lineTo(X(lv.cx - hgt(q) * tilt) + X(dia(q) / 2), X(Zs(q)));
    }
    ctx.closePath();
    beam(ctx, null, V.blue, 1.1 * lw, { alpha: up });
    // the head and the frog: their side profiles (s along the bow, h above the hair), seen from above
    const proj = (pts: Pt[]) => pts.map(([q, h]): Pt => [X(lv.cx - h * tilt), X(Zs(q))]);
    const outline = (pts: Pt[]) => {
      ctx.beginPath();
      proj(pts).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      beam(ctx, null, V.blue, 1 * lw, { alpha: up });
    };
    const hTop = hgt(Hh + 0.006 * S2) + 0.003 * S2;
    outline([[Hh - 0.004 * S2, 0.0035 * S2], [Hh, -0.0012], [Hh + 0.0085 * S2, -0.0015], [Hh + 0.0105 * S2, 0.004 * S2], [Hh + 0.0095 * S2, 0.0125 * S2], [Hh + 0.006 * S2, hTop], [Hh - 0.006 * S2, hgt(Hh - 0.006 * S2) + 0.4 * p.stick[1]]]);
    const fl = 0.047 * S2;
    const top = hgt(-0.02 * S2) - 0.003;
    outline([[0.002 * S2, -0.0025], [-fl + 0.004 * S2, -0.0028], [-fl, 0.004 * S2], [-fl + 0.003 * S2, top - 0.001 * S2], [-fl + 0.012 * S2, top], [-0.004 * S2, top], [0, 0.006 * S2]]);

    // ---- the contact: the handle where hair meets string (green: the contact point), the ring round it
    //      by the bow's force (red), and which way the bow goes
    const gx = X(lv.cx);
    const gz = X(lv.cz);
    handle(ctx, gx, gz, GREEN, small ? 4 : 7, up);
    let rc = 0;
    if (playing && bow) {
      const v = Math.abs(bow.speed);
      rc = Math.max(small ? 6 : 10, X(p.spreadB) * (0.5 + 0.7 * Math.min(1.5, Math.sqrt(F / 0.5)))) + 4;
      ring(ctx, gx, gz, rc, RED, 1.2, { alpha: 0.9 });
      if (!bow.changing && v > 0.02) {
        // down-bow draws the frog away from the strings (towards the player)
        const d = bow.dir > 0 ? 1 : -1;
        const zc = gz + d * (rc + 14);
        ctx.beginPath();
        ctx.moveTo(gx - 4.5, zc - d * 4);
        ctx.lineTo(gx, zc);
        ctx.lineTo(gx + 4.5, zc - d * 4);
        beam(ctx, null, V.blue, 1.5, { alpha: Math.min(1, 0.4 + v), hot: true });
      }
    }
    // ---- the two readings beside the contact, upright on the stage: where on the string (β, the
    //      distance from the bridge as a fraction of the sounding length) and how hard (N)
    ctx.setTransform(base);
    if (!small && playing) {
      // (beside the bow where it leaves the plate on the treble side, clear of the strings and f-holes)
      const [sx, sy] = P(lv.cx, -sh.hwMax);
      // (never off the top of the stage; in an ensemble, its box the instrument's own, in the aisle its
      // bow keeps clear of the next instrument)
      const [x, y] = vertical ? [bowLater && !scale ? Math.min(sx + 10, W - 30) : sx + 10, sy - 10] : [sx + 12, scale ? sy - 12 : Math.max(34, sy - 12)];
      label(ctx, lv.beta.toFixed(3), x, y, { color: GREEN, size: 11 });
      label(ctx, `${F.toFixed(2)} N`, x, y - 15, { color: RED, size: 11 });
    }
  };
  if (!bowLater) {
    drawBow();
    ctx.restore();
    return null;
  }
  ctx.restore();
  const lay = s.lay;
  return () => {
    ctx.save();
    ctx.setTransform(base);
    bwPlace(ctx, lay);
    drawBow();
    ctx.restore();
  };
}
