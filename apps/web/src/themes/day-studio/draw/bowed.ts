// Day Studio: the violin family on the 2D stage, drawn for daylight. The plan, the layout, the shapes and
// the bow's own motion are the shared drawer's (ui/stage-draw.ts); the painted layers (the varnished plate
// and the fittings, each with its shadow on the floor) and the live drawing over them are here.
import type { VisualFrame } from '@piano-model/engine';
import { BASS_MACH, BASS_PIN, bassAdjusters, bassHead, bassPinParts, bassTailWire, BOWED_PLAN, bowedDrawn, type BowedGeom, type BowedLayers, bowedLayout, type BowedLayout, type BowedPlan, bowedShapes, type BowedShapes, type BowedState, bowFit, bowLift, bwBridge, bwClamp, bwForce, bwHeadParts, bwHull, bwPegboxW, bwPlace, bwPoly, bwRng, bwSstep, bwTailpiece, hasEndpin, HEAD_EAR, HEAD_PROJ, INK, MM, ModeField, PEG_A, PEG_OF, PEG_SIDE, type Pt, rgba } from '../../../ui/stage-draw.ts';
import { LIGHT } from './kit.ts';

/** the painted layers by instrument and size: a few at once (an ensemble draws a violin, a viola and a
 *  cello side by side), the oldest let go */
const bowedLayers = new Map<string, BowedLayers>();
let bwScratch: HTMLCanvasElement | null = null;

/** a line at distance d inside a closed path, w wide (the path stroked wide, the inner part cut away,
 *  kept only inside the path) */
function bwInsetLine(c: CanvasRenderingContext2D, path: Path2D, d: number, w: number, style: string): void {
  const cv = c.canvas;
  if (!bwScratch) bwScratch = document.createElement('canvas');
  const s = bwScratch;
  if (s.width !== cv.width || s.height !== cv.height) {
    s.width = cv.width;
    s.height = cv.height;
  }
  const x = s.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, s.width, s.height);
  x.setTransform(c.getTransform());
  x.lineJoin = 'round';
  x.strokeStyle = style;
  x.lineWidth = 2 * (d + w / 2);
  x.stroke(path);
  x.globalCompositeOperation = 'destination-out';
  x.lineWidth = Math.max(0.01, 2 * (d - w / 2));
  x.strokeStyle = '#000';
  x.stroke(path);
  x.globalCompositeOperation = 'destination-in';
  x.fillStyle = '#000';
  x.fill(path);
  x.globalCompositeOperation = 'source-over';
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(s, 0, 0);
  c.restore();
}

/** brass, lit across a part (local px from a to b): its two edges in shade, a highlight off-centre */
function bwBrass(c: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, k = 1): CanvasGradient {
  const gr = c.createLinearGradient(ax, ay, bx, by);
  const col = (r: number, g: number, b: number) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
  gr.addColorStop(0, col(176, 134, 58));
  gr.addColorStop(0.3, col(243, 220, 154));
  gr.addColorStop(0.58, col(220, 182, 92));
  gr.addColorStop(1, col(125, 92, 34));
  return gr;
}

/** the double bass's machine heads (bassHead): the rollers across the pegbox with the strings coiled on
 *  them, the brass plates down the cheeks, the worms and their wheels, the keys standing out */
function paintBassHead(c: CanvasRenderingContext2D, p: BowedPlan, sc: number, dpr: number): void {
  const X = (x: number) => x * sc;
  const hd = bassHead(p);
  const xn = -p.neck;
  const shade = (on: boolean, blur = 6, dy = 4) => {
    c.shadowColor = on ? 'rgba(24,28,34,0.4)' : 'transparent';
    c.shadowBlur = on ? blur * dpr : 0;
    c.shadowOffsetY = on ? dy * dpr : 0;
    c.shadowOffsetX = on ? dy * 0.5 * dpr : 0;
  };
  // the rollers (steel), round: lit along their middle
  for (const { x, half, r } of hd.rollers) {
    c.fillStyle = (() => {
      const gr = c.createLinearGradient(X(x - r), 0, X(x + r), 0);
      gr.addColorStop(0, 'rgb(96,102,108)');
      gr.addColorStop(0.4, 'rgb(236,239,242)');
      gr.addColorStop(1, 'rgb(104,110,116)');
      return gr;
    })();
    c.fillRect(X(x - r), X(-half), X(2 * r), X(2 * half));
  }
  // the strings: off the nut into the pegbox, each coiled on its roller (silk-wrapped where it winds)
  for (let i = 0; i < 4; i++) {
    const co = hd.coils[i];
    c.strokeStyle = 'rgba(214,204,186,0.8)';
    c.lineWidth = Math.max(0.6, p.dia[i] * sc);
    c.beginPath();
    c.moveTo(X(xn), X((1.5 - i) * p.spreadN));
    c.lineTo(X(co.x + co.r * 0.6), X(co.z));
    c.stroke();
    const cp = bwPoly([[co.x - co.r, co.z - co.half], [co.x + co.r, co.z - co.half], [co.x + co.r, co.z + co.half], [co.x - co.r, co.z + co.half]], sc);
    c.fillStyle = 'rgb(150,142,128)';
    c.fill(cp);
    // the turns, leaning a little as a coil does
    c.strokeStyle = 'rgba(40,34,28,0.75)';
    c.lineWidth = 0.6;
    const n = 4;
    c.beginPath();
    for (let k = 1; k < n; k++) {
      const z = co.z - co.half + (2 * co.half * k) / n;
      c.moveTo(X(co.x - co.r), X(z - 0.0012));
      c.lineTo(X(co.x + co.r), X(z + 0.0012));
    }
    c.stroke();
    c.strokeStyle = 'rgba(236,228,212,0.5)';
    c.stroke(cp);
  }
  // the plates, down each cheek
  for (const [k, pl] of hd.plates.entries()) {
    const path = bwPoly(pl, sc);
    const s = k ? -1 : 1;
    const zIn = pl[0][1];
    c.save();
    shade(true, 5, 3);
    c.fillStyle = bwBrass(c, 0, X(zIn), 0, X(zIn + s * BASS_MACH.T), 0.95);
    c.fill(path);
    c.restore();
    c.strokeStyle = 'rgba(104,74,20,0.9)';
    c.lineWidth = 0.7;
    c.stroke(path);
  }
  // each tuner: the worm and shaft out of the plate under its wheel, the wheel, the collar and the key
  for (const t of hd.tuners) {
    const s = t.side;
    const M = BASS_MACH;
    c.save();
    shade(true, 5, 3);
    for (const [q, r] of [[t.worm, M.wormR], [t.neck, M.neckR], [t.collar, 0.0052]] as const) {
      c.fillStyle = bwBrass(c, X(t.x - r), 0, X(t.x + r), 0);
      c.fill(bwPoly(q, sc));
    }
    c.restore();
    // the worm's thread
    c.strokeStyle = 'rgba(104,74,20,0.6)';
    c.lineWidth = 0.6;
    c.beginPath();
    const z0 = t.worm[0][1];
    const z1 = t.worm[2][1];
    for (let k = 1; k < 4; k++) {
      const z = z0 + ((z1 - z0) * k) / 4;
      c.moveTo(X(t.x - M.wormR), X(z - s * 0.0012));
      c.lineTo(X(t.x + M.wormR), X(z + s * 0.0012));
    }
    c.stroke();
    for (const q of [t.worm, t.neck, t.collar]) {
      c.strokeStyle = 'rgba(104,74,20,0.9)';
      c.stroke(bwPoly(q, sc));
    }
    // the wheel, its teeth catching the light
    const gp = bwPoly(t.gear, sc);
    c.save();
    shade(true, 4, 2);
    c.fillStyle = bwBrass(c, X(t.x - M.gearR), 0, X(t.x + M.gearR), 0, 1.05);
    c.fill(gp);
    c.restore();
    c.strokeStyle = 'rgba(104,74,20,0.95)';
    c.lineWidth = 0.7;
    c.stroke(gp);
    // its hub (the roller's end) and the screw that holds it
    const zc = t.gear[0][1];
    c.beginPath();
    c.ellipse(X(t.x), X(zc), X(0.0036), X(0.0018), 0, 0, Math.PI * 2);
    c.fillStyle = 'rgb(125,92,34)';
    c.fill();
    // the key: a flat thumb-piece, its face turned to the side, a rim round it
    const kp = bwPoly(t.key, sc);
    c.save();
    shade(true, 6, 4);
    c.fillStyle = bwBrass(c, X(t.x - M.keyW), 0, X(t.x + M.keyW), 0);
    c.fill(kp);
    c.restore();
    c.fillStyle = bwBrass(c, X(t.x - M.keyW), 0, X(t.x + M.keyW), 0, 0.9);
    c.fill(bwPoly(t.face, sc));
    c.strokeStyle = 'rgba(104,74,20,0.95)';
    c.lineWidth = 0.7;
    c.stroke(kp);
    c.strokeStyle = 'rgba(255,244,214,0.55)';
    c.lineWidth = 0.6;
    c.stroke(bwPoly(t.face, sc));
  }
}

