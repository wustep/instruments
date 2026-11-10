// A 2D context for the tests, with no canvas: it keeps its transform and records what is drawn, in
// stage px. The lines drawn with no clip set (an ensemble's bows, drawn after every instrument, or a
// bow handed back to be drawn last), grouped by the bow that drew it; and every Path2D stroked (its
// points), for the outlines drawn inside the cells. `installCanvas` gives the test's global scope the
// Path2D (one that keeps its points) and the document the drawings make their scratch canvases with.

export type Seg = [number, number, number, number];

/** a 2D context that keeps its transform and, for every line drawn with no clip set (the bows, drawn
 *  after every instrument), the segment in stage px, grouped by the bow that drew it */
export function recorder() {
  type M = [number, number, number, number, number, number];
  let m: M = [1, 0, 0, 1, 0, 0];
  let clipped = false;
  const stack: { m: M; clipped: boolean }[] = [];
  const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const at = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const bows: Seg[][] = [];
  // every Path2D stroked (its points in stage px), for the outlines drawn inside the cells
  const outlines: [number, number][][] = [];
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
    stroke: (path?: { pts?: [number, number][] }) => {
      if (path?.pts?.length) outlines.push(path.pts.map(([x, y]) => at(x, y)));
    },
  };
  const ctx = new Proxy(own, { get: (o, k: string) => (k in o ? o[k] : noop), set: () => true }) as unknown as CanvasRenderingContext2D;
  return { ctx, bows: () => bows.filter((b) => b.length), outlines };
}

/** the global Path2D (keeping its points) and document the drawings need */
export function installCanvas(): void {
  // (the vector drawing makes its paths and its plate's mode field ahead; a path keeps its points, so
  // that the outlines stroked can be measured)
  const g = globalThis as unknown as Record<string, unknown>;
  g.Path2D ??= class {
    pts: [number, number][] = [];
    addPath(o: { pts: [number, number][] }) {
      this.pts.push(...o.pts);
    }
    moveTo(x: number, y: number) {
      this.pts.push([x, y]);
    }
    lineTo(x: number, y: number) {
      this.pts.push([x, y]);
    }
    closePath() {}
    arc(x: number, y: number) {
      this.pts.push([x, y]);
    }
    ellipse(x: number, y: number) {
      this.pts.push([x, y]);
    }
    rect(x: number, y: number, w: number, h: number) {
      this.pts.push([x, y], [x + w, y + h]);
    }
    quadraticCurveTo(_a: number, _b: number, x: number, y: number) {
      this.pts.push([x, y]);
    }
    bezierCurveTo(_a: number, _b: number, _c: number, _d: number, x: number, y: number) {
      this.pts.push([x, y]);
    }
  };
  g.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => recorder().ctx }) };
}
