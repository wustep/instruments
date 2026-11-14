// The tuba's limiter at loud dynamics, register by register, beside the other brass: for each held note (1 s)
// the most the limiter takes off (dB), when (in the attack's first 150 ms or the body after it), and the note's
// loudness as played (the loudest 400 ms, LUFS: room, limiter, PLAYBACK_DB). Summarised per octave.
//   npx tsx scripts/tuba-limiter.ts [--engine <core/index.ts>] [--only tuba,horn] [--vel 70,112,127] [--step 1] [--notes] [--params '{"volume":0.6}']
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { kWeight } from './audio-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const E = (await import(opt('--engine') ? pathToFileURL(resolve(opt('--engine')!)).href : '../packages/engine/src/core/index.ts')) as typeof import('../packages/engine/src/core/index.ts');
const FS = 48000;
const only = (opt('--only') ?? 'horn,trumpet,trombone,tuba').split(',') as (typeof E.INSTRUMENT_IDS)[number][];
const vels = (opt('--vel') ?? '70,112,127').split(',').map(Number);
const step = Number(opt('--step') ?? 1);
const params = opt('--params') ? JSON.parse(opt('--params')!) : undefined;
/** the loudest 400 ms, LUFS (as levels-compass.ts, whose import would run it) */
function momentaryMax(L: Float32Array, R: Float32Array, fs: number): number {
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
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
for (const id of only) {
  const info = E.INSTRUMENT_INFO[id];
  console.log(`\n${id}: limiter's most (dB), attack/body · LUFS as played`);
  for (const vel of vels) {
    const byOct = new Map<number, { gr: number; body: number; lufs: number }[]>();
    const notes: string[] = [];
    for (let m = info.lo; m <= info.hi; m += step) {
      const core = E.createCore({ sampleRate: FS, instrument: id, params });
      const on = Math.round(0.05 * FS);
      core.schedule({ type: 'noteOn', midi: m, velocity: vel }, on);
      core.schedule({ type: 'noteOff', midi: m }, Math.round(1.05 * FS));
      const n = Math.round(1.4 * FS);
      const L = new Float32Array(n), R = new Float32Array(n);
      const l = new Float32Array(128), r = new Float32Array(128);
      let att = 1, body = 1;
      for (let i = 0; i < n; i += 128) {
        core.process(l, r, 128);
        L.set(l.subarray(0, Math.min(128, n - i)), i); R.set(r.subarray(0, Math.min(128, n - i)), i);
        const g = (core as unknown as { limiter: { reduction: number } }).limiter.reduction;
        if (i < on + 0.15 * FS) att = Math.min(att, g); else body = Math.min(body, g);
      }
      const gr = -20 * Math.log10(Math.min(att, body)), grb = -20 * Math.log10(body);
      const o = Math.floor(m / 12) - 1;
      byOct.set(o, [...(byOct.get(o) ?? []), { gr, body: grb, lufs: momentaryMax(L, R, FS) }]);
      notes.push(`${E.midiName(m)} ${gr.toFixed(1)}`);
    }
    const all = [...byOct.values()].flat();
    console.log(`  v${String(vel).padEnd(4)}` + [...byOct.entries()].map(([o, v]) => `oct ${o}: ${Math.max(...v.map((x) => x.gr)).toFixed(1)}/${Math.max(...v.map((x) => x.body)).toFixed(1)} · ${med(v.map((x) => x.lufs)).toFixed(1)}`).join('   ') + `   | worst ${Math.max(...all.map((x) => x.gr)).toFixed(1)}, median LUFS ${med(all.map((x) => x.lufs)).toFixed(1)}`);
    if (args.includes('--notes')) console.log('        ' + notes.join('  '));
  }
}
