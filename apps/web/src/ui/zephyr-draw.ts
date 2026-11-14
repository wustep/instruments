// The zephyr on the 2D stage (the drawn look): its plan (zephyr-plan.ts) at its real sizes in metres, from
// its player's side as it stands: the mast with the blower at its foot, the yard falling from the mast's head
// over the ribbons' tops, the boom (the case: its soundboard's edge, the bridge, the keyboard's fronts), the
// wind's blade across the ribbons, and the sixty-one ribbons plumb between the bridge and the yard, the
// accidentals' dark, every C warm. And its live state, the engine's own (the frame's `zephyr`): a slot that
// blows is lit as far as its wind goes, its key is down, and its ribbon swings as wide as the engine says it
// does (the loudest few in their own shapes).
import type { VisualFrame } from '@piano-model/engine';
import { BLADE, BLADE_LOW, BLOWER, BOARD_Y, BOOM, BOOM_X0, BOOM_X1, BOOM_Y0, BRIDGE_H, KEYS_X0, KEYS_X1, KEYS_Y0, KEYS_Y1, LEG_X, MAST_R, MAST_X, MAST_Y1, PITCH, POST_X, RIBBONS, RIBBON_X, RIBBON_Y0, RIBBON_Y1, WHITES, ZP_X0, ZP_X1, ZP_Y0, ZP_Y1, kindOf, slotY, whiteX, yardLower, yardUpper, type P } from './zephyr-plan.ts';
import { INK, rgba } from './stage-draw.ts';

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface ZephyrState {
  /** where the sound leaves (the soundboard's middle), px in the box drawn */
  src?: { x: number; y: number };
  /** each ribbon's swing and each slot's wind as drawn (eased from the engine's) */
  amp?: Float32Array;
  wind?: Float32Array;
  t?: number;
  /** what was drawn last (px in the box drawn): the whole instrument, the ribbons' band, the keyboard, the
   *  blade; how many ribbons swing, the widest's index and its swing (px), how many slots blow and each
   *  blowing slot's box */
  drawn?: { body: Box; ribbons: Box; keys: Box; blade: Box; ringing: number; widest: number; swing: number; blowing: number; slots: { i: number; box: Box }[]; down: number[] };
}
export const newZephyrState = (): ZephyrState => ({});
/** the zephyr's box on the stage, m (its plan with the margins its drawing keeps) */
export const zephyrBox = (): { w: number; h: number } => ({ w: (ZP_X1 - ZP_X0) / 0.9, h: (ZP_Y1 - ZP_Y0) / 0.9 });

export interface ZpLayout {
  key: string;
  sc: number;
  ox: number;
  oy: number;
  mast: Path2D;
  yard: Path2D;
  yardEdge: Path2D;
  post: Path2D;
  boom: Path2D;
  board: Path2D;
  bridge: Path2D;
  blade: Path2D;
  duct: Path2D;
  blower: Path2D;
  legs: Path2D;
  feet: Path2D;
}
const layouts = new Map<string, ZpLayout>();
const poly = (pts: P[], X: (x: number) => number, Y: (y: number) => number, close = true): Path2D => {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(X(x), Y(y)) : p.moveTo(X(x), Y(y))));
  if (close) p.closePath();
  return p;
};

/** The layout for a W×H box (the file player's `top` px kept clear at its top): the zephyr as large as fits
 *  in 90 % of the width and of the height under the player, centred. */
