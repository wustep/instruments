import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import { computeDesigns } from '../../packages/engine/src/core/precompute.ts';
import { DEFAULT_THEME, THEMES, THEME_KEY } from './src/themes/index.ts';

// The piano's string filter designs (dispersion all-pass chains for 88 keys × 2
// polarisations) take ~0.35 s of CPU on a fast machine and several seconds on a
// slow one. They are computed here, at build time, for the two pianos the stage offers
// (the grand, and the upright: its own used to be designed in the page the first time it
// was asked for, a second of long tasks on a computer and three to four on a phone) at
// the two common sample rates and shipped as static files, so starting a piano costs the
// audio thread a few milliseconds and changing to the other one nothing. Content-hashed
// names keep a stale cache from pairing old designs with a newer engine.
const RATES = [44100, 48000];
const SHIPPED = ['grand', 'upright'];
function pianoDesigns(): Plugin {
  const files = new Map<string, { name: string; json: string }>();
  const make = async (preset: string, fs: number) => {
    let f = files.get(`${preset}:${fs}`);
    if (!f) {
      const json = JSON.stringify(await computeDesigns(preset, {}, fs));
      const hash = createHash('sha256').update(json).digest('hex').slice(0, 10);
      f = { name: `designs/${preset}-${fs}.${hash}.json`, json };
      files.set(`${preset}:${fs}`, f);
    }
    return f;
  };
  let build = false;
  return {
    name: 'piano-designs',
    configResolved(c) {
      build = c.command === 'build';
    },
    resolveId: (id) => (id === 'virtual:piano-designs' ? '\0virtual:piano-designs' : null),
    async load(id) {
      if (id !== '\0virtual:piano-designs') return null;
      // (the default export: the grand's, by rate, as ever; `byPreset`: each shipped piano's)
      const byPreset: Record<string, Record<number, string>> = {};
      for (const preset of SHIPPED) {
        byPreset[preset] = {};
        for (const fs of RATES) {
          const f = await make(preset, fs);
          if (build) this.emitFile({ type: 'asset', fileName: f.name, source: f.json });
          byPreset[preset][fs] = `/${f.name}`;
        }
      }
      return `export default ${JSON.stringify(byPreset.grand)};\nexport const byPreset = ${JSON.stringify(byPreset)};`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/designs\/(grand|upright)-(\d+)\./);
        if (!m) return next();
        res.setHeader('content-type', 'application/json');
        res.end((await make(m[1], Number(m[2]))).json);
      });
    },
  };
}

// The Notes and the Measurements are their own chunks (main.ts `lazyView`), so the stage's first load
// does not carry them. Opened first (a link to /notes), the page would ask for its chunk only once the
// main one had run: here the page starts both at once.
function preloadPages(): Plugin {
  return {
    name: 'preload-pages',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.filename.endsWith('index.html')) return [];
        const file = (name: string) => Object.values(ctx.bundle ?? {}).find((c) => c.type === 'chunk' && c.isDynamicEntry && c.facadeModuleId?.endsWith(`/views/${name}.ts`))?.fileName;
        const pages = { notes: file('notes'), measurements: file('measure') };
        if (!pages.notes || !pages.measurements) return [];
        const js = `(function(){var m=location.pathname.match(/^\\/(notes|measurements)\\/?$/);if(!m)return;var l=document.createElement('link');l.rel='modulepreload';l.href=${JSON.stringify(`/${pages.notes}`)};if(m[1]==='measurements')l.href=${JSON.stringify(`/${pages.measurements}`)};document.head.appendChild(l);})();`;
        return [{ tag: 'script', children: js, injectTo: 'head' }];
      },
    },
  };
}

// The themes (src/themes). Each has its own sheets, written as if it were the only look: `themeScope`
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
function themeScope() {
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
// choice it does not know, is the default's; the browser's own chrome (theme-color) follows.
function themeBoot(): Plugin {
  const bars = Object.fromEntries(THEMES.map((t) => [t.id, t.bar]));
  const js = `(function(){var b=${JSON.stringify(bars)},t=${JSON.stringify(DEFAULT_THEME)};try{var s=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(s&&b[s])t=s}catch(e){}document.documentElement.dataset.theme=t;document.addEventListener('DOMContentLoaded',function(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',b[t])})})();`;
  return {
    name: 'theme-boot',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{ tag: 'script', children: js, injectTo: 'head-prepend' }],
    },
  };
}

export default defineConfig({
  plugins: [pianoDesigns(), preloadPages(), themeBoot()],
  css: { postcss: { plugins: [themeScope()] } },
  // Safari 14.1 is the first WebKit with AudioWorklet; the worklet bundle is lowered to what it
  // parses, and `pnpm build` checks that (scripts/check-worklet-syntax.mjs)
  // (the 3D stage — three.js — is its own chunk, loaded only when 3D is switched on)
  // (two pages: the app, and 404.html, what the host serves for an address that is none of the app's)
  build: { target: ['es2020', 'safari14'], sourcemap: false, chunkSizeWarningLimit: 800, rolldownOptions: { input: { index: 'index.html', '404': '404.html' } } },
  worker: { format: 'es' },
  server: { port: 5199, strictPort: false },
  preview: { port: 4199 },
});
