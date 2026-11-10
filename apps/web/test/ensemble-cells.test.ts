// The ensemble on the 2D stage. Its strings are drawn at one scale (px/m), so a cello is twice a
// violin's length and every bow is its own instrument's length at that scale; the seats are spaced so
// that no bow, frog or tip on the string, reaches another instrument; and the group, bodies and bows at
// full reach, sits in the middle of the stage. (Stephen's Daylight quintet, Nov 2026: in equal cells a
// violin and a viola were drawn at twice a cello's scale, the viola's bow ran over both cellos, and the
// row was pushed right, the stage's left third empty.)
import { describe, expect, it } from 'vitest';
import { bowedGeometry, type VisualFrame } from '@piano-model/engine';
import { isKeyboard, type Voice } from '../src/orchestra/assign.ts';
import type { PartLive } from '../src/orchestra/ensemble.ts';
import { drawEnsemble, ensembleCells, newPartDraw, type Cell } from '../src/ui/ensemble-draw.ts';
import { BOWED_PLAN, FL_LEN, bowReach, bowedShapes, bowedSpan, type BowedGeom } from '../src/ui/stage-draw.ts';

/** the instrument area of the stage under the file player: a laptop, a large window, Stephen's window,
 *  a phone held upright (390×844 and a Pixel 7) and on its side, a wide monitor */
const STAGES: [number, number][] = [[1440, 505], [1535, 918], [2245, 918], [390, 422], [412, 400], [844, 190], [2560, 1100]];
const DAYLIGHT: Voice[] = ['violin', 'violin', 'viola', 'cello', 'cello'];
const LINEUPS: Voice[][] = [
  DAYLIGHT,
  ['violin', 'violin', 'viola', 'cello'],
  ['flute', 'violin', 'viola', 'violin', 'cello'],
  ['flute', 'violin', 'violin', 'viola', 'cello', 'grand'],
  ['flute', 'trumpet', 'violin', 'violin', 'violin', 'viola', 'cello', 'cello'],
  ['cello'],
  ['violin'],
  ['cello', 'cello'],
  ['viola', 'cello', 'cello'],
  ['violin', 'grand'],
  ['trumpet', 'cello', 'upright'],
  ['viola', 'viola', 'cello', 'cello', 'grand', 'upright'],
];
type Id = BowedGeom['id'];
const isBowed = (v: Voice): v is Id => v === 'violin' || v === 'viola' || v === 'cello';
const geom = (id: Id) => ({ id, ...bowedGeometry(id) });
/** the instrument's length as drawn (m): the scroll's top to the end button (the cello's first 0.16 m
 *  of endpin) */
const lengthOf = (id: Id) => {
  const s = bowedSpan(geom(id), BOWED_PLAN[id]);
  return s.x1 - s.x0;
};
const upright = (c: Cell) => c.h > c.w * 1.05;
/** a bowed instrument's bow at the far ends of its travel (stage px): along the bow (across the
 *  instrument), from the frog's far end with the tip on the string to the tip's with the frog on it;
 *  across the bow, the instrument's whole length (wherever on the strings the bow is set) */
const bowSpan = (v: Id, c: Cell) => {
  const r = bowReach(geom(v), BOWED_PLAN[v]);
  const sc = c.sc!;
  // (upright, the frog is to the left; lying, below: bwPlace)
  if (upright(c)) return { x0: c.x + c.w / 2 - r.frog * sc, x1: c.x + c.w / 2 + r.tip * sc, y0: c.y, y1: c.y + c.h };
  return { x0: c.x, x1: c.x + c.w, y0: c.y + c.h / 2 - r.tip * sc, y1: c.y + c.h / 2 + r.frog * sc };
};
const overlaps = (a: { x0: number; x1: number; y0: number; y1: number }, b: Cell) => a.x0 < b.x + b.w && b.x < a.x1 && a.y0 < b.y + b.h && b.y < a.y1;
const box = (c: Cell) => ({ x0: c.x, x1: c.x + c.w, y0: c.y, y1: c.y + c.h });

