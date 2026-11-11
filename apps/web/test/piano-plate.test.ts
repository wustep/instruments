// The 2D pianos' iron plate (ui/grand-plan.ts `plateOf`, `grandPlate`; ui/piano-draw.ts `upPlate`,
// `upLayout`): one tuning pin and one hitch pin per string, every one inside the case; each lead and tail
// on its own string's line; the bass's hitch rail short of the break; three tapered struts that end on a
// rail or the band; nothing but the frame on a small piano (an ensemble's); and the upright's hammers in
// one level row with the strings' tops stepping up to the bass.
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, PRESETS, buildKeySpecs } from '../../../packages/engine/src/core/design.ts';
import type { KeySummary } from '@piano-model/engine';
import { PLATE_DETAIL_PITCH, grandDepth, grandPlate, inPoly, layout, type Plate } from '../src/ui/grand-plan.ts';
import { upLayout, upPlate, type Pt } from '../src/ui/piano-draw.ts';
import { installCanvas } from './recording-ctx.ts';

const keysOf = (preset: string): KeySummary[] => {
  const d = PRESETS[preset];
  return buildKeySpecs(d, { ...DEFAULT_PARAMS, ...d.defaults }).map((s) => ({ midi: s.midi, f1: s.f1, B: s.B, nStrings: s.nStrings, lengthM: s.L, hasDamper: s.hasDamper, preparation: null }));
};
/** the keys laid from x0 at an even pitch (as the drawers take them) */
const ptsOf = (keys: KeySummary[], x0: number, pitch: number): Pt[] => keys.map((k) => ({ midi: k.midi, i: k.midi - 21, x: x0 + (k.midi - 21 + 0.5) * pitch, w: pitch, L: k.lengthM, k, wound: k.midi < 48 && k.nStrings <= 2 }));
const wires = (keys: KeySummary[]) => keys.reduce((a, k) => a + Math.max(1, k.nStrings), 0);

/** the stages measured: a laptop's, a phone's (two octaves, mid keyboard and at the bass), an ensemble's small cell */
const STAGES = [
  { name: 'laptop', W: 1440, H: 545, x0: 28, pitch: (1412 - 28) / 88 },
  { name: 'phone', W: 390, H: 480, x0: -640, pitch: 16.25 },
  { name: 'phone at the bass', W: 390, H: 480, x0: 0, pitch: 16.25 },
];
const SMALL = { W: 390, H: 110, x0: 12, pitch: (390 - 24) / 88 };

/** how far q lies off the line through a and b (px) */
const off = (a: number[], b: number[], q: number[]) => Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);

function checkEnds(pl: Plate, strings: { a: number[]; b: number[]; off: number[] }[], inside: (x: number, y: number) => boolean, W: number): void {
  const onStage = (s: { a: number[]; b: number[] }) => s.a[0] > 0 && s.a[0] < W && s.b[0] > 0 && s.b[0] < W;
  let n = 0;
  for (const s of strings)
    for (const d of s.off) {
      const a = [s.a[0] + d, s.a[1]];
      const b = [s.b[0] + d, s.b[1]];
      const [pin, hitch] = [pl.pins[n], pl.hitch[n]];
      expect(inside(pin[0], pin[1]), `pin ${n} inside the case`).toBe(true);
      // (a phone's upright is scaled to the strings in view: a longer one off to the side runs out of the
      // case's foot, as it always has; wherever the bridge end is in the case, so is the hitch pin)
      if (inside(b[0], b[1])) expect(inside(hitch[0], hitch[1]), `hitch pin ${n} inside the case`).toBe(true);
      else expect(onStage(s), `string ${n} off the stage`).toBe(false);
      // the lead and the tail continue their own string's line
      expect(off(a, b, pin)).toBeLessThan(0.01);
      expect(off(a, b, hitch)).toBeLessThan(0.01);
      expect(pl.leads[n][0]).toEqual(a);
      expect(pl.leads[n][1]).toEqual(pin);
      expect(pl.tails[n][0]).toEqual(b);
      expect(pl.tails[n][1]).toEqual(hitch);
      // the hitch pin is past the bridge, away from the pin end
      expect((hitch[0] - b[0]) * (b[0] - a[0]) + (hitch[1] - b[1]) * (b[1] - a[1])).toBeGreaterThan(0);
      n++;
    }
  expect(pl.pins.length).toBe(n);
  expect(pl.hitch.length).toBe(n);
}
function checkFrame(pl: Plate, firstPlain: { a: number[]; b: number[] }, pitch: number): void {
  // two rails; the bass's stops short of the break
  expect(pl.rails.length).toBe(2);
  expect(Math.max(...pl.rails[0].map((q) => q[0]))).toBeLessThan(Math.min(firstPlain.a[0], firstPlain.b[0]) - pitch);
  // three struts, tapering from the pin block, each ending on a rail or the band
  expect(pl.struts.length).toBe(3);
  for (const s of pl.struts) {
    expect(s.wb).toBeLessThan(s.wa);
    expect(s.a[0]).toBe(s.b[0]);
    expect(Math.abs(s.b[1] - s.a[1])).toBeGreaterThan(2 * pitch);
  }
  // the break's strut passes between the two rails
  expect(pl.struts[0].a[0]).toBeGreaterThan(Math.max(...pl.rails[0].map((q) => q[0])));
  expect(pl.struts[0].a[0]).toBeLessThan(Math.min(...pl.rails[1].map((q) => q[0])));
}

