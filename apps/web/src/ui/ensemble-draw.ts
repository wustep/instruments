// Orchestra mode in 2D: every instrument of the ensemble in a cell of its own, each drawn as the
// single instrument is (stage-draw.ts, piano-draw.ts: the same plans, strings and waves), from its own
// engine's frames. The pianos take a band across the whole width (their plan is as wide as their
// keyboard); the others share the rest: with bowed strings among them, all at one scale, their true
// sizes, spaced so that no bow reaches another instrument, the group centred; the bows are drawn last,
// over the whole stage.

import { bowedGeometry, type VisualFrame } from '@piano-model/engine';
import { isKeyboard, VOICE_INFO, type Voice } from '../orchestra/assign.ts';
import { isOrchestral, orchestraPlan, seatKinds } from '../orchestra/seats.ts';
import type { PartLive } from '../orchestra/ensemble.ts';
import { drawPiano, newPianoState, type PianoState } from './piano-draw.ts';
import { Contours, drawBassoonV, drawBowedV, drawClarinetV, drawFluteV, drawHarpV, drawGlockV, drawHornV, drawOboeV, drawPianoV, drawTromboneV, drawTrumpetV, drawTubaV, drawTimpaniV } from './vector/index.ts';
import { drawOboe, newOboeState, oboeBox, type OboeState } from './oboe-draw.ts';
import { clarinetBox, drawClarinet, newClarinetState, type ClarinetState } from './clarinet-draw.ts';
import { bassoonBox, drawBassoon, newBassoonState, type BassoonState } from './bassoon-draw.ts';
import { drawHorn, hornBox, newHornState, type HornState } from './horn-draw.ts';
import { drawTrombone, newTromboneState, tromboneBox, type TromboneState } from './trombone-draw.ts';
import { drawTuba, newTubaState, tubaBox, type TubaState } from './tuba-draw.ts';
import { drawHarp, harpBox, newHarpState, type HarpState } from './harp-draw.ts';
import { drawGlock, glockBox, newGlockState, type GlockState } from './glock-draw.ts';
import { drawTimpani, timpaniBox, newTimpaniState, type TimpaniState } from './timpani-draw.ts';
import { AutoScale, BOWED_PLAN, FL_LEN, ModeField, bowReach, bowedShapes, bowedSpan, drawBowed, drawFlute, drawTrumpet, trumpetBox, type BowedGeom, type BowedState, type FluteState, type TrumpetState } from './stage-draw.ts';

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** px per metre, one for the whole group (its instruments drawn at their true relative sizes) */
  sc?: number;
}

/** what each part's drawing keeps between frames */
export interface PartDraw {
  voice: Voice;
  bowed?: { geom: BowedGeom; st: BowedState; field: ModeField; vfield?: Contours };
  flute?: FluteState;
  trumpet?: TrumpetState;
  oboe?: OboeState;
  clarinet?: ClarinetState;
  bassoon?: BassoonState;
  horn?: HornState;
  trombone?: TromboneState;
  tuba?: TubaState;
  harp?: HarpState;
  glock?: GlockState;
  timpani?: TimpaniState;
  piano?: { st: PianoState; field: ModeField; vfield?: Contours };
}

export function newPartDraw(v: Voice): PartDraw {
  const inst = VOICE_INFO[v].instrument;
  if (inst === 'violin' || inst === 'viola' || inst === 'cello' || inst === 'bass')
    // (a coarser mode field than the single instrument's: six of them are drawn every frame)
    return { voice: v, bowed: { geom: { id: inst, ...bowedGeometry(inst) }, st: { strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) }, field: new ModeField(96, 54, 1.8, 0.6) } };
  if (inst === 'flute') return { voice: v, flute: { pScale: new AutoScale(1e-6), jetScale: new AutoScale(1e-9), env: new Float32Array(0) } as FluteState };
  if (inst === 'trumpet') return { voice: v, trumpet: { pScale: new AutoScale(1e-6), env: new Float32Array(0) } };
  if (inst === 'trombone') return { voice: v, trombone: newTromboneState() };
  if (inst === 'tuba') return { voice: v, tuba: newTubaState() };
  if (inst === 'harp') return { voice: v, harp: newHarpState() };
  if (inst === 'glockenspiel') return { voice: v, glock: newGlockState() };
  if (inst === 'horn') return { voice: v, horn: newHornState() };
  if (inst === 'timpani') return { voice: v, timpani: newTimpaniState() };
  if (inst === 'oboe') return { voice: v, oboe: newOboeState() };
  if (inst === 'clarinet') return { voice: v, clarinet: newClarinetState() };
  if (inst === 'bassoon') return { voice: v, bassoon: newBassoonState() };
  return { voice: v, piano: { st: newPianoState(), field: new ModeField(128, 62, 2.2, 3) } };
}

