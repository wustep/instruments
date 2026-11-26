// The themes at build time (src/themes): each theme's sheets scoped to it, and the page's boot script.
// Used by vite.config.ts; `scopeSelector` and `bootScript` are also what the unit tests read
// (test/themes.test.ts).
import type { Plugin } from 'vite';
import { DEFAULT_THEME, THEMES, THEME_KEY } from './src/themes/index.ts';

// Each theme has its own sheets, written as if it were the only look: `themeScope`
// makes every rule of a file under src/themes/<id>/ apply only under <html data-theme="<id>">. The scope is
// a `:where(...)`, which weighs nothing: each rule keeps the specificity it was written with, so a sheet
// brought in whole behaves as it did alone. A rule on the root itself (`:root`, `html`) is scoped on it;
// any other, under it. A sheet's @keyframes are named for its theme, so two looks may each have a `pulse`.
const THEME_SHEET = /\/src\/themes\/([a-z-]+)\/[^/]+\.css$/;
type CssNode = { type: string; name?: string; params?: string; prop?: string; value?: string; selectors?: string[]; parent?: CssNode };
type CssRoot = { source?: { input: { file?: string } }; walkAtRules(f: (n: CssNode) => void): void; walkRules(f: (n: CssNode) => void): void; walkDecls(f: (n: CssNode) => void): void };
export function scopeSelector(sel: string, id: string): string {
  const where = `:where([data-theme="${id}"])`;
  const s = sel.trim();
  if (/^:root(?![\w-])/.test(s)) return s.replace(/^:root/, `:root${where}`);
  if (/^html(?![\w-])/.test(s)) return s.replace(/^html/, `html${where}`);
  return `${where} ${s}`;
}
export function themeScope() {
  return {
    postcssPlugin: 'theme-scope',
    Once(root: CssRoot) {
      const id = THEME_SHEET.exec((root.source?.input.file ?? '').replace(/\\/g, '/'))?.[1];
      if (!id || !THEMES.some((t) => t.id === id)) return;
      const frames = new Set<string>();
      root.walkAtRules((a) => {
        if (/keyframes$/.test(a.name ?? '') && a.params) {
          frames.add(a.params);
          a.params = `${id}-${a.params}`;
        }
      });
      root.walkRules((r) => {
        if (r.parent?.type === 'atrule' && /keyframes$/.test(r.parent.name ?? '')) return;
        r.selectors = (r.selectors ?? []).map((s) => scopeSelector(s, id));
      });
      if (frames.size) {
        const names = new RegExp(`(^|[\\s,])(${[...frames].map((f) => f.replace(/[^\w-]/g, '\\$&')).join('|')})(?=$|[\\s,])`, 'g');
        root.walkDecls((d) => {
          if (d.prop === 'animation' || d.prop === 'animation-name') d.value = (d.value ?? '').replace(names, `$1${id}-$2`);
        });
      }
    },
  };
}

// The device's theme is on <html> before anything is painted: the first thing in the head of both pages
// (the app, and the 404) is this script, written here from the registry (src/themes/index.ts), so the
// sheet that applies from the first paint is that theme's and nothing flashes. A first visit, or a
// choice it does not know, is the default's; the browser's own chrome (theme-color) follows (under the
// default it is left as each page has it written: the app's bar, the 404's ground).
export function bootScript(): string {
  const bars = Object.fromEntries(THEMES.map((t) => [t.id, t.bar]));
  return `(function(){var b=${JSON.stringify(bars)},t=${JSON.stringify(DEFAULT_THEME)};try{var s=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(s&&b.hasOwnProperty(s))t=s}catch(e){}document.documentElement.dataset.theme=t;if(t!==${JSON.stringify(DEFAULT_THEME)})document.addEventListener('DOMContentLoaded',function(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',b[t])})})();`;
}
export function themeBoot(): Plugin {
  return {
    name: 'theme-boot',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{ tag: 'script', children: bootScript(), injectTo: 'head-prepend' }],
    },
  };
}
