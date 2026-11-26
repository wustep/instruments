// Day Studio: the trumpet on the 2D stage, gold in daylight, its caps, stems and mouthpiece silver, a
// pressed piston's button in ink, the bore's standing wave in the blue along the air's path. The plan and
// its projection are the shared drawer's (ui/stage-draw.ts); the layout (with the paths kept per size,
// which are this drawing's own) is kept here.
import type { VisualFrame } from '@piano-model/engine';
import { AutoScale, boreAt, BRASS_BREATH, brassBreath, INK, newBoreWave, rgba, slowPhase, spring01, TR_BELL_END, TR_BELL_LEN, TR_BELL_R, TR_BELL0, TR_BOUNDS, TR_BOW, TR_BOW_C, TR_CAP_TOP, TR_CY, TR_LEAD, TR_LEAD_END, TR_MAIN, TR_MP, TR_MPIECE, TR_MS_LOW, TR_MS_TOP, TR_MS_X, TR_RC, TR_RIM, TR_RT, TR_SLIDE_TRAVEL, TR_SLIDES, TR_STEM, TR_STROKE, TR_TAIL, TR_VX, TR_XB, TR_ZB, TR_ZL, trackBoreWave, trAir, trAlong, trBellR, type TrLayout, trLeadY, trPoly, trProj, type TrumpetState, type V3, v3add, v3len, v3lerp, VALVE_DOWN, waveInk } from '../../../ui/stage-draw.ts';
import { BRASS, breathStream, floorShadow, SILVER } from './kit.ts';

let trLayout: TrLayout | null = null;
export function trumpetLayout(W: number, H: number): TrLayout {
  const key = `${W}x${H}`;
  if (trLayout && trLayout.key === key) return trLayout;
  const b = TR_BOUNDS;
  const portrait = H > W * 1.05;
  const S = Math.min(((portrait ? 0.9 : 0.84) * W) / (b.x1 - b.x0), ((portrait ? 0.5 : 0.62) * H) / (b.y1 - b.y0));
  const ox = W / 2 - ((b.x0 + b.x1) / 2) * S;
  const oy = H * (portrait ? 0.38 : 0.47) - ((b.y0 + b.y1) / 2) * S;
  trLayout = { key, S, ox, oy, memo: new Map() };
  return trLayout;
}
// lacquered yellow brass in daylight: gold, its lit side towards the window (up and to the left), the bore's
// inside in deep shade
const BRASS_BODY = BRASS.body;
const BRASS_DEEP = BRASS.deep;
/** a metal as a round part is painted: across it from the lit side to the far one, its face towards us (a
 *  cap's top, a wire's middle), its edge */
interface Metal {
  stops: readonly (readonly [number, string])[];
  face: string;
  edge: string;
}
const M_BRASS: Metal = { stops: [[0, '#cfa850'], [0.24, BRASS.lit], [0.5, BRASS.body], [0.82, BRASS.shade], [1, BRASS.deep]], face: '#ecd28a', edge: BRASS.edge };
const M_NICKEL: Metal = { stops: [[0, '#b9c0c7'], [0.24, SILVER.lit], [0.5, SILVER.body], [0.84, SILVER.shade], [1, SILVER.deep]], face: '#eceef0', edge: SILVER.edge };

/** Side view of a B♭ trumpet from the player's left, a little in front of the bell and above: the
 *  mouthpiece and leadpipe, the main tuning slide, three piston valves (the pistons going down with the
 *  engine's fingering, on springs), the first and third slides (kicked out on the notes that need it)
 *  and the second's crook, the bell tail, bow and the flare to the rim. Gold in daylight, its caps, stems
 *  and mouthpiece silver, a pressed piston's button in ink. The bore's standing wave (the engine's, with
 *  its sign; drawn slowed) runs in the blue along the air's path from the lips to the bell, through the
 *  pressed valves' slides; the breath goes into the mouthpiece. */