/** how large a w×h cell draws an instrument of about 2.8 : 1 (length : width) */
const drawnSize = (w: number, h: number) => Math.min(Math.max(w, h) * 0.78, Math.min(w, h) * 0.84 * 2.8);

/** `n` instruments, `cols` to a row, in equal cells over a W×H band (a last row with fewer is centred) */
function grid(n: number, W: number, H: number, cols: number): Cell[] {
  const rows = Math.ceil(n / cols);
  const cw = W / cols;
  return Array.from({ length: n }, (_, k) => {
    const r = Math.floor(k / cols);
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const c = k - r * cols;
    const x0 = (W - inRow * cw) / 2;
    return { x: Math.round(x0 + c * cw), y: Math.round((r * H) / rows), w: Math.round(cw), h: Math.round(H / rows) };
  });
}

// ---- the strings at one scale. Each instrument used to fill an equal cell of its own, so a violin or
// a viola was drawn at about twice a cello's px/m, and its 0.64 m bow at that scale ran three times the
// length of the cello's beside it, over both cellos; and the row was pushed right to keep the violins'
// long bows on the stage (Stephen's Daylight quintet, Nov 2026). Now the group is drawn at one px/m:
// each seat's box is its own instrument's at that scale (a cello twice a violin's length), the seats are
// spaced so that no bow, frog or tip on the string, reaches another instrument, and the whole group,
// bodies and bows at full reach, is centred on the stage. The bows are drawn last, over the whole stage.

/** px a bow's far end keeps from the edge of the stage */
const BOW_EDGE = 6;
/** px round a bowed instrument's box (its drawing is clipped to the box: its outline's line and glow) */
const PAD = 3;
/** px a bow's far end keeps from the next instrument's box, and two boxes side by side from each other */
const CLEAR = 6;
const AISLE = 14;
/** px between two rows of instruments (upright) or two columns (lying) */
const LINE_GAP = 14;
/** an upright group is preferred unless lying draws it this much larger (a row of players reads as a
 *  section; lying, the strings' bows stand up the stage) */
const LYING = 0.8;
/** the flute's box across (m): the tube with its keys, and its standing wave either side */
const FLUTE_ACROSS = 0.3;
const geoms = new Map<BowedGeom['id'], BowedGeom>();
const geomOf = (id: BowedGeom['id']): BowedGeom => {
  let g = geoms.get(id);
  if (!g) geoms.set(id, (g = { id, ...bowedGeometry(id) }));
  return g;
};
const bowedId = (v: Voice): BowedGeom['id'] | null => {
  const id = VOICE_INFO[v].instrument;
  return id === 'violin' || id === 'viola' || id === 'cello' || id === 'bass' ? id : null;
};

/** An instrument's box at one px per metre: `across` it (m, along the line of seats) and `along` it, plus
 *  `pad` px round it; `lo` and `hi`, how far its bow reaches from its centre line (m) towards the line's
 *  start and its end, at the far ends of its travel (0: no bow). Upright, the line runs across the stage
 *  and the frog (the bass side) is towards its start, on the left; lying, the line runs down the stage
 *  and the tip is towards its start, at the top (bwPlace). */