/** the double bass's endpin (bassPinParts): the steel rod out to its point, the ebony socket over it,
 *  the steel ring at its flange, the thumbscrew that locks the rod */
function paintBassPin(c: CanvasRenderingContext2D, B: number, sc: number, dpr: number): void {
  const X = (x: number) => x * sc;
  const pin = bassPinParts(B);
  const r = BASS_PIN.rodR;
  const rg = c.createLinearGradient(0, X(-r), 0, X(r));
  rg.addColorStop(0, 'rgb(70,78,86)');
  rg.addColorStop(0.4, 'rgb(214,222,230)');
  rg.addColorStop(1, 'rgb(60,66,72)');
  const sockP = bwPoly(pin.sock, sc);
  c.save();
  c.shadowColor = 'rgba(24,28,34,0.4)';
  c.shadowBlur = 8 * dpr;
  c.shadowOffsetY = 5 * dpr;
  c.shadowOffsetX = 2.5 * dpr;
  c.fillStyle = rg;
  c.fill(bwPoly(pin.rod, sc));
  c.fillStyle = 'rgb(20,17,15)';
  c.fill(sockP);
  c.fillStyle = rg;
  c.fill(bwPoly(pin.screw, sc));
  c.fillStyle = 'rgb(150,158,166)';
  c.fill(bwPoly(pin.knob, sc));
  c.restore();
  c.strokeStyle = rgba(INK.line, 0.3);
  c.lineWidth = 0.7;
  c.stroke(sockP);
  c.strokeStyle = 'rgba(30,34,38,0.8)';
  c.stroke(bwPoly(pin.rod, sc));
  // the knurling on the screw's head
  const kx = B + BASS_PIN.screw;
  c.beginPath();
  for (let k = -2; k <= 2; k++) {
    c.moveTo(X(kx + k * 0.0024), X(-0.0205));
    c.lineTo(X(kx + k * 0.0024), X(-0.0285));
  }
  c.stroke();
  c.stroke(bwPoly(pin.knob, sc));
  c.fillStyle = 'rgba(200,206,212,0.85)';
  c.fillRect(X(B + 0.005), X(-0.023), X(0.003), X(0.046));
}

