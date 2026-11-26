// The 2D stage and vector lines in each theme: what a look draws that is not one of its inks (the
// spectrum's scale, a glockenspiel bar's stamp, an orchestra's piano's own keys, how the vector lines and
// their lettering are laid), the facts each alternate pinned about its own palette, and the pictures kept
// from frame to frame being remade when the theme changes. Night Bench's are main's, to the string.
import { afterEach, describe, expect, it } from 'vitest';
import { bowedGeometry, type VisualFrame } from '@piano-model/engine';
import { DEFAULT_THEME, THEMES, setTheme, theme, type ThemeId } from '../src/themes/index.ts';
import { isKeyboard, type Voice } from '../src/orchestra/assign.ts';
import { drawOwnKeys, ensembleCells, ownKeys } from '../src/ui/ensemble-draw.ts';
import { drawGlock, newGlockState } from '../src/ui/glock-draw.ts';
import { Layer } from '../src/ui/grand-plan.ts';
import { AutoScale, BRASS_BREATH, INK, ModeField, breathStream, drawBowed, drawSpectrum, spectrumBox } from '../src/ui/stage-draw.ts';
import { drawBowedV } from '../src/ui/vector/bowed.ts';
import { Contours, SLOTS, SPECTRUM_INK_V, V, beam, breathFlow, dot, heat, label, lipLine, slotColor } from '../src/ui/vector/kit.ts';
import { linePen } from '../src/ui/vector/pen.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

// (a document for the scratch canvases the drawings make, with what a change of theme marks on a page)
(globalThis as unknown as Record<string, unknown>).document = { createElement: () => ({ width: 0, height: 0, getContext: () => recorder().ctx }), documentElement: { dataset: {} }, querySelector: () => null };
installCanvas();
afterEach(() => setTheme(DEFAULT_THEME, false));

const ALTS: ThemeId[] = ['evening-hall', 'day-studio', 'night-gallery'];
const ALL: ThemeId[] = ['night-bench', ...ALTS];
const tri = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
const luma = (hex: string) => [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0);

