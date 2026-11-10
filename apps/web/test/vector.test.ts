// The vector display's kit, without a canvas: the plate's modes traced as lines (marching squares)
// and the colour roles; and the violin family drawn in its lines, through a context that records them.
import { describe, expect, it } from 'vitest';
import { bowedGeometry, type VisualFrame } from '@piano-model/engine';
import { AutoScale, BOWED_PLAN, bowedLayout, bowedShapes } from '../src/ui/stage-draw.ts';
import { drawBowedV } from '../src/ui/vector/bowed.ts';
import { Contours, SLOTS, V, heat, mix, slotColor } from '../src/ui/vector/kit.ts';
import { linePen } from '../src/ui/vector/pen.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

type Seg = [number, number, number, number];
const trace = (c: Contours, level: number): Seg[] => {
  const out: Seg[] = [];
  c.trace(level, 100, 50, 400, 200, (x0, y0, x1, y1) => out.push([x0, y0, x1, y1]));
  return out;
};
/** settle the field's level on one mode alone */
const sound = (k: number): Contours => {
  const c = new Contours(48, 28, 1.8);
  const amps = new Float32Array(12);
  amps[k] = 1;
  for (let i = 0; i < 40; i++) c.update(amps, 0);
  return c;
};

describe('plate modes as lines', () => {
  it('the lowest mode has no nodal line inside the plate, and one loop round its middle', () => {
    const c = sound(0);
    expect(c.level).toBeGreaterThan(0.9);
    expect(trace(c, 0)).toHaveLength(0);
    const loop = trace(c, 0.5);
    expect(loop.length).toBeGreaterThan(20);
    // closed: every end point is some other segment's end point
    const ends = loop.flatMap(([x0, y0, x1, y1]) => [`${x0.toFixed(2)},${y0.toFixed(2)}`, `${x1.toFixed(2)},${y1.toFixed(2)}`]);
    const count = new Map<string, number>();
    for (const e of ends) count.set(e, (count.get(e) ?? 0) + 1);
    expect([...count.values()].every((n) => n === 2)).toBe(true);
    for (const [x0, y0, x1, y1] of loop) for (const [x, y] of [[x0, y0], [x1, y1]]) {
      expect(x).toBeGreaterThan(100);
      expect(x).toBeLessThan(500);
      expect(y).toBeGreaterThan(50);
      expect(y).toBeLessThan(250);
    }
  });
  it('the next mode has one straight nodal line through the middle, edge to edge', () => {
    const segs = trace(sound(1), 0);
    expect(segs.length).toBeGreaterThan(10);
    const xs = segs.flatMap((s) => [s[0], s[2]]);
    const ys = segs.flatMap((s) => [s[1], s[3]]);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    // along one axis it stays on the middle (within a grid cell); along the other it crosses the plate
    const [flat, across, mid, mean] = spanX < spanY ? [spanX, spanY / 200, 300, xs.reduce((a, b) => a + b) / xs.length] : [spanY, spanX / 400, 150, ys.reduce((a, b) => a + b) / ys.length];
    expect(flat).toBeLessThan(1);
    expect(across).toBeGreaterThan(0.99);
    expect(Math.abs(mean - mid)).toBeLessThan(1);
  });
  it('a silent plate fades and draws nothing', () => {
    const c = sound(1);
    for (let i = 0; i < 60; i++) c.update(null, 0);
    expect(c.level).toBeLessThan(0.01);
  });
});

describe('colour roles', () => {
  it('the first four knobs take the four slots; any further knob is the structure’s blue', () => {
    expect(new Set([0, 1, 2, 3].map(slotColor)).size).toBe(4);
    expect([0, 1, 2, 3].map(slotColor)).toEqual([...SLOTS]);
    expect(slotColor(4)).toBe(V.blue);
    for (const s of SLOTS) expect([V.blue, V.amber]).not.toContain(s);
  });
  it('mix and heat run between their ends', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    const luma = (h: string) => [16, 8, 0].reduce((a, s) => a + ((parseInt(h.slice(1), 16) >> s) & 255), 0);
    const ramp = [0, 0.2, 0.4, 0.6, 0.8, 1].map(heat).map(luma);
    for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
    expect(heat(0.6)).toBe(V.amber);
  });
});

describe('the line pen (the action close-up drawn in lines)', () => {
  /** a context that records what ink reaches it */
  const fake = () => {
    const log: string[] = [];
    const c = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      beginPath: () => log.push('begin'),
      rect: () => log.push('rect'),
      fill() {
        log.push(`fill ${this.fillStyle}`);
      },
      stroke() {
        log.push(`stroke ${this.strokeStyle} ${this.lineWidth}`);
      },
    };
    return { c, log };
  };
  const blue = '79,182,242';
  const amber = '255,179,64';
  it('a solid fill becomes a black mask with its outline traced; the dark edge line after it is dropped', () => {
    const { c, log } = fake();
    const pen = linePen(c as unknown as CanvasRenderingContext2D);
    pen.beginPath();
    pen.rect(0, 0, 1, 1);
    pen.fillStyle = 'rgba(226,201,154,0.950)';
    pen.fill();
    pen.strokeStyle = 'rgba(0,0,0,0.550)';
    pen.lineWidth = 0.8;
    pen.stroke();
    expect(log).toEqual(['begin', 'rect', 'fill #000', `stroke rgba(${blue},0.870) 1`]);
    expect(c.lineWidth).toBe(0.8);
  });
  it('a faint fill is only outlined; a line keeps its width; named colours take their role', () => {
    const { c, log } = fake();
    const pen = linePen(c as unknown as CanvasRenderingContext2D, { '255,94,56': V.amber });
    pen.beginPath();
    pen.fillStyle = 'rgba(125,115,84,0.120)';
    pen.fill();
    pen.beginPath();
    pen.strokeStyle = 'rgba(255,94,56,0.900)';
    pen.lineWidth = 1.3;
    pen.stroke();
    expect(log).toEqual(['begin', `stroke rgba(${blue},0.372) 1`, 'begin', `stroke rgba(${amber},0.950) 1.3`]);
  });
});

