// The themes' chrome that is not in a sheet: the dials' pointers and the signs on the stage's knobs, the
// way past the bar that one look has, what the Notes page says of each look, and the 404 page's sheet,
// which is in the device's theme with no app to put it there. Night Bench is the page as it was.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, setTheme, theme, themeOf } from '../src/themes/index.ts';
import { wordsOf } from '../src/themes/words.ts';
import { pointTo } from '../src/ui/controls.ts';
import { looksWith } from '../src/ui/dom.ts';
import { knobAngle } from '../src/ui/stage-knob.ts';

const here = (p: string) => new URL(p, import.meta.url);
const read = (p: string) => readFileSync(here(p), 'utf8');
/** a line of an SVG, as far as `pointTo` asks of it */
const line = () => {
  const at: Record<string, string> = { x1: '20', y1: '20', x2: '20', y2: '11' };
  return { at, el: { setAttribute: (k: string, v: string) => void (at[k] = v) } as unknown as SVGElement };
};

afterEach(() => setTheme(DEFAULT_THEME, false));

describe('the dials', () => {
  it('Night Bench’s pointer is the hand it always was: from the cap’s middle, 9 long, written as it was', () => {
    const t = themeOf('night-bench');
    expect(t.chrome).toEqual({ knobPointer: [0, 9], stagePointer: [0, 9], skip: false });
    for (const u of [0, 0.13, 0.5, 0.77, 1]) {
      const a = knobAngle(u);
      const { at, el } = line();
      pointTo(el, a, t.chrome.knobPointer);
      expect(at).toEqual({ x1: '20', y1: '20', x2: (20 + 9 * Math.sin(a)).toFixed(2), y2: (20 - 9 * Math.cos(a)).toFixed(2) });
    }
  });

  it('a look’s pointer is its own: a mark at the rim turns with the value at both its ends', () => {
    for (const t of THEMES) {
      for (const p of [t.chrome.knobPointer, t.chrome.stagePointer]) {
        expect(p[0], t.id).toBeGreaterThanOrEqual(0);
        expect(p[1], t.id).toBeGreaterThan(p[0]);
        // (inside the track, which is drawn at 15)
        expect(p[1], t.id).toBeLessThan(15);
        const { at, el } = line();
        pointTo(el, Math.PI / 2, p);
        expect([Number(at.x1), Number(at.y1), Number(at.x2), Number(at.y2)].map((v) => Math.round(v * 100) / 100), t.id).toEqual([20 + p[0], 20, 20 + p[1], 20]);
      }
    }
    expect(themeOf('day-studio').chrome.stagePointer).toEqual([6.9, 9.9]);
    expect(themeOf('night-gallery').chrome.knobPointer).toEqual([5.5, 10.5]);
  });

  it('where a look signs the stage’s knobs, the lid and the room each have their own drawing', () => {
    expect(THEMES.filter((t) => t.chrome.stageSigns).map((t) => t.id)).toEqual(['day-studio', 'night-gallery']);
    for (const t of THEMES) {
      const s = t.chrome.stageSigns;
      if (!s) continue;
      expect(s.cls, t.id).toMatch(/^sk-[a-z]+$/);
      expect(s.lid, t.id).toMatch(/^M[\d.]/);
      expect(s.room, t.id).toMatch(/^M[\d.]/);
      expect(s.lid).not.toBe(s.room);
      // (its sheet draws it: the class is that sheet's)
      expect(read(`../src/themes/${t.id}/styles.css`), t.id).toContain(`.${s.cls} {`);
    }
  });
});

describe('what only some looks have', () => {
  it('is named for them: the way past the bar is Day Studio’s, and its sheet draws it', () => {
    expect(looksWith((t) => t.chrome.skip)).toBe('day-studio');
    expect(looksWith(() => true).split(' ')).toEqual(THEMES.map((t) => t.id));
    expect(looksWith(() => false)).toBe('');
    for (const t of THEMES) expect(read(`../src/themes/${t.id}/styles.css`).includes('.skip {'), t.id).toBe(t.chrome.skip);
    // (under any other look it is not there: the shared sheet's rule for data-themes)
    expect(read('../src/themes/base.css')).toMatch(/\[data-themes\]:not\(\[data-themes~='night-bench'\]\)/);
  });
});

