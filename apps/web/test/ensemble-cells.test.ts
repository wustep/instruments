// The ensemble on the 2D stage. Its strings are drawn at one scale (px/m), so a cello is twice a
// violin's length and every bow is its own instrument's length at that scale; the seats are spaced so
// that no bow, frog or tip on the string, reaches another instrument; and the group, bodies and bows at
// full reach, sits in the middle of the stage. (Stephen's Daylight quintet, Nov 2026: in equal cells a
// violin and a viola were drawn at twice a cello's scale, the viola's bow ran over both cellos, and the
// row was pushed right, the stage's left third empty.)
import { describe, expect, it } from 'vitest';
import { bowedGeometry, type VisualFrame } from '@piano-model/engine';
import { isKeyboard, VOICE_INFO, type Voice } from '../src/orchestra/assign.ts';
import { isOrchestral, seatKinds } from '../src/orchestra/seats.ts';
import type { PartLive } from '../src/orchestra/ensemble.ts';
import { drawEnsemble, ensembleCells, newPartDraw, type Cell } from '../src/ui/ensemble-draw.ts';
import { BOWED_PLAN, FL_LEN, bowReach, bowedShapes, bowedSpan, type BowedGeom } from '../src/ui/stage-draw.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

/** the instrument area of the stage under the file player: a laptop (and 1440×900's), a large window,
 *  Stephen's window, a phone held upright (390×844 and a Pixel 7) and on its side, a wide monitor */
