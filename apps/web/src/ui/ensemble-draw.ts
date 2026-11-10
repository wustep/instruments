// Orchestra mode in 2D: every instrument of the ensemble in a cell of its own, each drawn as the
// single instrument is (stage-draw.ts, piano-draw.ts: the same plans, strings and waves), from its own
// engine's frames. The pianos take a band across the whole width (their plan is as wide as their
// keyboard); the others share the rest in the grid that draws them largest and, with bowed strings
// among them, leaves every bow room on the stage: the bows are drawn last, over the whole stage.

import { bowedGeometry, type VisualFrame } from '@piano-model/engine';
import { isKeyboard, VOICE_INFO, type Voice } from '../orchestra/assign.ts';
import type { PartLive } from '../orchestra/ensemble.ts';
import { drawPiano, newPianoState, type PianoState } from './piano-draw.ts';
import { Contours, drawBowedV, drawFluteV, drawPianoV, drawTrumpetV } from './vector/index.ts';
import { AutoScale, BOWED_PLAN, ModeField, bowReach, bowedLayout, bowedShapes, drawBowed, drawFlute, drawTrumpet, type BowedGeom, type BowedState, type FluteState, type TrumpetState } from './stage-draw.ts';

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** what each part's drawing keeps between frames */
export interface PartDraw {
  voice: Voice;
  bowed?: { geom: BowedGeom; st: BowedState; field: ModeField; vfield?: Contours };
  flute?: FluteState;
  trumpet?: TrumpetState;
  piano?: { st: PianoState; field: ModeField; vfield?: Contours };
}

export function newPartDraw(v: Voice): PartDraw {
  const inst = VOICE_INFO[v].instrument;
  if (inst === 'violin' || inst === 'viola' || inst === 'cello')
    // (a coarser mode field than the single instrument's: six of them are drawn every frame)
    return { voice: v, bowed: { geom: { id: inst, ...bowedGeometry(inst) }, st: { strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) }, field: new ModeField(96, 54, 1.8, 0.6) } };
  if (inst === 'flute') return { voice: v, flute: { pScale: new AutoScale(1e-6), jetScale: new AutoScale(1e-9), env: new Float32Array(0) } as FluteState };
  if (inst === 'trumpet') return { voice: v, trumpet: { pScale: new AutoScale(1e-6), env: new Float32Array(0) } };
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

// ---- room for the bows. A bow is longer than its instrument: the violin's hair is 0.64 m, its body
// 0.36 m. Drawn in its instrument's cell alone it showed as a stub cut at the cell's edge, so the bows
// are drawn over the whole stage, after every instrument (drawEnsemble), and the cells are set where
// each bow, at either end of its travel, still ends on the stage.

/** px a bow's far end keeps from the edge of the stage */
const BOW_EDGE = 6;
const geoms = new Map<BowedGeom['id'], BowedGeom>();
const geomOf = (id: BowedGeom['id']): BowedGeom => {
  let g = geoms.get(id);
  if (!g) geoms.set(id, (g = { id, ...bowedGeometry(id) }));
  return g;
};
const bowedId = (v: Voice): BowedGeom['id'] | null => {
  const id = VOICE_INFO[v].instrument;
  return id === 'violin' || id === 'viola' || id === 'cello' ? id : null;
};

/** How far a voice's bow reaches from the centre of its w×h cell (px), at the far ends of its travel:
 *  `lo` towards the cell's left (the instrument upright, its bow lying across) or its top (the
 *  instrument lying, its bow upright), `hi` the other way. null: it has no bow. */
export function bowRoom(v: Voice, w: number, h: number): { upright: boolean; lo: number; hi: number } | null {
  const id = bowedId(v);
  if (!id) return null;
  const g = geomOf(id);
  const p = BOWED_PLAN[id];
  const lay = bowedLayout(g, p, bowedShapes(id, p, g.L), w, h);
  const r = bowReach(g, p);
  // (bwPlace: upright, the bass side, where the frog goes, is to the left; lying, it is below)
  return lay.vertical ? { upright: true, lo: r.frog * lay.sc, hi: r.tip * lay.sc } : { upright: false, lo: r.tip * lay.sc, hi: r.frog * lay.sc };
}

