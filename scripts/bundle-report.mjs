// The web app's chunks and what fills them: each chunk's size (minified, gzip) and its largest source
// modules (rendered bytes, after tree shaking). A production build into a scratch folder.
//   node scripts/bundle-report.mjs [--top 25] [--out dir]
import { build } from 'vite';
import { gzipSync } from 'node:zlib';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const top = Number(process.argv[process.argv.indexOf('--top') + 1] || 25);
const outDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : mkdtempSync(join(tmpdir(), 'bundle-'));
const report = [];
await build({
  root: 'apps/web',
  configFile: 'apps/web/vite.config.ts',
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true },
  plugins: [
    {
      name: 'bundle-report',
      generateBundle(_, bundle) {
        for (const c of Object.values(bundle)) {
          if (c.type !== 'chunk') continue;
          const mods = Object.entries(c.modules)
            .map(([id, m]) => [relative(process.cwd(), id.replace(/^\0/, '')).replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, ''), m.renderedLength])
            .sort((a, b) => b[1] - a[1]);
          report.push({ name: c.fileName, bytes: c.code.length, gz: gzipSync(c.code).length, entry: c.isEntry, dynamic: c.isDynamicEntry, mods });
        }
      },
    },
  ],
});
for (const c of report.sort((a, b) => b.bytes - a.bytes)) {
  console.log(`\n${c.name}  ${(c.bytes / 1024).toFixed(1)} kB  gz ${(c.gz / 1024).toFixed(1)} kB${c.entry ? '  (entry)' : c.dynamic ? '  (lazy)' : ''}`);
  for (const [id, n] of c.mods.slice(0, top)) console.log(`  ${(n / 1024).toFixed(1).padStart(7)} kB  ${id}`);
}