function paintBowedLayers(g: BowedGeom, p: BowedPlan, sh: BowedShapes, lay: BowedLayout, W: number, H: number, dpr: number, key: string): BowedLayers {
  const sc = lay.sc;
  const B = p.body;
  const S = B / 0.356;
  const L = g.L;
  const xb = L - p.neck;
  const xn = -p.neck;
  // each layer covers only its part's box (local metres → stage px, with room for the shadows)
  const mk = (x0: number, x1: number, z0: number, z1: number) => {
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      const px = lay.vertical ? lay.ox - z * sc : lay.ox + x * sc;
      const py = lay.vertical ? lay.oy + x * sc : lay.oy + z * sc;
      bx0 = Math.min(bx0, px);
      by0 = Math.min(by0, py);
      bx1 = Math.max(bx1, px);
      by1 = Math.max(by1, py);
    }
    const m = 44;
    const bx = Math.max(0, Math.floor(bx0 - m));
    const by = Math.max(0, Math.floor(by0 - m));
    const bw = Math.max(1, Math.min(W, Math.ceil(bx1 + m)) - bx);
    const bh = Math.max(1, Math.min(H, Math.ceil(by1 + m)) - by);
    const cv = document.createElement('canvas');
    cv.width = Math.round(bw * dpr);
    cv.height = Math.round(bh * dpr);
    const c = cv.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, -bx * dpr, -by * dpr);
    bwPlace(c, lay);
    return { cv, c, box: { cv, x: bx, y: by, w: bw, h: bh } };
  };
  const body = bwPoly(sh.body, sc);
  const holes = sh.fholes.map((f) => bwPoly(f, sc));
  const glow = new Path2D();
  glow.addPath(body);
  for (const h of holes) glow.addPath(h);
  const X = (x: number) => x * sc;
  // the shadows in proportion to the instrument as it is drawn (their sizes below are for a body the size
  // of a cello's on a desktop stage: a violin among an orchestra's seats casts a violin's shadow)
  const sd = dpr * bwClamp((B * sc) / 700, 0.05, 1.15);

  // ---- the plate
  const A = mk(0, B, -sh.hwMax, sh.hwMax);
  const a = A.c;
  a.save();
  a.shadowColor = 'rgba(28,34,42,0.34)';
  a.shadowBlur = 26 * sd;
  a.shadowOffsetX = 7 * sd;
  a.shadowOffsetY = 12 * sd;
  const vc = (k: number, al = 1) => `rgba(${p.varnish.map((v) => Math.min(255, Math.round(v * k))).join(',')},${al})`;
  // (the varnish in daylight: a warm red-brown, not the night bench's near-black; its shading is kept)
  a.fillStyle = vc(0.56);
  a.fill(body);
  a.restore();
  a.save();
  a.clip(body);
  // varnish: lighter over the bouts' crowns, where the arch catches the light
  for (const [u, r, al] of [[0.22, 0.27, 0.38], [0.74, 0.32, 0.38], [0.48, 0.16, 0.16]] as const) {
    const gr = a.createRadialGradient(X(u * B), 0, 0, X(u * B), 0, X(r * B));
    gr.addColorStop(0, vc(1.45, al));
    gr.addColorStop(1, vc(1.45, 0));
    a.fillStyle = gr;
    a.fillRect(X(-0.05 * B), X(-0.4 * B), X(1.1 * B), X(0.8 * B));
  }
  // spruce grain along the plate: close at the centre joint, wider at the flanks (drawn at about twice
  // the real spacing, 0.9 → 2 mm, so it reads at screen scale)
  const rnd = bwRng(g.id.length * 7919 + 17);
  a.lineWidth = 0.6;
  for (const side of [1, -1]) {
    let z = 0.00045;
    while (z < sh.hwMax) {
      const f = z / sh.hwMax;
      a.strokeStyle = `rgba(22,10,4,${(0.1 + 0.16 * rnd()).toFixed(3)})`;
      a.beginPath();
      const ph = rnd() * 6;
      for (let k = 0; k <= 24; k++) {
        const x = (k / 24) * B;
        const zz = side * (z + 0.00035 * S * Math.sin(ph + (x / B) * 7) * (0.4 + f));
        if (k) a.lineTo(X(x), X(zz));
        else a.moveTo(X(x), X(zz));
      }
      a.stroke();
      z += (0.0018 + 0.0022 * f * f) * S ** 0.5 * (0.8 + 0.4 * rnd());
    }
  }
  // the long arch catches the light along the middle; the varnish is mottled, rubbed thin in places
  {
    const ag = a.createLinearGradient(0, X(-sh.hwMax), 0, X(sh.hwMax));
    ag.addColorStop(0, vc(1.6, 0));
    ag.addColorStop(0.5, vc(1.6, 0.13));
    ag.addColorStop(1, vc(1.6, 0));
    a.fillStyle = ag;
    a.fillRect(0, X(-sh.hwMax), X(B), X(2 * sh.hwMax));
    const nw = 14;
    const nh = 8;
    const nc = document.createElement('canvas');
    nc.width = nw;
    nc.height = nh;
    const nx = nc.getContext('2d')!;
    const im = nx.createImageData(nw, nh);
    for (let i = 0; i < nw * nh; i++) {
      const v = rnd();
      const dark = v < 0.5;
      im.data[i * 4] = dark ? 20 : 255;
      im.data[i * 4 + 1] = dark ? 8 : 200;
      im.data[i * 4 + 2] = dark ? 2 : 140;
      im.data[i * 4 + 3] = Math.round(255 * Math.abs(v - 0.5) * (dark ? 0.26 : 0.14));
    }
    nx.putImageData(im, 0, 0);
    a.imageSmoothingEnabled = true;
    a.drawImage(nc, 0, X(-sh.hwMax), X(B), X(2 * sh.hwMax));
  }
  // the channel round the edge, deeper in colour
  for (const d of [16, 10, 5.5, 2.5]) {
    a.strokeStyle = 'rgba(14,6,2,0.12)';
    a.lineWidth = 2 * d * MM * S * sc;
    a.stroke(body);
  }
  a.restore();
  // purfling (black–white–black) and the edge's rounded crown catching the light
  bwInsetLine(a, body, p.purf[0] * sc, Math.max(1.4, p.purf[1] * sc), 'rgba(10,6,3,0.85)');
  bwInsetLine(a, body, p.purf[0] * sc, Math.max(0.5, p.purf[1] * sc * 0.3), 'rgba(236,214,180,0.16)');
  bwInsetLine(a, body, 1.6 * MM * S * sc, Math.max(0.8, 1.2 * MM * S * sc), 'rgba(250,200,150,0.10)');
  a.strokeStyle = 'rgba(38,18,8,0.8)';
  a.lineWidth = 1.1;
  a.lineJoin = 'round';
  a.stroke(body);
  // f-holes: cut through to the dark inside, their walls catching a little light
  for (const h of holes) {
    a.fillStyle = 'rgb(6,4,3)';
    a.fill(h);
    a.strokeStyle = 'rgba(236,200,160,0.32)';
    a.lineWidth = 0.75;
    a.stroke(h);
  }

  // ---- the fittings
  const reach = Math.max(sh.hwMax, p.pbW / 2 + 0.0098 * S ** 0.6 + 0.021 * S ** 0.62);
  const F = mk(-p.neck - p.head * HEAD_PROJ - 0.003, B + (hasEndpin(g.id) ? 0.385 : 0.012), -reach, reach);
  const c = F.c;
  const ebony = (x0: number, x1: number, half: number) => {
    const gr = c.createLinearGradient(0, -half, 0, half);
    gr.addColorStop(0, 'rgb(20,19,18)');
    gr.addColorStop(0.36, 'rgb(58,56,53)');
    gr.addColorStop(0.5, 'rgb(46,44,41)');
    gr.addColorStop(1, 'rgb(14,13,12)');
    void x0;
    void x1;
    return gr;
  };
  // fingerboard, standing well off the top: a soft shadow on the plate
  const fbEnd = xn + p.fbLen;
  const fbw = (x: number) => p.fbW[0] + ((p.fbW[1] - p.fbW[0]) * (x - xn)) / p.fbLen;
  const fb = bwPoly([[xn, -fbw(xn) / 2], [fbEnd, -fbw(fbEnd) / 2], [fbEnd, fbw(fbEnd) / 2], [xn, fbw(xn) / 2]], sc);
  c.save();
  c.shadowColor = 'rgba(24,28,34,0.46)';
  c.shadowBlur = 12 * sd;
  c.shadowOffsetY = 8 * sd;
  c.shadowOffsetX = 4 * sd;
  c.fillStyle = ebony(xn, fbEnd, (p.fbW[1] / 2) * sc);
  c.fill(fb);
  c.restore();
  c.fillStyle = ebony(xn, fbEnd, (p.fbW[1] / 2) * sc);
  c.fill(fb);
  // (its edge: a light on ebony)
  c.strokeStyle = rgba(LIGHT, 0.2);
  c.lineWidth = 0.8;
  c.stroke(fb);
  // the head: pegbox and scroll, front view
  const Lh = p.head;
  const e = p.eyeW / 2;
  const hp = bwHeadParts(p);
  const HX = (aa: number) => X(xn - aa * Lh * HEAD_PROJ);
  const sym = (pts: Pt[]) => {
    const q = new Path2D();
    pts.forEach(([aa, w], i) => (i ? q.lineTo(HX(aa), X(w)) : q.moveTo(HX(aa), X(w))));
    for (let i = pts.length - 1; i >= 0; i--) q.lineTo(HX(pts[i][0]), X(-pts[i][1]));
    q.closePath();
    return q;
  };
  const boxP = sym(hp.box);
  const crownP = sym(hp.crown);
  const earP = [1, -1].map((sg) => {
    const q = new Path2D();
    [...hp.ear].reverse().forEach(([aa, w], i) => (i ? q.lineTo(HX(aa), X(sg * w)) : q.moveTo(HX(aa), X(sg * w))));
    q.closePath();
    return q;
  });
  const headP = new Path2D();
  for (const q of [boxP, crownP, ...earP]) headP.addPath(q);
  c.save();
  c.shadowColor = 'rgba(24,28,34,0.4)';
  c.shadowBlur = 12 * sd;
  c.shadowOffsetY = 7 * sd;
  c.shadowOffsetX = 3.5 * sd;
  c.fillStyle = vc(0.4);
  for (const q of [boxP, crownP, ...earP]) c.fill(q);
  c.restore();
  // the outline: stroked wide, then the fill laid over it, so only the silhouette's edge shows
  c.strokeStyle = 'rgba(38,18,8,0.8)';
  c.lineWidth = 1.8;
  c.lineJoin = 'round';
  c.stroke(headP);
  const hg = c.createLinearGradient(0, X(-e), 0, X(e));
  hg.addColorStop(0, vc(0.66));
  hg.addColorStop(0.42, vc(1.12));
  hg.addColorStop(1, vc(0.56));
  c.fillStyle = hg;
  for (const q of [boxP, crownP, ...earP]) c.fill(q);
  // the ears: each turn's edge where it meets the crown, winding in to the eye (a boss)
  for (const [k, sg] of [[0, 1], [1, -1]] as const) {
    c.save();
    c.clip(crownP);
    c.strokeStyle = 'rgba(30,12,4,0.55)';
    c.lineWidth = 0.9;
    c.stroke(earP[k]);
    c.restore();
    const ea = HEAD_EAR.a;
    const ew = sg * (HEAD_EAR.w + 0.1) * e;
    c.beginPath();
    for (let j = 0; j <= 48; j++) {
      const th = (j / 48) * 2.2 * Math.PI;
      const r = HEAD_EAR.r * e * 0.92 * Math.exp(-0.36 * th);
      const aa = ea + (Math.cos(th) * r) / (Lh * HEAD_PROJ);
      const w = ew + sg * Math.sin(th) * r;
      if (j) c.lineTo(HX(aa), X(w));
      else c.moveTo(HX(aa), X(w));
    }
    c.strokeStyle = 'rgba(30,12,4,0.6)';
    c.lineWidth = 0.9;
    c.stroke();
    c.beginPath();
    c.arc(HX(ea), X(ew), 0.1 * e * sc, 0, Math.PI * 2);
    c.fillStyle = 'rgb(150,88,40)';
    c.fill();
    c.strokeStyle = 'rgba(30,12,4,0.7)';
    c.lineWidth = 0.8;
    c.stroke();
  }
  // the crown's spine and its two flutes
  c.strokeStyle = 'rgba(255,214,160,0.45)';
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(HX(0.68), 0);
  c.lineTo(HX(0.99), 0);
  c.stroke();
  c.strokeStyle = 'rgba(30,12,4,0.5)';
  c.lineWidth = Math.max(0.8, 0.06 * e * sc);
  for (const sg of [-1, 1]) {
    c.beginPath();
    hp.crown.forEach(([aa, w], i) => {
      if (aa < 0.68) return;
      const z = sg * Math.min(0.3 * e, 0.55 * w);
      if (i && aa > 0.68) c.lineTo(HX(aa), X(z));
      else c.moveTo(HX(aa), X(z));
    });
    c.stroke();
  }
  // the pegbox's cavity between the cheeks, closing in a round end at the throat
  const cheek = 4.2 * MM * S ** 0.85;
  const cav = new Path2D();
  const cavPts: Pt[] = [];
  for (let k = 0; k <= 16; k++) {
    const aa = 0.025 + (0.6 * k) / 16;
    cavPts.push([aa, bwPegboxW(p, aa) - cheek]);
  }
  cavPts.forEach(([aa, w], i) => (i ? cav.lineTo(HX(aa), X(w)) : cav.moveTo(HX(aa), X(w))));
  const aT = 0.625;
  const wT = bwPegboxW(p, aT) - cheek;
  cav.bezierCurveTo(HX(aT + 0.05), X(wT), HX(aT + 0.06), X(-wT), HX(aT), X(-wT));
  for (let k = 16; k >= 0; k--) cav.lineTo(HX(cavPts[k][0]), X(-cavPts[k][1]));
  cav.closePath();
  c.fillStyle = 'rgb(9,6,4)';
  c.fill(cav);
  c.strokeStyle = 'rgba(240,190,130,0.3)';
  c.lineWidth = 0.7;
  c.stroke(cav);
  // the nut
  const nutW = 0.0042 * S ** 0.5;
  c.fillStyle = 'rgb(30,27,24)';
  c.fillRect(X(xn - nutW), X(-fbw(xn) * 0.51), X(nutW), X(fbw(xn) * 1.02));
  c.strokeStyle = rgba(LIGHT, 0.4);
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(X(xn), X(-fbw(xn) * 0.51));
  c.lineTo(X(xn), X(fbw(xn) * 0.51));
  c.stroke();
  // pegs: the shafts across the cavity, each string wound on its own; then the heads outside (the
  // double bass: its machine heads)
  const sR = 0.0031 * S ** 0.6;
  const pegs = g.id === 'bass' ? 0 : 4;
  if (!pegs) paintBassHead(c, p, sc, sd);
  for (let i = 0; i < pegs; i++) {
    const aa = PEG_A[PEG_OF[i]];
    const w = bwPegboxW(p, aa);
    c.strokeStyle = 'rgb(28,22,18)';
    c.lineWidth = 2 * sR * sc;
    c.beginPath();
    c.moveTo(HX(aa), X(-w + cheek * 0.5));
    c.lineTo(HX(aa), X(w - cheek * 0.5));
    c.stroke();
  }
  for (let i = 0; i < pegs; i++) {
    const aa = PEG_A[PEG_OF[i]];
    const wIn = bwPegboxW(p, aa) - cheek;
    const zs = bwClamp((1.5 - i) * p.spreadN * 1.3, -wIn * 0.6, wIn * 0.6);
    c.strokeStyle = p.wound[i] ? 'rgba(214,204,186,0.75)' : 'rgba(228,234,240,0.85)';
    c.lineWidth = Math.max(0.6, p.dia[i] * sc);
    c.beginPath();
    c.moveTo(X(xn), X((1.5 - i) * p.spreadN));
    c.lineTo(HX(aa), X(zs));
    c.stroke();
    // the winding on the shaft
    c.strokeStyle = 'rgba(214,204,186,0.6)';
    c.lineWidth = 0.6;
    for (let k = -2; k <= 2; k++) {
      c.beginPath();
      c.moveTo(HX(aa) - sR * sc, X(zs + k * 0.0009 * S ** 0.5));
      c.lineTo(HX(aa) + sR * sc, X(zs + k * 0.0009 * S ** 0.5));
      c.stroke();
    }
  }
  const pegCol = hasEndpin(g.id) ? ['rgb(40,18,10)', 'rgb(110,54,32)'] : ['rgb(16,12,10)', 'rgb(66,52,42)'];
  for (let i = 0; i < pegs; i++) {
    const aa = PEG_A[PEG_OF[i]];
    const s = PEG_SIDE[i];
    const w0 = bwPegboxW(p, aa);
    const ax = HX(aa);
    const zc0 = w0 + 0.004 * S ** 0.6;
    const hl = 0.021 * S ** 0.62;
    const hwid = 0.019 * S ** 0.62;
    const shaft = new Path2D();
    shaft.rect(ax - sR * sc, X(s > 0 ? w0 - 0.001 : -zc0), 2 * sR * sc, X(zc0 - w0 + 0.001));
    // the collar (two rings), then the thumb-piece: from the collar it flares to a broad paddle with a
    // rounded end (strings3d.ts's peg head, seen face on)
    const head = new Path2D();
    const z0 = zc0 + 0.0058 * S ** 0.6;
    const N = 18;
    const ptsU: Pt[] = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      // a paddle: flaring quickly out of the collar, its sides a little full, its end squarely rounded
      const end = Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.55) / 0.45, 2.8)), 1 / 2.8);
      const A0 = 0.5 * hwid * (0.42 + 0.58 * bwSstep(0, 0.32, t)) * (0.94 + 0.06 * Math.sin(Math.PI * t)) * end;
      ptsU.push([z0 + t * hl, A0]);
    }
    ptsU.forEach(([z, A0], k) => (k ? head.lineTo(ax - X(A0), X(s * z)) : head.moveTo(ax - X(A0), X(s * z))));
    for (let k = N; k >= 0; k--) head.lineTo(ax + X(ptsU[k][1]), X(s * ptsU[k][0]));
    head.closePath();
    const collar = new Path2D();
    collar.rect(ax - 1.45 * sR * sc, X(s > 0 ? zc0 : -z0), 2.9 * sR * sc, X(z0 - zc0));
    c.save();
    c.shadowColor = 'rgba(24,28,34,0.4)';
    c.shadowBlur = 6 * sd;
    c.shadowOffsetY = 4 * sd;
    c.shadowOffsetX = 2 * sd;
    c.fillStyle = pegCol[0];
    c.fill(shaft);
    c.fill(collar);
    c.fill(head);
    c.restore();
    const pg = c.createLinearGradient(ax - X(hwid / 2), 0, ax + X(hwid / 2), 0);
    pg.addColorStop(0, pegCol[0]);
    pg.addColorStop(0.4, pegCol[1]);
    pg.addColorStop(1, pegCol[0]);
    c.fillStyle = pg;
    c.fill(head);
    c.fill(collar);
    c.fill(shaft);
    c.strokeStyle = rgba(INK.line, 0.45);
    c.lineWidth = 0.7;
    c.stroke(head);
    c.stroke(collar);
    c.strokeStyle = rgba(LIGHT, 0.3);
    c.beginPath();
    c.moveTo(ax - 1.45 * sR * sc, X(s * (zc0 + 0.5 * (z0 - zc0))));
    c.lineTo(ax + 1.45 * sR * sc, X(s * (zc0 + 0.5 * (z0 - zc0))));
    c.stroke();
  }
  // the tailpiece (ebony: broad at its fret, waisted towards the tail), the saddle and tailgut, the end
  // button or the cello's endpin (no chinrest: the Met's photographs, the reference, have none); the
  // double bass's on a steel tail wire, its own endpin
  const bass = g.id === 'bass';
  const { top: tpTop, end: tpEnd, wTop, w: tpW } = bwTailpiece(g, p);
  // saddle and tailgut (the bass: a tail wire, its two strands held in the tailpiece by ferrules)
  const sadX = B - 0.006 * S;
  const sadW = 0.034 * S ** 0.8;
  c.fillStyle = 'rgb(22,19,17)';
  c.fillRect(X(sadX - 0.0035 * S ** 0.6), X(-sadW / 2), X(0.007 * S ** 0.6), X(sadW));
  c.strokeStyle = rgba(LIGHT, 0.22);
  c.lineWidth = 0.7;
  c.strokeRect(X(sadX - 0.0035 * S ** 0.6), X(-sadW / 2), X(0.007 * S ** 0.6), X(sadW));
  if (bass) {
    const tw = bassTailWire(g, p);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const [col, w] of [['rgba(40,44,48,0.9)', 1.5], ['rgba(184,192,200,0.95)', 1], ['rgba(240,244,248,0.6)', 0.35]] as const) {
      c.strokeStyle = col;
      c.lineWidth = Math.max(w * 0.8, w * tw.r * 2 * sc);
      for (const strand of tw.strands) {
        c.beginPath();
        strand.forEach(([x, z], k) => (k ? c.lineTo(X(x), X(z)) : c.moveTo(X(x), X(z))));
        c.stroke();
      }
    }
    c.lineCap = 'butt';
    for (const f of tw.ferrules) {
      const fp = bwPoly(f, sc);
      c.fillStyle = 'rgb(220,182,92)';
      c.fill(fp);
      c.strokeStyle = 'rgba(104,74,20,0.9)';
      c.lineWidth = 0.6;
      c.stroke(fp);
    }
  } else {
    c.strokeStyle = 'rgba(214,190,150,0.55)';
    c.lineWidth = Math.max(0.8, 0.0018 * S ** 0.6 * sc);
    for (const sg of [-1, 1]) {
      c.beginPath();
      c.moveTo(X(tpEnd), X(sg * 0.0035 * S ** 0.7));
      c.lineTo(X(B + 0.003 * S), X(sg * 0.0015 * S));
      c.stroke();
    }
  }
  if (bass) paintBassPin(c, B, sc, sd);
  else if (hasEndpin(g.id)) {
    // endpin: the socket (ebony, with its collar) and the steel rod running on towards the floor
    const sock: Pt[] = [[0, 0.0175], [0.004, 0.019], [0.012, 0.017], [0.016, 0.0185], [0.022, 0.0185], [0.028, 0.012], [0.042, 0.009], [0.044, 0.0105], [0.05, 0.0105]];
    const sockP = new Path2D();
    sock.forEach(([d, r], i) => (i ? sockP.lineTo(X(B + d), X(-r)) : sockP.moveTo(X(B + d), X(-r))));
    for (let i = sock.length - 1; i >= 0; i--) sockP.lineTo(X(B + sock[i][0]), X(sock[i][1]));
    sockP.closePath();
    const rodL = 0.32;
    const rg = c.createLinearGradient(0, X(-0.005), 0, X(0.005));
    rg.addColorStop(0, 'rgb(70,78,86)');
    rg.addColorStop(0.4, 'rgb(214,222,230)');
    rg.addColorStop(1, 'rgb(60,66,72)');
    c.save();
    c.shadowColor = 'rgba(24,28,34,0.4)';
    c.shadowBlur = 8 * sd;
    c.shadowOffsetY = 5 * sd;
    c.shadowOffsetX = 2.5 * sd;
    c.fillStyle = rg;
    c.beginPath();
    c.moveTo(X(B + 0.05), X(-0.0048));
    c.lineTo(X(B + 0.05 + rodL), X(-0.0048));
    c.lineTo(X(B + 0.05 + rodL + 0.012), 0);
    c.lineTo(X(B + 0.05 + rodL), X(0.0048));
    c.lineTo(X(B + 0.05), X(0.0048));
    c.closePath();
    c.fill();
    c.fillStyle = 'rgb(20,17,15)';
    c.fill(sockP);
    c.restore();
    c.strokeStyle = rgba(INK.line, 0.3);
    c.lineWidth = 0.7;
    c.stroke(sockP);
    c.fillStyle = 'rgba(200,206,212,0.85)';
    c.fillRect(X(B + 0.004), X(-0.019), X(0.003), X(0.038));
  } else {
    c.beginPath();
    c.ellipse(X(B + 0.0035 * S), 0, X(0.004 * S), X(0.0052 * S), 0, 0, Math.PI * 2);
    c.fillStyle = 'rgb(22,19,17)';
    c.fill();
    c.strokeStyle = rgba(INK.line, 0.3);
    c.lineWidth = 0.7;
    c.stroke();
  }
  const tp = new Path2D();
  const NT = 30;
  for (let k = 0; k <= NT; k++) {
    const s = k / NT;
    const x = tpTop + s * (tpEnd - tpTop);
    if (k) tp.lineTo(X(x), X(-tpW(s) / 2));
    else tp.moveTo(X(x), X(-tpW(s) / 2));
  }
  for (let k = NT; k >= 0; k--) {
    const s = k / NT;
    tp.lineTo(X(tpTop + s * (tpEnd - tpTop)), X(tpW(s) / 2));
  }
  tp.closePath();
  c.save();
  c.shadowColor = 'rgba(24,28,34,0.46)';
  c.shadowBlur = 10 * sd;
  c.shadowOffsetY = 6 * sd;
  c.shadowOffsetX = 3 * sd;
  c.fillStyle = ebony(tpTop, tpEnd, (wTop / 2) * sc);
  c.fill(tp);
  c.restore();
  c.fillStyle = ebony(tpTop, tpEnd, (wTop / 2) * sc);
  c.fill(tp);
  c.strokeStyle = rgba(LIGHT, 0.22);
  c.lineWidth = 0.8;
  c.stroke(tp);
  if (bass) {
    // the bass's tailpiece is carved: a raised spine down its middle catching the light
    c.save();
    c.clip(tp);
    const sp = c.createLinearGradient(0, X(-wTop * 0.3), 0, X(wTop * 0.3));
    sp.addColorStop(0, 'rgba(120,112,104,0)');
    sp.addColorStop(0.5, 'rgba(120,112,104,0.22)');
    sp.addColorStop(1, 'rgba(120,112,104,0)');
    c.fillStyle = sp;
    c.fillRect(X(tpTop), X(-wTop * 0.3), X(tpEnd - tpTop), X(wTop * 0.6));
    c.restore();
  }
  // the fret (boxwood) the strings cross, and the holes behind it
  const xf = tpTop + 0.008 * S ** 0.7;
  c.strokeStyle = 'rgba(214,190,150,0.8)';
  c.lineWidth = Math.max(1, 0.0028 * S ** 0.6 * sc);
  c.beginPath();
  c.moveTo(X(xf), X(-wTop * 0.43));
  c.lineTo(X(xf), X(wTop * 0.43));
  c.stroke();
  // (the highest string's hole a little lower, for its fine tuner; a bass has none)
  const tailEnd = (i: number): Pt => [tpTop + 0.012 * S ** 0.7 + (i === 3 && !bass ? 0.012 * S ** 0.7 : 0), (1.5 - i) * p.spreadB * 0.62];
  for (let i = 0; i < 4; i++) {
    const [x, z] = tailEnd(i);
    c.beginPath();
    c.arc(X(x), X(z), Math.max(1, 0.0011 * S ** 0.6 * sc), 0, Math.PI * 2);
    c.fillStyle = 'rgb(4,3,3)';
    c.fill();
  }
  // a fine tuner on the highest string (nickel): its lever along the string and the knurled screw head
  if (!bass) {
    const [x, z] = tailEnd(3);
    const k = S ** 0.55;
    c.strokeStyle = 'rgba(150,158,166,0.75)';
    c.lineWidth = Math.max(1, 0.0022 * k * sc);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(X(x - 0.004 * k), X(z));
    c.lineTo(X(x + 0.0155 * k), X(z));
    c.stroke();
    c.lineCap = 'butt';
    c.beginPath();
    c.arc(X(x + 0.011 * k), X(z), Math.max(1.1, 0.0024 * k * sc), 0, Math.PI * 2);
    c.fillStyle = 'rgb(168,176,184)';
    c.fill();
  }
  // the bridge (maple), seen from above: its feet, the sloping face and the thin top edge (the bass's:
  // heavier, and a height adjuster in each leg, a knurled aluminium wheel on its screw)
  const bW = p.bridgeW;
  const { foot, topT, footL } = bwBridge(g, p);
  c.save();
  c.shadowColor = 'rgba(24,28,34,0.42)';
  c.shadowBlur = 5 * sd;
  c.shadowOffsetY = 4 * sd;
  c.shadowOffsetX = 2 * sd;
  c.fillStyle = 'rgb(176,150,112)';
  for (const sg of [-1, 1]) c.fillRect(X(xb - foot / 2), X(sg > 0 ? bW / 2 - footL : -bW / 2), X(foot), X(footL));
  c.restore();
  if (bass)
    for (const { x, z, r } of bassAdjusters(g, p)) {
      c.save();
      c.shadowColor = 'rgba(24,28,34,0.4)';
      c.shadowBlur = 4 * sd;
      c.shadowOffsetY = 3 * sd;
      c.shadowOffsetX = 1.5 * sd;
      const ag = c.createLinearGradient(X(x - r), X(z - r), X(x + r), X(z + r));
      ag.addColorStop(0, 'rgb(226,230,234)');
      ag.addColorStop(0.55, 'rgb(150,156,162)');
      ag.addColorStop(1, 'rgb(96,102,108)');
      c.fillStyle = ag;
      c.beginPath();
      c.arc(X(x), X(z), X(r), 0, Math.PI * 2);
      c.fill();
      c.restore();
      // the knurled rim, the screw through it
      c.strokeStyle = 'rgba(40,44,48,0.75)';
      c.lineWidth = 0.6;
      c.beginPath();
      for (let k = 0; k < 20; k++) {
        const th = (k / 20) * Math.PI * 2;
        c.moveTo(X(x + r * Math.cos(th)), X(z + r * Math.sin(th)));
        c.lineTo(X(x + r * 0.8 * Math.cos(th)), X(z + r * 0.8 * Math.sin(th)));
      }
      c.stroke();
      c.beginPath();
      c.arc(X(x), X(z), X(r), 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(X(x), X(z), X(r * 0.3), 0, Math.PI * 2);
      c.fillStyle = 'rgb(176,150,112)';
      c.fill();
      c.stroke();
    }
  c.save();
  c.shadowColor = 'rgba(24,28,34,0.42)';
  c.shadowBlur = 5 * sd;
  c.shadowOffsetY = 4 * sd;
  c.shadowOffsetX = 2 * sd;
  c.beginPath();
  c.moveTo(X(xb - foot * 0.42), X(-bW * 0.44));
  c.lineTo(X(xb + topT / 2), X(-bW * 0.44));
  c.lineTo(X(xb + topT / 2), X(bW * 0.44));
  c.lineTo(X(xb - foot * 0.42), X(bW * 0.44));
  c.closePath();
  const bg = c.createLinearGradient(X(xb - foot / 2), 0, X(xb + topT / 2), 0);
  bg.addColorStop(0, 'rgb(170,146,108)');
  bg.addColorStop(1, 'rgb(226,206,168)');
  c.fillStyle = bg;
  c.fill();
  c.restore();
  c.strokeStyle = 'rgba(255,244,222,0.9)';
  c.lineWidth = Math.max(1, topT * sc);
  c.beginPath();
  c.moveTo(X(xb), X(-bW * 0.44));
  c.lineTo(X(xb), X(bW * 0.44));
  c.stroke();
  // the strings' after-length, bridge to tailpiece
  for (let i = 0; i < 4; i++) {
    const [x, z] = tailEnd(i);
    c.strokeStyle = p.wound[i] ? 'rgba(214,204,186,0.6)' : 'rgba(228,234,240,0.7)';
    c.lineWidth = Math.max(0.6, p.dia[i] * sc);
    c.beginPath();
    c.moveTo(X(xb), X((1.5 - i) * p.spreadB));
    c.lineTo(X(x), X(z));
    c.stroke();
  }
  // the scratch canvas was only for the purfling
  if (bwScratch) bwScratch.width = bwScratch.height = 1;
  return { key, lay, plate: A.box, fit: F.box, body, glow };
}