interface Seat {
  across: number;
  along: number;
  pad: number;
  lo: number;
  hi: number;
}
function seatOf(v: Voice, upright: boolean): Seat {
  const id = bowedId(v);
  if (id) {
    const g = geomOf(id);
    const p = BOWED_PLAN[id];
    const { x0, x1 } = bowedSpan(g, p);
    const r = bowReach(g, p);
    return { across: 2 * bowedShapes(id, p, g.L).hwMax, along: x1 - x0, pad: PAD, lo: upright ? r.frog : r.tip, hi: upright ? r.tip : r.frog };
  }
  // the winds' own layouts leave a margin round them (fluteLayout, trumpetLayout); the trumpet is drawn
  // from its side either way, its bell to the right
  if (VOICE_INFO[v].instrument === 'oboe' || VOICE_INFO[v].instrument === 'clarinet' || VOICE_INFO[v].instrument === 'bassoon') {
    const b = VOICE_INFO[v].instrument === 'clarinet' ? clarinetBox() : VOICE_INFO[v].instrument === 'bassoon' ? bassoonBox() : oboeBox();
    return { across: b.h, along: b.w, pad: 0, lo: 0, hi: 0 };
  }
  if (VOICE_INFO[v].instrument === 'trumpet' || VOICE_INFO[v].instrument === 'trombone' || VOICE_INFO[v].instrument === 'horn') {
    // (the horn is drawn from its outside either way, its bell to the left; the trombone from its side, its
    // box long enough for its slide all the way out)
    const b = VOICE_INFO[v].instrument === 'horn' ? hornBox() : VOICE_INFO[v].instrument === 'trombone' ? tromboneBox() : trumpetBox();
    return { across: upright ? b.w : b.h, along: upright ? b.h : b.w, pad: 0, lo: 0, hi: 0 };
  }
  if (VOICE_INFO[v].instrument === 'harp') {
    // (the harp stands upright in its row, whichever way the stage runs)
    const b = harpBox();
    return { across: upright ? b.w : b.h, along: upright ? b.h : b.w, pad: 0, lo: 0, hi: 0 };
  }
  if (VOICE_INFO[v].instrument === 'tuba') {
    // (the tuba stands upright in its row, its bell up, whichever way the stage runs)
    const b = tubaBox();
    return { across: upright ? b.w : b.h, along: upright ? b.h : b.w, pad: 0, lo: 0, hi: 0 };
  }
  if (VOICE_INFO[v].instrument === 'glockenspiel') {
    // (from above, its low bars at the left, either way)
    const b = glockBox();
    return { across: upright ? b.w : b.h, along: upright ? b.h : b.w, pad: 0, lo: 0, hi: 0 };
  }
  if (VOICE_INFO[v].instrument === 'timpani') {
    // (the set from the audience, its drums side by side, either way)
    const b = timpaniBox();
    return { across: upright ? b.w : b.h, along: upright ? b.h : b.w, pad: 0, lo: 0, hi: 0 };
  }
  return { across: FLUTE_ACROSS, along: FL_LEN / (upright ? 0.86 : 0.9), pad: 0, lo: 0, hi: 0 };
}

/** the stage kept clear round the group (px) */
const margin = (W: number, H: number) => Math.max(BOW_EDGE, Math.round(0.02 * Math.min(W, H)));

/**
 * The group `mel` at `sc` px/m on a W×H band, `per` to a line, upright (rows across the stage) or lying
 * (columns down it), the group's box centred on the band; null if it does not fit. Along a line each
 * instrument stands far enough from the one before that neither's bow reaches the other's box.
 */