export function drawTrumpet(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TrumpetState): void {
  const L = trumpetLayout(W, H);
  const { S } = L;
  const P = (q: [number, number]): [number, number] => [L.ox + q[0] * S, L.oy + q[1] * S];
  const memo = <T,>(k: string, f: () => T): T => {
    let v = L.memo.get(k) as T | undefined;
    if (v === undefined) L.memo.set(k, (v = f()));
    return v;
  };
  /** a 3D offset (a slide kicked out, a piston down) on the screen */
  const shift = (o: V3): [number, number] => {
    const q = trProj(o);
    return [q[0] * S, q[1] * S];
  };
  const now = performance.now();
  const meta = fr?.excite?.meta ?? '';
  const valves = /valves (\S+)/.exec(meta)?.[1] ?? 'open';
  const down = VALVE_DOWN[valves] ?? VALVE_DOWN.open;
  const focus = fr?.focus ?? null;
  // ---- the mechanism's springs (the 3D model's: pistons 22 Hz, slides 6 Hz)
  // ---- the standing wave along the air's path
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const lvl = Math.min(1, peak / scale);
  // ---- the mechanism's springs (the 3D model's: pistons 22 Hz, slides 6 Hz); the fingers stay down
  // while the trumpet sounds and a moment after, then lift
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
  // the pressure at s along the path (m from the lips): the engine's wave, and in the bell's flare the
  // Webster horn's 1/r (p = ψ/r: the loop's wave is ψ, spreading over the widening mouth)
  const ampAt = (s: number) => {
    const d = total - s;
    const taper = d < TR_BELL_LEN ? TR_BELL_R[TR_BELL_R.length - 1] / trBellR(d) : 1;
    return (boreAt(w.amp, s / total) / scale) * taper;
  };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const D = 2 * TR_RT * S;
  // the air in the tubes: a pale strip, the blue's own tint (over gold a thin blue goes grey: the strip keeps
  // it blue), and over it the envelope's and the swing's strength in the blue
  const AIR_TONE = '232,238,252';
  const AIR_BASE = 0.72;
  const AIR_ENV = 0.55;
  const AIR_SWING = 0.7;
  /** the steps the wave's strength is drawn in along the tubes */
  const AIR_N = 14;
  /** tubes along 3D polylines: an edge, the body, the side away from the light in shade (and deeper
   *  along its far edge), the lacquer's light on the side towards the window (above, a little to the
   *  left); their paths are kept per canvas size under `key` */
  const tubes = (key: string, polys: () => V3[][], d = D, edge = BRASS.edge, body = BRASS_BODY, off?: V3) => {
    const { p, hp, sp, dp } = memo(`tube:${key}`, () => {
      const p = new Path2D();
      const hp = new Path2D();
      const sp = new Path2D();
      const dp = new Path2D();
      for (const pl3 of polys()) {
        const pl = trPoly(pl3).map(P);
        pl.forEach((q, i) => (i ? p.lineTo(...q) : p.moveTo(...q)));
        pl.forEach(([x, y], i) => {
          const a = pl[Math.max(0, i - 1)];
          const b = pl[Math.min(pl.length - 1, i + 1)];
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const nx = -(b[1] - a[1]) / l;
          const ny = (b[0] - a[0]) / l;
          // (how far towards the light this stretch of the tube shows its side: eased, so an upright
          // stretch still has its lit side and its side in shade)
          const dot = nx * -0.3 + ny * -0.95;
          const o = d * Math.sign(dot) * Math.sqrt(Math.abs(dot));
          for (const [path, k] of [[hp, 0.25], [sp, -0.22], [dp, -0.39]] as const) {
            if (i) path.lineTo(x + nx * o * k, y + ny * o * k);
            else path.moveTo(x + nx * o * k, y + ny * o * k);
          }
        });
      }
      return { p, hp, sp, dp };
    });
    const o = off ? shift(off) : null;
    if (o) {
      ctx.save();
      ctx.translate(o[0], o[1]);
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = d + 2.2;
    ctx.stroke(p);
    ctx.strokeStyle = body;
    ctx.lineWidth = d;
    ctx.stroke(p);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(176,134,58,0.6)';
    ctx.lineWidth = 0.5 * d;
    ctx.stroke(sp);
    ctx.strokeStyle = 'rgba(125,92,34,0.5)';
    ctx.lineWidth = 0.2 * d;
    ctx.stroke(dp);
    ctx.strokeStyle = 'rgba(243,220,154,0.5)';
    ctx.lineWidth = 0.36 * d;
    ctx.stroke(hp);
    ctx.strokeStyle = 'rgba(248,232,180,0.9)';
    ctx.lineWidth = Math.max(1, 0.15 * d);
    ctx.stroke(hp);
    ctx.lineCap = 'round';
    if (o) ctx.restore();
  };
  /** a wire part (a ring, a hook, a rod) in a metal: its edge, then its body along the middle */
  const wire = (w: number, m: Metal) => {
    ctx.strokeStyle = m.edge;
    ctx.lineWidth = w + 1.4;
    ctx.stroke();
    ctx.strokeStyle = m.face;
    ctx.lineWidth = Math.max(0.8, w - 0.6);
    ctx.stroke();
  };
  // a ferrule: the sleeve soldered over a joint, a short band a little proud of the tube
  const ferrule = (p: V3, off: V3 = [0, 0, 0], r = TR_RT) => {
    const a = P(trProj(v3add(p, off)));
    const b = P(trProj(v3add(p, v3add(off, [0.01, 0, 0]))));
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / l;
    const uy = (b[1] - a[1]) / l;
    const h = 0.0016 * S;
    const w = (r + 0.0011) * S;
    ctx.beginPath();
    ctx.moveTo(a[0] - ux * h + uy * w, a[1] - uy * h - ux * w);
    ctx.lineTo(a[0] + ux * h + uy * w, a[1] + uy * h - ux * w);
    ctx.lineTo(a[0] + ux * h - uy * w, a[1] + uy * h + ux * w);
    ctx.lineTo(a[0] - ux * h - uy * w, a[1] - uy * h + ux * w);
    ctx.closePath();
    ctx.fillStyle = '#e8cc82';
    ctx.fill();
    ctx.strokeStyle = BRASS.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  // the air inside the tubes of group g: its path a pale strip (the bore, as through the brass), then the
  // wave over it in the blue, by its strength: the envelope, and the swing between compression and
  // rarefaction (laid over the gold, not added to it)
  const airIn = (g: number) => {
    if (!focus || lvl < 0.02) return;
    // the runs on the screen, with each point's distance from the lips (kept per fingering)
    const proj = memo(`air:${valves}`, () => {
      let s0 = 0;
      return runs.map((r, ri) => {
        const xy = new Float32Array(2 * r.pts.length);
        const sm = new Float32Array(r.pts.length);
        let s = s0;
        r.pts.forEach((p3, i) => {
          if (i) s += v3len(r.pts[i - 1], p3);
          const q = P(trProj(p3));
          xy[2 * i] = q[0];
          xy[2 * i + 1] = q[1];
          sm[i] = s;
        });
        s0 += runLen[ri];
        return { xy, sm };
      });
    });
    const base = new Path2D();
    const buckets = new Map<number, Path2D>();
    const envB = new Map<number, Path2D>();
    runs.forEach((r, ri) => {
      if (r.group !== g || r.hidden || (g === 0 && ri === runs.length - 1)) return;
      const { xy, sm } = proj[ri];
      const o = r.slide !== undefined ? shift(slideOff(r.slide)) : [0, 0];
      let last = -1;
      let lastE = -1;
      let prev: [number, number] = [xy[0] + o[0], xy[1] + o[1]];
      base.moveTo(...prev);
      for (let i = 1; i < sm.length; i++) {
        const A = ampAt((sm[i - 1] + sm[i]) / 2);
        const v = A * ph;
        const q: [number, number] = [xy[2 * i] + o[0], xy[2 * i + 1] + o[1]];
        base.lineTo(...q);
        const e = Math.round(Math.min(AIR_N, AIR_N * Math.pow(Math.abs(A), 1.5)));
        if (e) {
          let bp = envB.get(e);
          if (!bp) envB.set(e, (bp = new Path2D()));
          if (e !== lastE) bp.moveTo(...prev);
          bp.lineTo(...q);
        }
        lastE = e;
        const a = Math.round(Math.min(AIR_N, AIR_N * Math.pow(Math.abs(v), 1.2)));
        const key = a > 0 ? (v >= 0 ? a : -a) : 0;
        if (key) {
          let bp = buckets.get(key);
          if (!bp) buckets.set(key, (bp = new Path2D()));
          if (key !== last) bp.moveTo(...prev);
          bp.lineTo(...q);
        }
        last = key;
        prev = q;
      }
    });
    ctx.lineCap = 'butt';
    ctx.strokeStyle = rgba(AIR_TONE, AIR_BASE * Math.min(1, 0.4 + lvl));
    ctx.lineWidth = 0.56 * D;
    ctx.stroke(base);
    for (const [e, bp] of envB) {
      ctx.strokeStyle = rgba(INK.sound, (e / AIR_N) * AIR_ENV);
      ctx.stroke(bp);
    }
    ctx.lineWidth = 0.32 * D;
    for (const [key, bp] of buckets) {
      ctx.strokeStyle = rgba(key > 0 ? INK.sound : INK.cool, (Math.abs(key) / AIR_N) * AIR_SWING);
      ctx.stroke(bp);
    }
    ctx.lineCap = 'round';
  };

  // the bell's outline (its flare about the projected axis), the bands along it that the light and the
  // shade fall in, the band inside it that carries the wave, the mouth: built once per canvas size
  const B = memo('bell', () => {
      const pts = Array.from({ length: 61 }, (_, i) => {
        const t = Math.pow(i / 60, 0.6);
        return { q: P(trProj(v3lerp(TR_BELL0, TR_BELL_END, t))), r: trBellR(TR_BELL_LEN * (1 - t)) * S };
      });
      const ax = trPoly([TR_BELL0, TR_BELL_END]);
      const l = Math.hypot(ax[1][0] - ax[0][0], ax[1][1] - ax[0][1]);
      const nx = -(ax[1][1] - ax[0][1]) / l;
      const ny = (ax[1][0] - ax[0][0]) / l;
      // (a band along the flare between k0 and k1 of its radius: −1 its upper edge, 1 its lower)
      const band = (k1: number, k0 = -k1) => {
        const b = new Path2D();
        pts.forEach(({ q, r }, i) => (i ? b.lineTo(q[0] + nx * r * k0, q[1] + ny * r * k0) : b.moveTo(q[0] + nx * r * k0, q[1] + ny * r * k0)));
        for (let i = pts.length - 1; i >= 0; i--) b.lineTo(pts[i].q[0] + nx * pts[i].r * k1, pts[i].q[1] + ny * pts[i].r * k1);
        b.closePath();
        return b;
      };
      const edges = new Path2D();
      for (const sg of [-1, 1]) pts.forEach(({ q, r }, i) => (i ? edges.lineTo(q[0] + sg * nx * r, q[1] + sg * ny * r) : edges.moveTo(q[0] + sg * nx * r, q[1] + sg * ny * r)));
      const mouth = new Path2D();
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * 2 * Math.PI;
        const q = P(trProj([TR_XB, TR_BELL_END[1] + TR_RIM * Math.cos(t), TR_ZB + TR_RIM * Math.sin(t)]));
        if (i) mouth.lineTo(...q);
        else mouth.moveTo(...q);
      }
      mouth.closePath();
      return { bell: band(1), inner: band(0.3), lit: [band(-0.08, -0.92), band(-0.24, -0.84), band(-0.4, -0.72)], shade: [band(1, 0), band(1, 0.24), band(1, 0.48), band(1, 0.74)], edges, mouth, nx, ny, e0: P(trProj(TR_BELL0)), e1: P(trProj(TR_BELL_END)), c: P(trProj([TR_XB, TR_BELL_END[1], TR_ZB])) };
  });
  // the mouthpiece's silhouette along the leadpipe's axis, rim to shank (kept, as the bell)
  const MP = memo('mouthpiece', () => {
    const ax0 = P(trProj(trAlong(-TR_MP)));
    const ax1 = P(trProj(trAlong(0)));
    const l = Math.hypot(ax1[0] - ax0[0], ax1[1] - ax0[1]);
    const ux = (ax1[0] - ax0[0]) / l;
    const uy = (ax1[1] - ax0[1]) / l;
    const at = (s2: number, r: number): [number, number] => {
      const q = P(trProj(trAlong(-TR_MP + s2)));
      return [q[0] - uy * r * S, q[1] + ux * r * S];
    };
    const mp = new Path2D();
    TR_MPIECE.forEach(([r, s2], i) => (i ? mp.lineTo(...at(s2, r)) : mp.moveTo(...at(s2, r))));
    for (let i = TR_MPIECE.length - 1; i >= 0; i--) mp.lineTo(...at(TR_MPIECE[i][1], -TR_MPIECE[i][0]));
    mp.closePath();
    // (across it, from its upper side, towards the light, to its lower)
    return { mp, a: at(0.03, -0.013), b: at(0.03, 0.013) };
  });
  // ---- its shadow on the floor (kept: the tubes at rest, the bell, the valves and the mouthpiece as one
  // silhouette)
  {
    const sh = memo('shadow', () => {
      const k = S / 1900;
      const b = TR_BOUNDS;
      const [x0, y0] = P([b.x0, b.y0]);
      const [x1, y1] = P([b.x1, b.y1]);
      return floorShadow({ x0, y0, x1, y1 }, Math.max(2, 14 * k), 5 * k, 9 * k, (c2) => {
        c2.lineJoin = 'round';
        c2.lineCap = 'round';
        c2.lineWidth = D + 2;
        const line = (pl3: V3[]) => {
          c2.beginPath();
          trPoly(pl3).map(P).forEach((q, i) => (i ? c2.lineTo(...q) : c2.moveTo(...q)));
          c2.stroke();
        };
        for (const pl3 of [TR_TAIL, TR_BOW, TR_MAIN, TR_LEAD]) line(pl3);
        for (const sl of TR_SLIDES) for (const pl3 of [sl.out, sl.back, sl.sleeve]) line(pl3);
        c2.fill(B.bell);
        c2.fill(B.mouth);
        c2.fill(MP.mp);
        // (the casings to their top caps: the pistons move, and are left out)
        c2.lineCap = 'butt';
        c2.lineWidth = 2 * (TR_RC + 0.0018) * S;
        for (const x of TR_VX) line([[x, -TR_CY - 0.0086, 0], [x, TR_CY + 0.006, 0]]);
      });
    });
    if (sh) ctx.drawImage(sh.cv, sh.x, sh.y, sh.w, sh.h);
  }
  // ---- group 0: the bell section (tail, bow, the bell pipe flaring to the rim), farthest
  tubes('bellTail', () => [TR_TAIL, TR_BOW]);
  {
    const { bell } = B;
    ctx.fillStyle = BRASS_BODY;
    ctx.fill(bell);
    // lacquer in daylight: the light along the upper flank, the lower flank in shade, deeper along its edge
    ctx.fillStyle = 'rgba(243,220,154,0.34)';
    for (const q of B.lit) ctx.fill(q);
    ctx.fillStyle = 'rgba(176,134,58,0.26)';
    for (const q of B.shade.slice(0, 3)) ctx.fill(q);
    ctx.fillStyle = 'rgba(125,92,34,0.36)';
    ctx.fill(B.shade[3]);
    ctx.strokeStyle = BRASS.edge;
    ctx.lineWidth = 1.1;
    ctx.stroke(B.edges);
    // the wave inside the bell: a gradient along its axis, as wide as the flare lets it be
    if (focus && lvl > 0.02) {
      const sBell = total - runLen[runs.length - 1];
      const { e0, e1, inner } = B;
      const gw = ctx.createLinearGradient(e0[0], e0[1], e1[0], e1[1]);
      const ge = ctx.createLinearGradient(e0[0], e0[1], e1[0], e1[1]);
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        const A = ampAt(sBell + u * TR_BELL_LEN);
        ge.addColorStop(u, rgba(INK.sound, AIR_ENV * Math.min(1, Math.pow(Math.abs(A), 1.5))));
        gw.addColorStop(u, rgba(waveInk(A * ph), AIR_SWING * Math.min(1, Math.pow(Math.abs(A * ph), 1.2))));
      }
      const gb = ctx.createLinearGradient(e0[0], e0[1], e1[0], e1[1]);
      gb.addColorStop(0, rgba(AIR_TONE, AIR_BASE * Math.min(1, 0.4 + lvl)));
      gb.addColorStop(1, rgba(AIR_TONE, 0.3 * AIR_BASE * Math.min(1, 0.4 + lvl)));
      ctx.fillStyle = gb;
      ctx.fill(inner);
      ctx.fillStyle = ge;
      ctx.fill(inner);
      ctx.fillStyle = gw;
      ctx.fill(inner);
    }
    // the rim: the bell's mouth as an ellipse, its rolled bead, the throat inside in deep shade, the flare
    // coming up into the light towards the rim
    const { mouth, c } = B;
    const tg = ctx.createRadialGradient(c[0] - 0.01 * S, c[1], 0, c[0], c[1], TR_RIM * S);
    tg.addColorStop(0, '#4f3a14');
    tg.addColorStop(0.4, BRASS_DEEP);
    tg.addColorStop(0.78, BRASS.shade);
    tg.addColorStop(1, BRASS.body);
    ctx.fillStyle = tg;
    ctx.fill(mouth);
    ctx.strokeStyle = BRASS.edge;
    ctx.lineWidth = 1.6;
    ctx.stroke(mouth);
    st.src = { x: c[0] + 0.012 * S, y: c[1] };
  }
  airIn(0);
  ferrule([TR_BOW_C[0] + 0.001, -0.02, TR_ZB], [0, 0, 0], 0.0065);
  ferrule([TR_BELL0[0] + 0.0012, TR_BELL0[1], TR_ZB], [0, 0, 0], 0.0068);
  // ---- group 1: the valve casings, their caps, the pistons
  TR_VX.forEach((x, k) => {
    // a horizontal circle round the casing's axis, on the screen (kept per canvas size)
    const ring = (y: number, r: number) =>
      memo(`ring:${k}:${y}:${r}`, () => {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 40; i++) {
          const t = (i / 40) * 2 * Math.PI;
          pts.push(P(trProj([x + r * Math.cos(t), y, r * Math.sin(t)])));
        }
        return pts;
      });
    const cyl = (y0: number, y1: number, r: number, m: Metal, top = true) => {
      const a = ring(y0, r);
      const b = ring(y1, r);
      const sx0 = Math.min(...a.map((q) => q[0]));
      const sx1 = Math.max(...a.map((q) => q[0]));
      const yb0 = P(trProj([x, y0, 0]))[1];
      const yb1 = P(trProj([x, y1, 0]))[1];
      const body = new Path2D();
      body.rect(sx0, yb1, sx1 - sx0, yb0 - yb1);
      const ell = (pts: [number, number][]) => {
        const e = new Path2D();
        pts.forEach((q, i) => (i ? e.lineTo(...q) : e.moveTo(...q)));
        e.closePath();
        return e;
      };
      // (round: lit on its side towards the window, in shade on the other)
      const gx = ctx.createLinearGradient(sx0, 0, sx1, 0);
      for (const [o, col] of m.stops) gx.addColorStop(o, col);
      ctx.fillStyle = gx;
      ctx.fill(body);
      ctx.fill(ell(a));
      ctx.strokeStyle = m.edge;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(sx0, yb1);
      ctx.lineTo(sx0, yb0);
      ctx.moveTo(sx1, yb1);
      ctx.lineTo(sx1, yb0);
      ctx.stroke();
      const lower = new Path2D();
      a.slice(20, 41).forEach((q, i) => (i ? lower.lineTo(...q) : lower.moveTo(...q)));
      ctx.stroke(lower);
      if (top) {
        const e = ell(b);
        ctx.fillStyle = m.face;
        ctx.fill(e);
        ctx.stroke(e);
      }
    };
    // bottom cap (nickel, knurled), the casing, the top cap
    cyl(-TR_CY - 0.0086, -TR_CY, TR_RC + 0.0018, M_NICKEL, false);
    cyl(-TR_CY, TR_CY, TR_RC, M_BRASS);
    cyl(TR_CY, TR_CY + 0.006, TR_RC + 0.0018, M_NICKEL);
    // the casing's collars (the knuckles' bands, the guide ring): their near halves
    ctx.strokeStyle = 'rgba(138,101,31,0.75)';
    ctx.lineWidth = 1;
    for (const y of [-TR_CY + 0.0062, 0.0129, TR_CY - 0.0072]) {
      ctx.beginPath();
      ring(y, TR_RC + 0.0005).slice(20, 41).forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
      ctx.stroke();
    }
    // the piston: stem and button (pearl in a polished bezel), down by the stroke when pressed; a
    // pressed one's pearl is in ink (a valve held is a mechanical fact, not a light)
    const yb = TR_CAP_TOP + TR_STEM;
    const [, dy] = shift([0, -TR_STROKE * press[k], 0]);
    const s0 = P(trProj([x, TR_CY + 0.006, 0]));
    const s1 = P(trProj([x, yb, 0]));
    s1[1] += dy;
    ctx.strokeStyle = SILVER.edge;
    ctx.lineWidth = Math.max(1.5, 0.005 * S);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(...s0);
    ctx.lineTo(...s1);
    ctx.stroke();
    ctx.strokeStyle = SILVER.body;
    ctx.lineWidth = Math.max(0.5, 0.005 * S - 2);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.save();
    ctx.translate(0, dy);
    cyl(yb, yb + 0.0045, 0.0084, M_NICKEL);
    ctx.beginPath();
    ring(yb + 0.0045, 0.0053).forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    ctx.closePath();
    ctx.fillStyle = pressed[k] ? rgba(INK.line, 0.94) : '#fbfaf5';
    ctx.fill();
    ctx.strokeStyle = pressed[k] ? rgba(INK.line, 0.94) : 'rgba(95,104,114,0.7)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  });
  // ---- group 2: the main tuning slide, the third slide (inside its loop), the first slide
  const slideTubes = (k: number) => {
    // (brass whether the air goes through it or not: the wave in the blue says where it goes)
    const sl = TR_SLIDES[k];
    tubes(`fixed${k}`, () => [sl.out, sl.back]);
    // kicked out, the slide shows its nickel-silver inner tubes between the fixed tubes and its sleeve
    if (kick[k] > 0.0005) {
      const ends = [sl.out[sl.out.length - 1], sl.back[0]];
      ctx.save();
      const [ox, oy] = shift([sl.dir[0] * (kick[k] + 0.003), 0, 0]);
      // the inner tubes: from the fixed tube's end out to the sleeve, stretched with the kick
      ctx.lineCap = 'butt';
      for (const [wd, col] of [[D * 0.9 + 2, SILVER.edge], [D * 0.9, SILVER.body], [D * 0.22, SILVER.lit]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = wd;
        ctx.beginPath();
        for (const e of ends) {
          const a = P(trProj(e));
          ctx.moveTo(...a);
          ctx.lineTo(a[0] + ox, a[1] + oy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    tubes(`sleeve${k}`, () => [sl.sleeve], D, BRASS.edge, BRASS_BODY, slideOff(k));
  };
  tubes('main', () => [TR_MAIN]);
  slideTubes(2);
  slideTubes(0);
  airIn(2);
  // the third slide's ring and the first's thumb saddle, riding with them
  {
    const o3 = slideOff(2);
    const c3 = P(trProj(v3add([0.075, 0.0135, TR_ZL - 0.0042], o3)));
    const b3 = P(trProj(v3add([0.075, -0.004 + TR_RT, TR_ZL], o3)));
    const rw = Math.max(1, 0.0022 * S);
    ctx.beginPath();
    ctx.ellipse(c3[0], c3[1], 0.0105 * S, 0.0105 * S * 0.96, 0, 0, 2 * Math.PI);
    ctx.moveTo(b3[0], b3[1]);
    ctx.lineTo(c3[0], c3[1] + 0.0101 * S);
    wire(rw, M_BRASS);
    const o1 = slideOff(0);
    const sad = [[-0.0786, 0.016], [-0.078, 0.003], [-0.0752, -0.0028], [-0.0668, -0.01 + TR_RT - 0.0004], [-0.0584, -0.0028], [-0.0556, 0.003], [-0.055, 0.016]].map(([x, y]) => P(trProj(v3add([x, y, TR_ZL], o1))));
    ctx.beginPath();
    sad.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    wire(rw, M_BRASS);
  }
  // the ferrules: the main slide's, the 1st and 3rd slides' sleeves (riding with them)
  ferrule([0.1035, TR_MS_TOP, TR_ZL]);
  ferrule([0.1015, TR_MS_LOW, -0.002]);
  for (const k of [0, 2]) {
    const sl = TR_SLIDES[k];
    ferrule(sl.sleeve[0], slideOff(k));
    ferrule(sl.sleeve[sl.sleeve.length - 1], slideOff(k));
  }
  {
    // the 3rd slide's stop rod (clamped to the slide) and its knurled nut, the guide on the fixed tube
    const o3 = slideOff(2);
    const zr = TR_ZL - TR_RT - 0.0027;
    const r0 = P(trProj(v3add([0.018, -0.004, zr], o3)));
    const r1 = P(trProj(v3add([0.113, -0.004, zr], o3)));
    ctx.beginPath();
    ctx.moveTo(...r0);
    ctx.lineTo(...r1);
    wire(Math.max(1, 0.0024 * S), M_NICKEL);
    const nut = P(trProj(v3add([0.0225, -0.004, zr], o3)));
    ctx.fillStyle = SILVER.body;
    ctx.strokeStyle = SILVER.edge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(nut[0], nut[1] - 0.0031 * S, 0.0048 * S, 0.0062 * S, 0.001 * S);
    ctx.fill();
    ctx.stroke();
    const gd = P(trProj([0.0485, -0.004, zr]));
    ctx.beginPath();
    ctx.arc(gd[0], gd[1], 0.0026 * S, 0, 2 * Math.PI);
    ctx.fillStyle = BRASS.lit;
    ctx.fill();
    ctx.strokeStyle = BRASS.edge;
    ctx.stroke();
  }
  {
    // the water key on the main slide's crook: the nipple, the lever's cork cup, its hinge, the paddle
    const msR = (TR_MS_TOP - TR_MS_LOW) / 2;
    const c: V3 = [TR_MS_X, (TR_MS_TOP + TR_MS_LOW) / 2, (TR_ZL - 0.002) / 2];
    const uz = TR_ZL - c[2];
    const at = (a: number, out: number): V3 => {
      const q: V3 = [c[0] + msR * Math.sin(a), c[1] + msR * Math.cos(a), c[2] + uz * Math.cos(a)];
      const l = Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]);
      return [q[0] + ((q[0] - c[0]) / l) * out, q[1] + ((q[1] - c[1]) / l) * out, q[2] + ((q[2] - c[2]) / l) * out];
    };
    // the lever lies along the crook's outside, from its cup back past the hinge to the paddle
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = 2.5 - 0.62 * (i / 10);
      const q = P(trProj(at(a, TR_RT + 0.0028 + 0.0035 * Math.max(0, (i - 6) / 4))));
      if (i) ctx.lineTo(...q);
      else ctx.moveTo(...q);
    }
    wire(Math.max(1, 0.0017 * S), M_NICKEL);
    const cup = P(trProj(at(2.5, TR_RT + 0.0026)));
    ctx.beginPath();
    ctx.ellipse(cup[0], cup[1], 0.0034 * S, 0.0026 * S, Math.atan2(cup[1] - P(trProj(c))[1], cup[0] - P(trProj(c))[0]) + Math.PI / 2, 0, 2 * Math.PI);
    ctx.fillStyle = SILVER.body;
    ctx.fill();
    ctx.fillStyle = rgba(INK.felt, 0.55); // the cork
    ctx.fill();
    ctx.strokeStyle = SILVER.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // ---- group 3: the leadpipe, the receiver, the finger hook and the mouthpiece
  tubes('lead', () => [TR_LEAD]);
  {
    // the finger hook past the third valve, leaning back, its tip curled
    const xb = 0.0545;
    const y0 = trLeadY(xb);
    const hook = [[xb, y0 + TR_RT - 0.001], [xb - 0.0035, y0 + 0.0095], [xb - 0.0098, y0 + 0.0165], [xb - 0.0098, y0 + 0.0228], [xb - 0.0045, y0 + 0.0262], [xb + 0.0006, y0 + 0.0244], [xb + 0.0016, y0 + 0.0212]].map(([x, y]) => P(trProj([x, y, TR_ZL])));
    ctx.beginPath();
    hook.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    wire(Math.max(1, 0.0026 * S), M_BRASS);
  }
  // the mouthpiece: its silhouette along the leadpipe's axis (silver plate), rim to shank
  {
    const { mp, a, b } = MP;
    const gm = ctx.createLinearGradient(...a, ...b);
    for (const [o, col] of M_NICKEL.stops) gm.addColorStop(o, col);
    ctx.fillStyle = gm;
    ctx.fill(mp);
    ctx.strokeStyle = SILVER.edge;
    ctx.lineWidth = 1.1;
    ctx.stroke(mp);
  }
  airIn(3);
  ferrule([TR_LEAD_END - 0.0015, TR_MS_TOP, TR_ZL]);
  // ---- group 4: the second valve's crook, nearest
  slideTubes(1);
  airIn(4);
  for (const e of [TR_SLIDES[1].sleeve[0], TR_SLIDES[1].sleeve[TR_SLIDES[1].sleeve.length - 1]]) ferrule(e);
  // ---- the breath into the mouthpiece while the note is blown: the reeds' streams (breathStream),
  // converging on the lips' aperture at the rim's middle, pulsing with the lips' buzz (drawn slowed)
  {
    const tr = fr?.excite?.trace;
    let lo = 1;
    let hi = 0;
    if (tr) for (let i = 0; i < tr.length; i += 4) {
      lo = Math.min(lo, tr[i]);
      hi = Math.max(hi, tr[i]);
    }
    const swing = tr && hi > lo ? Math.sqrt(hi) - Math.sqrt(Math.max(0, lo)) : 0;
    if (swing > 0.02 && lvl > 0.02) {
      // drawn slowed, a little quicker for higher notes (the true buzz is the note itself)
      const open01 = 0.5 - 0.5 * Math.cos(2 * Math.PI * 4.5 * Math.sqrt((focus?.f1 ?? 392) / 392) * (now / 1000));
      const rim = P(trProj(trAlong(-TR_MP)));
      const c = P(trProj(trAlong(0)));
      const l = Math.hypot(c[0] - rim[0], c[1] - rim[1]);
      const ux = (c[0] - rim[0]) / l;
      const uy = (c[1] - rim[1]) / l;
      breathStream(ctx, (a, w) => [rim[0] - ux * a * S + uy * w * S, rim[1] - uy * a * S - ux * w * S], S, BRASS_BREATH, brassBreath(lvl, Math.min(1, swing * 1.6) * open01), now);
    }
  }
  ctx.restore();
}
