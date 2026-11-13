// Every instrument's loudness note by note across its compass, as played (room, limiter, PLAYBACK_DB), at
// three dynamics: where one instrument, or one register of it, falls out of line with the others. One held
// note of 1.2 s each; the figure is the loudest 400 ms (momentary loudness, LUFS: BS.1770's K-weighting), so
// a struck note and a blown one read alike.
//   npx tsx scripts/levels-compass.ts [--engine <core/index.ts>] [--only flute,clarinet] [--step 3] [--vel 40,80,120]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { kWeight } from './audio-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const E = (await import(opt('--engine') ? pathToFileURL(resolve(opt('--engine')!)).href : '../packages/engine/src/core/index.ts')) as typeof import('../packages/engine/src/core/index.ts');
const FS = 48000;
const only = opt('--only')?.split(',');
const step = Number(opt('--step') ?? 3);
const vels = (opt('--vel') ?? '40,80,120').split(',').map(Number);
const params = opt('--params') ? JSON.parse(opt('--params')!) : undefined;

/** the loudest 400 ms, LUFS */
export function momentaryMax(L: Float32Array, R: Float32Array, fs: number): number {
  const kl = kWeight(L, fs), kr = kWeight(R, fs);
  const blk = Math.round(0.4 * fs), hop = Math.round(0.05 * fs);
  let best = 0;
  for (let a = 0; a + blk <= kl.length; a += hop) {
    let s = 0;
    for (let i = a; i < a + blk; i++) s += kl[i] * kl[i] + kr[i] * kr[i];
    if (s > best) best = s;
  }
  return -0.691 + 10 * Math.log10(best / blk + 1e-30);
}

const summary: string[] = [];
for (const id of E.INSTRUMENT_IDS) {
  if (only && !only.includes(id)) continue;
  const info = E.INSTRUMENT_INFO[id];
  console.log(`\n${id}  (${vels.map((v) => `v${v}`).join('  ')})`);
  const per: number[][] = vels.map(() => []);
  for (let m = info.lo; m <= info.hi; m += step) {
    const cells: string[] = [];
    vels.forEach((vel, k) => {
      const out = E.renderInstrument({ sampleRate: FS, instrument: id, params, events: [{ time: 0.1, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 1.3, event: { type: 'noteOff', midi: m } }], duration: 1.9 });
      const l = momentaryMax(out.left, out.right, FS);
      per[k].push(l);
      cells.push(l.toFixed(1).padStart(6));
    });
    console.log(`  ${E.midiName(m).padEnd(4)} ${cells.join(' ')}`);
  }
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
  summary.push(`${id.padEnd(13)} ${per.map((a) => `${med(a).toFixed(1).padStart(6)} (${Math.min(...a).toFixed(1)}…${Math.max(...a).toFixed(1)})`.padEnd(26)).join(' ')}`);
}
console.log(`\nmedian over the compass (lowest…highest note's), LUFS momentary max, ${vels.map((v) => `v${v}`).join(' / ')}\n${summary.join('\n')}`);