/**
 * The cells of `mel`, `cols` to a row over a W×H band, with room for every bow at full travel.
 * `upright`: the instruments stand side by side and their bows lie across the band; otherwise they lie
 * in rows and their bows stand. The cells keep their size the other way and close up along the bows
 * (a bow may lie over its neighbours, not leave the stage) until every bow, frog or tip on the
 * string, ends inside the band; what room is left goes either side as the bows need it. null: no room.
 */
function bowGrid(mel: Voice[], W: number, H: number, cols: number, upright: boolean): Cell[] | null {
  const n = mel.length;
  const rows = Math.ceil(n / cols);
  const cw = W / cols;
  const ch = H / rows;
  const E = upright ? W : H;
  const count = upright ? cols : rows;
  // (an instrument stands upright in a cell taller than 1.05 × its width: bowedLayout)
  const cap = upright ? ch / 1.05 - 2 : cw * 1.05 - 2;
  const place = (pitch: number): Cell[] | null => {
    const ext = Math.round(Math.min(pitch, cap));
    if (ext < 16) return null;
    // (no longer than the bowed strings can fill, 3.4 × its width for a violin lying: a flute in a
    // cell closed up for the bows is not drawn twice their length)
    const w = upright ? ext : Math.round(Math.min(cw, 3.4 * ext));
    const h = upright ? Math.round(Math.min(ch, 3.4 * ext)) : ext;
    let lo = 0;
    let hi = E - count * pitch;
    const at = mel.map((v, k) => {
      const r = Math.floor(k / cols);
      const c = k - r * cols;
      const inRow = r === rows - 1 ? n - r * cols : cols;
      // the cell's centre along the bows, from where the grid starts
      const d = upright ? ((cols - inRow) / 2 + c + 0.5) * pitch : (r + 0.5) * pitch;
      const room = bowRoom(v, w, h);
      if (room) {
        lo = Math.max(lo, BOW_EDGE + room.lo - d);
        hi = Math.min(hi, E - BOW_EDGE - room.hi - d);
      }
      return { r, c, inRow, d };
    });
    if (lo > hi) return null;
    const start = Math.min(hi, Math.max(lo, (E - count * pitch) / 2));
    return at.map(({ r, c, inRow, d }) => (upright ? { x: Math.round(start + d - ext / 2), y: Math.round(r * ch + (ch - h) / 2), w, h } : { x: Math.round((W - inRow * cw) / 2 + c * cw + (cw - w) / 2), y: Math.round(start + d - ext / 2), w, h }));
  };
  const full = upright ? cw : ch;
  const whole = place(full);
  if (whole) return whole;
  // (the closer the cells, the smaller the instruments and their bows: the largest pitch that fits)
  let a = 0;
  let b = full;
  for (let i = 0; i < 24; i++) {
    const m = (a + b) / 2;
    if (place(m)) a = m;
    else b = m;
  }
  return a > 0 ? place(a) : null;
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
    // the grid that draws an instrument largest
    let best = 1;
    let bs = -1;
    for (let cols = 1; cols <= n; cols++) {
      const s = drawnSize(W / cols, mh / Math.ceil(n / cols));
      if (s > bs * 1.02) {
        bs = s;
        best = cols;
      }
    }
    let cells = grid(n, W, mh, best);
    const melV = mel.map((i) => voices[i]);
    if (melV.some(bowedId)) {
      // with bowed strings: the grid, upright or lying, that draws them largest with room for their bows
      let bb = -1;
      for (let cols = 1; cols <= n; cols++) {
        for (const upright of [false, true]) {
          const g = bowGrid(melV, W, mh, cols, upright);
          const s = g ? drawnSize(g[0].w, g[0].h) : -1;
          if (g && s > bb * 1.02) {
            bb = s;
            cells = g;
          }
        }
      }
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
      const bow = vector ? drawBowedV(ctx, c.w, c.h, d.bowed.geom, fr, d.bowed.st, (d.bowed.vfield ??= new Contours(48, 28, 1.8, 0.6)), now, true) : drawBowed(ctx, c.w, c.h, d.bowed.geom, fr, d.bowed.st, d.bowed.field, now, true);
      if (bow) bows.push(bow);
    } else if (d.flute) (vector ? drawFluteV : drawFlute)(ctx, c.w, c.h, fr, d.flute);
    else if (d.trumpet) (vector ? drawTrumpetV : drawTrumpet)(ctx, c.w, c.h, fr, d.trumpet);
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