function placeGroup(mel: Voice[], per: number, upright: boolean, sc: number, W: number, H: number): Cell[] | null {
  const n = mel.length;
  const Eu = upright ? W : H;
  const Ev = upright ? H : W;
  const m = margin(W, H);
  const seats = mel.map((v) => seatOf(v, upright));
  // half the box, across and along (px); how far the box or the bow reaches either way along the line
  const hu = seats.map((s) => (s.across * sc) / 2 + s.pad);
  const hv = seats.map((s) => (s.along * sc) / 2 + s.pad);
  const lo = seats.map((s, i) => Math.max(hu[i], s.lo * sc));
  const hi = seats.map((s, i) => Math.max(hu[i], s.hi * sc));
  const cu: number[] = new Array(n);
  const lines: { a: number; b: number; lo: number; hi: number; th: number }[] = [];
  for (let a = 0; a < n; a += per) {
    const b = Math.min(n, a + per);
    cu[a] = 0;
    for (let i = a + 1; i < b; i++) {
      const j = i - 1;
      // the boxes clear of each other; the one before's bow (its far end towards this one) clear of this
      // box, and this one's bow clear of the box before
      cu[i] = cu[j] + Math.max(hu[j] + hu[i] + AISLE, seats[j].hi * sc + CLEAR + hu[i], seats[i].lo * sc + CLEAR + hu[j]);
    }
    let l = Infinity;
    let h = -Infinity;
    let th = 0;
    for (let i = a; i < b; i++) {
      l = Math.min(l, cu[i] - lo[i]);
      h = Math.max(h, cu[i] + hi[i]);
      th = Math.max(th, 2 * hv[i]);
    }
    lines.push({ a, b, lo: l, hi: h, th });
  }
  const U = Math.max(...lines.map((L) => L.hi - L.lo));
  const V = lines.reduce((t, L) => t + L.th, 0) + (lines.length - 1) * LINE_GAP;
  if (U > Eu - 2 * m || V > Ev - 2 * m) return null;
  const cells: Cell[] = new Array(n);
  let v0 = (Ev - V) / 2;
  for (const L of lines) {
    // each line's box (bodies and bows) centred along the band, the lines' stack centred across it
    const u0 = Eu / 2 - (L.lo + L.hi) / 2;
    const vc = v0 + L.th / 2;
    for (let i = L.a; i < L.b; i++) {
      const w = Math.round(2 * (upright ? hu[i] : hv[i]));
      const h = Math.round(2 * (upright ? hv[i] : hu[i]));
      const [xc, yc] = upright ? [u0 + cu[i], vc] : [vc, u0 + cu[i]];
      cells[i] = { x: Math.round(xc - w / 2), y: Math.round(yc - h / 2), w, h, sc };
    }
    v0 += L.th + LINE_GAP;
  }
  return cells;
}

/** the group with strings at the largest scale that fits, in the arrangement that draws it largest
 *  (fewer lines and upright, unless another is clearly larger); null if nothing fits */
function fitGroup(mel: Voice[], W: number, H: number): Cell[] | null {
  const n = mel.length;
  let best: Cell[] | null = null;
  let bs = 0;
  for (const upright of [true, false])
    for (let per = n; per >= 1; per--) {
      let a = 0;
      let b = Math.max(W, H) / 0.3;
      if (!placeGroup(mel, per, upright, 1, W, H)) continue;
      for (let i = 0; i < 32; i++) {
        const mid = (a + b) / 2;
        if (placeGroup(mel, per, upright, mid, W, H)) a = mid;
        else b = mid;
      }
      const s = a * (upright ? 1 : LYING);
      if (s > bs * 1.02) {
        bs = s;
        best = placeGroup(mel, per, upright, a, W, H);
      }
    }
  return best;
}

// ---- an orchestra (five players or more: orchestra/seats.ts). Its rows as the 3D stage seats them, front to
// back up the stage: the strings at the bottom (first violins at the left, the basses at the right end),
// the woodwinds above them, the brass and the timpani above those; each row centred, every instrument at
// one scale, each row's instruments on one centre line. A row comes down as far as the instruments in front
// of it allow (a tall bassoon or timpani set over a violin, not over the bass beside it), so the rows nest
// as an orchestra seen from the hall does. A phone's stage may take the shorter rows the 3D stage gives it,
// or put the strings' last sections behind their first; whichever draws the orchestra larger.

/** the least an instrument is drawn long (px): an orchestra's rows drawing one smaller keep the one line */
const MIN_PX = 24;
/** px a row stands at least above the one in front of it */
const ROW_STEP = 16;

/** a row of the 2D orchestra: its seats left to right (indices into the voices); `hang`: it stands past
 *  the left end of the row before it (the timpani beside the brass), no lower than the row before that */
interface Row2 {
  seats: number[];
  hang?: boolean;
}

/** each row (front first) at `sc` px/m on a W×H band: the cells, or null if they do not fit. The whole
 *  group (bodies and bows at full reach) is centred up and down the band, and its middle across it (as far
 *  as the timpani hanging off the brass row's end allow) */
