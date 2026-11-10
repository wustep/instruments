// The ensemble's cells on the 2D stage. A bow is longer than its instrument, so it is drawn over the
// whole stage and the cells are set where every bow, at either end of its travel, still ends on it.
import { describe, expect, it } from 'vitest';
import { isKeyboard, type Voice } from '../src/orchestra/assign.ts';
import { bowRoom, ensembleCells, type Cell } from '../src/ui/ensemble-draw.ts';

/** the instrument area of the stage under the file player: a laptop, a large window, a phone held
 *  upright (390×844 and a Pixel 7) and on its side, a wide monitor */
const STAGES: [number, number][] = [[1440, 505], [1535, 918], [390, 422], [412, 400], [844, 190], [2560, 1100]];
const LINEUPS: Voice[][] = [
  ['violin', 'violin', 'viola', 'cello'],
  ['flute', 'violin', 'viola', 'violin', 'cello'],
  ['flute', 'violin', 'violin', 'viola', 'cello', 'grand'],
  ['flute', 'trumpet', 'violin', 'violin', 'violin', 'viola', 'cello', 'cello'],
  ['cello'],
  ['violin', 'grand'],
  ['trumpet', 'cello', 'upright'],
  ['viola', 'viola', 'cello', 'cello', 'grand', 'upright'],
];
const overlap = (a: Cell, b: Cell) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the ensemble’s cells', () => {
  for (const [W, H] of STAGES)
    for (const lineup of LINEUPS)
      it(`${W}×${H} ${lineup.join(' ')}: every bow ends on the stage, frog or tip on the string`, () => {
        const cells = ensembleCells(lineup, W, H);
        expect(cells).toHaveLength(lineup.length);
        // the bows' band: the stage above the pianos
        const band = Math.min(H, ...cells.filter((_, i) => isKeyboard(lineup[i])).map((c) => c.y));
        cells.forEach((c, i) => {
          const who = `${lineup[i]} ${i}`;
          // on the stage, large enough to be drawn, clear of the others
          expect(c.x, who).toBeGreaterThanOrEqual(0);
          expect(c.y, who).toBeGreaterThanOrEqual(0);
          expect(c.x + c.w, who).toBeLessThanOrEqual(W + 1);
          expect(c.y + c.h, who).toBeLessThanOrEqual(H + 1);
          expect(Math.min(c.w, c.h), who).toBeGreaterThanOrEqual(24);
          for (let j = 0; j < i; j++) expect(overlap({ ...c, x: c.x + 1, y: c.y + 1, w: c.w - 2, h: c.h - 2 }, cells[j]), `${who} over ${lineup[j]} ${j}`).toBe(false);
          const room = bowRoom(lineup[i], c.w, c.h);
          if (!room) return;
          // along the bow: across the stage for an instrument standing upright, down it for one lying
          const [mid, end] = room.upright ? [c.x + c.w / 2, W] : [c.y + c.h / 2, band];
          expect(mid - room.lo, `${who}: the bow's low end`).toBeGreaterThanOrEqual(3);
          expect(mid + room.hi, `${who}: the bow's high end`).toBeLessThanOrEqual(end - 3);
        });
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

  it('the strings are drawn no smaller than their bows need: a quartet on a laptop stands in a row, each as tall as the stage allows', () => {
    const cells = ensembleCells(['violin', 'violin', 'viola', 'cello'], 1440, 505);
    expect(new Set(cells.map((c) => c.y)).size).toBe(1);
    for (const c of cells) {
      expect(c.h).toBe(505);
      // (a violin 505 px tall is 149 px wide: its cell holds it)
      expect(c.w).toBeGreaterThan(170);
    }
  });
});
