// The themes: the registry, a change of theme reaching the 2D inks and the vector palette, each theme's
// sheets scoped to it by the build, and the boot script that puts the device's theme on the page before
// anything is painted.
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { bootScript, scopeSelector } from '../theme-plugins.ts';
import { DEFAULT_THEME, THEMES, THEME_KEY, isThemeId, nextTheme, onTheme, setTheme, theme, themeEpoch, themeOf } from '../src/themes/index.ts';
import { INK, rgba } from '../src/ui/stage-draw.ts';
import { SLOTS, SPECTRUM_INK_V, V, core, heat, slotColor } from '../src/ui/vector/kit.ts';

const here = (p: string) => new URL(p, import.meta.url);
const HEX = /^#[0-9a-f]{6}$/;
const RGB = /^\d{1,3},\d{1,3},\d{1,3}$/;

afterEach(() => setTheme(DEFAULT_THEME, false));

describe('the registry', () => {
  it('four themes, the incumbent first and the default; each with a name, a folder and its three sheets', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['night-bench', 'evening-hall', 'day-studio', 'night-gallery']);
    expect(THEMES.map((t) => t.name)).toEqual(['Night Bench', 'Evening Hall', 'Day Studio', 'Night Gallery']);
    expect(DEFAULT_THEME).toBe('night-bench');
    expect(theme().id, 'with no device to ask, the default').toBe('night-bench');
    const sheets = readFileSync(here('../src/themes/sheets.ts'), 'utf8');
    for (const t of THEMES) {
      expect(themeOf(t.id)).toBe(t);
      expect(isThemeId(t.id)).toBe(true);
      for (const f of ['theme.ts', 'world.ts', 'styles.css', 'panel.css', 'vector.css']) expect(existsSync(here(`../src/themes/${t.id}/${f}`)), `${t.id}/${f}`).toBe(true);
      for (const f of ['styles', 'panel', 'vector']) expect(sheets, `${t.id}/${f}.css is in the page's sheet`).toContain(`'./${t.id}/${f}.css'`);
    }
    expect(isThemeId('sepia')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it('a theme’s data is whole: every ink by role, the vector palette, the signs, the swatch', () => {
    for (const t of THEMES) {
      expect(t.ink.ground, t.id).toMatch(HEX);
      for (const k of ['line', 'sound', 'warm', 'cool', 'copper', 'felt', 'wood', 'ebony'] as const) expect(t.ink[k], `${t.id} ink.${k}`).toMatch(RGB);
      for (const k of ['ground', 'line', 'lineMid', 'lineDim', 'frame', 'sound', 'slot1', 'slot2', 'slot3', 'slot4'] as const) expect(t.vector.ink[k], `${t.id} vector.${k}`).toMatch(HEX);
      // (a ramp from quiet to loud, in order)
      expect(t.vector.heat[0][0]).toBe(0);
      expect(t.vector.heat[t.vector.heat.length - 1][0]).toBe(1);
      for (let i = 1; i < t.vector.heat.length; i++) expect(t.vector.heat[i][0]).toBeGreaterThan(t.vector.heat[i - 1][0]);
      for (const [, c] of t.vector.heat) expect(c).toMatch(HEX);
      for (const k of ['back', 'prev', 'next', 'close', 'reset', 'knobs'] as const) expect(t.glyphs[k], `${t.id} sign ${k}`).toBeTruthy();
      for (const c of [...t.swatch, t.bar]) expect(c).toMatch(HEX);
      // (the page's ground is light or dark as the theme says it is)
      const lum = [1, 3, 5].map((i) => parseInt(t.ink.ground.slice(i, i + 2), 16)).reduce((a, b) => a + b) / 3;
      expect(lum > 128 ? 'light' : 'dark', t.id).toBe(t.scheme);
    }
    // what a look lights with is its own: no two themes share it
    expect(new Set(THEMES.map((t) => t.swatch[1])).size).toBe(THEMES.length);
  });

  it('a theme’s theme.ts is data: it imports nothing of the app (the build reads it, and the tests)', () => {
    for (const t of THEMES) {
      const src = readFileSync(here(`../src/themes/${t.id}/theme.ts`), 'utf8');
      const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l));
      for (const l of imports) expect(l, `${t.id}/theme.ts`).toMatch(/^import type .* from '\.\.\/types\.ts';$/);
      expect(src, `${t.id}/theme.ts`).not.toMatch(/\bdocument\b|\bwindow\b/);
    }
  });

  it('Night Bench is the look the app had: its inks and its vector palette, value for value', () => {
    const t = themeOf('night-bench');
    expect(t.ink).toEqual({ ground: '#0e0d0b', line: '236,226,206', sound: '255,94,56', warm: '242,166,70', cool: '150,182,210', copper: '196,128,82', felt: '205,181,146', wood: '58,42,28', ebony: '22,19,16' });
    expect(t.vector.ink).toEqual({ ground: '#000000', line: '#4fb6f2', lineMid: '#3487c4', lineDim: '#1f5f8c', frame: '#133954', sound: '#ffb340', slot1: '#5be381', slot2: '#ff5d40', slot3: '#ff73cf', slot4: '#eef6f8' });
    expect([t.vector.blend, t.vector.glow, t.vector.core]).toEqual(['lighter', true, ['#ffffff', 0.55]]);
    expect(t.figures).toBe('10px "IBM Plex Mono", monospace');
    // (its signs are characters of its type, as they were)
    expect([t.glyphs.prev, t.glyphs.next, t.glyphs.close, t.glyphs.reset, t.glyphs.knobs]).toEqual(['‹', '›', '×', '↺', '◐']);
  });
});