beforeAll(() => {
  installCanvas();
  const P = (globalThis as unknown as { Path2D: { prototype: Record<string, unknown> } }).Path2D;
  P.prototype.roundRect ??= () => {};
});

describe('the grand’s plate (2D)', () => {
  const keys = keysOf('grand');
  for (const s of STAGES)
    it(`${s.name}: a pin and a hitch pin per string, inside the rim, on the string’s line; the frame`, () => {
      const pts = ptsOf(keys, s.x0, s.pitch);
      const lay = layout(s.W, s.H, pts, 1, grandDepth(s.W, pts));
      const pl = grandPlate(lay, s.H);
      expect(pl.detail).toBe(true);
      expect(pl.pins.length).toBe(wires(keys));
      checkEnds(pl, lay.strs, (x, y) => y < s.H && inPoly(lay.innerPts, x, y), s.W);
      checkFrame(pl, lay.strs.find((q) => !q.p.wound)!, s.pitch);
      // the pin block runs from the strings' fronts to the stage's front edge
      expect(pl.toward).toBe(1);
      expect(pl.edge.length).toBe(88);
      // (cached with the layout: nothing is built per frame)
      expect(grandPlate(lay, s.H)).toBe(pl);
    });
  it('a small piano (an ensemble’s): the frame, no pins or wires', () => {
    expect(SMALL.pitch).toBeLessThan(PLATE_DETAIL_PITCH);
    const pts = ptsOf(keys, SMALL.x0, SMALL.pitch);
    const pl = grandPlate(layout(SMALL.W, SMALL.H, pts, 1, grandDepth(SMALL.W, pts)), SMALL.H);
    expect(pl.detail).toBe(false);
    expect(pl.pins.length + pl.hitch.length + pl.leads.length + pl.tails.length).toBe(0);
    expect(pl.rails.length).toBe(2);
  });
});

describe('the upright (2D)', () => {
  const keys = keysOf('upright');
  const maxL = Math.max(...keys.map((k) => k.lengthM));
  for (const s of STAGES)
    it(`${s.name}: the hammers in one level row, the tops stepping up to the bass; the plate`, () => {
      const pts = ptsOf(keys, s.x0, s.pitch);
      // (a phone fits the longest string in view, never closer than 45 % of the longest)
      const vis = Math.max(0, ...pts.filter((p) => p.x > -p.w && p.x < s.W + p.w).map((p) => p.L));
      const lay = upLayout(s.W, s.H, pts, 1, Math.max(vis, 0.45 * maxL));
      const st = lay.strings;
      for (const q of st) {
        expect(q.hy).toBe(st[0].hy);
        // the strike point and the damper are on the string, the damper under the hammers
        expect(off([q.x0, q.y0], [q.x1, q.y1], [q.hx, q.hy])).toBeLessThan(0.01);
        expect(off([q.x0, q.y0], [q.x1, q.y1], [q.dx, q.dy])).toBeLessThan(0.01);
        expect(q.dy).toBeGreaterThan(q.hy);
        expect(q.y0).toBeLessThanOrEqual(q.hy);
      }
      // among the plain strings the tops never step down towards the bass; the bass's are the highest
      const plain = st.filter((q) => !q.p.wound);
      for (let k = 1; k < plain.length; k++) expect(plain[k].y0).toBeGreaterThanOrEqual(plain[k - 1].y0 - 1e-6);
      expect(st[0].y0).toBeLessThan(st[87].y0 - 2 * s.pitch);
      const pl = upPlate(lay);
      const r = lay.in;
      checkEnds(pl, st.map((q) => ({ a: [q.x0, q.y0], b: [q.x1, q.y1], off: q.off })), (x, y) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1, s.W);
      const first = plain[0];
      checkFrame(pl, { a: [first.x0, first.y0], b: [first.x1, first.y1] }, s.pitch);
      expect(pl.toward).toBe(-1);
      expect(upPlate(lay)).toBe(pl);
    });
  it('a small piano: the frame, no pins or wires', () => {
    const pts = ptsOf(keys, SMALL.x0, SMALL.pitch);
    const pl = upPlate(upLayout(SMALL.W, SMALL.H, pts, 1, maxL));
    expect(pl.detail).toBe(false);
    expect(pl.pins.length + pl.hitch.length).toBe(0);
    expect(pl.rails.length).toBe(2);
  });
});