function placeRows(voices: Voice[], rows: Row2[], sc: number, W: number, H: number): Cell[] | null {
  const m = margin(W, H);
  const out: Cell[] = new Array(voices.length);
  type It = { i: number; hu: number; hv: number; lo: number; hi: number; x: number; v: number };
  const done: It[] = [];
  const lines: { L: number; v: number }[] = [];
  for (const row of rows) {
    const its: It[] = row.seats.map((i) => {
      const s = seatOf(voices[i], true);
      const hu = (s.across * sc) / 2 + s.pad;
      return { i, hu, hv: (s.along * sc) / 2 + s.pad, lo: Math.max(hu, s.lo * sc), hi: Math.max(hu, s.hi * sc), x: 0, v: 0 };
    });
    // along the row: boxes clear of each other, each bow clear of its neighbour's box (placeGroup's rule)
    for (let k = 1; k < its.length; k++) {
      const a = its[k - 1];
      const b = its[k];
      const sa = seatOf(voices[a.i], true);
      const sb = seatOf(voices[b.i], true);
      b.x = a.x + Math.max(a.hu + b.hu + AISLE, sa.hi * sc + CLEAR + b.hu, sb.lo * sc + CLEAR + a.hu);
    }
    const L = Math.min(...its.map((t) => t.x - t.lo));
    const R = Math.max(...its.map((t) => t.x + t.hi));
    const prev = lines[lines.length - 1];
    // centred, or past the left end of the row before
    const dx = row.hang && prev ? prev.L - AISLE - R : -(L + R) / 2;
    for (const t of its) t.x += dx;
    // up the stage: as low as the instruments in front allow (their boxes and bows, a gap between)
    const floor = row.hang ? (lines.length > 1 ? lines[lines.length - 2].v + ROW_STEP : 0) : prev ? prev.v + ROW_STEP : 0;
    let v = floor;
    for (const t of its)
      for (const d of done)
        if (t.x - t.lo < d.x + d.hi + CLEAR && d.x - d.lo < t.x + t.hi + CLEAR) v = Math.max(v, d.v + d.hv + LINE_GAP + t.hv);
    for (const t of its) t.v = v;
    lines.push({ L: L + dx, v });
    done.push(...its);
  }
  const left = Math.min(...done.map((t) => t.x - t.lo));
  const right = Math.max(...done.map((t) => t.x + t.hi));
  const bottom = Math.min(...done.map((t) => t.v - t.hv));
  const top = Math.max(...done.map((t) => t.v + t.hv));
  if (right - left > W - 2 * m || top - bottom > H - 2 * m) return null;
  const mid = (top + bottom) / 2;
  // the orchestra's middle (its podium: every row but the timpani's is centred on it) in the stage's middle,
  // unless that would put the group off the stage (the timpani past the brass's left end on a narrow one)
  const cx = Math.min(Math.max(0, right - (W / 2 - m)), left + (W / 2 - m));
  for (const t of done) {
    const w = Math.round(2 * t.hu);
    const h = Math.round(2 * t.hv);
    const xc = W / 2 + t.x - cx;
    const yc = H / 2 - (t.v - mid);
    out[t.i] = { x: Math.round(xc - w / 2), y: Math.round(yc - h / 2), w, h, sc };
  }
  return out;
}

/** the orchestra's cells at the largest scale its rows fit at, in the lineup's order (the keyboards' left
 *  out: they take the band below). Tried: the computer's plan and the phone's (shorter rows), the strings
 *  in one line or their last sections behind the first, the woodwinds in their two rows or one */
