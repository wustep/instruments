// A theme's own 2D drawers (themes/drawers.ts), and Day Studio's (themes/day-studio/draw/): the instruments
// re-drawn for daylight. The shared drawers in ui/ stay the one entry and hand over at their top; Night Bench
// has none of its own and is drawn as ever; while Day Studio's are on their way nothing is drawn in their
// place. And what the day's paint is held to: the same geometry and the same record as the shared drawing,
// nothing that glows, the one blue for what sounds and only that, a dark wood still dark on the pale ground.
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bowedGeometry, glockBars, hornFingering, hornTubeLength, tromboneFingering, tromboneSlideOut, tromboneTubeLength, type KeySummary, type VisualFrame } from '@piano-model/engine';
import { DEFAULT_PARAMS, PRESETS, buildKeySpecs } from '../../../packages/engine/src/core/design.ts';
import { DEFAULT_THEME, THEMES, setTheme, theme } from '../src/themes/index.ts';
import { loadDrawers, ownDrawer, type Drawers } from '../src/themes/drawers.ts';
import { AutoScale, BRASS_BREATH, INK, ModeField, breathStream, drawBowed, drawFlute, drawTrumpet, type FluteState, type TrumpetState } from '../src/ui/stage-draw.ts';
import { drawBassoon, newBassoonState } from '../src/ui/bassoon-draw.ts';
import { WOOD as NIGHT_CLARINET_WOOD, drawClarinet, newClarinetState } from '../src/ui/clarinet-draw.ts';
import { drawOboe, newOboeState } from '../src/ui/oboe-draw.ts';
import { drawHorn, newHornState } from '../src/ui/horn-draw.ts';
import { drawTrombone, newTromboneState } from '../src/ui/trombone-draw.ts';
import { drawTuba, newTubaState } from '../src/ui/tuba-draw.ts';
import { drawTimpani, newTimpaniState } from '../src/ui/timpani-draw.ts';
import { drawHarp, newHarpState } from '../src/ui/harp-draw.ts';
import { drawGlock, newGlockState } from '../src/ui/glock-draw.ts';
import { drawPiano, newPianoState, type PianoGeom } from '../src/ui/piano-draw.ts';
import { drawRoom, newRoomState, roomRect } from '../src/ui/room-draw.ts';
import { installCanvas } from './recording-ctx.ts';

/** what a drawing did, in order: every fill and stroke with its style (a gradient: its stops, joined), the
 *  blend modes it set, the boxes it stroked, the pictures it laid */
interface Seen {
  ops: { kind: 'fill' | 'stroke'; style: string; width: number }[];
  blends: string[];
  rects: number;
  images: number;
}
/** what the scratch canvases were asked since it was last emptied: a still picture kept from frame to frame
 *  (a piano's base, a string's varnished plate, a shadow's silhouette) is painted on one, once, and laid
 *  with drawImage; its paint is the drawing's too */
const kept: Seen = { ops: [], blends: [], rects: 0, images: 0 };
const emptyKept = () => {
  kept.ops.length = 0;
  kept.blends.length = 0;
  kept.rects = 0;
  kept.images = 0;
};
/** a 2D context that draws nothing and remembers what it was asked (it hands out pixels too: the drawn
 *  strings grain their wood on scratch canvases). `into`: where it remembers (its own record, unless a
 *  scratch canvas's, which all share one) */
