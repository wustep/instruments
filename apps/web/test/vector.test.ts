// The vector display's kit, without a canvas: the plate's modes traced as lines (marching squares)
// and the colour roles.
import { describe, expect, it } from 'vitest';
import { Contours, SLOTS, V, heat, mix, slotColor } from '../src/ui/vector/kit.ts';
import { linePen } from '../src/ui/vector/pen.ts';

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