// ---- the violin family in lines, alone on the stage: violin, viola, cello and double bass alike
describe('the violin family in lines, alone on the stage', () => {
  installCanvas();
  /** the stage under the top band (W×H) and the file player's px at its top: a laptop's (1440×900), a
   *  phone's held upright (390×844: the box lies) and the Pixel 7's, and a taller box (the instrument
   *  stands) */
  const BOXES: [number, number, number][] = [[1440, 532, 42], [390, 366, 84], [412, 424, 42], [390, 560, 42]];
  const frameAt = (pos: number) => ({ bow: { pos, speed: 0, dir: 1, changing: false } }) as unknown as VisualFrame;
  const bbox = (pts: [number, number][]) => {
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  for (const id of ['violin', 'viola', 'cello', 'bass'] as const)
    for (const [W, H, top] of BOXES)
      it(`${id} in ${W}×${H}: its plate drawn at its layout's scale and whole, its scroll on the stage${id === 'bass' ? '; all of it, to the endpin’s point; its bow clear of the file player, and on a phone at both ends of its travel' : ''}`, () => {
        const g = { id, ...bowedGeometry(id) };
        const p = BOWED_PLAN[id];
        const sh = bowedShapes(id, p, g.L);
        const lay = bowedLayout(g, p, sh, W, H, undefined, top);
        for (const pos of [0, 1]) {
          const st = { strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) };
          const { ctx, bows, outlines } = recorder();
          drawBowedV(ctx, W, H, g, frameAt(pos), st, new Contours(48, 28, 1.8, 0.6), 1000, true, undefined, top)!();
          const boxes = outlines.map(bbox);
          // the plate: the widest outline drawn, its length the body's at the layout's scale
          const across = (b: ReturnType<typeof bbox>) => (lay.vertical ? b.x1 - b.x0 : b.y1 - b.y0);
          const along = (b: ReturnType<typeof bbox>) => (lay.vertical ? b.y1 - b.y0 : b.x1 - b.x0);
          const plate = boxes.reduce((a, b) => (across(b) > across(a) ? b : a));
          expect(along(plate) / (p.body * lay.sc), `${id}: its plate's length`).toBeCloseTo(1, 2);
          expect(across(plate) / (2 * sh.hwMax * lay.sc), `${id}: its plate's width`).toBeCloseTo(1, 1);
          const inside = (b: ReturnType<typeof bbox>, y0 = 0) => b.x0 >= -0.5 && b.x1 <= W + 0.5 && b.y0 >= y0 - 0.5 && b.y1 <= H + 0.5;
          expect(inside(plate), `${id}: its plate on the stage`).toBe(true);
          // the scroll's end (the outlines' farthest point towards the head) on the stage
          const all = bbox(outlines.flat());
          expect(lay.vertical ? all.y0 : all.x0, `${id}: its scroll on the stage`).toBeGreaterThanOrEqual(-0.5);
          if (id !== 'bass') continue;
          // the bass: everything it draws on the stage under the file player, its endpin's point too
          for (const b of boxes) expect(inside(b, top), `the bass: an outline at ${b.x0.toFixed(0)}…${b.x1.toFixed(0)}, ${b.y0.toFixed(0)}…${b.y1.toFixed(0)} on the stage`).toBe(true);
          expect((lay.vertical ? all.y1 - all.y0 : all.x1 - all.x0) / (lay.vertical ? H - top : W), 'the bass: its share of the stage').toBeGreaterThan(0.9);
          // its bow (handed back, drawn with no clip): never over the file player (the top middle of the
          // stage, 120 px wide); on a phone, frog or tip on the string, all of it on the stage
          const segs = bows().flat();
          expect(segs.length).toBeGreaterThan(20);
          for (const [x0, y0, x1, y1] of segs) {
            const overPlayer = Math.max(x0, x1) > W / 2 - 60 && Math.min(x0, x1) < W / 2 + 60 && Math.min(y0, y1) < top;
            expect(overPlayer, 'the bass: its bow over the file player').toBe(false);
          }
          if (W < 500) {
            const b = bbox(segs.flatMap(([a, c, d, e]) => [[a, c], [d, e]] as [number, number][]));
            expect(inside(b, top), `the bass's bow at ${pos}: ${b.x0.toFixed(0)}…${b.x1.toFixed(0)}, ${b.y0.toFixed(0)}…${b.y1.toFixed(0)} on the stage`).toBe(true);
          }
        }
      });
});