interface Call {
  op: string;
  args: unknown[];
  fill: string;
  stroke: string;
  font: string;
  blend: string;
  dash: number[];
}
/** a context that keeps what it is told: every call, with the inks, the type and the blend set at the time */
function spy() {
  const props: Record<string, unknown> = { fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  const stack: Record<string, unknown>[] = [];
  let dash: number[] = [];
  const calls: Call[] = [];
  const noop = () => undefined;
  const own: Record<string, unknown> = {
    save: () => stack.push({ ...props }),
    restore: () => Object.assign(props, stack.pop() ?? {}),
    setLineDash: (d: number[]) => (dash = [...d]),
    measureText: (t: string) => ({ width: 6 * t.length }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  const ctx = new Proxy(own, {
    get: (o, k: string) => {
      if (k in o) return o[k];
      if (k in props) return props[k];
      return (...args: unknown[]) => void calls.push({ op: k, args, fill: String(props.fillStyle), stroke: String(props.strokeStyle), font: String(props.font), blend: String(props.globalCompositeOperation), dash });
    },
    set: (_o, k: string, v) => {
      props[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, of: (op: string) => calls.filter((c) => c.op === op) };
}

// ---------------------------------------------------------------- the vector palette, by role
describe('the vector palette in each theme: the roles hold, whatever the hues', () => {
  for (const id of ALL)
    it(`${id}: four slots of their own, a fifth knob the structure's line; the sound's ramp passes through the sound`, () => {
      setTheme(id, false);
      expect(new Set([0, 1, 2, 3].map(slotColor)).size).toBe(4);
      expect([0, 1, 2, 3].map(slotColor)).toEqual([...SLOTS]);
      expect(slotColor(4)).toBe(V.line);
      for (const s of SLOTS) expect([V.line, V.sound]).not.toContain(s);
      expect(heat(0.6)).toBe(V.sound);
      // on a tube the louder is the brighter; on paper the louder is the more ink
      const ramp = [0, 0.2, 0.4, 0.6, 0.8, 1].map(heat).map(luma);
      for (let i = 1; i < ramp.length; i++) {
        if (theme().vector.blend === 'multiply') expect(ramp[i], `${id} step ${i}`).toBeLessThan(ramp[i - 1]);
        else expect(ramp[i], `${id} step ${i}`).toBeGreaterThan(ramp[i - 1]);
      }
    });

  it('the alternates’ own: Evening Hall ivory and gold with verdigris, rose and gilt; Day Studio graphite and the one blue, deepening; Night Gallery argon and tungsten', () => {
    setTheme('evening-hall', false);
    expect([tri(V.line), tri(V.sound)]).toEqual(['232,222,200', '255,190,85']);
    expect([V.slot1, V.slot2, V.slot3, V.ground]).toEqual(['#62cfa9', '#f08a94', '#d9b25f', '#0b0405']);
    setTheme('day-studio', false);
    expect([V.line, V.sound, V.slot4, V.ground]).toEqual(['#2b3644', '#1d48d1', '#0e141b', '#f3f5f8']);
    expect([theme().vector.blend, theme().vector.glow, theme().vector.labelBlend]).toEqual(['multiply', false, 'source-over']);
    setTheme('night-gallery', false);
    expect([V.line, V.sound, V.ground]).toEqual(['#86bdea', '#ffc56e', '#08090b']);
    expect([theme().vector.blend, theme().vector.glow, theme().vector.labelBlend]).toEqual(['lighter', true, 'lighter']);
  });

  it('lines are laid as the look lays them (added on a tube, multiplied on film); its lettering as the lines, or plainly on the sheet', () => {
    for (const id of ALL) {
      setTheme(id, false);
      const s = spy();
      s.ctx.beginPath();
      beam(s.ctx, null, V.line, 1);
      dot(s.ctx, 0, 0, 1, V.sound);
      label(s.ctx, 'A4', 0, 0);
      const day = id === 'day-studio';
      expect(s.of('stroke')[0].blend, `${id}: a beam`).toBe(day ? 'multiply' : 'lighter');
      expect(s.of('fill')[0].blend, `${id}: a dot`).toBe(day ? 'multiply' : 'lighter');
      expect(s.of('fillText')[0].blend, `${id}: a label`).toBe(day ? 'source-over' : 'lighter');
      expect(s.of('fillText')[0].font, `${id}: Hershey, then the look's own mono`).toBe(`500 11px "Hershey", ${theme().vector.mono}`);
    }
    setTheme('night-bench', false);
    expect(theme().vector.mono).toBe('"IBM Plex Mono", ui-monospace, monospace');
  });
});

// ---------------------------------------------------------------- the line pen
describe('the line pen in each theme (the action close-up drawn in lines)', () => {
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
  const GROUNDS: Record<ThemeId, string> = { 'night-bench': '#000000', 'evening-hall': '#0b0405', 'day-studio': '#f3f5f8', 'night-gallery': '#08090b' };
  for (const id of ALL)
    it(`${id}: a solid fill is a mask in the display's own ground with its outline traced; named colours take their role`, () => {
      setTheme(id, false);
      expect(V.ground).toBe(GROUNDS[id]);
      const { c, log } = fake();
      const pen = linePen(c as unknown as CanvasRenderingContext2D, { [INK.sound]: V.sound });
      pen.beginPath();
      pen.rect(0, 0, 1, 1);
      pen.fillStyle = 'rgba(226,201,154,0.950)';
      pen.fill();
      pen.strokeStyle = 'rgba(0,0,0,0.550)';
      pen.lineWidth = 0.8;
      pen.stroke();
      pen.beginPath();
      pen.strokeStyle = `rgba(${INK.sound},0.900)`;
      pen.lineWidth = 1.3;
      pen.stroke();
      expect(log).toEqual(['begin', 'rect', `fill ${GROUNDS[id]}`, `stroke rgba(${tri(V.line)},0.870) 1`, 'begin', `stroke rgba(${tri(V.sound)},0.950) 1.3`]);
    });
});

// ---------------------------------------------------------------- the breath, in a look's slots
describe('the breath and the lips in each theme: the first slot’s dashed streams, the second slot’s lips', () => {
  for (const id of ALL)
    it(id, () => {
      setTheme(id, false);
      const s = spy();
      const at = (a: number, w: number): [number, number] => [500 - a * 1000, 300 + w * 1000];
      breathFlow(s.ctx, at, 0.02, [0.0034, 0.0018, 0.0006], 0.0016, false, 1, 0);
      lipLine(s.ctx, at, 0.002, 0.0125, 1.4, 1, true);
      const strokes = s.of('stroke');
      const flow = strokes.filter((c) => c.stroke === V.slot1);
      expect(flow.length).toBe(1);
      expect(flow[0].dash.length).toBe(2);
      expect(strokes.filter((c) => c.stroke === V.slot2).length).toBeGreaterThan(0);
      // (nothing of it in the structure's line or the sound's colour)
      expect(strokes.filter((c) => c.stroke === V.line || c.stroke === V.sound).length).toBe(0);
    });
  it('Evening Hall’s are verdigris and rose', () => {
    setTheme('evening-hall', false);
    expect([V.slot1, V.slot2]).toEqual(['#62cfa9', '#f08a94']);
  });
});

describe('the drawn style’s breath in each theme: dashed streams in the look’s cool ink (steel, verdigris, slate)', () => {
  const COOL: Record<ThemeId, string> = { 'night-bench': '150,182,210', 'evening-hall': '138,196,178', 'day-studio': '92,112,138', 'night-gallery': '139,168,198' };
  it('each look has its own', () => {
    expect(THEMES.map((t) => t.ink.cool)).toEqual(ALL.map((id) => COOL[id]));
  });
  // (Day Studio draws its instruments with its own drawers, themes/day-studio/draw: its breath is theirs)
  for (const id of ALL.filter((t) => t !== 'day-studio'))
    it(id, () => {
      setTheme(id, false);
      expect(INK.cool).toBe(COOL[id]);
      const s = spy();
      breathStream(s.ctx, (a, w) => [500 - a * 1000, 300 + w * 1000], 1000, BRASS_BREATH, 0.8, 0);
      const strokes = s.of('stroke');
      expect(strokes.length).toBeGreaterThan(0);
      for (const c of strokes) {
        expect(c.stroke.startsWith(`rgba(${COOL[id]},`), `${id}: ${c.stroke}`).toBe(true);
        expect(c.dash.length).toBeGreaterThan(0);
      }
    });
});

// ---------------------------------------------------------------- the spectrum
describe('the spectrum’s scale and trace in each theme', () => {
  const buf = new Float32Array(2048);
  const analyser = { frequencyBinCount: 1024, fftSize: 2048, context: { sampleRate: 48000 }, getFloatFrequencyData: (a: Float32Array) => a.fill(-60) } as unknown as AnalyserNode;
  const X = (f: number) => (400 * Math.log(f / 30)) / Math.log(12000 / 30);
  /** drawn in a 400 px band: its box at y 6, 30 px tall */
  const draw = (an: AnalyserNode | null, vector = false) => {
    const s = spy();
    drawSpectrum(s.ctx, 0, 6, 400, 30, an, buf, null, 'piano', vector ? (SPECTRUM_INK_V as Parameters<typeof drawSpectrum>[9]) : undefined);
    return s;
  };

  it('Night Bench: three faint figures in the trace’s own box, nothing before the first sound; the trace over them', () => {
    const idle = draw(null);
    expect(idle.of('fillText').map((c) => [c.args[0], c.args[2], c.fill, c.font])).toEqual(['100', '1k', '10k'].map((t) => [t, 34, 'rgba(236,226,206,0.300)', '10px "IBM Plex Mono", monospace']));
    expect(idle.of('stroke')).toHaveLength(0);
    expect(idle.of('fillRect')).toHaveLength(0);
    const on = draw(analyser);
    expect(on.of('stroke').map((c) => c.stroke)).toEqual(['rgba(236,226,206,0.550)']);
    expect(on.calls.findIndex((c) => c.op === 'fillText')).toBeLessThan(on.calls.findIndex((c) => c.op === 'stroke'));
    // in vector lines: the sound's colour for the trace, the structure's for the figures
    const v = draw(analyser, true);
    expect(v.of('stroke').map((c) => c.stroke)).toEqual([`rgba(${tri(V.sound)},0.900)`]);
    expect(v.of('fillText')[0].fill).toBe(`rgba(${tri(V.line)},0.300)`);
    expect(v.of('fillText')[0].font).toBe('500 10px "Hershey", "IBM Plex Mono", monospace');
    expect(spectrumBox(40)).toEqual([6, 32]);
    expect(spectrumBox(60)).toEqual([6, 52]);
  });

  it('Evening Hall: the figures in the muted ink, in Cabin; with no sound yet, their axis under them', () => {
    setTheme('evening-hall', false);
    const idle = draw(null);
    expect(idle.of('fillText').map((c) => [c.args[2], c.fill, c.font])).toEqual([1, 2, 3].map(() => [34, 'rgba(241,231,211,0.640)', '500 11px "Cabin Variable", "Gill Sans", sans-serif']));
    expect(idle.of('stroke').map((c) => c.stroke)).toEqual(['rgba(241,231,211,0.280)']);
    expect(idle.of('moveTo')[0].args).toEqual([0, 35.5]);
    expect(idle.of('lineTo')[0].args).toEqual([400, 35.5]);
    // (sounding: the trace alone is stroked, as on the bench)
    expect(draw(analyser).of('stroke').map((c) => c.stroke)).toEqual(['rgba(241,231,211,0.550)']);
    expect(draw(null, true).of('stroke').map((c) => c.stroke)).toEqual([`rgba(${tri(V.sound)},0.280)`]);
    expect(spectrumBox(40)).toEqual([6, 32]);
  });

  it('Day Studio: figures and trace firm on the plaster, and before any sound the line the trace will rise from', () => {
    setTheme('day-studio', false);
    const idle = draw(null);
    expect(idle.of('fillText')[0].fill).toBe('rgba(28,34,42,0.620)');
    expect(idle.of('fillText')[0].font).toBe('500 11.5px "Ysabeau Office Variable", "Avenir Next", "Segoe UI", system-ui, sans-serif');
    expect(idle.of('stroke').map((c) => c.stroke)).toEqual(['rgba(28,34,42,0.280)']);
    expect(draw(analyser).of('stroke').map((c) => c.stroke)).toEqual(['rgba(28,34,42,0.800)']);
    const v = draw(analyser, true);
    expect(v.of('fillText')[0].fill).toBe(`rgba(${tri(V.line)},0.700)`);
    expect(v.of('stroke').map((c) => c.stroke)).toEqual([`rgba(${tri(V.sound)},0.900)`]);
  });

  it('Night Gallery: the scale hangs under the trace’s floor, each figure from a tick at its frequency, laid after the trace; with no sound the floor is a hairline', () => {
    setTheme('night-gallery', false);
    const foot = theme().draw.spectrum.foot;
    expect(foot).toBe(13);
    const idle = draw(null);
    // (the figures' baseline 2 px over the foot's end; the ticks 4 px down from the floor)
    expect(idle.of('fillText').map((c) => [c.args[2], c.fill, c.font])).toEqual([1, 2, 3].map(() => [36 + foot - 2, 'rgba(230,232,234,0.600)', '11px "Libre Franklin Variable", "Helvetica Neue", Arial, sans-serif']));
    expect(idle.of('fillRect').map((c) => c.args)).toEqual([100, 1000, 10000].map((f) => [Math.round(X(f)) - 0.5, 36, 1, 4]));
    expect(idle.of('stroke').map((c) => c.stroke)).toEqual(['rgba(230,232,234,0.300)']);
    expect(draw(null, true).of('stroke').map((c) => c.stroke)).toEqual([`rgba(${tri(V.sound)},0.500)`]);
    const on = draw(analyser);
    expect(on.of('stroke').map((c) => c.stroke)).toEqual(['rgba(230,232,234,0.550)']);
    expect(on.calls.findIndex((c) => c.op === 'fillText')).toBeGreaterThan(on.calls.findIndex((c) => c.op === 'stroke'));
    // the band leaves the foot under the trace's box: a tall band keeps 6 px for the partials' marks, a
    // low one (a phone's) 4
    expect(spectrumBox(60)).toEqual([6, 60 - 6 - 13]);
    expect(spectrumBox(40)).toEqual([4, 40 - 4 - 13]);
    // the scope shows nothing before a key is struck; the others keep its axis
    expect(THEMES.map((t) => t.draw.scopeAxisAtRest)).toEqual([true, true, true, false]);
  });
});

// ---------------------------------------------------------------- a glockenspiel bar's stamp
describe('the note stamped on a glockenspiel’s bar is cut in the look’s own face', () => {
  const FACES: [ThemeId, RegExp][] = [
    ['night-bench', /^500 \d+px "IBM Plex Mono", monospace$/],
    ['evening-hall', /^600 \d+px "Cabin Variable", "Gill Sans", sans-serif$/],
    ['night-gallery', /^500 \d+px "Libre Franklin Variable", "Helvetica Neue", Arial, sans-serif$/],
  ];
  for (const [id, face] of FACES)
    it(id, () => {
      setTheme(id, false);
      const s = spy();
      drawGlock(s.ctx, 1440, 551, null, newGlockState(), 39);
      const stamps = s.of('fillText');
      expect(stamps.length).toBeGreaterThan(20);
      for (const c of stamps) expect(c.font).toMatch(face);
    });
  it('Day Studio’s is its page’s face, semibold', () => {
    expect(THEMES.find((t) => t.id === 'day-studio')!.draw.stamp).toEqual({ weight: 600, family: '"Ysabeau Office Variable", "Avenir Next", "Segoe UI", system-ui, sans-serif' });
  });
});

// ---------------------------------------------------------------- an orchestra's piano's own keys
describe('an orchestra’s piano’s own keys in each theme', () => {
  const lineup: Voice[] = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'violin', 'violin', 'viola', 'cello', 'bass', 'grand'];
  const cell = ensembleCells(lineup, 1440, 505)[lineup.findIndex(isKeyboard)];
  /** what is laid on C4 (white) and C♯4 (black): its fills, then its edge */
  const keysOf = (vector: boolean, down: number[]) => {
    const fills: { style: string; x: number; w: number }[] = [];
    const strokes: { style: string; x: number }[] = [];
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      save() {},
      restore() {},
      fillRect(x: number, _y: number, w: number) {
        fills.push({ style: String(this.fillStyle), x, w });
      },
      strokeRect(x: number) {
        strokes.push({ style: String(this.strokeStyle), x });
      },
    };
    drawOwnKeys(ctx as unknown as CanvasRenderingContext2D, cell, new Set(down), vector);
    const keys = ownKeys(cell);
    const of = (m: number) => keys.find((k) => k.midi === m)!;
    const at = (m: number) => [...fills.filter((f) => Math.abs(f.x - of(m).x) < 1e-6 && Math.abs(f.w - of(m).w) < 1e-6).map((f) => f.style), ...strokes.filter((f) => Math.abs(f.x - 0.5 - of(m).x) < 1e-6).map((f) => f.style)];
    return { white: at(60), black: at(61), field: fills[0].style, all: fills.map((f) => f.style) };
  };
  it('the piano stands beside the orchestra with keys of its own', () => {
    expect(cell.keys).toBe(true);
  });

  const DRAWN: Record<ThemeId, { field: string; whiteDown: string; black: string; blackDown: string; parting: string }> = {
    'night-bench': { field: '#efe7d6', whiteDown: '#f2c3ad', black: '#15120f', blackDown: '#6a2a1a', parting: 'rgba(120, 106, 84, 0.75)' },
    // (the hall's piano keeps the bench's ivory and ebony)
    'evening-hall': { field: '#efe7d6', whiteDown: '#f2c3ad', black: '#15120f', blackDown: '#6a2a1a', parting: 'rgba(120, 106, 84, 0.75)' },
    'day-studio': { field: '#f8f7f1', whiteDown: '#c9d8fb', black: '#24272a', blackDown: '#2553e0', parting: 'rgba(126, 124, 116, 0.8)' },
    // (half-light, a held key lit and never coloured)
    'night-gallery': { field: '#a9abae', whiteDown: '#f5f7f9', black: '#0b0d10', blackDown: '#7c8591', parting: 'rgba(32, 34, 37, 0.8)' },
  };
  for (const id of ALL)
    it(`${id}, drawn: the whites' field and their partings, a held white and a held black in the look's own`, () => {
      setTheme(id, false);
      const want = DRAWN[id];
      const rest = keysOf(false, []);
      const held = keysOf(false, [60, 61]);
      expect(rest.field).toBe(want.field);
      expect(rest.all).toContain(want.parting);
      expect(rest.black).toEqual([want.black]);
      expect(held.black).toEqual([want.blackDown]);
      expect(held.white).toContain(want.whiteDown);
      expect(rest.white).not.toContain(want.whiteDown);
    });

  const LINES: Record<ThemeId, { black: string; blackDown: string; whiteDown: string; blackEdge: string; whiteEdge: string }> = {
    'night-bench': { black: 'rgba(79, 182, 242, 0.22)', blackDown: 'rgba(255, 179, 64, 0.55)', whiteDown: 'rgba(255, 179, 64, 0.3)', blackEdge: '#3487c4', whiteEdge: '#1f5f8c' },
    'evening-hall': { black: 'rgba(195, 208, 220, 0.2)', blackDown: 'rgba(255, 190, 85, 0.55)', whiteDown: 'rgba(255, 190, 85, 0.3)', blackEdge: '#b3a68c', whiteEdge: '#7d7260' },
    // (on the sheet the edges are a weight heavier: ink for a black key, the middle grey for a white)
    'day-studio': { black: 'rgba(43, 54, 68, 0.3)', blackDown: 'rgba(29, 72, 209, 0.6)', whiteDown: 'rgba(29, 72, 209, 0.2)', blackEdge: '#2b3644', whiteEdge: '#64707d' },
    'night-gallery': { black: 'rgba(134, 189, 234, 0.22)', blackDown: 'rgba(255, 197, 110, 0.55)', whiteDown: 'rgba(255, 197, 110, 0.3)', blackEdge: '#5a8fbf', whiteEdge: '#3a6289' },
  };
  for (const id of ALL)
    it(`${id}, in lines: masked with the display's ground, a black key washed, a held key in the sound's colour`, () => {
      setTheme(id, false);
      const want = LINES[id];
      const rest = keysOf(true, []);
      const held = keysOf(true, [60, 61]);
      expect(rest.field).toBe(V.ground);
      expect(rest.black).toEqual([V.ground, want.black, want.blackEdge]);
      expect(held.black).toEqual([V.ground, want.blackDown, V.sound]);
      expect(rest.white).toEqual([want.whiteEdge]);
      expect(held.white).toEqual([want.whiteDown, V.sound]);
      // (a wash is the palette's own colour: the sound's for a held key)
      expect(want.blackDown.replace(/ /g, '')).toContain(`rgba(${tri(V.sound)},`);
    });
});

// ---------------------------------------------------------------- pictures kept from frame to frame
describe('a picture kept from one frame to the next is a theme’s: a change of theme repaints it', () => {
  it('a Layer repaints when its key changes, or the theme; never otherwise', () => {
    const layer = new Layer();
    let n = 0;
    const paint = (key = 'k') => layer.paint(100, 50, 1, key, () => void n++);
    paint();
    paint();
    expect(n).toBe(1);
    setTheme('evening-hall', false);
    paint();
    paint();
    expect(n).toBe(2);
    paint('other');
    expect(n).toBe(3);
    setTheme('night-bench', false);
    paint('other');
    expect(n).toBe(4);
  });

  it('the violin’s painted layers are made again in the new theme’s linework, once', () => {
    // (each layer is a canvas of its own: count them as they are asked for)
    const g = globalThis as unknown as { document: { createElement: (t: string) => unknown } };
    const doc = g.document;
    let made = 0;
    const image = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, Math.ceil(w) * Math.ceil(h)) * 4) });
    const pixels = (ctx: CanvasRenderingContext2D): CanvasRenderingContext2D =>
      new Proxy(ctx, { get: (o, k) => (k === 'createImageData' ? image : (o as unknown as Record<string | symbol, unknown>)[k]), set: () => true });
    g.document = {
      ...doc,
      createElement: () => {
        made++;
        return { width: 0, height: 0, getContext: () => pixels(recorder().ctx) };
      },
    };
    try {
      const geom = { id: 'violin' as const, ...bowedGeometry('violin') };
      const st = { strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) };
      const field = new ModeField(24, 14, 1.8, 0.6);
      const draw = () => drawBowed(pixels(recorder().ctx), 1437, 531, geom, null, st, field, 1000);
      made = 0;
      draw();
      const first = made;
      expect(first).toBeGreaterThan(1);
      draw();
      expect(made, 'the same theme: the layers are kept').toBe(first);
      setTheme('night-gallery', false);
      draw();
      const second = made - first;
      expect(second, 'another theme: painted again').toBeGreaterThan(1);
      draw();
      expect(made, 'and kept').toBe(first + second);
    } finally {
      g.document = doc;
    }
  });
});

