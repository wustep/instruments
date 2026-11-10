// The double bass's plan on the 2D stage (stage-draw.ts): its machine heads (the strings' order on
// them, no string crossing another in the pegbox), its endpin within what the drawing takes along the
// strings, and its layout alone on the stage: whole under the file player, its bow's whole travel on
// the stage where the box allows (a phone), never smaller than 3/4 of the size its length allows.
import { describe, expect, it } from 'vitest';
import { bowedGeometry } from '@piano-model/engine';
import { BASS_MACH, BASS_PIN, BOWED_PLAN, HEAD_PROJ, bassHead, bassPinParts, bowReach, bowedDrawn, bowedLayout, bowedShapes, bowedSpan, bwPegboxW } from '../src/ui/stage-draw.ts';

const g = { id: 'bass' as const, ...bowedGeometry('bass') };
const p = BOWED_PLAN.bass;
const sh = bowedShapes('bass', p, g.L);
type P = [number, number];
/** do segments ab and cd cross (properly) */
const cross = (a: P, b: P, c: P, d: P) => {
  const o = (p: P, q: P, r: P) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

describe('the double bass’s machine heads', () => {
  const hd = bassHead(p);
  it('four tuners: the E and A on the bass side, the E farther from the nut; the D and G on the treble side', () => {
    expect(hd.tuners.map((t) => t.side)).toEqual([1, 1, -1, -1]);
    // (x runs from the body towards the scroll as it falls: farther from the nut is more negative)
    expect(hd.tuners[0].x).toBeLessThan(hd.tuners[1].x);
    expect(hd.tuners[3].x).toBeLessThan(hd.tuners[2].x);
    // staggered down the pegbox: four rollers at four places, the sides in turn
    const xs = hd.tuners.map((t) => t.x).sort((a, b) => b - a);
    for (let i = 1; i < 4; i++) expect(xs[i - 1] - xs[i]).toBeGreaterThan(0.03);
    // two plates, each tuner's wheel just outside its side's plate (the cheek's outside there, and the
    // plate's edge), its key standing out beyond it
    expect(hd.plates).toHaveLength(2);
    for (const t of hd.tuners) {
      const out = (q: P[]) => Math.min(...q.map(([, z]) => t.side * z));
      const plateOut = bwPegboxW(p, (-p.neck - t.x) / (p.head * HEAD_PROJ)) + BASS_MACH.T;
      const plate = hd.plates[t.side > 0 ? 0 : 1];
      expect(Math.min(...plate.map(([, z]) => t.side * z))).toBeGreaterThan(0.02);
      expect(out(t.gear)).toBeGreaterThan(plateOut - 1e-6);
      expect(out(t.key)).toBeGreaterThan(plateOut + 0.02);
      // keys on one side clear of each other along the pegbox
      for (const u of hd.tuners) if (u !== t && u.side === t.side) expect(Math.abs(u.x - t.x)).toBeGreaterThan(2 * Math.max(...t.key.map(([x]) => x - t.x)));
    }
  });
  it('each string from the nut to its own roller, inside the pegbox, crossing no other', () => {
    const nut = (i: number): P => [-p.neck, (1.5 - i) * p.spreadN];
    for (let i = 0; i < 4; i++) {
      const c = hd.coils[i];
      expect(c.x).toBe(hd.rollers[i].x);
      expect(Math.abs(c.z) + c.half).toBeLessThan(hd.rollers[i].half);
      for (let j = 0; j < i; j++) expect(cross(nut(i), [hd.coils[i].x, hd.coils[i].z], nut(j), [hd.coils[j].x, hd.coils[j].z]), `strings ${i} and ${j}`).toBe(false);
    }
  });
});

describe('the double bass’s endpin and layout', () => {
  it('the endpin, socket to point, within what the drawing takes along the strings', () => {
    const pin = bassPinParts(p.body);
    const tip = Math.max(...[...pin.rod, ...pin.sock].map(([x]) => x));
    expect(tip).toBeCloseTo(p.body + BASS_PIN.end, 6);
    expect(bowedSpan(g, p).x1).toBeGreaterThanOrEqual(tip);
  });
  /** the stage under the top band and the file player's px at its top (desktop 1440×900; a phone
   *  390×844 and a Pixel 7, their stages lying; a box the bass stands in) */
  for (const [W, H, top, bowFits] of [[1440, 532, 42, false], [390, 366, 84, true], [412, 424, 42, true], [390, 560, 42, true]] as [number, number, number, boolean][])
    it(`${W}×${H} under ${top} px of player: the whole bass on the stage, ${bowFits ? 'its bow’s whole travel too' : 'filling its length (its bow cut at the far ends of its travel, as the cello’s)'}`, () => {
      const lay = bowedLayout(g, p, sh, W, H, undefined, top);
      const d = bowedDrawn(g, p, sh, lay);
      const len = bowedSpan(g, p).x1 - bowedSpan(g, p).x0;
      expect(d.body.x0).toBeGreaterThanOrEqual(0);
      expect(d.body.x1).toBeLessThanOrEqual(W);
      expect(d.body.y0).toBeGreaterThanOrEqual(top);
      expect(d.body.y1).toBeLessThanOrEqual(H);
      const r = bowReach(g, p);
      if (bowFits) {
        expect(d.bow.x0).toBeGreaterThanOrEqual(0);
        expect(d.bow.x1).toBeLessThanOrEqual(W);
        expect(d.bow.y0).toBeGreaterThanOrEqual(top);
        expect(d.bow.y1).toBeLessThanOrEqual(H);
        // and no smaller than 3/4 of the size the length allows
        expect(lay.sc).toBeGreaterThanOrEqual(0.75 * ((0.95 * (lay.vertical ? H - top : W)) / len) - 1e-9);
      } else {
        // the bow cannot fit without the bass drawn at less than 3/4 its size: it fills its length (or
        // its width, the box under the player)
        expect((H - top - 12) / (r.frog + r.tip)).toBeLessThan(0.75 * lay.sc);
        expect(lay.sc).toBeCloseTo(Math.min((0.95 * W) / len, (0.93 * (H - top)) / (2 * sh.hwMax)), 6);
      }
    });
});