describe('the ensemble’s cells', () => {
  for (const [W, H] of STAGES)
    for (const lineup of LINEUPS)
      it(`${W}×${H} ${lineup.join(' ')}: one scale, every bow clear of the others and on the stage, the group centred`, () => {
        const cells = ensembleCells(lineup, W, H);
        expect(cells).toHaveLength(lineup.length);
        // the band above the pianos (the strings' bows lie in it)
        const band = Math.min(H, ...cells.filter((_, i) => isKeyboard(lineup[i])).map((c) => c.y));
        const mel = lineup.map((v, i) => i).filter((i) => !isKeyboard(lineup[i]));
        cells.forEach((c, i) => {
          const who = `${lineup[i]} ${i}`;
          // on the stage, large enough to be drawn, clear of the others
          expect(c.x, who).toBeGreaterThanOrEqual(0);
          expect(c.y, who).toBeGreaterThanOrEqual(0);
          expect(c.x + c.w, who).toBeLessThanOrEqual(W + 1);
          expect(c.y + c.h, who).toBeLessThanOrEqual(H + 1);
          expect(Math.min(c.w, c.h), who).toBeGreaterThanOrEqual(isKeyboard(lineup[i]) ? 24 : 12);
          for (let j = 0; j < i; j++) expect(overlaps({ x0: c.x + 1, x1: c.x + c.w - 1, y0: c.y + 1, y1: c.y + c.h - 1 }, cells[j]), `${who} over ${lineup[j]} ${j}`).toBe(false);
        });
        // one scale for the whole group, the strings standing or lying alike
        const sc = cells[mel[0]].sc!;
        expect(sc, 'the group’s px/m').toBeGreaterThan(0);
        for (const i of mel) {
          expect(cells[i].sc, `${lineup[i]} ${i}: the group's scale`).toBe(sc);
          if (isBowed(lineup[i])) expect(upright(cells[i]), `${lineup[i]} ${i}: standing as the others do`).toBe(upright(cells[mel.find((k) => isBowed(lineup[k]))!]));
        }
        // each instrument's box its own length at that scale (a cello's twice a violin's), within its
        // few px of margin
        for (const i of mel) {
          const v = lineup[i];
          if (!isBowed(v)) continue;
          const c = cells[i];
          const along = upright(c) ? c.h : c.w;
          const across = upright(c) ? c.w : c.h;
          expect(Math.abs(along - lengthOf(v) * sc), `${v} ${i}: its length at the group's scale`).toBeLessThanOrEqual(8);
          const hw = bowedShapes(v, BOWED_PLAN[v], geom(v).L).hwMax;
          expect(Math.abs(across - 2 * hw * sc), `${v} ${i}: its width at the group's scale`).toBeLessThanOrEqual(8);
        }
        // the flute too (its own layout fills 86 % of its box's length standing, 90 % lying)
        for (const i of mel) {
          if (lineup[i] !== 'flute') continue;
          const c = cells[i];
          expect(((upright(c) ? 0.86 * c.h : 0.9 * c.w) / FL_LEN) / sc, 'the flute at the group’s scale').toBeCloseTo(1, 1);
        }
        // every bow, frog or tip on the string, on the stage and clear of every other instrument's box
        const spans: ReturnType<typeof bowSpan>[] = [];
        for (const i of mel) {
          const v = lineup[i];
          if (!isBowed(v)) continue;
          const s = bowSpan(v, cells[i]);
          spans.push(s);
          const who = `${v} ${i}'s bow`;
          expect(s.x0, `${who}: on the stage`).toBeGreaterThanOrEqual(3);
          expect(s.x1, `${who}: on the stage`).toBeLessThanOrEqual(W - 3);
          expect(s.y0, `${who}: on the stage`).toBeGreaterThanOrEqual(0);
          expect(s.y1, `${who}: above the pianos`).toBeLessThanOrEqual(band + 1);
          for (const j of mel) if (j !== i) expect(overlaps(s, cells[j]), `${who} over ${lineup[j]} ${j}`).toBe(false);
        }
        // the group's box (its instruments and their bows at full reach) in the middle of the band
        const all = [...mel.map((i) => box(cells[i])), ...spans];
        const L = Math.min(...all.map((b) => b.x0));
        const R = W - Math.max(...all.map((b) => b.x1));
        const T = Math.min(...all.map((b) => b.y0));
        const B = band - Math.max(...all.map((b) => b.y1));
        expect(Math.abs(L - R), `left ${L.toFixed(1)} px, right ${R.toFixed(1)} px`).toBeLessThanOrEqual(3);
        expect(Math.abs(T - B), `top ${T.toFixed(1)} px, bottom ${B.toFixed(1)} px`).toBeLessThanOrEqual(3);
        // and as large as the band allows: it reaches the margin on one side or the other
        expect(Math.min(L + R - 2 * Math.max(6, Math.round(0.02 * Math.min(W, band))), T + B - 2 * Math.max(6, Math.round(0.02 * Math.min(W, band)))), 'the group fills the band one way').toBeLessThanOrEqual(4);
      });

  it('without bowed strings nothing closes up: equal cells over the whole band', () => {
    for (const [W, H] of STAGES)
      for (const lineup of [['flute', 'trumpet'], ['flute', 'flute', 'trumpet'], ['trumpet', 'grand'], ['flute', 'trumpet', 'trumpet', 'flute', 'upright']] as Voice[][]) {
        const cells = ensembleCells(lineup, W, H);
        const mel = cells.filter((_, i) => !isKeyboard(lineup[i]));
        const band = Math.min(H, ...cells.filter((_, i) => isKeyboard(lineup[i])).map((c) => c.y));
        for (const c of mel) expect([c.w, c.h]).toEqual([mel[0].w, mel[0].h]);
        const rows = new Set(mel.map((c) => c.y)).size;
        const cols = Math.ceil(mel.length / rows);
        expect(Math.abs(mel[0].w * cols - W)).toBeLessThanOrEqual(cols);
        expect(Math.abs(mel[0].h * rows - band)).toBeLessThanOrEqual(rows);
      }
  });

  it('the Daylight quintet in Stephen’s window and on a laptop: one row, standing, in order, a cello 2.3 × a violin’s length', () => {
    for (const [W, H] of [[2245, 918], [1440, 505]]) {
      const cells = ensembleCells(DAYLIGHT, W, H);
      // one row: one centre line
      const mid = cells.map((c) => c.y + c.h / 2);
      expect(Math.max(...mid) - Math.min(...mid)).toBeLessThanOrEqual(1);
      for (const c of cells) expect(upright(c)).toBe(true);
      // in the lineup's order, left to right
      for (let i = 1; i < 5; i++) expect(cells[i].x).toBeGreaterThan(cells[i - 1].x + cells[i - 1].w);
      const [v1, v2, va, c1, c2] = cells.map((c) => c.h);
      expect(v1).toBe(v2);
      expect(c1).toBe(c2);
      expect(c1 / v1).toBeCloseTo(lengthOf('cello') / lengthOf('violin'), 1);
      expect(va / v1).toBeCloseTo(lengthOf('viola') / lengthOf('violin'), 1);
    }
  });
});