// ---------------------------------------------------------------- the bowed string's travelling corner
describe('the corner travelling along a bowed string is the brightest point drawn; on film, the deepest ink', () => {
  /** a frame with the A string bowed, its Helmholtz corner a third of the way along */
  const frame = () => {
    const n = 48;
    const shape = Float32Array.from({ length: n }, (_, i) => (i < 16 ? i / 16 : (n - 1 - i) / (n - 1 - 16)) * 1e-4);
    return {
      bow: { pos: 0.5, speed: 0.2, dir: 1, changing: false },
      strings: [0, 1, 2, 3].map((i) => ({ open: 55 + 7 * i, stop: 55 + 7 * i, level: i === 2 ? 1e-4 : 0, bowing: i === 2 })),
      focus: { midi: 69, lengthM: 0.325, f1: 440, B: 0, shapes: [shape] },
    } as unknown as VisualFrame;
  };
  for (const id of ALL)
    it(id, () => {
      setTheme(id, false);
      const geom = { id: 'violin' as const, ...bowedGeometry('violin') };
      const st = { strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) };
      const s = spy();
      for (let k = 0; k < 3; k++) drawBowedV(s.ctx, 1437, 531, geom, frame(), st, new Contours(48, 28, 1.8, 0.6), 1000 + 16 * k);
      const want = id === 'day-studio' ? V.slot4 : '#fff8ec';
      expect(theme().vector.corner).toBe(want);
      expect(s.of('fill').some((c) => c.fill === want), `${id}: a dot in ${want}`).toBe(true);
    });
});
