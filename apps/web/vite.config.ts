import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import { computeDesigns } from '../../packages/engine/src/core/precompute.ts';

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

export default defineConfig({
  plugins: [pianoDesigns(), preloadPages()],
  // Safari 14.1 is the first WebKit with AudioWorklet; the worklet bundle is lowered to what it
  // parses, and `pnpm build` checks that (scripts/check-worklet-syntax.mjs)
  // (the 3D stage — three.js — is its own chunk, loaded only when 3D is switched on)
  // (two pages: the app, and 404.html, what the host serves for an address that is none of the app's)
  build: { target: ['es2020', 'safari14'], sourcemap: false, chunkSizeWarningLimit: 800, rolldownOptions: { input: { index: 'index.html', '404': '404.html' } } },
  worker: { format: 'es' },
  server: { port: 5199, strictPort: false },
  preview: { port: 4199 },
});
