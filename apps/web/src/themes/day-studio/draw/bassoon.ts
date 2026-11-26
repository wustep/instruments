// Day Studio: the bassoon on the 2D stage, maple and nickel silver in daylight. Its layout and live state
// are the shared drawer's (ui/bassoon-draw.ts).
import type { VisualFrame } from '@piano-model/engine';
import { bassoonLayout, bassoonLive, type BassoonState, BOOT_RING_HW, boreD, boreHU, borePx, BS_BORE, BS_H, BS_KEYS, BS_TOUCHES, bsFrame, type BsLayout, bsRecord, LEGS, R_WCAP, reedEyePath, U_HI, U_L, U_LO, U_W, waveInk } from '../../../ui/bassoon-draw.ts';
import { INK, rgba } from '../../../ui/stage-draw.ts';
import { breathStream, LIGHT } from './kit.ts';

// ---------------------------------------------------------------- the classic drawing
// In daylight the bassoon is an object on pale plaster, lit by a window up and to the left of the screen:
// its maple a deep red varnish, its nickel silver bright with a shade side and an edge that stands it off
// the ground (the bocal above all, a thin tube on the plaster), one soft shadow on the floor. What sounds
// is the one blue (the bore's pressure, the reed's blades); what a finger holds is graphite ink (a touch,
// a hole or a ring under its fingertip, a pad moved off its rest), and through the dark wood, where ink
// cannot show, a firm light line.
/** nickel silver in daylight: lit, body, shade, and (r,g,b) the edge that stands it off the plaster */
const AG_LIT = '#f6f7f8';
const AG_BODY = '#d3d8dd';
const AG_SHADE = '#98a1aa';
const AG_EDGE = '95,104,114';

/** how the daylight falls in the lying frame: the lit side across a tube is −u both ways up (lying: up;
 *  standing, the bell up: the screen's left); (`cx`, `cy`) the way a shadow falls (the screen's down and a
 *  little to its right), `hx` the way along h that is the screen's up or left (a dome's highlight); `hair`
 *  the width of a hairline (1 px on a stage; thinner on an orchestra's small bassoon, which is its wood
 *  and not its keys' outlines) */
interface Light {
  cx: number;
  cy: number;
  hx: number;
  hair: number;
}
const LYING: Light = { cx: 0.5, cy: 0.86, hx: -1, hair: 1 };
const STANDING: Light = { cx: -0.86, cy: 0.5, hx: 1, hair: 1 };

/** what daylight adds to a layout, made once with it: the floor's shadow (a blurred picture, drawn each
 *  frame as an image), the dark wood a line through it is light on, and the pale parts along the long joint
 *  (the bell's ring and lip) where it is not */
interface Day {
  wood: Path2D;
  pale: Path2D;
  cast: { cv: HTMLCanvasElement; x: number; y: number; w: number; h: number } | null;
  s: number;
}
const days = new WeakMap<BsLayout, Day>();
/** (shadows are kept up to 6 megapixels in all, a dozen at most: a window dragged wider leaves no trail of
 *  canvases, and an orchestra's small ones all stay) */
const kept: { L: BsLayout; px: number }[] = [];
function keep(L: BsLayout, px: number): void {
  const i = kept.findIndex((k) => k.L === L);
  if (i >= 0) kept.splice(i, 1);
  kept.push({ L, px });
  let sum = kept.reduce((a, k) => a + k.px, 0);
  while ((sum > 6e6 || kept.length > 12) && kept.length > 1) {
    const old = kept.shift()!;
    sum -= old.px;
    days.delete(old.L);
  }
}
/** the canvas px to one of the box's a context draws at (2 at most: a shadow is soft) */
const castScale = (ctx: CanvasRenderingContext2D): number => {
  const t = ctx.getTransform?.();
  return t ? Math.min(2, Math.max(1, Math.round(Math.hypot(t.a, t.b) * 4) / 4)) : 1;
};
/** The bassoon's one shadow on the floor: its silhouette (the joints, the bocal and the reed, the hand
 *  rest, the touches) blurred, down and a little to the right on the screen whichever way the bassoon
 *  lies, in proportion to its size (on a computer's stage: a blur of 13 px, 4 px across and 7 down). In the
 *  lying frame, `s` canvas px to one of the box's. */