/**
 * A violin, viola or cello in the W×H box at the context's origin, nothing drawn outside the box.
 * With `bowLater` the bow is left out and handed back: called, it draws the bow with no clip. An
 * ensemble draws its bows that way, after every instrument (ensemble-draw.ts): a bow is longer than
 * its instrument's cell is wide, and it lies over the neighbours.
 */
export function drawBowed(ctx: CanvasRenderingContext2D, W: number, H: number, g: BowedGeom, fr: VisualFrame | null, st: BowedState, field: ModeField, now: number, bowLater = false, scale?: number, top = 0): (() => void) | null {
  const p = BOWED_PLAN[g.id];
  const sh = bowedShapes(g.id, p, g.L);
  const dpr = Math.max(1, Math.abs(ctx.getTransform().a) || 1);
  const key = `${g.id}|${g.L}|${W}|${H}|${dpr}|${scale ?? ''}|${top}`;
  let ly = bowedLayers.get(key);
  if (!ly) {
    ly = paintBowedLayers(g, p, sh, bowedLayout(g, p, sh, W, H, scale, top), W, H, dpr, key);
    bowedLayers.set(key, ly);
    for (const k of bowedLayers.keys()) {
      if (bowedLayers.size <= 6) break;
      bowedLayers.delete(k);
    }
  }
  const { sc } = ly.lay;
  const B = p.body;
  const S = B / 0.356;
  const L = g.L;
  const xb = L - p.neck;
  const xn = -p.neck;
  const X = (x: number) => x * sc;
  // string i's place across (m) at x along
  const zAt = (i: number, x: number) => (1.5 - i) * (p.spreadN + ((p.spreadB - p.spreadN) * (x - xn)) / L);

  // between frames
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
  ctx.drawImage(ly.plate.cv, ly.plate.x, ly.plate.y, ly.plate.w, ly.plate.h);
  bwPlace(ctx, ly.lay);

  // the body's modes, as sand on a plate: pale nodal lines and a breath of blue where it moves, on the
  // varnish, kept under the strings and out of the f-holes
  const lvl = field.update(fr?.modes ?? null, now / 1000);
  if (lvl > 0.01) {
    ctx.save();
    ctx.clip(ly.glow, 'evenodd');
    ctx.globalAlpha = 0.55;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(field.canvas, 0, X(-sh.hwMax), X(B), X(2 * sh.hwMax));
    ctx.restore();
  }
  // inside, seen as through the top: the bass bar under the bass foot, the soundpost behind the treble
  // foot; they carry the bridge's motion into the plates, so they show with the body's level
  {
    const zBar = 0.4 * p.bridgeW;
    const x0 = (B - p.bar[1]) / 2;
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = rgba(LIGHT, 0.16 + 0.3 * lvl);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const sg of [-1, 1]) {
      ctx.moveTo(X(x0), X(zBar - 0.002 * S + (sg * p.bar[0]) / 2));
      ctx.quadraticCurveTo(X(B / 2), X(zBar + (sg * p.bar[0]) / 2), X(x0 + p.bar[1]), X(zBar + 0.0015 * S + (sg * p.bar[0]) / 2));
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(xb + 0.003 * S), X(-(p.bridgeW / 2 - 0.0045 * S)), (p.post / 2) * sc, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.setTransform(base);
  ctx.drawImage(ly.fit.cv, ly.fit.x, ly.fit.y, ly.fit.w, ly.fit.h);
  bwPlace(ctx, ly.lay);

  // ---- the strings, the fingers, the bowed string's shape
  const strs = fr?.strings;
  const focus = fr?.focus ?? null;
  const bowedIdx = strs ? strs.findIndex((s) => s.bowing) : -1;
  let mxl = 0;
  if (strs) for (const s of strs) mxl = Math.max(mxl, s.level);
  const norm = st.lvlScale.of(mxl);
  const fingerX: number[] = [xn, xn, xn, xn];
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const s = strs?.[i];
    // the finger: its place eased so a shift slides (τ 35 ms) while vibrato goes straight through,
    // drawn four times larger than life
    const stopped = !!s && s.stop < 0.995;
    const base = s ? xb - s.stop * L : xn;
    if (stopped) {
      if (lv.fa[i] < 0.05) lv.fx[i] = base;
      else lv.fx[i] += (base - lv.fx[i]) * ease(0.035);
    }
    lv.fa[i] += ((stopped ? 1 : 0) - lv.fa[i]) * ease(stopped ? 0.03 : 0.09);
    const dev = s && stopped ? -(s.stopNow ?? s.stop) * L + s.stop * L : 0;
    const fx = lv.fx[i] + 4 * dev;
    const decay = Math.exp(-dt / 0.45);
    lv.vlo[i] = Math.min(4 * dev, lv.vlo[i] * decay);
    lv.vhi[i] = Math.max(4 * dev, lv.vhi[i] * decay);
    fingerX[i] = lv.fa[i] > 0.02 ? fx : xn;
    const l = s ? Math.sqrt(s.level / norm) : 0;
    // the string itself, at its own gauge
    ctx.strokeStyle = p.wound[i] ? 'rgba(214,204,186,0.72)' : 'rgba(228,234,240,0.85)';
    ctx.lineWidth = Math.max(0.6, p.dia[i] * sc);
    ctx.beginPath();
    ctx.moveTo(X(xn), X(zAt(i, xn)));
    ctx.lineTo(X(xb), X(zAt(i, xb)));
    ctx.stroke();
    // a ringing string is drawn in the blue between its finger and the bridge, by its level (the bowed
    // one shows its shape instead)
    if (l > 0.03 && !(focus && i === bowedIdx)) {
      const x0 = Math.max(xn, fingerX[i]);
      ctx.strokeStyle = rgba(INK.sound, 0.9 * (0.3 + 0.7 * l));
      ctx.lineWidth = Math.max(1.6, p.dia[i] * sc);
      ctx.beginPath();
      ctx.moveTo(X(x0), X(zAt(i, x0)));
      ctx.lineTo(X(xb), X(zAt(i, xb)));
      ctx.stroke();
    }
  }
  // fingertips: a pad pressing the string to the board, rolling with the vibrato (its range a faint
  // bar), the contact a firm line across the string: where it is stopped (a light, on the ebony)
  for (let i = 0; i < 4; i++) {
    const a = lv.fa[i];
    if (a < 0.02) continue;
    const s = strs?.[i];
    const lit = s?.bowing ? 1 : 0.6;
    const x = fingerX[i];
    const z = zAt(i, x);
    const pad = 0.0066;
    ctx.globalAlpha = a;
    if (lv.vhi[i] - lv.vlo[i] > 0.0004) {
      ctx.strokeStyle = rgba(LIGHT, 0.4 * lit);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(lv.fx[i] + lv.vlo[i]), X(z) + X(pad) * 0.95);
      ctx.lineTo(X(lv.fx[i] + lv.vhi[i]), X(z) + X(pad) * 0.95);
      ctx.stroke();
    }
    const roll = (x - lv.fx[i]) * 0.5;
    const gr = ctx.createRadialGradient(X(x - roll), X(z), 0, X(x - roll), X(z), X(pad));
    gr.addColorStop(0, rgba(INK.felt, 0.62 * lit));
    gr.addColorStop(0.65, rgba(INK.felt, 0.42 * lit));
    gr.addColorStop(1, rgba(INK.felt, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(X(x - roll), X(z), X(pad * 0.85), X(pad), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(LIGHT, 0.95 * lit);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(x), X(z - pad * 0.55));
    ctx.lineTo(X(x), X(z + pad * 0.55));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // the bowed string's Helmholtz motion (sideways, in the bowing direction, in plan): its shape now,
  // the envelope it has swept lately, and the travelling corner
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
    ctx.fillStyle = rgba(INK.sound, 0.18);
    ctx.fill();
    ctx.strokeStyle = rgba(INK.sound, 0.5);
    ctx.lineWidth = 0.7;
    ctx.stroke();
    let kc = 1;
    let best = -1;
    for (let k = 1; k < n - 1; k++) {
      const d2 = Math.abs(shp[k - 1] - 2 * shp[k] + shp[k + 1]);
      if (d2 > best) {
        best = d2;
        kc = k;
      }
    }
    ctx.strokeStyle = rgba(INK.sound, 1);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const x = xk(k);
      const z = zAt(bowedIdx, x) - shp[k] * amp;
      if (k) ctx.lineTo(X(x), X(z));
      else ctx.moveTo(X(x), X(z));
    }
    ctx.stroke();
    // the corner: a light dot ringed in the blue (it runs over the ebony and over the varnish)
    const cxk = xk(kc);
    const czk = zAt(bowedIdx, cxk) - shp[kc] * amp;
    ctx.fillStyle = rgba(LIGHT, 0.96);
    ctx.beginPath();
    ctx.arc(X(cxk), X(czk), 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK.sound, 1);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ---- the bow
  const bow = fr?.bow;
  const playing = bowedIdx >= 0;
  if (playing) {
    lv.bi = bowedIdx;
    if (focus) lv.beta = bwClamp(1 - focus.hammerAt, 0.02, 0.45);
  }
  const sb = strs?.[lv.bi];
  const cxT = xb - lv.beta * (sb ? (sb.stopNow ?? sb.stop) : 1) * L;
  const czT = zAt(lv.bi, cxT);
  // the bow lies tangent to the bridge's arch at the string it plays, so over the outer strings it is
  // inclined and its plan shortens (cos of the slope; strings3d.ts poses it the same way)
  const inclT = Math.atan(((1.5 - lv.bi) * p.spreadB) / p.bridgeR);
  // a lifted bow is set down where it plays; a playing one moves there (string crossings, contact)
  const snap = playing && lv.lift > 0.9;
  lv.cx += (cxT - lv.cx) * (snap ? 1 : ease(0.05));
  lv.cz += (czT - lv.cz) * (snap ? 1 : ease(0.06));
  lv.incl += (inclT - lv.incl) * (snap ? 1 : ease(0.06));
  lv.lift += (bowLift(lv, playing, bow?.lift, dt) - lv.lift) * ease(playing || bow?.lift === undefined || lv.quiet! > 0.6 ? 0.15 : 0.05);
  const Hh = g.bowLength;
  const S2 = bowFit(g);
  const pos = bow ? bwClamp(bow.pos, 0, 1) : 0.5;
  const ci = Math.cos(lv.incl);
  // the stick leans towards the fingerboard (the player tilts the hair), so from above it shows beside
  // the hair, closest in the middle where the camber brings it down
  const tilt = Math.sin(0.7);
  const tiltC = Math.cos(0.7);
  // the stick's height over the hair: 17.5 mm at the frog, down to 8 mm at the middle (the camber),
  // rising smoothly into the head
  const hgt = (s: number) => 0.0175 * S2 - 0.0095 * S2 * Math.sin(Math.PI * bwClamp(s / Hh, 0, 1)) + 0.004 * S2 * bwSstep(0.94, 1.01, s / Hh);
  const Zs = (s: number) => lv.cz + (pos * Hh - s) * ci;
  {
    // local (x along the strings, z across) to the stage, as bwPlace turns it
    const { ox, oy, vertical } = ly.lay;
    const P = (x: number, z: number): [number, number] => (vertical ? [ox - X(z), oy + X(x)] : [ox + X(x), oy + X(z)]);
    const [fx, fy] = P(lv.cx, Zs(0));
    const [tx, ty] = P(lv.cx, Zs(Hh));
    st.bowLine = { fx, fy, tx, ty, pos };
    st.drawn = ly.drawn ??= bowedDrawn(g, p, sh, ly.lay);
  }
  const lay = ly.lay;
  /** the bow and the contact (in the local frame bwPlace sets) */
  const drawBow = () => {
    // the hair gives under the string: δ = F·a·(H − a)/(T·H) for hair tension T ≈ 60 N, drawn 3× larger
    const F = bwForce(fr?.excite?.meta);
    const s0 = 0.003 * S2;
    const s1 = Hh - 0.002 * S2;
    const ac = bwClamp(pos * Hh, s0 + 1e-4, s1 - 1e-4);
    // (drawn larger to be seen; where the whole ribbon is 2–3 px, an orchestra's seat, that much would only
    // carry it under the stick: there it is drawn straight)
    const seen = bwClamp((Math.abs(X(p.hairW * tiltC)) - 3) / 5, 0, 1);
    const d0 = playing ? seen * Math.min(0.6 * p.hairW, (3 * F * ac * (Hh - ac)) / (60 * Hh)) : 0;
    const defl = (s: number) => (s <= ac ? (d0 * s) / Math.max(1e-6, ac) : (d0 * (Hh - s)) / Math.max(1e-6, Hh - ac));
    const Xh = (s: number, h: number) => X(lv.cx - h * tilt - defl(bwClamp(s, 0, Hh)));
    const alpha = 1 - 0.55 * lv.lift;
    ctx.globalAlpha = alpha;
    // the bow's own shadow on what lies under it, down and a little to the right as the instrument's (no
    // blur: it moves every frame); in the local frame, which an upright instrument turns
    const sdx = Math.min(7, 0.004 * sc);
    const sdy = Math.min(12, 0.007 * sc);
    const [shx, shy] = lay.vertical ? [sdy, -sdx] : [sdx, sdy];
    const hw = (p.hairW * tiltC) / 2;
    {
      // (the bow is straight: one line along it, from the stick's far side to the hair's, laid four times,
      // each narrower, so that it is soft at its sides and its ends; never wider than it is thrown, so
      // that nothing of it shows on the bow's side towards the light)
      const xL = X(lv.cx - 0.0215 * S2 * tilt - p.stick[0] / 2);
      const xR = X(lv.cx) + X(hw);
      const wS = xR - xL;
      const f = Math.min(0.3 * wS, Math.abs(shx));
      const xc = (xL + xR) / 2 + shx;
      const zA = X(Zs(-0.09 * S2)) + shy;
      const zB = X(Zs(Hh)) + shy;
      const cap = (Math.sign(zB - zA) * wS) / 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(24,28,34,0.055)';
      for (const k of [1, 0.66, 0.33, 0]) {
        ctx.lineWidth = wS + 2 * f * k;
        ctx.beginPath();
        ctx.moveTo(xc, zA + cap);
        ctx.lineTo(xc, zB - cap);
        ctx.stroke();
      }
    }
    // hair: a pale ribbon with an edge (it lies over the plaster too), its strands dashed so that they
    // ride along with the bow
    ctx.beginPath();
    for (const s of [s0, ac, s1]) ctx.lineTo(Xh(s, 0) - X(hw), X(Zs(s)));
    for (const s of [s1, ac, s0]) ctx.lineTo(Xh(s, 0) + X(hw), X(Zs(s)));
    ctx.closePath();
    // (the edge under the ribbon: its outer half shows on the plaster; the ribbon itself stays pale where it
    // crosses a varnish, however narrow it is drawn: an orchestra's violin bow has 2–3 px of hair)
    ctx.strokeStyle = rgba(INK.line, 0.42);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(244,239,226,0.95)';
    ctx.fill();
    ctx.lineCap = 'butt';
    ctx.lineWidth = 0.7;
    const dashes = [[18, 4, 30, 3, 11, 5], [26, 3, 9, 6, 20, 4], [12, 5, 34, 2, 16, 3], [22, 4, 14, 3, 28, 5]];
    // (its strands only where the ribbon is wide enough to carry them: four lines in 3 px are a grey bar)
    const strands = Math.max(0, Math.min(1, (2 * Math.abs(X(hw)) - 3) / 4));
    for (let k = 0; k < 4 && strands > 0; k++) {
      const off = X(hw) * ((k + 0.5) / 2 - 1);
      ctx.setLineDash(dashes[k]);
      ctx.strokeStyle = `rgba(122,108,86,${(0.6 * strands).toFixed(3)})`;
      ctx.beginPath();
      for (const s of [s0, ac, s1]) ctx.lineTo(Xh(s, 0) + off, X(Zs(s)));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // the stick (pernambuco), round and tapering: Tourte's 110 mm of full diameter, then a taper
    const sBack = -0.085 * S2;
    const sHead = Hh + 0.006 * S2;
    const dia = (s: number) => {
      const t = bwClamp((s - (sBack + 0.11 * S2)) / (sHead - sBack - 0.11 * S2), 0, 1);
      return p.stick[0] * Math.pow(p.stick[1] / p.stick[0], Math.pow(t, 1.2));
    };
    const NS = 28;
    const stick = new Path2D();
    for (let k = 0; k <= NS; k++) {
      const s = sBack + ((sHead - sBack) * k) / NS;
      const x = X(lv.cx - hgt(s) * tilt) - X(dia(s) / 2);
      if (k) stick.lineTo(x, X(Zs(s)));
      else stick.moveTo(x, X(Zs(s)));
    }
    for (let k = NS; k >= 0; k--) {
      const s = sBack + ((sHead - sBack) * k) / NS;
      stick.lineTo(X(lv.cx - hgt(s) * tilt) + X(dia(s) / 2), X(Zs(s)));
    }
    stick.closePath();
    // the head: its profile from strings3d.ts, the ivory face plate at the tip
    // a profile (s along the bow, h above the hair) seen from above, and a part of thickness t as the
    // profile swept across t (its near face turned a little towards us)
    const proj = (pts: Pt[]) => pts.map(([s, h]): Pt => [X(lv.cx - h * tilt), X(Zs(s))]);
    const slab = (pts: Pt[], t: number): Pt[] => {
      const q = proj(pts);
      const d = X((t / 2) * tiltC);
      return bwHull([...q.map(([x, y]): Pt => [x - d, y]), ...q.map(([x, y]): Pt => [x + d, y])]);
    };
    const hTop = hgt(Hh + 0.006 * S2) + 0.003 * S2;
    const headProf: Pt[] = [
      [Hh - 0.004 * S2, 0.0035 * S2], [Hh, -0.0012], [Hh + 0.0085 * S2, -0.0015], [Hh + 0.0105 * S2, 0.004 * S2], [Hh + 0.0095 * S2, 0.0125 * S2], [Hh + 0.006 * S2, hTop], [Hh - 0.006 * S2, hgt(Hh - 0.006 * S2) + 0.4 * p.stick[1]],
    ];
    const headT = p.stick[1] * 1.15;
    const headP = slab(headProf, headT);
    const plateP = slab([[Hh + 0.0086 * S2, -0.0016], [Hh + 0.0108 * S2, -0.0016], [Hh + 0.0128 * S2, 0.004 * S2], [Hh + 0.0116 * S2, 0.0128 * S2], [Hh + 0.0096 * S2, 0.0125 * S2], [Hh + 0.0105 * S2, 0.004 * S2]], p.stick[1] * 1.17);
    const pathOf = (pts: Pt[]) => {
      const q = new Path2D();
      pts.forEach(([x, y], i) => (i ? q.lineTo(x, y) : q.moveTo(x, y)));
      q.closePath();
      return q;
    };
    const head = pathOf(headP);
    ctx.fillStyle = 'rgb(108,48,20)';
    ctx.fill(stick);
    ctx.fill(head);
    ctx.strokeStyle = 'rgba(16,6,2,0.7)';
    ctx.lineWidth = 0.7;
    ctx.stroke(stick);
    ctx.stroke(head);
    ctx.fillStyle = 'rgb(140,68,30)';
    ctx.fill(pathOf(proj(headProf).map(([x, y]): Pt => [x + X((headT / 2) * tiltC), y])));
    // the face plate at the tip: ivory, with its edge
    const plate = pathOf(plateP);
    ctx.fillStyle = 'rgb(240,234,220)';
    ctx.fill(plate);
    ctx.strokeStyle = rgba(INK.line, 0.5);
    ctx.lineWidth = 0.6;
    ctx.stroke(plate);
    // the stick is round: lit along one side, in shade along the other
    for (const [off, w, col] of [[-0.2, 0.34, 'rgba(206,120,70,0.55)'], [-0.24, 0.1, 'rgba(255,214,176,0.7)'], [0.3, 0.22, 'rgba(30,10,4,0.45)']] as const) {
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (let k = 0; k <= NS; k++) {
        const s = sBack + 0.01 * S2 + ((sHead - sBack - 0.012 * S2) * k) / NS;
        ctx.lineTo(X(lv.cx - hgt(s) * tilt) + X(dia(s) * off), X(Zs(s)));
      }
      ctx.lineWidth = Math.max(0.6, X(p.stick[1] * w));
      ctx.stroke();
    }
    // the winding (silver wire) and the thumb leather by the frog; the button at the end
    const band = (sA: number, sB: number, fill: string, wire: boolean) => {
      const xa = X(lv.cx - hgt((sA + sB) / 2) * tilt);
      const r = X(dia(sA) / 2 + 0.0004);
      ctx.fillStyle = fill;
      ctx.fillRect(xa - r, Math.min(X(Zs(sA)), X(Zs(sB))), 2 * r, Math.abs(X(Zs(sB)) - X(Zs(sA))));
      // (silver and leather alike: an edge, so the pale ones stand off the plaster)
      ctx.strokeStyle = 'rgba(60,66,74,0.6)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(xa - r, Math.min(X(Zs(sA)), X(Zs(sB))), 2 * r, Math.abs(X(Zs(sB)) - X(Zs(sA))));
      if (wire) {
        ctx.strokeStyle = 'rgba(90,96,102,0.6)';
        ctx.lineWidth = 0.5;
        const n = Math.max(2, Math.round(Math.abs(X(Zs(sB)) - X(Zs(sA))) / 1.6));
        ctx.beginPath();
        for (let k = 1; k < n; k++) {
          const y = X(Zs(sA + ((sB - sA) * k) / n));
          ctx.moveTo(xa - r, y);
          ctx.lineTo(xa + r, y);
        }
        ctx.stroke();
      }
    };
    band(0.004 * S2, 0.034 * S2, 'rgb(214,219,224)', true);
    band(-0.008 * S2, 0.004 * S2, 'rgb(64,40,26)', false);
    band(sBack - 0.016 * S2, sBack - 0.013 * S2, 'rgb(214,219,224)', false);
    band(sBack - 0.013 * S2, sBack - 0.004 * S2, 'rgb(20,17,15)', false);
    band(sBack - 0.004 * S2, sBack, 'rgb(214,219,224)', false);
    // the frog (ebony): its side profile seen from above with the bow tilted, the silver ferrule where the
    // hair leaves it, the pearl eye
    const fl = 0.047 * S2;
    const top = hgt(-0.02 * S2) - 0.003;
    const fw = 0.0124 * S2;
    const frogProf: Pt[] = [[0.002 * S2, -0.0025], [-fl + 0.004 * S2, -0.0028], [-fl, 0.004 * S2], [-fl + 0.003 * S2, top - 0.001 * S2], [-fl + 0.012 * S2, top], [-0.004 * S2, top], [0, 0.006 * S2]];
    const frog = pathOf(slab(frogProf, fw));
    ctx.fillStyle = 'rgb(18,16,15)';
    ctx.fill(frog);
    // (its edge: a light, for where it lies over the fingerboard or the varnish)
    ctx.strokeStyle = rgba(LIGHT, 0.28);
    ctx.lineWidth = 0.8;
    ctx.stroke(frog);
    // its near side face (the one the tilt turns up towards us): polished ebony, the pearl slide along
    // its hair edge, the silver underslide at its back, the pearl eye
    const side = (pts: Pt[]) => pathOf(proj(pts).map(([x, y]): Pt => [x + X((fw / 2) * tiltC), y]));
    ctx.fillStyle = 'rgb(44,41,38)';
    ctx.fill(side(frogProf));
    ctx.fillStyle = 'rgba(226,232,236,0.75)';
    ctx.fill(side([[-0.0005 * S2, -0.0028], [-fl + 0.005 * S2, -0.0028], [-fl + 0.005 * S2, -0.0008], [-0.0005 * S2, -0.0008]]));
    ctx.fillStyle = 'rgb(186,192,198)';
    ctx.fill(side([[-fl + 0.0006 * S2, 0.004 * S2], [-fl + 0.0062 * S2, 0.004 * S2], [-fl + 0.0062 * S2, top - 0.0015 * S2], [-fl + 0.0028 * S2, top - 0.0015 * S2]]));
    const ferr = pathOf(slab([[0.0015 * S2, -0.003 * S2], [0.0047 * S2, -0.003 * S2], [0.0047 * S2, 0.0054 * S2], [0.0015 * S2, 0.0054 * S2]], fw * 1.04));
    ctx.fillStyle = 'rgb(214,219,224)';
    ctx.fill(ferr);
    ctx.strokeStyle = 'rgba(60,66,74,0.6)';
    ctx.lineWidth = 0.5;
    ctx.stroke(ferr);
    const eye = proj([[-0.022 * S2, 0.006 * S2]])[0];
    ctx.beginPath();
    ctx.ellipse(eye[0] + X((fw / 2) * tiltC), eye[1], X(0.0028 * S2 * tilt), X(0.0028 * S2), 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232,238,244,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,170,180,0.9)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    // the contact: where hair meets string, the bow's pull on it, by the power the bow puts in
    if (playing && bow) {
      const v = Math.abs(bow.speed);
      const pw = Math.min(1, Math.sqrt((v * F) / 0.25));
      const gx = X(lv.cx);
      const gz = X(lv.cz);
      const rc = Math.max(4, X(p.spreadB) * (0.35 + 0.45 * Math.min(1.5, Math.sqrt(F / 0.5))));
      ctx.beginPath();
      ctx.arc(gx, gz, rc * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = rgba(INK.sound, 0.12 + 0.3 * pw);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.sound, 0.35 + 0.6 * pw);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // (no mark for the bow's direction here: the bow itself moves; the vector style keeps its chevron)
    }
    ctx.globalAlpha = 1;
  };
  if (!bowLater) {
    drawBow();
    ctx.restore();
    return null;
  }
  ctx.restore();
  return () => {
    ctx.save();
    ctx.setTransform(base);
    bwPlace(ctx, lay);
    drawBow();
    ctx.restore();
  };
}
