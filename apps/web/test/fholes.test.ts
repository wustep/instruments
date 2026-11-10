// The f-holes are constructed (src/ui/gl/fholes.ts), not traced from a photograph: each has two round
// eyes, the lower the larger and farther out; one smooth S between them, with no wobble; a nick in each
// edge at the middle; the wings' tips and nothing else sharp; and never crosses itself. The trace they
// replace (still in outlines.ts) fails every one of these, which is what was on the stage: lumpy hooks.
import { describe, expect, it } from 'vitest';
import { BOWED } from '../../../packages/engine/src/core/bowed.ts';
import { fholeOf } from '../src/ui/gl/fholes.ts';
import { CELLO, VIOLIN } from '../src/ui/gl/outlines.ts';
import { BASS } from '../src/ui/gl/bass-outline.ts';
import { BOWED_PLAN, bowedShapes } from '../src/ui/stage-draw.ts';

type P2 = [number, number];
/** the turn at each corner of a closed polygon (radians, anticlockwise positive) */
function turns(p: P2[]): number[] {
  const n = p.length;
  return p.map((q, i) => {
    const a = p[(i + n - 1) % n];
    const b = p[(i + 1) % n];
    let t = Math.atan2(b[1] - q[1], b[0] - q[0]) - Math.atan2(q[1] - a[1], q[0] - a[0]);
    while (t > Math.PI) t -= 2 * Math.PI;
    while (t < -Math.PI) t += 2 * Math.PI;
    return t;
  });
}
/** the circle through three points */
function circle(a: P2, b: P2, c: P2): { c: P2; r: number } {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
  const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
  return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
}
/** an outline's eyes: the runs of points that lie on one circle for more than two thirds of the way round */
function eyes(p: P2[]): { c: P2; r: number; sweep: number }[] {
  const n = p.length;
  const t = turns(p);
  const out: { c: P2; r: number; sweep: number }[] = [];
  const used = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const k = circle(p[i], p[(i + 4) % n], p[(i + 8) % n]);
    if (!(k.r < 0.05)) continue;
    const on = (j: number) => Math.abs(Math.hypot(p[j][0] - k.c[0], p[j][1] - k.c[1]) - k.r) < k.r * 1e-3;
    let a = i;
    let b = i;
    while (on((a + n - 1) % n) && (a + n - 1) % n !== b) a = (a + n - 1) % n;
    while (on((b + 1) % n) && (b + 1) % n !== a) b = (b + 1) % n;
    let sweep = 0;
    let count = 0;
    for (let j = a; ; j = (j + 1) % n) {
      used[j] = 1;
      count++;
      if (j !== a && j !== b) sweep += Math.abs(t[j]);
      if (j === b) break;
    }
    if (count > 12 && sweep > (240 * Math.PI) / 180) out.push({ ...k, sweep });
  }
  return out.sort((x, y) => x.c[0] - y.c[0]);
}
/** how often an outline's edge changes the way it bends (wobble: a clean S changes a handful of times) */
const wobble = (p: P2[]) => {
  const t = turns(p).filter((x) => Math.abs(x) > 1e-6);
  let c = 0;
  for (let i = 0; i < t.length; i++) if (t[i] * t[(i + 1) % t.length] < 0) c++;
  return c;
};
function crossesItself(p: P2[]): boolean {
  const n = p.length;
  const side = (a: P2, b: P2, c: P2) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]];
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true;
    }
  return false;
}

describe('f-holes', () => {
  // (length and the gap between the two upper eyes, mm: H. Jóhannsson's tables, docs/3d-reference.md)
  // (the double bass's: 245 mm long, its upper eyes 140 mm apart, makers' figures for a 3/4 bass)
  for (const [name, ol, body, lenMm, gapMm] of [['violin', VIOLIN, 0.356, 73, 42], ['cello', CELLO, 0.755, 130, 98], ['double bass', BASS, 1.11, 245, 140]] as const) {
    it(`${name}: two round eyes, a smooth S, two nicks, two wing tips`, () => {
      const p = fholeOf(ol) as P2[];
      expect(crossesItself(p)).toBe(false);
      // the eyes: two circles, each swept more than two thirds of the way round; the upper one
      // (towards the neck) smaller, and nearer the centre line
      const e = eyes(p);
      expect(e.length).toBe(2);
      expect(e[0].r).toBeLessThan(e[1].r * 0.9);
      expect(e[0].c[1]).toBeLessThan(e[1].c[1] - 0.05);
      // (their sizes are a real instrument's: 6–8 mm and 8.5–11 mm across on a violin, about twice on a cello)
      const S = body / 0.356;
      expect((2 * e[0].r * body * 1000) / S ** 0.85).toBeGreaterThan(6);
      expect((2 * e[0].r * body * 1000) / S ** 0.85).toBeLessThan(8.5);
      // no wobble: the edge changes the way it bends a few times (the S, the nicks, the wings), not at every row
      expect(wobble(p)).toBeLessThan(30);
      // sharp corners: the two nicks' points, on the bridge line and on opposite edges, and the two wings' tips
      const t = turns(p);
      const sharp = p.filter((_, i) => Math.abs(t[i]) > (75 * Math.PI) / 180);
      expect(sharp.length).toBe(4);
      let u0 = Infinity;
      let u1 = -Infinity;
      for (const [u] of p) {
        u0 = Math.min(u0, u);
        u1 = Math.max(u1, u);
      }
      // the real instrument's sizes, within 5 %
      expect(Math.abs((u1 - u0) * body * 1000 - lenMm) / lenMm).toBeLessThan(0.05);
      expect(Math.abs(2 * (e[0].c[1] - e[0].r) * body * 1000 - gapMm) / gapMm).toBeLessThan(0.05);
      const nicks = sharp.filter(([u]) => Math.abs(u - (u0 + u1) / 2) < 0.004);
      expect(nicks.length).toBe(2);
      expect(Math.abs(nicks[0][1] - nicks[1][1])).toBeGreaterThan(0.012);
      const tips = sharp.filter((q) => !nicks.includes(q));
      for (const q of tips) expect(e.some((k) => Math.abs(Math.hypot(q[0] - k.c[0], q[1] - k.c[1]) - k.r) < 1e-6)).toBe(true);
      // (the photograph's trace, which this replaces, has neither round eyes nor a clean edge; the
      // bass has no trace)
      if (ol !== BASS) {
        expect(eyes(ol.fhole as P2[]).length).toBe(0);
        expect(wobble(ol.fhole as P2[])).toBeGreaterThan(60);
      }
    });
  }
  it('on the stage: bass and treble holes are mirror images, their nicks on the bridge line', () => {
    for (const id of ['violin', 'viola', 'cello'] as const) {
      const pl = BOWED_PLAN[id];
      const L = BOWED[id].L;
      const sh = bowedShapes(id, pl, L);
      const [bass, treble] = sh.fholes;
      expect(treble.length).toBe(bass.length);
      for (let i = 0; i < bass.length; i++) {
        expect(treble[i][0]).toBe(bass[i][0]);
        expect(treble[i][1]).toBe(-bass[i][1]);
      }
      const t = turns(bass as P2[]);
      const xb = L - pl.neck;
      const near = bass.filter((_, i) => Math.abs(t[i]) > (75 * Math.PI) / 180).filter(([x]) => Math.abs(x - xb) < 0.004 * pl.body);
      expect(near.length).toBe(2);
    }
  });
});