function bsDay(L: BsLayout, s: number): Day {
  const hit = days.get(L);
  if (hit && hit.s === s) return hit;
  const wood = new Path2D();
  for (const p of [L.boot, L.long, L.wing]) wood.addPath(p);
  const pale = new Path2D();
  pale.addPath(L.bellRing);
  pale.addPath(L.lip);
  const day: Day = { wood, pale, cast: null, s };
  if (typeof document !== 'undefined') {
    const { sc } = L;
    const light = L.vertical ? STANDING : LYING;
    const blur = Math.max(1.5, 0.014 * sc);
    const far = Math.max(1.2, 0.009 * sc);
    const m = Math.ceil(2 * blur + far) + 2;
    const x = Math.floor(L.x0 - m);
    const y = Math.floor(L.c + (U_LO - 0.006) * sc - m);
    const w = Math.ceil(L.x0 + (BS_H + 0.006) * sc + m) - x;
    const h = Math.ceil(L.c + (U_HI + 0.004) * sc + m) - y;
    const mk = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * s));
      cv.height = Math.max(1, Math.round(h * s));
      return cv;
    };
    const sil = mk();
    const cv = mk();
    const a = sil.getContext('2d');
    const b = cv.getContext('2d');
    if (a && b) {
      a.setTransform(s, 0, 0, s, -x * s, -y * s);
      a.fillStyle = '#000';
      const parts = [L.boot, L.bootRing, L.cap, L.long, L.mouth, L.wing, L.wingCap, L.bocal, L.blades, L.thread, L.rest, L.restStem];
      for (const p of [...parts, ...L.touches.filter((_, i) => !BS_TOUCHES[i].back)]) a.fill(p);
      b.shadowColor = 'rgba(28,34,42,0.32)';
      b.shadowBlur = blur * s;
      b.shadowOffsetX = far * light.cx * s;
      b.shadowOffsetY = far * light.cy * s;
      b.drawImage(sil, 0, 0);
      // (the silhouette itself out again: the shadow alone is kept)
      b.shadowColor = 'transparent';
      b.globalCompositeOperation = 'destination-out';
      b.drawImage(sil, 0, 0);
      day.cast = { cv, x, y, w, h };
    }
  }
  days.set(L, day);
  keep(L, day.cast ? day.cast.cv.width * day.cast.cv.height : 0);
  return day;
}

/** The bassoon from the front: the boot with its silver ring and cap, the wing joint and its ridge, the
 *  long joint and the bell, flamed maple; the bocal and the reed, its opening following the engine's reed
 *  (drawn slowed); the keys closing for the engine's note by the chart (each on a spring), the thumbs'
 *  faint through the wood; and the bore's standing wave in blue along the folded bore from the reed to
 *  where it leaves the tube, its envelope beside each leg. `top`: the file player's px over the box's top. */
