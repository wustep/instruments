// Orchestra mode in 2D: every instrument of the ensemble in a cell of its own, each drawn as the
// single instrument is (stage-draw.ts, piano-draw.ts: the same plans, strings and waves), from its own
// engine's frames. The pianos take a band across the whole width (their plan is as wide as their
// keyboard); the others share the rest in the grid that draws them largest.

import { bowedGeometry, type VisualFrame } from '@piano-model/engine';
import { isKeyboard, VOICE_INFO, type Voice } from '../orchestra/assign.ts';
import type { PartLive } from '../orchestra/ensemble.ts';
import { drawPiano, newPianoState, type PianoState } from './piano-draw.ts';
import { Contours, drawBowedV, drawFluteV, drawPianoV, drawTrumpetV } from './vector/index.ts';
import { AutoScale, ModeField, drawBowed, drawFlute, drawTrumpet, type BowedGeom, type BowedState, type FluteState, type TrumpetState } from './stage-draw.ts';

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
    // the grid that draws an instrument of about 2.8 : 1 (length : width) largest
    let best = 1;
    let bs = -1;
    for (let cols = 1; cols <= mel.length; cols++) {
      const rows = Math.ceil(mel.length / cols);
      const cw = W / cols;
      const ch = mh / rows;
      const long = Math.max(cw, ch);
      const short = Math.min(cw, ch);
      const s = Math.min(long * 0.78, short * 0.84 * 2.8);
      if (s > bs * 1.02) {
        bs = s;
        best = cols;
      }
    }
    const rows = Math.ceil(mel.length / best);
    mel.forEach((i, k) => {
      const r = Math.floor(k / best);
      // a last row with fewer instruments is centred
      const inRow = r === rows - 1 ? mel.length - r * best : best;
      const cw = W / best;
      const c = k - r * best;
      const x0 = (W - inRow * cw) / 2;
      out[i] = { x: Math.round(x0 + c * cw), y: Math.round((r * mh) / rows), w: Math.round(cw), h: Math.round(mh / rows) };
    });
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
      if (vector) drawBowedV(ctx, c.w, c.h, d.bowed.geom, fr, d.bowed.st, (d.bowed.vfield ??= new Contours(48, 28, 1.8, 0.6)), now);
      else drawBowed(ctx, c.w, c.h, d.bowed.geom, fr, d.bowed.st, d.bowed.field, now);
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
}
