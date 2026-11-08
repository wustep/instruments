import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import { computeDesigns } from '../../packages/engine/src/core/precompute.ts';

// The piano's string filter designs (dispersion all-pass chains for 88 keys × 2
// polarisations) take ~0.35 s of CPU on a fast machine and several seconds on a
// slow one. They are computed here, at build time, for the default grand at the two
// common sample rates and shipped as static files, so starting the piano costs the
// audio thread a few milliseconds. Content-hashed names keep a stale cache from
// pairing old designs with a newer engine.
const RATES = [44100, 48000];
function pianoDesigns(): Plugin {
  const files = new Map<number, { name: string; json: string }>();
  const make = async (fs: number) => {
    let f = files.get(fs);
    if (!f) {
      const json = JSON.stringify(await computeDesigns('grand', {}, fs));
      const hash = createHash('sha256').update(json).digest('hex').slice(0, 10);
      f = { name: `designs/grand-${fs}.${hash}.json`, json };
      files.set(fs, f);
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
      const urls: Record<number, string> = {};
      for (const fs of RATES) {
        const f = await make(fs);
        if (build) this.emitFile({ type: 'asset', fileName: f.name, source: f.json });
        urls[fs] = `/${f.name}`;
      }
      return `export default ${JSON.stringify(urls)};`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/designs\/grand-(\d+)\./);
        if (!m) return next();
        res.setHeader('content-type', 'application/json');
        res.end((await make(Number(m[1]))).json);
      });
    },
  };
}

export default defineConfig({
  plugins: [pianoDesigns()],
  // Safari 14.1 is the first WebKit with AudioWorklet; the worklet bundle is lowered to what it
  // parses, and `pnpm build` checks that (scripts/check-worklet-syntax.mjs)
  build: { target: ['es2020', 'safari14'], sourcemap: false },
  worker: { format: 'es' },
  server: { port: 5199, strictPort: false },
  preview: { port: 4199 },
});