function orchestraCells(voices: Voice[], mel: number[], W: number, H: number): Cell[] | null {
  const kinds = seatKinds(mel.map((i) => VOICE_INFO[voices[i]]));
  const sub = mel.map((i) => voices[i]);
  let best: Cell[] | null = null;
  let bs = 0;
  for (const tall of [false, true]) {
    const plan = orchestraPlan(kinds, tall);
    const secs = [...plan.strings, ...(plan.basses.length ? [plan.basses] : [])];
    const fronts: number[][][] = [[secs.flat()]];
    if (secs.length >= 3) fronts.push([secs.slice(0, Math.ceil(secs.length / 2)).flat(), secs.slice(Math.ceil(secs.length / 2)).flat()]);
    // (the harps at the left end of the first row behind the strings, as the 3D stage seats them: seats.ts)
    const w0 = plan.winds.map((r, k) => (k === 0 ? [...plan.harps, ...r] : r));
    if (!w0.length && plan.harps.length) w0.push(plan.harps.slice());
    const winds: number[][][] = [w0];
    if (w0.length > 1) winds.push([w0.flat()]);
    const back: Row2[] = plan.brass.map((r) => ({ seats: r }));
    if (plan.drums.length) back.push({ seats: plan.drums, hang: back.length > 0 && !plan.drumsBehind });
    for (const f of fronts)
      for (const w of winds) {
        const rows = [...f.map((r) => ({ seats: r })), ...w.map((r) => ({ seats: r })), ...back].filter((r) => r.seats.length);
        if (!placeRows(sub, rows, 1, W, H)) continue;
        let a = 1;
        let b = Math.max(W, H) / 0.3;
        for (let k = 0; k < 30; k++) {
          const c = (a + b) / 2;
          if (placeRows(sub, rows, c, W, H)) a = c;
          else b = c;
        }
        if (a > bs * 1.02) {
          bs = a;
          best = placeRows(sub, rows, a, W, H);
        }
      }
  }
  if (!best) return null;
  const out: Cell[] = new Array(voices.length);
  mel.forEach((i, k) => (out[i] = best![k]));
  return out;
}

/** the cells for a lineup on a W×H stage, in the lineup's order */
export function ensembleCells(voices: Voice[], W: number, H: number): Cell[] {
  const kb = voices.map((v, i) => (isKeyboard(v) ? i : -1)).filter((i) => i >= 0);
  const mel = voices.map((v, i) => (isKeyboard(v) ? -1 : i)).filter((i) => i >= 0);
  const out: Cell[] = new Array(voices.length);
  // the pianos: a band at the bottom (the front of the stage), side by side
  const kbH = kb.length ? (mel.length ? Math.round(H * (W > H ? 0.46 : 0.4)) : H) : 0;
  kb.forEach((i, k) => {
    const w = W / kb.length;
    out[i] = { x: Math.round(k * w), y: H - kbH, w: Math.round(w), h: kbH };
  });
  const mh = H - kbH;
  if (mel.length) {
    const n = mel.length;
    const melV = mel.map((i) => voices[i]);
    // an orchestra in its rows; with bowed strings: the group at one scale, its bows clear of the others, centred
    // (a stage too short for rows, a phone on its side, keeps the one line: no instrument under 24 px long)
    if (isOrchestral(seatKinds(melV.map((v) => VOICE_INFO[v])))) {
      const oc = orchestraCells(voices, mel, W, mh);
      if (oc && mel.every((i) => Math.max(oc[i].w, oc[i].h) >= MIN_PX)) {
        mel.forEach((i) => (out[i] = oc[i]));
        return out;
      }
    }
    let cells = melV.some(bowedId) ? fitGroup(melV, W, mh) : null;
    if (!cells) {
      // the winds alone: each fills an equal cell, in the grid that draws an instrument largest
      let best = 1;
      let bs = -1;
      for (let cols = 1; cols <= n; cols++) {
        const s = drawnSize(W / cols, mh / Math.ceil(n / cols));
        if (s > bs * 1.02) {
          bs = s;
          best = cols;
        }
      }
      cells = grid(n, W, mh, best);
    }
    mel.forEach((i, k) => (out[i] = cells[k]));
  }
  return out;
}

/** 88 keys evenly across a width: each key's centre and width (the white keys' layout) */
function keysAcross(x0: number, w: number): (m: number) => { x: number; w: number } {
  const WHITE = [0, 2, 4, 5, 7, 9, 11];
  const ww = w / 52;
  const whiteIndex = (m: number) => {
    let n = 0;
    for (let k = 21; k < m; k++) if (WHITE.includes(k % 12)) n++;
    return n;
  };
  const idx = new Map<number, number>();
  for (let m = 21; m <= 108; m++) idx.set(m, whiteIndex(m));
  return (m) => {
    const i = idx.get(m) ?? 0;
    return WHITE.includes(m % 12) ? { x: x0 + (i + 0.5) * ww, w: ww } : { x: x0 + i * ww, w: ww * 0.6 };
  };
}