export function drawBassoon(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: BassoonState, top = 0): void {
  const L = bassoonLayout(W, H, top);
  const { sc, Hm } = L;
  const X = (h: number) => L.x0 + h * sc;
  const Y = (u: number) => L.c + u * sc;
  const now = performance.now();
  const lv = bassoonLive(fr, st, now);
  const { lvl, ph, end, keyPos } = lv;
  const day = bsDay(L, castScale(ctx));
  const hair = Math.min(1, sc / 400);
  const light: Light = { ...(L.vertical ? STANDING : LYING), hair };
  ctx.save();
  bsFrame(ctx, L);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- on the floor: its shadow
  const cast = day.cast;
  if (cast) ctx.drawImage(cast.cv, cast.x, cast.y, cast.w, cast.h);
  // ---- behind the bassoon: the pressure's envelope beside each leg, pinched at the nodes
  if (lv.sounding) {
    const hm = Hm * Math.min(1, 0.35 + lvl);
    for (const g of LEGS) {
      const b = Math.min(end, g.b);
      if (b <= g.a) continue;
      const M = Math.max(8, Math.round(((b - g.a) / 2.6) * 120));
      ctx.beginPath();
      const [ha] = boreHU(g.a);
      const A0 = Math.min(1, Math.abs(lv.ampAt(g.a))) * hm;
      ctx.moveTo(X(ha), Y(g.base));
      ctx.lineTo(X(ha), Y(g.base) + g.sgn * A0);
      for (let i = 0; i <= M; i++) {
        const x = g.a + ((b - g.a) * i) / M;
        const [h] = boreHU(x);
        ctx.lineTo(X(h), Y(g.base) + g.sgn * hm * Math.min(1, Math.abs(lv.ampAt(x))));
      }
      const [hb] = boreHU(b);
      ctx.lineTo(X(hb), Y(g.base));
      ctx.closePath();
      ctx.fillStyle = rgba(INK.sound, 0.09 + 0.07 * lvl);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.sound, 0.3 + 0.3 * lvl);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // ---- the wood: the long joint and bell first, the boot, then the wing over the long joint (the red
  // varnish a little up from the night's, lit along the side towards the window)
  const woodGrad = (u0: number, r: number) => {
    const g = ctx.createLinearGradient(0, Y(u0 - r), 0, Y(u0 + r));
    g.addColorStop(0, '#2b0d08');
    g.addColorStop(0.22, '#62231a');
    g.addColorStop(0.5, '#45170f');
    g.addColorStop(1, '#1b0705');
    return g;
  };
  ctx.fillStyle = woodGrad(U_L, 0.026);
  ctx.fill(L.long);
  ctx.fillStyle = woodGrad(0, 0.037);
  ctx.fill(L.boot);
  // (the wing's shadow on the long joint beside it)
  ctx.fillStyle = 'rgba(24,28,34,0.46)';
  ctx.fill(L.ridgeShadow);
  ctx.fillStyle = woodGrad(U_W + 0.012, 0.0265);
  ctx.fill(L.wing);
  ctx.strokeStyle = 'rgba(176,82,52,0.2)';
  ctx.lineWidth = Math.max(0.6, 0.00055 * sc);
  ctx.stroke(L.flame);
  ctx.strokeStyle = 'rgba(30,8,4,0.35)';
  ctx.lineWidth = 0.7;
  ctx.stroke(L.grain);
  ctx.fillStyle = 'rgba(255,224,204,0.08)';
  ctx.fill(L.sheen);
  ctx.fillStyle = 'rgba(255,232,214,0.19)';
  ctx.fill(L.spec);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill(L.shade);
  ctx.strokeStyle = 'rgba(255,226,206,0.24)';
  ctx.lineWidth = Math.max(0.8, 0.0007 * sc);
  ctx.stroke(L.ridge);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke(L.wing);
  // the hand rest (dark rosewood on its stem), the bell's pale lip
  ctx.fillStyle = metalGrad(ctx, Y(-0.036), Y(-0.032));
  ctx.fill(L.restStem);
  ctx.strokeStyle = rgba(AG_EDGE, 0.9);
  ctx.lineWidth = 0.9 * hair;
  ctx.stroke(L.restStem);
  const gr = ctx.createLinearGradient(0, Y(-0.058), 0, Y(-0.036));
  gr.addColorStop(0, '#6a3420');
  gr.addColorStop(0.35, '#34170d');
  gr.addColorStop(1, '#160906');
  ctx.fillStyle = gr;
  ctx.fill(L.rest);
  ctx.strokeStyle = rgba(INK.line, 0.5);
  ctx.lineWidth = hair;
  ctx.stroke(L.rest);
  const gl = ctx.createLinearGradient(0, Y(U_L - 0.027), 0, Y(U_L + 0.027));
  gl.addColorStop(0, '#b3aa9a');
  gl.addColorStop(0.25, '#f4eddc');
  gl.addColorStop(0.6, '#cdc3ae');
  gl.addColorStop(1, '#7d766a');
  ctx.fillStyle = gl;
  ctx.fill(L.lip);
  // (the wood's outline on the plaster; the pale lip's)
  ctx.strokeStyle = rgba(INK.line, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke(L.long);
  ctx.stroke(L.boot);
  ctx.strokeStyle = rgba(INK.line, 0.45);
  ctx.stroke(L.lip);
  // the bell's mouth: its rim's face, the dark of the bore
  ctx.fillStyle = '#e2d9c6';
  ctx.fill(L.mouth);
  ctx.fillStyle = '#060303';
  ctx.fill(L.mouthIn);
  ctx.strokeStyle = rgba(INK.line, 0.45);
  ctx.stroke(L.mouth);
  // ---- the chimneys (dark, down through the wood) and the finger holes and pads' holes in it
  ctx.strokeStyle = 'rgba(6,1,0,0.26)';
  ctx.lineWidth = Math.max(hair, 0.0028 * sc);
  ctx.stroke(L.chimneys);
  BS_KEYS.forEach((k, i) => {
    if (k.style === 'back' || k.style === 'side') return;
    const p = keyPos[i];
    if (k.style === 'cup' && p < 0.03) return;
    ctx.beginPath();
    ctx.arc(X(k.h), Y(k.u), k.hole * sc, 0, 2 * Math.PI);
    ctx.fillStyle = k.style === 'cup' ? `rgba(3,1,1,${Math.min(1, p * 1.5).toFixed(3)})` : '#030101';
    ctx.fill();
  });
  // ---- the bocal: nickel silver, a thin tube on the plaster (its edges dark, a light down its middle);
  // its nipple under the whisper pad
  ctx.fillStyle = '#c3c9cf';
  ctx.fill(L.bocal);
  ctx.fillStyle = AG_LIT;
  ctx.fill(L.bocalLit);
  ctx.strokeStyle = `rgb(${AG_EDGE})`;
  ctx.lineWidth = 1;
  ctx.stroke(L.bocal);
  ctx.fillStyle = AG_BODY;
  ctx.fill(L.nipple);
  ctx.lineWidth = 0.8 * hair;
  ctx.stroke(L.nipple);
  // ---- the reed: the cane's blades, the scraped tip lighter, the bark's collar, the wires, the thread
  ctx.fillStyle = '#d0aa66';
  ctx.fill(L.blades);
  ctx.fillStyle = 'rgba(252,236,190,0.6)';
  ctx.fill(L.tip);
  ctx.fillStyle = 'rgba(120,80,34,0.6)';
  ctx.fill(L.collar);
  ctx.strokeStyle = 'rgba(120,84,40,0.55)';
  ctx.lineWidth = Math.max(0.6, 0.0005 * sc);
  ctx.stroke(L.spine);
  ctx.strokeStyle = 'rgba(84,58,22,0.85)';
  ctx.lineWidth = Math.max(0.5, 0.9 * hair);
  ctx.stroke(L.blades);
  ctx.fillStyle = '#8a2230';
  ctx.fill(L.thread);
  ctx.strokeStyle = 'rgba(30,4,8,0.55)';
  ctx.lineWidth = Math.max(0.5, 0.0003 * sc);
  ctx.stroke(L.wraps);
  ctx.strokeStyle = 'rgba(48,8,14,0.7)';
  ctx.lineWidth = 0.9 * hair;
  ctx.stroke(L.thread);
  // (the wires: brass)
  ctx.strokeStyle = rgba(INK.warm, 0.95);
  ctx.lineWidth = Math.max(hair, 0.0007 * sc);
  ctx.stroke(L.wires);
  // ---- the standing wave inside the bore, laid over the wood and the bocal: its envelope in blue, and in
  // it the pressure now (compression blue, rarefaction slate); the nodes stay wood
  if (lv.sounding) {
    for (const q of L.glowQ) {
      const A = lv.ampAt(q.x);
      if (Math.abs(A) < 0.02) continue;
      // (between the reed's blades, its first 40 mm, a tint: the cane stays cane)
      ctx.fillStyle = rgba(INK.sound, (q.x < 0.04 ? 0.3 : 0.75) * Math.min(1, Math.pow(Math.abs(A), 0.9)));
      ctx.fill(q.p);
      ctx.fillStyle = rgba(waveInk(A * ph), 0.9 * Math.min(1, Math.abs(A * ph)));
      ctx.fill(q.pi);
    }
    for (const g of [L.desc, L.asc]) {
      if (end <= g.a) continue;
      const [ha] = boreHU(g.a);
      const [hb] = boreHU(g.b);
      const ge = ctx.createLinearGradient(X(ha), 0, X(hb), 0);
      const gw = ctx.createLinearGradient(X(ha), 0, X(hb), 0);
      const N = 48;
      for (let i = 0; i <= N; i++) {
        const A = lv.ampAt(g.a + ((g.b - g.a) * i) / N);
        ge.addColorStop(i / N, rgba(INK.sound, 0.75 * Math.min(1, Math.pow(Math.abs(A), 0.9))));
        gw.addColorStop(i / N, rgba(waveInk(A * ph), 0.9 * Math.min(1, Math.abs(A * ph))));
      }
      ctx.save();
      // (the wide bore runs behind the wing: its wave kept off the wing's face)
      if (g === L.asc) ctx.clip(L.offWing, 'evenodd');
      ctx.fillStyle = ge;
      ctx.fill(g.p);
      ctx.fillStyle = gw;
      ctx.fill(g.pi);
      ctx.restore();
    }
  }
  // ---- the silver (metal: the wave stays under it): the boot's ring and cap, the bell's ring, the wing's
  // cap; the joints' seams
  for (const [p, u0, r] of [[L.bootRing, 0, BOOT_RING_HW], [L.cap, 0, 0.031], [L.bellRing, U_L, 0.0253], [L.wingCap, U_W, R_WCAP]] as const) {
    ctx.fillStyle = metalGrad(ctx, Y(u0 - r), Y(u0 + r));
    ctx.fill(p);
    ctx.strokeStyle = rgba(AG_EDGE, 0.9);
    ctx.lineWidth = Math.max(0.5, 0.9 * hair);
    ctx.stroke(p);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = Math.max(0.5, hair);
  ctx.stroke(L.capRim);
  ctx.stroke(L.seams);
  // ---- through the wood: the pads on the back and the thumbs' touches, a faint dashed line, firm under
  // the thumbs: graphite where they reach past the body onto the plaster, light on the dark wood
  const ghosts = (ink: string) => {
    BS_KEYS.forEach((k, i) => {
      if (k.style !== 'back') return;
      ghostPad(ctx, X(k.h), Y(k.u), k.r * sc, 1 - keyPos[i], k.closed ? keyPos[i] : 1 - keyPos[i], sc, ink, hair);
    });
    BS_TOUCHES.forEach((t, i) => {
      if (!t.back) return;
      const q = lv.touchPress[i];
      if (q > 0.01) {
        ctx.fillStyle = rgba(ink, 0.16 * q);
        ctx.fill(L.touches[i]);
      }
      ctx.setLineDash(q > 0.5 ? [] : [0.0016 * sc, 0.0012 * sc]);
      ctx.strokeStyle = rgba(ink, q > 0.5 ? 0.3 + 0.4 * q : 0.3);
      ctx.lineWidth = hair;
      ctx.stroke(L.touches[i]);
    });
  };
  ctx.save();
  ghosts(INK.line);
  ctx.clip(day.wood);
  ghosts(LIGHT);
  ctx.restore();
  // ---- the mechanism: rods (polished axles), hinge tubes
  const wr = Math.max(hair, 0.0021 * sc);
  ctx.strokeStyle = `rgb(${AG_EDGE})`;
  ctx.lineWidth = wr;
  ctx.stroke(L.rods);
  if (wr > 1.8) {
    ctx.strokeStyle = AG_BODY;
    ctx.lineWidth = wr - 1.2;
    ctx.stroke(L.rods);
  }
  ctx.strokeStyle = AG_LIT;
  ctx.lineWidth = Math.max(0.5 * hair, 0.0006 * sc);
  ctx.save();
  ctx.translate(0, -0.0004 * sc);
  ctx.stroke(L.rods);
  ctx.restore();
  ctx.fillStyle = AG_BODY;
  ctx.fill(L.hinges);
  ctx.strokeStyle = rgba(AG_EDGE, 0.9);
  ctx.lineWidth = hair;
  ctx.stroke(L.hinges);
  // ---- the keys: arms from their hinges, cups lifting and seating on springs, the rings and holes
  // under the fingers, the side pads lifting outwards
  for (const k of BS_KEYS) {
    if (!k.rod || k.style === 'side' || k.style === 'back') continue;
    const cy = Y(k.u);
    const ry = k.r * sc;
    const rod = Y(k.rod);
    if (Math.abs(rod - cy) > ry) bsArm(ctx, X(k.h), cy + Math.sign(rod - cy) * ry * 0.75, rod, k.r * sc * 0.34, 0.0013 * sc, hair);
  }
  BS_KEYS.forEach((k, i) => {
    const p = keyPos[i];
    const moved = k.closed ? p : 1 - p;
    const cx = X(k.h);
    const cy = Y(k.u);
    if (k.style === 'hole') bsHole(ctx, cx, cy, k.r * sc, k.hole * sc, lv.keyPress[i], k.id === 'l1' ? lv.half : 0, hair);
    else if (k.style === 'ring') bsRing(ctx, cx, cy, k.r * sc, k.hole * sc, lv.keyPress[i], p, hair);
    else if (k.style === 'cup') bsCup(ctx, cx, cy, k.r * sc, k.r * sc, p, moved, p * 0.0025 * sc, light);
    else if (k.style === 'side') {
      // edge-on: a narrow ellipse beside the tube, lifting outwards
      const out = (k.left ? -1 : 1) * p * 0.0024 * sc;
      bsCup(ctx, cx, cy + out, k.r * sc, Math.max(0.6, 0.0013 * sc), p, moved, 0, light);
    }
  });
  // the touches: levers and spatulas, inked under a finger
  BS_TOUCHES.forEach((t, i) => {
    if (t.back) return;
    const q = lv.touchPress[i];
    const path = L.touches[i];
    const g = ctx.createLinearGradient(0, Y(Math.min(t.v0, t.v1) - 0.003), 0, Y(Math.max(t.v0, t.v1) + 0.003));
    g.addColorStop(0, AG_LIT);
    g.addColorStop(0.5, AG_BODY);
    g.addColorStop(1, '#a9b1b9');
    ctx.fillStyle = g;
    ctx.fill(path);
    if (q > 0.01) {
      ctx.fillStyle = rgba(INK.line, 0.62 * q);
      ctx.fill(path);
    }
    ctx.strokeStyle = q > 0.5 ? rgba(INK.line, 0.6 + 0.35 * q) : rgba(AG_EDGE, t.fixed ? 0.75 : 0.95);
    ctx.lineWidth = (1 + 0.5 * q) * hair;
    ctx.stroke(path);
  });
  // the pillars, over the rods
  ctx.fillStyle = '#e4e7ea';
  ctx.fill(L.posts);
  ctx.strokeStyle = rgba(AG_EDGE, 0.95);
  ctx.lineWidth = hair;
  ctx.stroke(L.posts);
  // ---- the reed's tip: the opening between the blades, seen a little from its end (twice its 1 mm at
  // rest, shut once a cycle when the note is loud)
  reedEye(ctx, L, lv.open * 0.001 * sc, Math.min(1, 4 * lv.blow));
  // the breath into the reed: a faint stream from the lips, flowing in
  if (lv.blow > 0.02) {
    const a = Math.min(1, 0.3 + lv.blow) * (1 + 2.5 * lv.vib);
    // (the reed's axis out of the tip, towards the player: (tdx, tdy))
    const at = (b: number, w: number): [number, number] => [L.tipX + L.tdx * b * sc - L.tdy * w * sc, L.tipY + L.tdy * b * sc + L.tdx * w * sc];
    breathStream(ctx, at, sc, [[0.017, 0.0052], [0.007, 0.003], [0.0016, 0.001]], 0.45 * a, now);
  }
  // ---- the wave's line along the bore's axis, over everything (its nodes stand still): blue (down the
  // bocal, across the silver), and a light line where it lies on the dark wood
  if (lv.sounding) {
    ctx.beginPath();
    const n = 260;
    const e = Math.min(end, BS_BORE);
    for (let i = 0; i <= n; i++) {
      const x = (e * i) / n;
      const b = borePx(L, x);
      const v = lv.ampAt(x) * ph * Math.min(0.0045, 0.3 * boreD(x) + 0.0012) * sc;
      if (i) ctx.lineTo(b.px + b.nx * v, b.py + b.ny * v);
      else ctx.moveTo(b.px + b.nx * v, b.py + b.ny * v);
    }
    const a = Math.min(1, 3 * lvl);
    ctx.strokeStyle = rgba(INK.sound, 0.9 * a);
    ctx.lineWidth = Math.max(0.5, 1.5 * hair);
    ctx.stroke();
    ctx.save();
    ctx.clip(day.wood);
    ctx.strokeStyle = rgba(LIGHT, 0.9 * a);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.clip(day.pale);
    ctx.strokeStyle = rgba(INK.sound, 0.9 * a);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  bsRecord(L, st, lv.fingers);
}

/** polished nickel silver across a part, from its lit edge (y0) to its far one (y1): the window's light,
 *  the body, its shade side, the floor's bounce */
function metalGrad(ctx: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#bcc3ca');
  g.addColorStop(0.18, AG_LIT);
  g.addColorStop(0.36, AG_BODY);
  g.addColorStop(0.66, AG_SHADE);
  g.addColorStop(0.88, '#c2c8ce');
  g.addColorStop(1, '#8d96a0');
  return g;
}
/** a key's arm: from its cup's edge (y0, half-width w0) narrowing to its hinge tube (y1, w1) */
function bsArm(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, w0: number, w1: number, hair: number): void {
  const m = (y0 + y1) / 2;
  ctx.beginPath();
  ctx.moveTo(x - w0, y0);
  ctx.bezierCurveTo(x - w0 * 0.5, m, x - w1, m, x - w1, y1);
  ctx.lineTo(x + w1, y1);
  ctx.bezierCurveTo(x + w1, m, x + w0 * 0.5, m, x + w0, y0);
  ctx.closePath();
  ctx.fillStyle = '#b4bcc4';
  ctx.fill();
  ctx.strokeStyle = rgba(AG_EDGE, 0.9);
  ctx.lineWidth = 0.9 * hair;
  ctx.stroke();
}
/** a pad's cup from the front (or edge-on): a silver dome, lifted `p` (1 open), inked where a finger or a
 *  linkage has moved it off its rest (`moved`), its shadow on the wood as it lifts */
function bsCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, p: number, moved: number, lift: number, day: Light): void {
  const s = 0.965 + 0.035 * p;
  rx *= s;
  ry *= s;
  if (p > 0.02 && lift > 0) {
    ctx.beginPath();
    ctx.ellipse(cx + lift * 0.5 * day.cx, cy + lift * 0.5 * day.cy, rx * 1.02, Math.max(0.5, ry * 1.02), 0, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(24,28,34,${(0.4 * p).toFixed(3)})`;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, Math.max(0.5, ry), 0, 0, 2 * Math.PI);
  // (polished: a bright crown towards the light, a shade band, the floor's bounce at its skirt)
  const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
  g.addColorStop(0, AG_LIT);
  g.addColorStop(0.32, '#e1e5e9');
  g.addColorStop(0.66, AG_SHADE);
  g.addColorStop(0.9, '#c2c8ce');
  g.addColorStop(1, '#a9b1b9');
  ctx.fillStyle = g;
  ctx.fill();
  if (moved > 0.01) {
    ctx.fillStyle = rgba(INK.line, 0.3 * moved);
    ctx.fill();
  }
  ctx.strokeStyle = moved > 0.5 ? rgba(INK.line, 0.55 + 0.4 * moved) : rgba(AG_EDGE, 0.95);
  ctx.lineWidth = (1 + 0.6 * moved) * day.hair;
  ctx.stroke();
  if (ry > 2.5 && rx > 2.5) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.74, ry * 0.74, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = rgba(INK.line, 0.18);
    ctx.lineWidth = 1;
    ctx.stroke();
    // the dome's highlight
    ctx.beginPath();
    ctx.ellipse(cx + day.hx * rx * 0.22, cy - ry * 0.4, rx * 0.26, Math.max(0.3, ry * 0.12), 0, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }
}
/** a fingertip on a ring: graphite, over all of it inside its edge (radius `r`; `q` how far it is down) */
function fingertip(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, q: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle = rgba(INK.line, 0.9 * q);
  ctx.fill();
}
/** an open finger hole with its metal bushing: under the finger (`q`) the fingertip covers it; L1's
 *  rolled down (`half`) uncovers the upper half (towards the reed) */
function bsHole(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hole: number, q: number, half: number, hair: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.moveTo(cx + hole, cy);
  ctx.arc(cx, cy, hole, 0, 2 * Math.PI, true);
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, AG_LIT);
  g.addColorStop(0.5, AG_BODY);
  g.addColorStop(1, AG_SHADE);
  ctx.fillStyle = g;
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = rgba(AG_EDGE, 0.95);
  ctx.lineWidth = hair;
  ctx.stroke();
  if (q > 0.01) {
    // the fingertip: over the whole hole, or rolled down off its upper half (towards the reed: +h, +x)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.25, 0, 2 * Math.PI);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(cx - half * r * 0.9, cy, r * 1.25 * (1 - 0.45 * half), r * 1.2, 0, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(INK.line, 0.9 * q);
    ctx.fill();
    ctx.strokeStyle = rgba(LIGHT, 0.5 * q);
    ctx.lineWidth = hair;
    ctx.stroke();
    ctx.restore();
  }
}
/** a ring key from the front: a thin silver ring round its hole; under the finger (`q`) the ring goes
 *  down and the fingertip covers the hole and the ring: an open hole is a bright ring, a covered one dark */
function bsRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hole: number, q: number, p: number, hair: number): void {
  const s = 0.965 + 0.035 * p;
  const ro = r * s;
  const ri = r * 0.72;
  ctx.beginPath();
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI);
  ctx.fillStyle = '#1a0805';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, hole, 0, 2 * Math.PI);
  ctx.fillStyle = '#010000';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, 2 * Math.PI);
  ctx.moveTo(cx + ri, cy);
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI, true);
  const g = ctx.createLinearGradient(0, cy - ro, 0, cy + ro);
  g.addColorStop(0, AG_LIT);
  g.addColorStop(0.42, AG_BODY);
  g.addColorStop(0.58, '#e6e9ec');
  g.addColorStop(1, AG_SHADE);
  ctx.fillStyle = g;
  ctx.fill('evenodd');
  ctx.strokeStyle = rgba(AG_EDGE, 0.95);
  ctx.lineWidth = hair;
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, 2 * Math.PI);
  ctx.stroke();
  if (q > 0.01) fingertip(ctx, cx, cy, Math.max(ri * 1.02, ro - 0.5 * hair), q);
}
/** a pad on the back, seen through the wood: its outline a faint dashed line (`ink`: light on the wood,
 *  graphite past it), stronger shut (`shut`), firm and faintly filled while its key has moved it (`moved`) */
function ghostPad(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, shut: number, moved: number, sc: number, ink: string, hair: number): void {
  ctx.setLineDash(moved > 0.5 ? [] : [0.0016 * sc, 0.0012 * sc]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  if (moved > 0.01) {
    ctx.fillStyle = rgba(ink, 0.14 * moved);
    ctx.fill();
  }
  ctx.strokeStyle = rgba(ink, moved > 0.5 ? 0.3 + 0.4 * moved : 0.2 + 0.12 * shut);
  ctx.lineWidth = hair;
  ctx.stroke();
}
/** the eye at the reed's tip: the dark of the opening, and the blades' edges, which are what moves: cane
 *  at rest, in the blue of what sounds while they are blown (`blown` 0…1) */
function reedEye(ctx: CanvasRenderingContext2D, L: BsLayout, o: number, blown: number): void {
  const p = reedEyePath(L, o);
  ctx.fillStyle = '#080604';
  ctx.fill(p);
  ctx.lineWidth = Math.min(1.5, Math.max(Math.min(1, L.sc / 400), 0.0007 * L.sc));
  ctx.strokeStyle = 'rgba(84,58,22,0.85)';
  ctx.stroke(p);
  if (blown > 0.01) {
    ctx.strokeStyle = rgba(INK.sound, 0.9 * blown);
    ctx.stroke(p);
  }
}