function spy(into?: Seen): { ctx: CanvasRenderingContext2D; seen: Seen } {
  const seen: Seen = into ?? { ops: [], blends: [], rects: 0, images: 0 };
  const state: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const stack: Record<string, unknown>[] = [];
  const grad = () => {
    const stops: string[] = [];
    return { stops, addColorStop: (_o: number, c: string) => void stops.push(c) };
  };
  const text = (v: unknown): string => (typeof v === 'string' ? v : ((v as { stops?: string[] })?.stops ?? []).join(' '));
  const image = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, Math.ceil(w) * Math.ceil(h)) * 4) });
  const own: Record<string, unknown> = {
    save: () => void stack.push({ ...state }),
    restore: () => void Object.assign(state, stack.pop() ?? {}),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    createLinearGradient: grad,
    createRadialGradient: grad,
    createConicGradient: grad,
    createImageData: image,
    getImageData: (_x: number, _y: number, w: number, h: number) => image(w, h),
    measureText: () => ({ width: 0 }),
    fill: () => void seen.ops.push({ kind: 'fill', style: text(state.fillStyle), width: 0 }),
    stroke: () => void seen.ops.push({ kind: 'stroke', style: text(state.strokeStyle), width: state.lineWidth as number }),
    fillRect: () => void seen.ops.push({ kind: 'fill', style: text(state.fillStyle), width: 0 }),
    strokeRect: () => {
      seen.rects++;
      seen.ops.push({ kind: 'stroke', style: text(state.strokeStyle), width: state.lineWidth as number });
    },
    drawImage: () => void seen.images++,
    canvas: { width: 0, height: 0 },
  };
  const ctx = new Proxy(own, {
    get: (o, k: string) => (k in o ? o[k] : k in state ? state[k] : () => undefined),
    set: (_o, k: string, v) => {
      if (k === 'globalCompositeOperation') seen.blends.push(v as string);
      state[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, seen };
}
// (the scratch canvases the drawings make are spies too; and what a change of theme marks on a page, the
// root's attribute and the browser's bar, has somewhere to go)
(globalThis as unknown as Record<string, unknown>).document = { createElement: () => ({ width: 0, height: 0, getContext: () => spy(kept).ctx }), documentElement: { dataset: {} }, querySelector: () => null };
installCanvas();
// (the upright's case is a rounded box: the tests' Path2D has no such corner, as piano-plate.test.ts)
(globalThis as unknown as { Path2D: { prototype: Record<string, unknown> } }).Path2D.prototype.roundRect ??= () => {};

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const base = { load: 0, voices: 1, sympathetic: 0, maxVoices: 1, sustain: 0, soft: 0, gainReduction: 1, strike: null, modes: new Float32Array(16) };
const lipTrace = (midi: number) => {
  const P = 48000 / et(midi);
  return Float32Array.from({ length: Math.round(4 * P) }, (_, i) => Math.max(0, 1.4 * Math.sin((2 * Math.PI * i) / P) + 0.5));
};
const shapeOf = (partial: number) => Float32Array.from({ length: 160 }, (_, i) => Math.cos((Math.PI * Math.max(1, partial) * i) / 159));
const windFocus = (midi: number, partial: number, lengthM: number) => ({ midi, nStrings: 1, shapes: [shapeOf(partial)], hammerAt: 0.01, prepAt: -1, lengthM, f1: et(midi), B: 0, damper: 0 });
const lips = (midi: number, meta = '') => ({ title: 'Lips', unit: '', rate: 48000, trace: lipTrace(midi), trace2: lipTrace(midi), trace2Label: '', caption: '', meta });
/** each instrument's stage: how it is drawn (through the shared entry), and a frame with a note sounding
 *  where one is made here */
let W = 1440;
let H = 560;
const TOP = 46;
/** A stage no other test has drawn on. The still pictures are kept by the stage's size (and the theme): a
 *  test that means to see them painted (a shadow's silhouette, a varnished plate) draws on a size of its
 *  own, or it would find them made already and see nothing. */
let sizes = 0;
const freshStage = () => {
  sizes++;
  W = 1440 + 2 * sizes;
  H = 560 + 2 * sizes;
};
const pianoGeom = (kind: 'grand' | 'upright'): PianoGeom => {
  const d = PRESETS[kind === 'grand' ? 'grand' : 'upright'];
  const keys: KeySummary[] = buildKeySpecs(d, { ...DEFAULT_PARAMS, ...d.defaults }).map((s) => ({ midi: s.midi, f1: s.f1, B: s.B, nStrings: s.nStrings, lengthM: s.L, hasDamper: s.hasDamper, preparation: null }));
  return { keys, keyX: (midi: number) => ({ x: 28 + ((midi - 21 + 0.5) * (W - 56)) / 88, w: (W - 56) / 88 }), kind, lid: 1 } as unknown as PianoGeom;
};
interface Case {
  name: string;
  state: () => unknown;
  draw: (ctx: CanvasRenderingContext2D, fr: VisualFrame | null, st: unknown) => void;
  sounding?: () => VisualFrame;
}
const wind =
  <S>(draw: (ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: S, top?: number) => void) =>
  (ctx: CanvasRenderingContext2D, fr: VisualFrame | null, st: unknown) =>
    draw(ctx, W, H, fr, st as S, TOP);
const bowed = (id: 'violin' | 'viola' | 'cello' | 'bass'): Case => ({
  name: id,
  state: () => ({ st: { strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) }, field: new ModeField(24, 14, 1.8, 0.6, true) }),
  draw: (ctx, fr, s) => {
    const { st, field } = s as { st: Parameters<typeof drawBowed>[5]; field: ModeField };
    drawBowed(ctx, W, H, { id, ...bowedGeometry(id) }, fr, st, field, 1000, false, undefined, TOP);
  },
  sounding: () =>
    ({
      ...base,
      bow: { pos: 0.5, speed: 0.2, dir: 1, changing: false },
      strings: [0, 1, 2, 3].map((i) => ({ open: 55 + 7 * i, stop: 55 + 7 * i, level: i === 1 ? 1e-4 : 0, bowing: i === 1 })),
      excite: { meta: 'D string · down-bow 20 cm/s · 0.50 N · β 0.093 · 50 % from the frog' },
    }) as unknown as VisualFrame,
});
const piano = (kind: 'grand' | 'upright'): Case => ({
  name: kind === 'grand' ? 'piano' : 'upright piano',
  state: () => ({ st: newPianoState(), field: new ModeField(24, 14, 2.2, 3), g: pianoGeom(kind) }),
  draw: (ctx, fr, s) => {
    const { st, field, g } = s as { st: ReturnType<typeof newPianoState>; field: ModeField; g: PianoGeom };
    drawPiano(ctx, W, H, g, fr, st, field, 1000);
  },
});
const CASES: Case[] = [
  piano('grand'),
  piano('upright'),
  bowed('violin'),
  bowed('viola'),
  bowed('cello'),
  bowed('bass'),
  { name: 'harp', state: newHarpState, draw: wind(drawHarp) },
  { name: 'flute', state: (): FluteState => ({ pScale: new AutoScale(1e-6), jetScale: new AutoScale(1e-9), env: new Float32Array(0) }) as FluteState, draw: wind(drawFlute) },
  { name: 'oboe', state: newOboeState, draw: wind(drawOboe) },
  { name: 'clarinet', state: newClarinetState, draw: wind(drawClarinet) },
  { name: 'bassoon', state: newBassoonState, draw: wind(drawBassoon) },
  {
    name: 'horn',
    state: newHornState,
    draw: wind(drawHorn),
    sounding: () => {
      const f = hornFingering(55);
      return { ...base, instrument: 'horn', focus: windFocus(55, f.partial, hornTubeLength(f)), excite: lips(55), lips: { open: 0.8, blow: 0.8 } } as unknown as VisualFrame;
    },
  },
  {
    name: 'trumpet',
    state: (): TrumpetState => ({ pScale: new AutoScale(1e-6), env: new Float32Array(0) }),
    draw: (ctx, fr, st) => drawTrumpet(ctx, W, H, fr, st as TrumpetState),
    sounding: () => ({ ...base, instrument: 'trumpet', focus: windFocus(67, 4, 1.48), excite: lips(67, 'valves 1+2 · partial 4') }) as unknown as VisualFrame,
  },
  {
    name: 'trombone',
    state: newTromboneState,
    draw: wind(drawTrombone),
    sounding: () => {
      const f = tromboneFingering(53, 'tenor');
      const out = tromboneSlideOut(f, 'tenor');
      return { ...base, instrument: 'trombone', focus: windFocus(53, f.partial, tromboneTubeLength(f, 'tenor')), excite: lips(53, `position ${f.position} · partial ${f.partial}`), lips: { open: 0.8, blow: 3 }, trombone: { size: 'tenor', slide: out, target: out, position: f.position, valves: f.valves, side: f.side, partial: f.partial } } as unknown as VisualFrame;
    },
  },
  { name: 'tuba', state: newTubaState, draw: wind(drawTuba) },
  { name: 'timpani', state: newTimpaniState, draw: wind(drawTimpani) },
  {
    name: 'glockenspiel',
    state: newGlockState,
    draw: wind(drawGlock),
    sounding: () => {
      const amp = new Float32Array(glockBars().length);
      amp[5] = 1;
      amp[12] = 0.5;
      return { focus: { midi: 84, f1: 1046.5, shapes: [new Float32Array(160)] }, glock: { amp, last: 5, ago: 0.1, vel: 80, hits: [{ bar: 5, ago: 0.05, vel: 80, hand: 0 }], hands: [5, 12] } } as unknown as VisualFrame;
    },
  },
];
/** draw a few frames 8 ms apart (the springs settle, a slowed wave is on its way): what the last frame did
 *  on the stage's canvas (`seen`), and what was painted on scratch canvases over all of them (`layers`: the
 *  kept pictures: whole only on a stage nothing has drawn on under this theme, `freshStage`) */
async function run(c: Case, fr: VisualFrame | null, n = 1): Promise<{ seen: Seen; layers: Seen; st: unknown }> {
  const st = c.state();
  let seen = spy().seen;
  emptyKept();
  for (let k = 0; k < n; k++) {
    const s = spy();
    c.draw(s.ctx, fr, st);
    seen = s.seen;
    if (k < n - 1) await new Promise((r) => setTimeout(r, 8));
  }
  const layers: Seen = { ops: [...kept.ops], blends: [...kept.blends], rects: kept.rects, images: kept.images };
  return { seen, layers, st };
}
const styles = (s: Seen) => s.ops.map((o) => o.style).join(' | ');
const glows = (s: Seen) => s.blends.filter((b) => b === 'lighter' || b === 'screen');
const DAY = THEMES.find((t) => t.id === 'day-studio')!;
const NIGHT = THEMES.find((t) => t.id === 'night-bench')!;
/** the one blue, as a canvas colour's digits */
const BLUE = DAY.ink.sound;
/** the plain record of a drawing's state: what the shared drawer stores for the tests and the stage */
const record = (st: unknown) => {
  const s = (st as { st?: unknown }).st ?? st;
  const { drawn, src } = s as { drawn?: unknown; src?: unknown };
  return JSON.parse(JSON.stringify({ drawn: drawn ?? null, src: src ?? null }));
};

afterEach(() => setTheme(DEFAULT_THEME, false));

describe('a theme’s own drawers', () => {
  it('Night Bench has none: the shared drawers draw', async () => {
    expect(theme().id).toBe('night-bench');
    for (const k of ['bowed', 'flute', 'trumpet', 'bassoon', 'clarinet', 'oboe', 'horn', 'trombone', 'tuba', 'timpani', 'harp', 'glock', 'piano', 'room', 'breath', 'field'] as (keyof Drawers)[]) expect(ownDrawer(k), k).toBeUndefined();
    for (const id of ['evening-hall', 'night-gallery'] as const) {
      setTheme(id, false);
      expect(ownDrawer('bassoon'), `${id}: the shared drawing in its inks`).toBeUndefined();
    }
    setTheme(DEFAULT_THEME, false);
    expect((await run(CASES.find((c) => c.name === 'bassoon')!, null)).seen.ops.length).toBeGreaterThan(50);
  });

  it('Day Studio’s stand in for nothing until they are there: no night drawing in the day’s inks', async () => {
    setTheme('day-studio', false);
    const hold = ownDrawer('bassoon');
    expect(hold, 'a drawer that draws nothing').toBeTypeOf('function');
    for (const c of CASES) {
      const { seen } = await run(c, null);
      expect(seen.ops.length + seen.images, c.name).toBe(0);
    }
    // (the room's fronts wait too, and a plate's picture is cleared, not left as the last theme's)
    const s = spy();
    drawRoom(s.ctx, W, H, newRoomState(), { x: 700, y: 280 }, 0.4, 0.2, 1000, null);
    expect(s.seen.ops.length).toBe(0);
    const px = new Uint8ClampedArray(16).fill(200);
    ownDrawer('field')!(px, new Float32Array(4), 1, 1, false);
    expect([...px]).toEqual(new Array(16).fill(0));
    // then they are fetched (on a page: as soon as the theme is the one in use), and the same entry draws
    await loadDrawers();
    const { DAY_DRAWERS } = await import('../src/themes/day-studio/draw/index.ts');
    expect(ownDrawer('bassoon')).toBe(DAY_DRAWERS.bassoon);
    expect(ownDrawer('bassoon')).not.toBe(hold);
    expect((await run(CASES.find((c) => c.name === 'bassoon')!, null)).seen.ops.length).toBeGreaterThan(50);
    // and only under their own theme
    setTheme('evening-hall', false);
    expect(ownDrawer('bassoon')).toBeUndefined();
  });
});

describe('Day Studio’s 2D drawers', () => {
  beforeAll(async () => {
    await import('../src/themes/day-studio/draw/index.ts');
  });

  it('every instrument is its own drawing in daylight, on the shared drawing’s geometry: the same record, another paint', async () => {
    freshStage();
    for (const c of CASES) {
      const night = await run(c, null);
      setTheme('day-studio', false);
      const day = await run(c, null);
      setTheme(DEFAULT_THEME, false);
      expect(day.seen.ops.length, `${c.name} is drawn`).toBeGreaterThan(20);
      // (what the shared drawer stores for the stage and the tests: its boxes, where its sound leaves it.
      // The flute stores neither: its geometry is held to the shared one's by its picture, not here)
      expect(record(day.st), `${c.name}: what it records`).toEqual(record(night.st));
      if (c.name !== 'flute') expect(record(day.st), `${c.name} records something`).not.toEqual({ drawn: null, src: null });
      // another paint, on the stage's canvas and in what is kept (a piano's base and a string's plate are
      // nearly all kept pictures: the same number of strokes over them, in other colours under them)
      const paint = (r: { seen: Seen; layers: Seen }) => `${styles(r.seen)} || ${styles(r.layers)}`;
      expect(paint(day), `${c.name}: its paint`).not.toBe(paint(night));
      expect(paint(day), `${c.name}: no ink of the night`).not.toContain(NIGHT.ink.sound);
      // an object on the floor casts one soft shadow. The winds, the brass, the harp and the percussion lay
      // theirs as a picture under the drawing, which no night drawing does; a piano's and a string's is
      // painted into the still layer both themes lay (one picture, or the plate and the fittings)
      const laid = !['piano', 'upright piano', 'violin', 'viola', 'cello', 'bass'].includes(c.name);
      if (laid) {
        expect(night.seen.images, `${c.name}: the night lays no picture`).toBe(0);
        expect(day.seen.images, `${c.name}: its shadow, laid under it`).toBeGreaterThanOrEqual(1);
      } else expect(day.seen.images, `${c.name}: its kept layers, as the night's`).toBe(night.seen.images);
      // and that kept picture was painted here, where this test can see it (not found made already): it
      // adds no light, and nothing of it is the blue (an instrument at rest sounds nowhere)
      expect(day.layers.ops.length, `${c.name}: its kept picture is painted on a stage of its own`).toBeGreaterThan(0);
      expect(glows(day.layers), `${c.name}: its kept picture`).toEqual([]);
      expect(styles(day.layers), `${c.name}: its kept picture at rest`).not.toContain(BLUE);
    }
  });

  it('nothing glows: no drawer of the day’s adds light anywhere in its source, and every shadow it casts is a shade', () => {
    // The rule is of every path through the drawing, which no handful of frames walks: so it is read off
    // the sources. No additive blend (the night's drawers have them: the piano's, the strings', the flute's
    // and the trumpet's, the reeds'), and a shadow's colour is always dark and nearly grey (a cast shadow on
    // the floor or of one part on another), never a halo in the blue or a warm light.
    const dir = new URL('../src/themes/day-studio/draw/', import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThanOrEqual(17);
    const additive = /['"`](lighter|screen|color-dodge|plus-lighter)['"`]/;
    let shadows = 0;
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      expect(additive.test(src), `${f}: an additive blend`).toBe(false);
      for (const m of src.matchAll(/shadowColor = ([^;]+);/g)) {
        // every colour named in what is assigned (a conditional names two): 'transparent', or rgba(r,g,b,…)
        const cols = [...m[1].matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+)/g)];
        expect(cols.length + (m[1].includes('transparent') ? 1 : 0), `${f}: ${m[1]}`).toBeGreaterThan(0);
        for (const c of cols) {
          const [r, g, b] = [+c[1], +c[2], +c[3]];
          shadows++;
          expect(Math.max(r, g, b), `${f}: ${m[1]} is dark`).toBeLessThanOrEqual(64);
          expect(Math.max(r, g, b) - Math.min(r, g, b), `${f}: ${m[1]} is nearly grey`).toBeLessThanOrEqual(48);
        }
      }
    }
    expect(shadows, 'the shadows were found').toBeGreaterThan(10);
    // (the shared drawers, the night's, do add light: what this reads for is there to be found)
    const night = ['stage-draw.ts', 'grand-plan.ts', 'piano-draw.ts', 'bassoon-draw.ts', 'clarinet-draw.ts', 'oboe-draw.ts'].map((f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8'));
    for (const src of night) expect(additive.test(src)).toBe(true);
  });

  it('and none is added as it draws, still or sounding, on the stage or in a picture it keeps', async () => {
    // (what the frames made here reach: a check on the drawing as it runs, beside the reading above. The
    // one glow these frames find in the night's drawing is the piano's, which shows the spy sees one.)
    freshStage();
    let nightGlows = 0;
    let dayKept = 0;
    for (const c of CASES) {
      for (const fr of [null, c.sounding?.() ?? null]) {
        const night = await run(c, fr, fr ? 6 : 1);
        nightGlows += glows(night.seen).length + glows(night.layers).length;
        setTheme('day-studio', false);
        const day = await run(c, fr, fr ? 6 : 1);
        setTheme(DEFAULT_THEME, false);
        dayKept += day.layers.ops.length;
        expect(glows(day.seen), `${c.name}${fr ? ' sounding' : ''}`).toEqual([]);
        expect(glows(day.layers), `${c.name}${fr ? ' sounding' : ''}: its kept pictures`).toEqual([]);
      }
    }
    expect(nightGlows, 'the spy sees a glow where there is one').toBeGreaterThan(0);
    expect(dayKept, 'the day’s kept pictures were painted where the spy saw them').toBeGreaterThan(500);
  });

  it('the one blue is what sounds, and only that: none on an instrument at rest, some where a note sounds', async () => {
    freshStage();
    setTheme('day-studio', false);
    for (const c of CASES) {
      const still = await run(c, null);
      expect(styles(still.seen), `${c.name} at rest`).not.toContain(BLUE);
      expect(still.layers.ops.length, `${c.name}: its kept picture is painted here`).toBeGreaterThan(0);
      expect(styles(still.layers), `${c.name} at rest: its kept pictures`).not.toContain(BLUE);
      if (!c.sounding) continue;
      const sound = await run(c, c.sounding(), 6);
      expect(styles(sound.seen), `${c.name} sounding`).toContain(BLUE);
    }
  });

  it('the reeds’ grenadilla is still dark wood, and stands off the plaster', async () => {
    const { CLARINET_WOOD, OBOE_WOOD } = await import('../src/themes/day-studio/draw/index.ts');
    const lum = (hex: string): number => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const contrast = (a: string, b: string): number => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    // the plaster (the theme's ground) and the lightest the room's patch of light makes it behind the body
    for (const wood of [CLARINET_WOOD, OBOE_WOOD]) {
      for (const s of [DAY.ink.ground, '#f7f9fa']) expect(contrast(wood, s), `${wood} on ${s}`).toBeGreaterThanOrEqual(1.3);
      expect(lum(wood)).toBeLessThan(0.03);
    }
    // (not lifted towards the ground: darker than the night's, which had to read on near-black)
    expect(lum(CLARINET_WOOD)).toBeLessThan(lum(NIGHT_CLARINET_WOOD));
  });

  it('the breath reads on the plaster: the same three streams, more of the slate and a firmer line', () => {
    const at = (a: number, w: number) => [500 - a * 1000, 300 + w * 1000] as const;
    const night = spy();
    breathStream(night.ctx, at, 1000, BRASS_BREATH, 0.3, 0);
    setTheme('day-studio', false);
    const day = spy();
    breathStream(day.ctx, at, 1000, BRASS_BREATH, 0.3, 0);
    expect(night.seen.ops.map((o) => [o.style, o.width])).toEqual(new Array(3).fill([`rgba(${NIGHT.ink.cool},0.300)`, 1]));
    expect(day.seen.ops.map((o) => [o.style, o.width])).toEqual(new Array(3).fill([`rgba(${DAY.ink.cool},0.660)`, 1.4]));
    expect(INK.cool).toBe(DAY.ink.cool);
  });

  it('the room has no wall drawn (the page lays it as light: `roomLight`); its fronts are the blue, in the same room', () => {
    const fronts = (id: 'night-bench' | 'day-studio') => {
      setTheme(id, false);
      const st = newRoomState();
      st.waves.push({ t0: 0.6, amp: 1 });
      const s = spy();
      const g = drawRoom(s.ctx, W, H, st, { x: 700, y: 280 }, 0.4, 0, 1000, null);
      return { g, seen: s.seen };
    };
    const night = fronts('night-bench');
    const day = fronts('day-studio');
    expect(night.seen.rects, 'the night’s walls: a dashed box').toBe(1);
    expect(day.seen.rects).toBe(0);
    expect(day.g).toEqual(roomRect(W, H, 0.4));
    expect(day.g).toEqual(night.g);
    expect(day.seen.ops.length).toBeGreaterThan(0);
    for (const o of day.seen.ops) expect(o.style).toContain(BLUE);
    expect(THEMES.filter((t) => t.draw.roomLight).map((t) => t.id)).toEqual(['day-studio']);
  });

  it('a plate’s sand is laid over the wood, not added: the blue on a pale board, its pale tint on dark varnish', async () => {
    const { DAY_DRAWERS } = await import('../src/themes/day-studio/draw/index.ts');
    // three points of a field: on a nodal line, half way, where it moves most
    const f = Float32Array.from([0, 0.5, 1]);
    const paint = (pale: boolean, lv = 1) => {
      const px = new Uint8ClampedArray(12);
      DAY_DRAWERS.field(px, f, 1, lv, pale);
      return [0, 1, 2].map((i) => [...px.subarray(4 * i, 4 * i + 4)]);
    };
    const [node, , swing] = paint(false);
    expect(node.slice(0, 3)).toEqual([29, 72, 209]);
    expect(node[3]).toBe(Math.round(255 * 0.26));
    expect(swing.slice(0, 3)).toEqual([29, 72, 209]);
    expect(swing[3]).toBe(Math.round(255 * 0.05));
    const [paleNode, , paleSwing] = paint(true);
    expect(paleNode.slice(0, 3)).toEqual([168, 196, 255]);
    expect(paleNode[3]).toBe(Math.round(255 * 0.34));
    expect(paleSwing.slice(0, 3)).toEqual([150, 185, 255]);
    // (never opaque: the wood shows through; and nothing at all on a still plate)
    for (const p of [...paint(false), ...paint(true)]) expect(p[3]).toBeLessThan(100);
    for (const p of paint(true, 0)) expect(p[3]).toBe(0);
    // the shared plate hands its pixels over under the theme, and paints its own under the night's
    setTheme('day-studio', false);
    expect(ownDrawer('field')).toBe(DAY_DRAWERS.field);
  });
});