describe('a change of theme', () => {
  it('reaches the 2D inks, the vector palette and whoever listens, at once; the epoch counts it', () => {
    const heard: string[] = [];
    const off = onTheme((t) => heard.push(t.id));
    const e0 = themeEpoch();
    expect(INK.sound).toBe('255,94,56');
    expect(V.sound).toBe('#ffb340');
    for (const t of THEMES.slice(1)) {
      setTheme(t.id, false);
      expect(theme()).toBe(t);
      expect(INK, t.id).toEqual(t.ink);
      expect({ ...V }, t.id).toEqual(t.vector.ink);
      expect(SLOTS, t.id).toEqual([t.vector.ink.slot1, t.vector.ink.slot2, t.vector.ink.slot3, t.vector.ink.slot4]);
      expect(slotColor(1)).toBe(t.vector.ink.slot2);
      expect(slotColor(9)).toBe(t.vector.ink.line);
      expect(rgba(INK.sound, 0.5)).toBe(`rgba(${t.ink.sound},0.500)`);
      // the ramp's loud end, the core's mix and the display's figures are the theme's
      expect(heat(1)).toBe(t.vector.heat[t.vector.heat.length - 1][1]);
      expect(heat(0)).toBe(t.vector.heat[0][1]);
      expect(core(t.vector.core[0])).toBe(t.vector.core[0]);
      expect(SPECTRUM_INK_V.font).toBe(t.vector.figures);
    }
    expect(heard).toEqual(['evening-hall', 'day-studio', 'night-gallery']);
    expect(themeEpoch()).toBe(e0 + 3);
    // the same theme again is no change
    setTheme('night-gallery', false);
    expect(themeEpoch()).toBe(e0 + 3);
    expect(heard.length).toBe(3);
    off();
    setTheme('night-bench', false);
    expect(heard.length, 'a listener let go hears no more').toBe(3);
    expect(INK.sound).toBe('255,94,56');
    // (an id that is none of them changes nothing)
    setTheme('sepia' as never, false);
    expect(theme().id).toBe('night-bench');
  });

  it('the button walks the four in order and comes round', () => {
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      setTheme(nextTheme().id, false);
      seen.push(theme().id);
    }
    expect(seen).toEqual(['evening-hall', 'day-studio', 'night-gallery', 'night-bench']);
  });
});

describe('each theme’s sheets are scoped to it by the build', () => {
  it('a rule on the root is scoped on it, any other under it, at the weight it was written with', () => {
    const w = ':where([data-theme="day-studio"])';
    expect(scopeSelector(':root', 'day-studio')).toBe(`:root${w}`);
    expect(scopeSelector(":root[data-audio='running'] .lamp", 'day-studio')).toBe(`:root${w}[data-audio='running'] .lamp`);
    expect(scopeSelector(":root:not([data-route='stage']) .view", 'day-studio')).toBe(`:root${w}:not([data-route='stage']) .view`);
    expect(scopeSelector('html', 'day-studio')).toBe(`html${w}`);
    expect(scopeSelector('body', 'day-studio')).toBe(`${w} body`);
    expect(scopeSelector('.top a:hover', 'day-studio')).toBe(`${w} .top a:hover`);
    expect(scopeSelector('*', 'day-studio')).toBe(`${w} *`);
    expect(scopeSelector('  ::selection ', 'day-studio')).toBe(`${w} ::selection`);
    // (a class that only begins like the root's names is not the root)
    expect(scopeSelector('html-view', 'day-studio')).toBe(`${w} html-view`);
    expect(scopeSelector(':root-like', 'day-studio')).toBe(`${w} :root-like`);
  });

  it('no theme’s sheet names another theme, and the shared sheet is the only one that names them all', () => {
    for (const t of THEMES) {
      for (const f of ['styles', 'panel', 'vector']) {
        const css = readFileSync(here(`../src/themes/${t.id}/${f}.css`), 'utf8');
        expect(css, `${t.id}/${f}.css is written as the only look`).not.toMatch(/data-theme=/);
      }
    }
    const base = readFileSync(here('../src/themes/base.css'), 'utf8');
    for (const t of THEMES) expect(base).toContain(`[data-theme='${t.id}']`);
  });
});

describe('the boot script (the first thing in the page’s head)', () => {
  const run = (stored: string | null | Error) => {
    const dataset: Record<string, string> = {};
    const meta = { content: '', setAttribute(_k: string, v: string) {
      this.content = v;
    } };
    let ready: (() => void) | null = null;
    const document = { documentElement: { dataset }, addEventListener: (_e: string, f: () => void) => (ready = f), querySelector: () => meta };
    const localStorage = {
      getItem: (k: string) => {
        if (stored instanceof Error) throw stored;
        return k === THEME_KEY ? stored : null;
      },
    };
    new Function('document', 'localStorage', bootScript())(document, localStorage);
    const before = dataset.theme;
    ready?.();
    return { theme: before, bar: meta.content };
  };
  it('puts the device’s theme on <html> at once, and its colour on the browser’s chrome', () => {
    for (const t of THEMES) expect(run(t.id), t.id).toEqual({ theme: t.id, bar: t.bar });
  });
  it('a first visit, a choice it does not know, or no storage at all: the default', () => {
    const d = { theme: DEFAULT_THEME, bar: themeOf(DEFAULT_THEME).bar };
    expect(run(null)).toEqual(d);
    expect(run('sepia')).toEqual(d);
    expect(run('__proto__')).toEqual(d);
    expect(run(new Error('denied'))).toEqual(d);
  });
  it('is in both pages’ heads when they are built: the app’s and the 404’s have a theme-color to set', () => {
    for (const f of ['../index.html', '../404.html']) expect(readFileSync(here(f), 'utf8'), f).toMatch(/<meta name="theme-color" content="#141312" \/>/);
  });
});