// ---- the bows as drawn: the vector style's drawing, through a context that records its lines

/** a 2D context that keeps its transform and, for every line drawn with no clip set (the bows, drawn
 *  after every instrument), the segment in stage px, grouped by the bow that drew it */
function recorder() {
  type M = [number, number, number, number, number, number];
  let m: M = [1, 0, 0, 1, 0, 0];
  let clipped = false;
  const stack: { m: M; clipped: boolean }[] = [];
  const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const at = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const bows: [number, number, number, number][][] = [];
  let pen: [number, number] | null = null;
  let start: [number, number] | null = null;
  const seg = (p: [number, number]) => {
    if (pen && !clipped && bows.length) bows[bows.length - 1].push([pen[0], pen[1], p[0], p[1]]);
    pen = p;
  };
  const noop = () => undefined;
  const grad = { addColorStop: noop };
  const own: Record<string, unknown> = {
    save: () => stack.push({ m: [...m] as M, clipped }),
    restore: () => {
      const s = stack.pop();
      if (s) ({ m, clipped } = s);
    },
    translate: (x: number, y: number) => (m = mul(m, [1, 0, 0, 1, x, y])),
    scale: (x: number, y: number) => (m = mul(m, [x, 0, 0, y, 0, 0])),
    rotate: (t: number) => (m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0])),
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => (m = mul(m, [a, b, c, d, e, f])),
    setTransform: (a: number | { a: number; b: number; c: number; d: number; e: number; f: number }, b?: number, c?: number, d?: number, e?: number, f?: number) => {
      m = typeof a === 'number' ? [a, b!, c!, d!, e!, f!] : [a.a, a.b, a.c, a.d, a.e, a.f];
      // (a bow's drawing begins by setting the stage's transform back, outside every clip; it sets it
      // back again for its readings, after its lines)
      if (!clipped && !(bows.length && !bows[bows.length - 1].length)) bows.push([]);
    },
    getTransform: () => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }),
    clip: () => (clipped = true),
    beginPath: () => (pen = start = null),
    moveTo: (x: number, y: number) => (pen = start = at(x, y)),
    lineTo: (x: number, y: number) => seg(at(x, y)),
    quadraticCurveTo: (_a: number, _b: number, x: number, y: number) => seg(at(x, y)),
    bezierCurveTo: (_a: number, _b: number, _c: number, _d: number, x: number, y: number) => seg(at(x, y)),
    closePath: () => start && seg(start),
    arc: (x: number, y: number, r: number) => {
      pen = start = at(x + r, y);
      for (let k = 1; k <= 12; k++) seg(at(x + r * Math.cos((k * Math.PI) / 6), y + r * Math.sin((k * Math.PI) / 6)));
    },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 0 }),
  };
  const ctx = new Proxy(own, { get: (o, k: string) => (k in o ? o[k] : noop), set: () => true }) as unknown as CanvasRenderingContext2D;
  return { ctx, bows: () => bows.filter((b) => b.length) };
}

