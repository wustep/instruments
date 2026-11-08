// Download the reference subset on demand into .cache/iowa (gitignored) and
// convert AIFF -> WAV with ffmpeg. Usage: pnpm refs:fetch [--all]
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, DYNAMICS, REF_KEYS, available, ensureDirs, iowaName, url, wavPath, type Dyn } from './references.ts';

ensureDirs();
const keys = process.argv.includes('--all') ? Array.from({ length: 88 }, (_, i) => 21 + i) : REF_KEYS;
const jobs: { m: number; d: Dyn }[] = [];
for (const m of keys) for (const d of DYNAMICS) if (available(m, d) && !existsSync(wavPath(m, d))) jobs.push({ m, d });
console.log(`${jobs.length} files to fetch into ${CACHE}`);

async function one({ m, d }: { m: number; d: Dyn }): Promise<void> {
  const aiff = join(CACHE, 'aiff', `Piano.${d}.${iowaName(m)}.aiff`);
  if (!existsSync(aiff) || statSync(aiff).size < 10000) {
    const res = await fetch(url(m, d), { headers: { 'User-Agent': 'piano-model-calibration' } });
    if (!res.ok) throw new Error(`${res.status} ${url(m, d)}`);
    writeFileSync(aiff, Buffer.from(await res.arrayBuffer()));
  }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-c:a', 'pcm_s16le', wavPath(m, d)]);
  process.stdout.write(`${d}.${iowaName(m)} `);
}

const queue = jobs.slice();
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const j = queue.shift()!;
      try {
        await one(j);
      } catch (e) {
        console.error(`\nfailed ${j.d}.${iowaName(j.m)}: ${(e as Error).message}`);
      }
    }
  }),
);
console.log('\ndone');
