// A theme's own 2D drawers. The themes of the night (Night Bench, Evening Hall, Night Gallery) are one
// set of drawings in different inks: the drawers in ui/ (stage-draw.ts and the rest), which read the
// theme's inks as they draw. A theme whose instruments are drawn another way altogether (Day Studio:
// objects in daylight on pale plaster, each with its shadow on the floor) has drawers of its own, in its
// folder (themes/<id>/draw/), a chunk of their own that is fetched only when that theme is the one in use.
//
// The drawers in ui/ stay the one entry everybody calls (the stage, an orchestra's seats, the tests). Each
// asks here first, at its top, and hands over where the theme in use has its own:
//
//   const own = ownDrawer('bassoon');
//   if (own) return own(ctx, W, H, fr, st, top);
//
// So nothing in ui/ imports a theme's folder (the theme's drawers import ui/, for the layouts and the live
// state they share with it), and what is here of the ui/ modules is their types alone.
//
// While a theme's own drawers are still on their way, nothing is drawn in their place (a drawing made for
// the night in the day's inks is no picture of either): the stage is the page's ground for those frames.
// Should they never come (the chunk could not be fetched), the shared drawers draw, so the stage is never
// left empty.
import { onTheme, theme, type Theme, type ThemeId } from './index.ts';
import type { breathStream, drawBowed, drawFlute, drawTrumpet } from '../ui/stage-draw.ts';
import type { drawBassoon } from '../ui/bassoon-draw.ts';
import type { drawClarinet } from '../ui/clarinet-draw.ts';
import type { drawOboe } from '../ui/oboe-draw.ts';
import type { drawHorn } from '../ui/horn-draw.ts';
import type { drawTrombone } from '../ui/trombone-draw.ts';
import type { drawTuba } from '../ui/tuba-draw.ts';
import type { drawTimpani } from '../ui/timpani-draw.ts';
import type { drawHarp } from '../ui/harp-draw.ts';
import type { drawGlock } from '../ui/glock-draw.ts';
import type { drawPiano } from '../ui/piano-draw.ts';
import type { drawRoom } from '../ui/room-draw.ts';

/** What a theme may draw itself: each the shared function's own signature, under the name it is asked by. */
export interface Drawers {
  bowed: typeof drawBowed;
  flute: typeof drawFlute;
  trumpet: typeof drawTrumpet;
  bassoon: typeof drawBassoon;
  clarinet: typeof drawClarinet;
  oboe: typeof drawOboe;
  horn: typeof drawHorn;
  trombone: typeof drawTrombone;
  tuba: typeof drawTuba;
  timpani: typeof drawTimpani;
  harp: typeof drawHarp;
  glock: typeof drawGlock;
  /** both pianos (the grand's plan and the upright's) */
  piano: typeof drawPiano;
  /** the listening room's wavefronts */
  room: typeof drawRoom;
  /** a stream of the breath going into a wind (every wind's and brass's) */
  breath: typeof breathStream;
  /** a vibrating plate's picture (stage-draw.ts `ModeField`): the field `f` (its largest magnitude `mx`)
   *  into the pixels `d` (rgba), at the level `lv` (0..1); `pale`: on a dark plate (a violin's varnish) */
  field: (d: Uint8ClampedArray, f: Float32Array, mx: number, lv: number, pale: boolean) => void;
}

/** the themes that have drawers of their own, and how each is fetched */
const LOADERS: Partial<Record<ThemeId, () => Promise<unknown>>> = {
  'day-studio': () => import('./day-studio/draw/index.ts'),
};
const sets: Partial<Record<ThemeId, Partial<Drawers>>> = {};
const asked: Partial<Record<ThemeId, Promise<void>>> = {};
const failed = new Set<ThemeId>();

/** what stands in for a theme's drawers while they are on their way: nothing is drawn */
const HOLD: Drawers = {
  bowed: () => null,
  flute: () => {},
  trumpet: () => {},
  bassoon: () => {},
  clarinet: () => {},
  oboe: () => {},
  horn: () => {},
  trombone: () => {},
  tuba: () => {},
  timpani: () => {},
  harp: () => {},
  glock: () => {},
  piano: () => {},
  room: () => ({ x0: 0, y0: 0, x1: 0, y1: 0 }),
  breath: () => {},
  field: (d) => void d.fill(0),
};

/** a theme's folder gives its drawers (its draw/index.ts, as it is loaded) */
export function registerDrawers(id: ThemeId, set: Partial<Drawers>): void {
  sets[id] = set;
}

/** The drawer of the theme in use for `k`, where that theme draws it itself: undefined, and the shared
 *  drawer draws. */
export function ownDrawer<K extends keyof Drawers>(k: K): Drawers[K] | undefined {
  const id = theme().id;
  const set = sets[id];
  if (set) return set[k];
  return LOADERS[id] && !failed.has(id) ? HOLD[k] : undefined;
}

/** Fetch a theme's own drawers (the one in use, unless another is named), once; resolved when they are
 *  there, or when the theme has none. */
export function loadDrawers(id: ThemeId = theme().id): Promise<void> {
  const load = LOADERS[id];
  if (!load || sets[id]) return Promise.resolve();
  return (asked[id] ??= load().then(
    () => {
      failed.delete(id);
    },
    () => {
      // (not fetched: the shared drawers draw meanwhile; asked for again when the theme is next chosen)
      failed.add(id);
      delete asked[id];
    },
  ));
}

/** are the drawers of the theme in use there to draw with (its own fetched, or it has none)? */
export const drawersReady = (): boolean => !LOADERS[theme().id] || !!sets[theme().id] || failed.has(theme().id);

// on a page: the drawers of the theme in use are asked for as soon as this is read (the first frame may
// already be theirs), and those of any theme changed to. (Where there is no page, the unit tests, a test
// imports a theme's draw/index.ts itself, or awaits `loadDrawers()`: until then the shared entries draw
// nothing under a theme that has its own.)
if (typeof window !== 'undefined' && typeof document !== 'undefined') onTheme((t: Theme) => void loadDrawers(t.id), true);