describe('the Notes page’s words', () => {
  const KEYS = ['sympathetic', 'still', 'keySounds', 'keyLost', 'wave', 'slides', 'pool', 'light', 'wires', 'chosen'];

  it('every look has all of them, and the page sets every one into a sentence', () => {
    for (const t of THEMES) {
      const w = wordsOf(t.id);
      expect(Object.keys(w).sort(), t.id).toEqual([...KEYS].sort());
      for (const k of KEYS) expect((w as unknown as Record<string, string>)[k].trim().length, `${t.id} ${k}`).toBeGreaterThan(0);
    }
    const used = new Set([...read('../src/views/notes.ts').matchAll(/\$\{w\.(\w+)\}/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual([...KEYS].sort());
  });

  it('Night Bench’s are the page’s as it was written', () => {
    expect(wordsOf('night-bench')).toEqual({ sympathetic: 'glow amber', still: 'dark', keySounds: 'lights', keyLost: 'dark', wave: 'glows', slides: 'light up', pool: 'pool', light: 'under a studio light', wires: 'moving and glowing as they sound', chosen: 'lit' });
    const src = read('../src/views/notes.ts');
    const w = wordsOf('night-bench') as unknown as Record<string, string>;
    const said = src.replace(/\$\{w\.(\w+)\}/g, (_, k: string) => w[k]);
    for (const s of ['On the stage they glow amber exactly as much as they really move', 'stays dark under a bass note', 'The keyboard lights only the notes the engine is really sounding', 'its standing wave glows inside the tube', 'the valve slides light up when the air goes through them', 'the room is the pool of light on the floor', 'physically based materials under a studio light, the strings drawn as wires of their real gauges, moving and glowing as they sound.', 'the instruments lit on the fallboard']) expect(said).toContain(s);
  });

  it('a look that is not lit says so: daylight’s strings are drawn, its room a patch, no glow', () => {
    const d = wordsOf('day-studio');
    for (const s of Object.values(d)) expect(s).not.toMatch(/glow|\blit\b|light up|dark/);
    expect(d.pool).toBe('patch');
    expect(wordsOf('evening-hall').light).toContain('spotlight');
    expect(wordsOf('night-gallery').light).toContain('gallery');
  });
});

describe('the 404 page’s sheet', () => {
  const css = read('../src/not-found.css');
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('begins with the bench’s rules, which are also a page’s whose script never ran', () => {
    const bench = themeOf('night-bench');
    const root = /(^|\n):root \{([\s\S]*?)\n\}/.exec(rules)![2];
    expect(root).toContain(`--ground: ${bench.ink.ground};`);
    expect(root).toContain('color-scheme: dark;');
    // (its type: the serif italic word, the mono line)
    expect(rules).toMatch(/\n\.nf-word \{[^}]*font: italic 400[^}]*var\(--serif\)/);
    expect(rules).toMatch(/\n\.nf-line \{[^}]*var\(--mono\)/);
  });

  it('then each other look’s tokens and rules, every one of them under that look alone', () => {
    const first = rules.indexOf(":root[data-theme='");
    expect(first).toBeGreaterThan(0);
    const after = rules.slice(first);
    for (const t of THEMES) {
      if (t.id === DEFAULT_THEME) {
        expect(after, 'the bench has no block: its rules are the sheet’s own').not.toContain(`[data-theme='${t.id}']`);
        continue;
      }
      const block = new RegExp(`:root\\[data-theme='${t.id}'\\] \\{([\\s\\S]*?)\\n\\}`).exec(after);
      expect(block, t.id).not.toBeNull();
      expect(block![1], t.id).toContain(`--ground: ${t.ink.ground};`);
      expect(block![1], t.id).toContain(`color-scheme: ${t.scheme};`);
    }
    // (after the bench's rules nothing is said to every look at once)
    let n = 0;
    for (const m of after.matchAll(/(^|[{}])\s*([^{}]+?)\s*\{/g)) {
      // (a width or a preference asked about is no rule of its own)
      if (m[2].startsWith('@media')) continue;
      for (const sel of m[2].split(',')) expect(sel.trim(), sel).toMatch(/^:root\[data-theme='[a-z-]+'\]/);
      n++;
    }
    expect(n).toBeGreaterThan(40);
  });

  it('the line’s words are one box for the look that lays the line out as lamp and words', () => {
    expect(read('../404.html')).toContain('<span class="nf-said">404 · <span id="nf-path">nothing</span> plays at this address</span>');
    expect(rules).toMatch(/\n\.nf-said \{\s*display: contents;/);
    expect(rules).toMatch(/:root\[data-theme='day-studio'\] \.nf-said \{\s*display: inline;/);
  });
});

describe('a change of theme', () => {
  it('is the chrome’s too: the pointer a knob is painted with is the new look’s', () => {
    setTheme('night-gallery', false);
    expect(theme().chrome.knobPointer).toEqual([5.5, 10.5]);
    setTheme('night-bench', false);
    expect(theme().chrome.knobPointer).toEqual([0, 9]);
  });
});
