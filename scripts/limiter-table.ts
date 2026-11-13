// How hard each instrument drives its own limiter (post.ts Limiter: instant attack, 180 ms release) when it
// is played loud, alone: a held note of 1 s on every third note of the compass at three loud velocities; the
// most the limiter takes off (dB) and on how many of the notes it takes more than 1 dB. A limiter that works
// on a single loud note ducks it: the note's body sinks under its own attack, and fortissimo is no louder
// than forte.
//   npx tsx scripts/limiter-table.ts [--engine <core/index.ts>] [--only tuba,trombone] [--vel 100,115,127] [--step 3]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const E = (await import(opt('--engine') ? pathToFileURL(resolve(opt('--engine')!)).href : '../packages/engine/src/core/index.ts')) as typeof import('../packages/engine/src/core/index.ts');
const FS = 48000;
const only = opt('--only')?.split(',');
const vels = (opt('--vel') ?? '100,115,127').split(',').map(Number);
const step = Number(opt('--step') ?? 3);
for (const id of E.INSTRUMENT_IDS) {
  if (only && !only.includes(id)) continue;
  const info = E.INSTRUMENT_INFO[id];
  const cells: string[] = [];
  for (const vel of vels) {
    let worst = 0, worstAt = info.lo, over = 0, n = 0;
    for (let m = info.lo; m <= info.hi; m += step) {
      const core = E.createCore({ sampleRate: FS, instrument: id });
      core.schedule({ type: 'noteOn', midi: m, velocity: vel }, Math.round(0.05 * FS));
      core.schedule({ type: 'noteOff', midi: m }, Math.round(1.05 * FS));
      const L = new Float32Array(128), R = new Float32Array(128);
      let minG = 1;
      for (let i = 0; i < 1.4 * FS; i += 128) {
        core.process(L, R, 128);
        const g = (core as unknown as { limiter: { reduction: number } }).limiter.reduction;
        if (g < minG) minG = g;
      }
      const db = -20 * Math.log10(minG);
      n++;
      if (db > 1) over++;
      if (db > worst) { worst = db; worstAt = m; }
    }
    cells.push(`v${vel}: ${worst.toFixed(1).padStart(4)} dB at ${E.midiName(worstAt).padEnd(3)} (${String(over).padStart(2)}/${n} over 1 dB)`);
  }
  console.log(`${id.padEnd(13)} ${cells.join('   ')}`);
}