describe('the bows as drawn (vector lines)', () => {
  // (the vector drawing makes its paths and its plate's mode field ahead; nothing of them is read here)
  const g = globalThis as unknown as Record<string, unknown>;
  g.Path2D ??= class {
    addPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
    arc() {}
    ellipse() {}
    rect() {}
    quadraticCurveTo() {}
    bezierCurveTo() {}
  };
  g.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => recorder().ctx }) };

  const frameAt = (pos: number) => ({ bow: { pos, speed: 0, dir: 1, changing: false } }) as unknown as VisualFrame;
  /** the lineup drawn with every bow set down at `pos` along its hair (0: the frog on the string) */
  const draw = (lineup: Voice[], W: number, H: number, pos: number) => {
    const cells = ensembleCells(lineup, W, H);
    const parts = lineup.map((voice) => ({ voice, frame: frameAt(pos), down: new Set(), strikes: [], vels: new Map() }) as unknown as PartLive);
    const draws = lineup.map(newPartDraw);
    const { ctx, bows } = recorder();
    drawEnsemble(ctx, cells, parts, draws, () => [], 1000, true);
    return { cells, bows: bows(), draws };
  };
  const extent = (segs: [number, number, number, number][]) => ({
    x0: Math.min(...segs.flatMap((s) => [s[0], s[2]])),
    x1: Math.max(...segs.flatMap((s) => [s[0], s[2]])),
    y0: Math.min(...segs.flatMap((s) => [s[1], s[3]])),
    y1: Math.max(...segs.flatMap((s) => [s[1], s[3]])),
  });
  /** does the segment pass through the box (Liang–Barsky) */
  const crosses = ([x0, y0, x1, y1]: [number, number, number, number], c: Cell) => {
    let t0 = 0;
    let t1 = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    for (const [p, q] of [[-dx, x0 - c.x], [dx, c.x + c.w - x0], [-dy, y0 - c.y], [dy, c.y + c.h - y0]]) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
    return true;
  };

  for (const [W, H] of [[2245, 918], [1440, 505], [1535, 918], [390, 422]] as [number, number][])
    it(`${W}×${H}, the Daylight quintet: each bow its own instrument’s length at the one scale, clear of the others, the group centred`, () => {
      const ends = [0, 1].map((pos) => draw(DAYLIGHT, W, H, pos));
      const { cells, draws } = ends[0];
      for (const { bows } of ends) expect(bows).toHaveLength(5);
      // the scale each bow is drawn at: its hair as drawn (frog to tip, at the bridge's arch over the
      // string it rests on) over its real length. One for all five, the cells' own; so the viola's bow is
      // as long as a violin's (equal hair) and a cello's 0.6/0.64 of it, never three times a cello's
      const drawnSc = DAYLIGHT.map((v) => {
        const id = v as Id;
        const l = draws[DAYLIGHT.indexOf(v)].bowed!.st.bowLine!;
        const incl = Math.atan((0.5 * BOWED_PLAN[id].spreadB) / BOWED_PLAN[id].bridgeR);
        return Math.hypot(l.tx - l.fx, l.ty - l.fy) / (geom(id).bowLength * Math.cos(incl));
      });
      const sc = drawnSc[0];
      DAYLIGHT.forEach((v, i) => expect(drawnSc[i] / drawnSc[3], `${v} ${i}: its bow drawn at ${(drawnSc[i] / drawnSc[3]).toFixed(2)} × the cello's scale`).toBeCloseTo(1, 2));
      expect(cells[0].sc! / sc, 'the cells’ scale').toBeCloseTo(1, 2);
      DAYLIGHT.forEach((v, i) => {
        const id = v as Id;
        const g = geom(id);
        const who = `${v} ${i}`;
        // the whole bow as drawn, frog to head, at the two ends of its travel: within its reach (the
        // reach is the outermost string's, the bow level; on the second string, tilted on the bridge's
        // arch, it is a few per cent less)
        const frogEnd = extent(ends[1].bows[i]);
        const tipEnd = extent(ends[0].bows[i]);
        const r = bowReach(g, BOWED_PLAN[id]);
        const c = cells[i];
        const mid = upright(c) ? c.x + c.w / 2 : c.y + c.h / 2;
        const [lo, hi] = upright(c) ? [frogEnd.x0, tipEnd.x1] : [tipEnd.y0, frogEnd.y1];
        expect(mid - lo, `${who}: the frog's end`).toBeLessThanOrEqual(r.frog * sc + 1);
        expect(mid - lo, `${who}: the frog's end`).toBeGreaterThan(0.9 * r.frog * sc);
        expect(hi - mid, `${who}: the tip's end`).toBeLessThanOrEqual(r.tip * sc + 1);
        expect(hi - mid, `${who}: the tip's end`).toBeGreaterThan(0.9 * r.tip * sc);
        // no line of it through another instrument
        for (const { bows } of ends)
          for (const s of bows[i])
            cells.forEach((o, j) => {
              if (j !== i) expect(crosses(s, o), `${who}'s bow through ${DAYLIGHT[j]} ${j}`).toBe(false);
            });
      });
      // the group, its bows drawn at both ends of their travel, centred on the stage
      const all = [...cells.map(box), ...ends.flatMap((e) => e.bows.map(extent))];
      const L = Math.min(...all.map((b) => b.x0));
      const R = W - Math.max(...all.map((b) => b.x1));
      const T = Math.min(...all.map((b) => b.y0));
      const B = H - Math.max(...all.map((b) => b.y1));
      expect(Math.abs(L - R), `left ${L.toFixed(1)}, right ${R.toFixed(1)}`).toBeLessThanOrEqual(0.03 * W);
      expect(Math.abs(T - B), `top ${T.toFixed(1)}, bottom ${B.toFixed(1)}`).toBeLessThanOrEqual(3);
    });
});