/** a piano part's live state into the drawing's (the same object drives its 2D plan and 3D action) */
export function syncPianoState(st: PianoState, p: PartLive): void {
  const fr = p.frame;
  st.down = p.down;
  st.strikes = p.strikes;
  st.vels = p.vels;
  st.sustain = fr?.sustain ?? p.sustain;
  st.soft = fr?.soft ?? 0;
  st.middle = fr?.middle ?? 0;
  st.upright = p.voice === 'upright';
}

/** draw the ensemble: each part in its cell (stage coordinates, the top band already translated) */
export function drawEnsemble(ctx: CanvasRenderingContext2D, cells: Cell[], parts: PartLive[], draws: PartDraw[], keysOf: (p: PartLive) => import('@piano-model/engine').KeySummary[], now: number, vector = false): void {
  // the bows: each drawn after every instrument, over the whole stage (never cut at its own cell's edge)
  const bows: (() => void)[] = [];
  parts.forEach((p, i) => {
    const c = cells[i];
    const d = draws[i];
    if (!c || !d || c.w < 8 || c.h < 8) return;
    const fr: VisualFrame | null = p.frame;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.beginPath();
    ctx.rect(0, 0, c.w, c.h);
    ctx.clip();
    // (the vector display: the same cells, each instrument as its lines; its plates traced coarser)
    if (d.bowed) {
      const bow = vector ? drawBowedV(ctx, c.w, c.h, d.bowed.geom, fr, d.bowed.st, (d.bowed.vfield ??= new Contours(48, 28, 1.8, 0.6)), now, true, c.sc) : drawBowed(ctx, c.w, c.h, d.bowed.geom, fr, d.bowed.st, d.bowed.field, now, true, c.sc);
      if (bow) bows.push(bow);
    } else if (d.flute) (vector ? drawFluteV : drawFlute)(ctx, c.w, c.h, fr, d.flute);
    else if (d.trumpet) (vector ? drawTrumpetV : drawTrumpet)(ctx, c.w, c.h, fr, d.trumpet);
    else if (d.oboe) (vector ? drawOboeV : drawOboe)(ctx, c.w, c.h, fr, d.oboe);
    else if (d.clarinet) (vector ? drawClarinetV : drawClarinet)(ctx, c.w, c.h, fr, d.clarinet);
    else if (d.bassoon) (vector ? drawBassoonV : drawBassoon)(ctx, c.w, c.h, fr, d.bassoon);
    else if (d.horn) (vector ? drawHornV : drawHorn)(ctx, c.w, c.h, fr, d.horn);
    else if (d.trombone) {
      d.trombone.sizeHint = p.size;
      (vector ? drawTromboneV : drawTrombone)(ctx, c.w, c.h, fr, d.trombone);
    }
    else if (d.tuba) (vector ? drawTubaV : drawTuba)(ctx, c.w, c.h, fr, d.tuba);
    else if (d.harp) (vector ? drawHarpV : drawHarp)(ctx, c.w, c.h, fr, d.harp);
    else if (d.glock) (vector ? drawGlockV : drawGlock)(ctx, c.w, c.h, fr, d.glock);
    else if (d.timpani) (vector ? drawTimpaniV : drawTimpani)(ctx, c.w, c.h, fr, d.timpani);
    else if (d.piano) {
      const st = d.piano.st;
      syncPianoState(st, p);
      // a little room either side of the keys
      const m = Math.max(10, c.w * 0.03);
      const pg = { keys: keysOf(p), kind: p.voice === 'upright' ? 'upright' : 'grand', lid: 1, keyX: keysAcross(m, c.w - 2 * m) } as const;
      if (vector) drawPianoV(ctx, c.w, c.h, pg, fr, st, (d.piano.vfield ??= new Contours(56, 28, 2.2, 3)), now);
      else drawPiano(ctx, c.w, c.h, pg, fr, st, d.piano.field, now);
    }
    ctx.restore();
  });
  for (const bow of bows) bow();
}