export function zephyrLayout(W: number, H: number, top = 0): ZpLayout {
  const key = `${W}x${H}x${top}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const sc = Math.max(1, Math.min((W * 0.9) / (ZP_X1 - ZP_X0), ((H - top) * 0.9) / (ZP_Y1 - ZP_Y0)));
  const ox = W / 2 - ((ZP_X0 + ZP_X1) / 2) * sc;
  const oy = top + (H - top) / 2 + ((ZP_Y0 + ZP_Y1) / 2) * sc;
  const X = (x: number) => ox + x * sc;
  const Y = (y: number) => oy - y * sc;
  const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const legs = new Path2D();
  // (the treble leg, from the boom to its foot; the mast is its own leg at the bass end)
  legs.addPath(poly(rect(LEG_X - 0.014, 0.03, LEG_X + 0.014, BOOM_Y0), X, Y));
  const feet = new Path2D();
  for (const x of [MAST_X, LEG_X]) feet.addPath(poly([[x - 0.06, 0], [x + 0.06, 0], [x + 0.045, 0.03], [x - 0.045, 0.03]], X, Y));
  const L: ZpLayout = {
    key,
    sc,
    ox,
    oy,
    mast: poly(rect(MAST_X - MAST_R, 0.03, MAST_X + MAST_R, MAST_Y1), X, Y),
    yard: poly([...yardLower, ...[...yardUpper].reverse()], X, Y),
    yardEdge: poly(yardLower, X, Y, false),
    post: poly(rect(POST_X - 0.011, BOARD_Y, POST_X + 0.011, yardLower[yardLower.length - 1][1] + 0.01), X, Y),
    boom: poly(BOOM, X, Y),
    board: poly([[BOOM_X0, BOARD_Y], [BOOM_X1, BOARD_Y]], X, Y, false),
    bridge: poly(rect(RIBBON_X[0] - 0.012, BOARD_Y, RIBBON_X[RIBBONS.length - 1] + 0.012, BOARD_Y + BRIDGE_H), X, Y),
    blade: poly(BLADE, X, Y),
    duct: poly(BLADE_LOW, X, Y, false),
    blower: poly(BLOWER, X, Y),
    legs,
    feet,
  };
  if (layouts.size > 8) layouts.clear();
  layouts.set(key, L);
  return L;
}

/** the frame into what both styles draw: each ribbon's swing (0…1, eased so a note swells in a frame and
 *  dies as the engine's does), each slot's wind (of its fortissimo), the loudest ribbons' shapes */
export function zephyrLive(fr: VisualFrame | null, st: ZephyrState, now: number): { amp: Float32Array; wind: Float32Array; shapes: Map<number, Float32Array> } {
  const zv = fr?.zephyr ?? null;
  const amp = (st.amp ??= new Float32Array(RIBBONS.length));
  const wind = (st.wind ??= new Float32Array(RIBBONS.length));
  const dt = Math.min(0.1, Math.max(0, (now - (st.t ?? now)) / 1000));
  st.t = now;
  const kUp = 1 - Math.exp(-dt / 0.012);
  const kDn = 1 - Math.exp(-dt / 0.05);
  for (let i = 0; i < amp.length; i++) {
    const a = zv ? Math.min(1, zv.amp[i] ?? 0) : 0;
    amp[i] += (a - amp[i]) * (a > amp[i] ? kUp : kDn);
    if (amp[i] < 1e-4) amp[i] = 0;
    const w = zv ? Math.min(1.2, zv.wind[i] ?? 0) : 0;
    wind[i] += (w - wind[i]) * (w > wind[i] ? kUp : kDn);
    if (wind[i] < 1e-3) wind[i] = 0;
  }
  const shapes = new Map<number, Float32Array>();
  if (zv) for (const s of zv.shapes) shapes.set(s.string, s.shape);
  return { amp, wind, shapes };
}

/** a ribbon's swing in px for its amplitude (a fortissimo in the bass swings the ribbon's middle about a
 *  centimetre either way; drawn at least a few px wide so that a soft one still shows, and never into the
 *  next ribbon but one) */
export const swingPx = (a: number, i: number, sc: number): number => (a <= 0.004 ? 0 : Math.max(1.2, Math.sqrt(a) * Math.min(1.6 * PITCH, 0.004 + 0.016 * RIBBONS[i].length) * sc));
/** a slot counts as blowing from this much wind */
export const BLOWS = 0.06;

/** record what was drawn */
export function zephyrRecord(L: ZpLayout, st: ZephyrState, lv: ReturnType<typeof zephyrLive>): void {
  const X = (x: number) => L.ox + x * L.sc;
  const Y = (y: number) => L.oy - y * L.sc;
  const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0: X(x0), y0: Y(y1), x1: X(x1), y1: Y(y0) });
  let ringing = 0;
  let widest = -1;
  let swing = 0;
  const slots: { i: number; box: Box }[] = [];
  const down: number[] = [];
  for (let i = 0; i < lv.amp.length; i++) {
    if (lv.amp[i] > 0.01) ringing++;
    const w = swingPx(lv.amp[i], i, L.sc);
    if (w > swing) [swing, widest] = [w, i];
    if (lv.wind[i] > BLOWS) {
      const [a, b] = slotY(i);
      slots.push({ i, box: box(RIBBON_X[i] - PITCH / 2, a, RIBBON_X[i] + PITCH / 2, b) });
      down.push(i);
    }
  }
  const n = RIBBONS.length;
  const blade = BLADE.reduce((b, [x, y]) => ({ x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  st.drawn = {
    body: box(ZP_X0, ZP_Y0, ZP_X1, ZP_Y1),
    ribbons: box(RIBBON_X[0] - 0.01, RIBBON_Y0[0], RIBBON_X[n - 1] + 0.01, RIBBON_Y1[0]),
    keys: box(KEYS_X0, KEYS_Y0, KEYS_X1, KEYS_Y1),
    blade: box(blade.x0, blade.y0, blade.x1, blade.y1),
    ringing,
    widest,
    swing,
    blowing: slots.length,
    slots,
    down,
  };
  st.src = { x: X((BOOM_X0 + BOOM_X1) / 2), y: Y(BOARD_Y) };
}

const RIBBON_INK = { c: '232,170,96', natural: '226,222,212', sharp: '104,120,152' };
export const ribbonInk = (i: number): string => RIBBON_INK[kindOf(i)];
/** the wind's colour: cool air */
const AIR = '150,196,226';

/** The zephyr from its player's side. `top`: the file player's px over the box's top. */
export function drawZephyr(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: ZephyrState, top = 0): void {
  const L = zephyrLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const lv = zephyrLive(fr, st, performance.now());
  const small = sc < 150;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const edge = rgba(INK.steel, 0.5);
  // ---- the blower at the mast's foot, the feet, the treble leg
  ctx.fillStyle = '#1b1d21';
  ctx.fill(L.blower);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.stroke(L.blower);
  ctx.fillStyle = '#17181b';
  ctx.fill(L.feet);
  ctx.stroke(L.feet);
  ctx.fill(L.legs);
  ctx.stroke(L.legs);
  // ---- the blade behind the ribbons: a pale wing, its duct along its lower edge; each blowing slot lit
  {
    const g = ctx.createLinearGradient(X(MAST_X), 0, X(POST_X), 0);
    g.addColorStop(0, 'rgba(120,138,160,0.34)');
    g.addColorStop(1, 'rgba(120,138,160,0.2)');
    ctx.fillStyle = g;
    ctx.fill(L.blade);
    ctx.strokeStyle = rgba(INK.steel, 0.55);
    ctx.lineWidth = 1;
    ctx.stroke(L.blade);
    ctx.strokeStyle = rgba(INK.steel, 0.75);
    ctx.lineWidth = Math.max(1.5, 0.014 * sc);
    ctx.stroke(L.duct);
  }
  for (let i = 0; i < RIBBONS.length; i++) {
    const w = lv.wind[i];
    if (w <= BLOWS) continue;
    const [a, b] = slotY(i);
    const x = X(RIBBON_X[i]);
    const hw = Math.max(1.5, 0.42 * PITCH * sc);
    const g = ctx.createLinearGradient(x - hw * 2.2, 0, x + hw * 2.2, 0);
    const al = Math.min(0.85, 0.25 + 0.6 * w);
    g.addColorStop(0, rgba(AIR, 0));
    g.addColorStop(0.5, rgba(AIR, al));
    g.addColorStop(1, rgba(AIR, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - hw * 2.2, Y(b), hw * 4.4, Y(a) - Y(b));
  }
  // ---- the mast (a carbon tube: dark, one long highlight)
  {
    const g = ctx.createLinearGradient(X(MAST_X - MAST_R), 0, X(MAST_X + MAST_R), 0);
    g.addColorStop(0, '#121316');
    g.addColorStop(0.35, '#4b5058');
    g.addColorStop(0.6, '#23252a');
    g.addColorStop(1, '#0d0e10');
    ctx.fillStyle = g;
    ctx.fill(L.mast);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke(L.mast);
  }
  // ---- the boom: the case, the soundboard's pale edge along its top, the bridge on it
  {
    const g = ctx.createLinearGradient(0, Y(BOARD_Y), 0, Y(BOOM_Y0));
    g.addColorStop(0, '#2a2c31');
    g.addColorStop(1, '#141518');
    ctx.fillStyle = g;
    ctx.fill(L.boom);
    ctx.strokeStyle = edge;
    ctx.stroke(L.boom);
    ctx.fillStyle = 'rgba(226,222,212,0.85)';
    ctx.fill(L.bridge);
    ctx.strokeStyle = 'rgba(236,230,214,0.9)';
    ctx.lineWidth = Math.max(1.5, 0.009 * sc);
    ctx.lineCap = 'butt';
    ctx.stroke(L.board);
    ctx.lineCap = 'round';
  }
  // ---- the keyboard's fronts: the naturals' ivory, the accidentals over them; a key that blows is down
  if (!small) {
    const y0 = Y(KEYS_Y1);
    const h = Y(KEYS_Y0) - y0;
    const downAt = new Set<number>();
    for (let i = 0; i < RIBBONS.length; i++) if (lv.wind[i] > BLOWS) downAt.add(i);
    ctx.fillStyle = '#0b0b0c';
    ctx.fillRect(X(KEYS_X0) - 1, y0 - 1, X(KEYS_X1) - X(KEYS_X0) + 2, h + 2);
    // (white key k is the k-th natural from C2)
    let k = 0;
    for (let i = 0; i < RIBBONS.length; i++) {
      if (RIBBONS[i].sharp) continue;
      const dn = downAt.has(i);
      ctx.fillStyle = dn ? rgba(INK.amber, 0.95) : 'rgba(232,226,210,0.92)';
      const x0 = X(whiteX(k)) + 0.5;
      const x1 = X(whiteX(k + 1)) - 0.5;
      ctx.fillRect(x0, y0 + (dn ? 0.3 * h : 0), x1 - x0, h * (dn ? 0.7 : 1));
      k++;
    }
    for (let i = 0; i < RIBBONS.length; i++) {
      if (!RIBBONS[i].sharp) continue;
      const dn = downAt.has(i);
      ctx.fillStyle = dn ? rgba(INK.amber, 0.95) : '#17171a';
      const x = X(RIBBON_X[i]);
      const hw = 0.3 * PITCH * sc;
      ctx.fillRect(x - hw, y0 - 0.45 * h + (dn ? 0.2 * h : 0), 2 * hw, 0.7 * h);
    }
    void WHITES;
  }
  // ---- the ribbons: each from the bridge to its pin in the yard
  for (let i = 0; i < RIBBONS.length; i++) {
    const x = X(RIBBON_X[i]);
    const y0 = Y(RIBBON_Y0[i]);
    const y1 = Y(RIBBON_Y1[i]);
    const ink = ribbonInk(i);
    const a = lv.amp[i];
    const w = swingPx(a, i, sc);
    const lw = Math.max(small ? 0.6 : 0.9, RIBBONS[i].width * sc * 0.9);
    if (w > 0) {
      const sh = lv.shapes.get(i);
      ctx.fillStyle = rgba(ink, 0.1 + 0.22 * Math.min(1, a * 3));
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.quadraticCurveTo(x + 2 * w, (y0 + y1) / 2, x, y0);
      ctx.quadraticCurveTo(x - 2 * w, (y0 + y1) / 2, x, y1);
      ctx.fill();
      ctx.strokeStyle = rgba(ink, 0.97);
      ctx.lineWidth = lw;
      ctx.beginPath();
      if (sh && sh.length > 2) {
        let pk = 1e-12;
        for (let q = 0; q < sh.length; q++) pk = Math.max(pk, Math.abs(sh[q]));
        // (the shape runs bridge 0 → yard 1; drawn as wide as the envelope)
        for (let q = 0; q < sh.length; q++) {
          const u = q / (sh.length - 1);
          const px = x + (sh[q] / pk) * w;
          const py = y0 + (y1 - y0) * u;
          if (q) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
      } else {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = rgba(ink, kindOf(i) === 'natural' ? 0.6 : 0.9);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
  }
  // ---- the yard over the ribbons' tops, its post at the treble end
  {
    ctx.fillStyle = '#1d1f23';
    ctx.fill(L.post);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke(L.post);
    const g = ctx.createLinearGradient(0, Y(MAST_Y1), 0, Y(1));
    g.addColorStop(0, '#3a3e45');
    g.addColorStop(1, '#17181b');
    ctx.fillStyle = g;
    ctx.fill(L.yard);
    ctx.stroke(L.yard);
    ctx.strokeStyle = 'rgba(214,220,228,0.7)';
    ctx.lineWidth = Math.max(1, 0.005 * sc);
    ctx.stroke(L.yardEdge);
  }
  ctx.restore();
  zephyrRecord(L, st, lv);
}
