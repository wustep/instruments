// The themes: the registry, the one in use, and the change from one to another.
//
// A theme is a whole look (types.ts). Each has its own folder: `theme.ts` (its inks, palettes and signs:
// data), `styles.css`, `panel.css`, `vector.css` (its chrome, scoped to it at build time, all four in the
// page's one sheet: sheets.ts) and `world.ts` (its 3D room and lights, loaded with the 3D stage:
// worlds.ts). Nothing else in the app names a theme: it asks `theme()` and listens with `onTheme`.
//
// The choice is the device's (localStorage). The page's boot script, written from this registry by the
// build (vite.config.ts `themeBoot`), has put it on <html data-theme> before the first paint: the sheet
// that applies and the first frame drawn are already that theme's. `setTheme` changes everything together:
// the attribute (the chrome), the inks and palettes (the 2D stage and vector lines, on their next frame),
// and whoever listens (the 3D stage builds the new world).
//
// This module has no DOM at import and runs in Node (the unit tests, the build).

import type { Theme, ThemeId } from './types.ts';
import { nightBench } from './night-bench/theme.ts';
import { eveningHall } from './evening-hall/theme.ts';
import { dayStudio } from './day-studio/theme.ts';
import { nightGallery } from './night-gallery/theme.ts';

export type { Glyph, GlyphName, Glyphs, Ink, Theme, ThemeId, VectorInk, VectorLook } from './types.ts';

/** in the order the theme button walks them */
export const THEMES: readonly Theme[] = [nightBench, eveningHall, dayStudio, nightGallery];
/** a first visit's */
export const DEFAULT_THEME: ThemeId = 'night-bench';
/** where the device keeps its choice */
export const THEME_KEY = 'piano-model.theme';

const byId = new Map<string, Theme>(THEMES.map((t) => [t.id, t]));
export const isThemeId = (s: unknown): s is ThemeId => typeof s === 'string' && byId.has(s);
export const themeOf = (id: ThemeId): Theme => byId.get(id)!;

function initial(): Theme {
  // (the boot script has already read the device's choice)
  if (typeof document !== 'undefined') {
    const a = document.documentElement.dataset.theme;
    if (isThemeId(a)) return themeOf(a);
  }
  try {
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_KEY) : null;
    if (isThemeId(s)) return themeOf(s);
  } catch {
    // (no storage: a private window, a file)
  }
  return themeOf(DEFAULT_THEME);
}

let current = initial();
let epoch = 0;
const subs = new Set<(t: Theme) => void>();

/** the theme in use */
export const theme = (): Theme => current;
/** counts the changes of theme: a picture cached under one is not another's (a cache keeps the epoch it
 *  was made in) */
export const themeEpoch = (): number => epoch;

/** hear of every change of theme (`now`: and of the one in use, at once). Returns the way to stop. */
export function onTheme(f: (t: Theme) => void, now = false): () => void {
  subs.add(f);
  if (now) f(current);
  return () => subs.delete(f);
}

/** what of a theme is the document's own: the attribute its sheet answers to, and the browser's chrome */
function mark(t: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bar);
}

/** Change the theme: the chrome, the 2D stage, the vector lines and the 3D world together. `keep`: the
 *  device remembers it (false: for this page only, as a test or a script asks). */
export function setTheme(id: ThemeId, keep = true): void {
  const t = byId.get(id);
  if (!t) return;
  if (keep) {
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      // (not kept: the page still changes)
    }
  }
  if (t === current) return mark(t);
  current = t;
  epoch++;
  mark(t);
  for (const f of [...subs]) f(t);
}

/** the theme after the one in use, as the button walks them */
export const nextTheme = (): Theme => THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];

mark(current);
