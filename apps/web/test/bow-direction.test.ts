// Which way the bow goes is marked only in the vector style (a chevron beside the contact); the
// drawn 2D style shows the bow itself and the contact's glow, no mark. Both drawings through a
// context that records the bow's lines: the chevron is two strokes of √(4.5² + 4²) px meeting at a point.
import { describe, expect, it } from 'vitest';
import { bowedGeometry, type VisualFrame } from '@piano-model/engine';
import { AutoScale, ModeField, drawBowed } from '../src/ui/stage-draw.ts';
import { drawBowedV } from '../src/ui/vector/bowed.ts';
import { Contours } from '../src/ui/vector/kit.ts';
import { installCanvas, recorder, type Seg } from './recording-ctx.ts';

const ARM = Math.hypot(4.5, 4);
const len = (s: Seg) => Math.hypot(s[2] - s[0], s[3] - s[1]);
/** the chevrons among a bow's lines: two arms of the chevron's length, end to start, mirrored about its axis */
function chevrons(segs: Seg[]): { apex: [number, number]; open: [number, number] }[] {
  const out: { apex: [number, number]; open: [number, number] }[] = [];
  for (let i = 0; i + 1 < segs.length; i++) {
    const a = segs[i];
    const b = segs[i + 1];
    if (Math.abs(len(a) - ARM) > 0.02 || Math.abs(len(b) - ARM) > 0.02) continue;
    if (Math.hypot(a[2] - b[0], a[3] - b[1]) > 1e-6) continue;
    // 9 px across its open end
    if (Math.abs(Math.hypot(b[2] - a[0], b[3] - a[1]) - 9) > 0.02) continue;
    out.push({ apex: [a[2], a[3]], open: [(a[0] + b[2]) / 2, (a[1] + b[3]) / 2] });
  }
  return out;
}
/** a frame with the bow drawn across the second string at 20 cm/s */
const frame = (dir: number, changing = false) =>
  ({
    bow: { pos: 0.5, speed: 0.2 * dir, dir, changing },
    strings: [0, 1, 2, 3].map((i) => ({ open: 55 + 7 * i, stop: 55 + 7 * i, level: i === 1 ? 1e-4 : 0, bowing: i === 1 })),
    excite: { meta: 'D string · down-bow 20 cm/s · 0.50 N · β 0.093 · 50 % from the frog' },
  }) as unknown as VisualFrame;

/** a recording context that also hands out pixels (the drawn style grains its wood on scratch canvases) */
const withPixels = (ctx: CanvasRenderingContext2D): CanvasRenderingContext2D => {
  const image = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, Math.ceil(w) * Math.ceil(h)) * 4) });
  return new Proxy(ctx, { get: (o, k) => (k === 'createImageData' ? image : k === 'getImageData' ? (_x: number, _y: number, w: number, h: number) => image(w, h) : (o as unknown as Record<string | symbol, unknown>)[k]), set: () => true });
};

describe('the bow’s direction mark', () => {
  (globalThis as unknown as Record<string, unknown>).document = { createElement: () => ({ width: 0, height: 0, getContext: () => withPixels(recorder().ctx) }) };
  installCanvas();
  const BOXES: [number, number, number][] = [[1440, 532, 42], [390, 366, 84]];
  for (const id of ['violin', 'viola', 'cello', 'bass'] as const)
    for (const [W, H, top] of BOXES) {
      const g = { id, ...bowedGeometry(id) };
      const classic = (fr: VisualFrame) => {
        const st = { strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) };
        const field = new ModeField();
        // (twice: the bow is set down on the first frame, drawn on the string on the next)
        drawBowed(withPixels(recorder().ctx), W, H, g, fr, st, field, 1000, true, undefined, top)!();
        const second = recorder();
        drawBowed(withPixels(second.ctx), W, H, g, fr, st, field, 1016, true, undefined, top)!();
        return second.bows().flat();
      };
      const vector = (fr: VisualFrame) => {
        const st = { strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) };
        const field = new Contours(48, 28, 1.8, 0.6);
        drawBowedV(recorder().ctx, W, H, g, fr, st, field, 1000, true, undefined, top)!();
        const second = recorder();
        drawBowedV(second.ctx, W, H, g, fr, st, field, 1016, true, undefined, top)!();
        return second.bows().flat();
      };
      it(`${id} in ${W}×${H}: the drawn style has no chevron, down-bow or up-bow; it still draws its bow`, () => {
        for (const dir of [1, -1]) {
          const segs = classic(frame(dir));
          expect(segs.length, 'the bow is drawn').toBeGreaterThan(20);
          expect(chevrons(segs)).toHaveLength(0);
        }
      });
      it(`${id} in ${W}×${H}: the vector style keeps one, on the side the bow goes to, and none while the bow turns`, () => {
        const down = chevrons(vector(frame(1)));
        const up = chevrons(vector(frame(-1)));
        expect(down).toHaveLength(1);
        expect(up).toHaveLength(1);
        // it points the other way for the other stroke: apex beyond its open end, on opposite sides
        const way = (c: (typeof down)[number]) => [c.apex[0] - c.open[0], c.apex[1] - c.open[1]];
        const [dx, dy] = way(down[0]);
        const [ux, uy] = way(up[0]);
        expect(dx * ux + dy * uy).toBeCloseTo(-16, 3);
        expect(Math.hypot(down[0].apex[0] - up[0].apex[0], down[0].apex[1] - up[0].apex[1])).toBeGreaterThan(20);
        expect(chevrons(vector(frame(1, true)))).toHaveLength(0);
      });
    }
});