const STAGES: [number, number][] = [[1440, 505], [1440, 490], [1535, 918], [2245, 918], [390, 422], [412, 400], [844, 190], [2560, 1100]];
const DAYLIGHT: Voice[] = ['violin', 'violin', 'viola', 'cello', 'cello'];
/** a string quintet with the double bass (Daylight's lineup, its second cello a bass), and with two */
const QUINTET: Voice[] = ['violin', 'violin', 'viola', 'cello', 'bass'];
const TWO_BASSES: Voice[] = ['violin', 'violin', 'viola', 'cello', 'bass', 'bass'];
/** Beethoven's Fifth as its preset seats it, with three trombones, and a small mixed orchestra */
const B5: Voice[] = ['flute', 'flute', 'oboe', 'oboe', 'clarinet', 'clarinet', 'bassoon', 'bassoon', 'horn', 'horn', 'trumpet', 'trumpet', 'timpani', 'violin', 'violin', 'viola', 'cello', 'bass'];
const B5_TB: Voice[] = [...B5.slice(0, 12), 'trombone', 'trombone', 'trombone', ...B5.slice(12)];
const MIXED: Voice[] = ['violin', 'flute', 'clarinet', 'horn', 'cello', 'trumpet', 'timpani'];
const LINEUPS: Voice[][] = [
  DAYLIGHT,
  QUINTET,
  TWO_BASSES,
  ['bass'],
  ['cello', 'bass'],
  ['bass', 'bass'],
  ['flute', 'violin', 'viola', 'cello', 'bass', 'grand'],
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
  B5,
  B5_TB,
  MIXED,
  [...B5, 'grand'],
];
type Id = BowedGeom['id'];
const isBowed = (v: Voice): v is Id => v === 'violin' || v === 'viola' || v === 'cello' || v === 'bass';
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
        const orch = isOrchestral(seatKinds(lineup.filter((v) => !isKeyboard(v)).map((v) => VOICE_INFO[v])));
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
          // (an orchestra's winds and brass at its one scale on a phone: an oboe is 16 cm across and 73 cm long,
          // a trumpet seen from its side 26 cm tall)
          const thin = ['flute', 'oboe', 'clarinet', 'bassoon', 'trumpet', 'trombone'].includes(lineup[i]) && lineup.filter((v) => !isKeyboard(v)).length >= 5;
          expect(Math.min(c.w, c.h), who).toBeGreaterThanOrEqual(isKeyboard(lineup[i]) ? 24 : thin ? 6 : 12);
          expect(Math.max(c.w, c.h), who).toBeGreaterThanOrEqual(24);
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
        // (an orchestra's middle, its strings' row, in the stage's middle, unless the timpani past the brass
        // row's left end would run off the stage: then a side of the group at the stage's margin)
        const m0 = Math.max(6, Math.round(0.02 * Math.min(W, band)));
        if (orch) {
          const mids = mel.filter((i) => isBowed(lineup[i])).map((i) => cells[i].y + cells[i].h / 2);
          const front = mel.filter((i) => isBowed(lineup[i]) && cells[i].y + cells[i].h / 2 >= Math.max(...mids) - 1.5);
          if (front.length) {
            const fb = [...front.map((i) => box(cells[i])), ...front.map((i) => bowSpan(lineup[i] as Id, cells[i]))];
            const fmid = (Math.min(...fb.map((b) => b.x0)) + Math.max(...fb.map((b) => b.x1))) / 2;
            // (or, on a stage too short for its rows, the one line centred as before)
            expect(Math.abs(fmid - W / 2) <= 3 || Math.min(L, R) <= m0 + 3 || Math.abs(L - R) <= 3, `the strings' middle ${fmid.toFixed(1)} px, the stage's ${W / 2}`).toBe(true);
          }
        } else expect(Math.abs(L - R), `left ${L.toFixed(1)} px, right ${R.toFixed(1)} px`).toBeLessThanOrEqual(3);
        expect(Math.abs(T - B), `top ${T.toFixed(1)} px, bottom ${B.toFixed(1)} px`).toBeLessThanOrEqual(3);
        // and as large as the band allows: it reaches the margin on one side or the other
        expect(Math.min(L + R - 2 * Math.max(6, Math.round(0.02 * Math.min(W, band))), T + B - 2 * Math.max(6, Math.round(0.02 * Math.min(W, band)))), 'the group fills the band one way').toBeLessThanOrEqual(4);
      });

  it('an orchestra in its rows: the strings at the front (the bottom), the woodwinds above them, the brass and the timpani at the back (the top)', () => {
    const mid = (c: Cell) => c.y + c.h / 2;
    for (const [W, H] of STAGES.filter(([, h]) => h > 300))
      for (const L of [B5, B5_TB, MIXED]) {
        const cells = ensembleCells(L, W, H);
        const of = (...v: Voice[]) => L.flatMap((x, i) => (v.includes(x) ? [cells[i]] : []));
        const strings = of('violin', 'viola', 'cello', 'bass');
        const winds = of('flute', 'oboe', 'clarinet', 'bassoon');
        const brass = of('horn', 'trumpet', 'trombone');
        const who = `${W}×${H} ${L.length} seats`;
        // the strings' row below every woodwind, the woodwinds' below every brass instrument
        expect(Math.min(...strings.map(mid)), who).toBeGreaterThan(Math.max(...winds.map(mid)));
        expect(Math.min(...winds.map(mid)), who).toBeGreaterThan(Math.max(...brass.map(mid)));
        // first violins at the left, then the seconds, the violas, the cellos; flutes left of oboes, horns of trumpets
        const xs = L.map((v, i) => (v === 'violin' || v === 'viola' || v === 'cello' ? cells[i].x : NaN)).filter((x) => !Number.isNaN(x));
        if (strings.length >= 4 && new Set(of('violin', 'viola', 'cello').map((c) => c.y)).size === 1) expect(xs, who).toEqual([...xs].sort((a, b) => a - b));
        expect(Math.max(...of('horn').map((c) => c.x)), who).toBeLessThan(Math.min(...of('trumpet').map((c) => c.x)));
        // the timpani at the back: above the strings, at the left of the brass (or above them)
        const [t] = of('timpani');
        expect(mid(t), who).toBeLessThan(Math.min(...strings.map(mid)));
        expect(t.x < Math.min(...brass.map((c) => c.x)) || mid(t) < Math.min(...brass.map(mid)), who).toBe(true);
      }
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

describe('the bows as drawn (vector lines)', () => {
  installCanvas();

  const frameAt = (pos: number) => ({ bow: { pos, speed: 0, dir: 1, changing: false } }) as unknown as VisualFrame;
  /** the lineup drawn with every bow set down at `pos` along its hair (0: the frog on the string) */
  const draw = (lineup: Voice[], W: number, H: number, pos: number) => {
    const cells = ensembleCells(lineup, W, H);
    const parts = lineup.map((voice) => ({ voice, frame: frameAt(pos), down: new Set(), strikes: [], vels: new Map() }) as unknown as PartLive);
    const draws = lineup.map(newPartDraw);
    const { ctx, bows, outlines } = recorder();
    drawEnsemble(ctx, cells, parts, draws, () => [], 1000, true);
    return { cells, bows: bows(), draws, outlines };
  };
  /** the plate as drawn in a cell: of the outlines stroked inside it, the widest across the instrument;
   *  its length along the instrument (px) */
  const plateLength = (outlines: [number, number][][], c: Cell) => {
    const up = upright(c);
    let best = { across: -1, along: 0 };
    for (const o of outlines) {
      const xs = o.map((q) => q[0]);
      const ys = o.map((q) => q[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      if (x0 < c.x - 1 || x1 > c.x + c.w + 1 || y0 < c.y - 1 || y1 > c.y + c.h + 1) continue;
      const across = up ? x1 - x0 : y1 - y0;
      if (across > best.across) best = { across, along: up ? y1 - y0 : x1 - x0 };
    }
    return best.along;
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

  for (const [name, LINE] of [['the Daylight quintet', DAYLIGHT], ['a string quintet with the double bass', QUINTET], ['the quintet with two basses', TWO_BASSES]] as [string, Voice[]][])
  for (const [W, H] of [[2245, 918], [1440, 505], [1440, 490], [1535, 918], [390, 422]] as [number, number][])
    it(`${W}×${H}, ${name}: each bow its own instrument’s length at the one scale, clear of the others, the group centred`, () => {
      const DAYLIGHT = LINE;
      const ends = [0, 1].map((pos) => draw(DAYLIGHT, W, H, pos));
      const { cells, draws, outlines } = ends[0];
      for (const { bows } of ends) expect(bows).toHaveLength(DAYLIGHT.length);
      // the bass at the cello's px/m, so its plate as drawn 1110/755 = 1.47 × the cello's (within 3 %)
      const ci = DAYLIGHT.indexOf('cello');
      DAYLIGHT.forEach((v, i) => {
        if (v !== 'bass') return;
        expect(cells[i].sc, `bass ${i}: the cello's px/m`).toBe(cells[ci].sc);
        const r = plateLength(outlines, cells[i]) / plateLength(outlines, cells[ci]);
        expect(Math.abs(r / (1.11 / 0.755) - 1), `bass ${i}: its plate drawn ${r.toFixed(3)} × the cello's`).toBeLessThan(0.03);
        expect(plateLength(outlines, cells[i]) / (1.11 * cells[i].sc!), `bass ${i}: its plate at the group's scale`).toBeCloseTo(1, 2);
      });
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
        // arch, it is less by up to two strings' spacing and by the tilt's cosine: a few per cent, the
        // double bass's 11 %, its strings 31 mm apart under 0.58 m of hair)
        const frogEnd = extent(ends[1].bows[i]);
        const tipEnd = extent(ends[0].bows[i]);
        const r = bowReach(g, BOWED_PLAN[id]);
        const c = cells[i];
        const mid = upright(c) ? c.x + c.w / 2 : c.y + c.h / 2;
        const [lo, hi] = upright(c) ? [frogEnd.x0, tipEnd.x1] : [tipEnd.y0, frogEnd.y1];
        const sp = BOWED_PLAN[id].spreadB;
        const least = (reach: number) => 0.98 * (reach - 2 * sp) * Math.cos(Math.atan((0.5 * sp) / BOWED_PLAN[id].bridgeR)) * sc;
        expect(mid - lo, `${who}: the frog's end`).toBeLessThanOrEqual(r.frog * sc + 1);
        expect(mid - lo, `${who}: the frog's end`).toBeGreaterThan(least(r.frog));
        expect(hi - mid, `${who}: the tip's end`).toBeLessThanOrEqual(r.tip * sc + 1);
        expect(hi - mid, `${who}: the tip's end`).toBeGreaterThan(least(r.tip));
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
