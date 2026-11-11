// The audio thread's cost of a note-on: each key struck twice (two passes over the keyboard), the time
// of the 128-frame block that holds each strike, against the median block's. A block over the budget
// (128 frames at the rate: 2.67 ms at 48 kHz) is a dropout risk on its own; with other instruments on
// the same audio thread (the Orchestra), less is enough.
//   npx tsx scripts/audio-cpu.ts [--instrument piano] [--preset grand] [--engine <core/index.ts>] [--step 1]
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts')));
const eng = (await import(pathToFileURL(ENGINE).href)) as typeof import('../packages/engine/src/core/index.ts');
const inst = opt('--instrument', 'piano');
const preset = opt('--preset', inst === 'piano' ? 'grand' : '');
const STEP = Number(opt('--step', '1'));
const FS = Number(opt('--fs', '48000'));
const info = eng.INSTRUMENT_INFO[inst as keyof typeof eng.INSTRUMENT_INFO];
const core = eng.createCore({ sampleRate: FS, instrument: inst as never, preset: preset || undefined });
const bl = new Float32Array(128), br = new Float32Array(128);
const run = (blocks: number) => {
  const ts: number[] = [];
  for (let b = 0; b < blocks; b++) {
    const t0 = performance.now();
    core.process(bl, br, 128);
    ts.push(performance.now() - t0);
  }
  return ts;
};
// warm the JIT on a few notes first
run(400);
const passes: { m: number; ms: number }[][] = [[], []];
const all: number[] = [];
for (let pass = 0; pass < 2; pass++) {
  for (let m = info.lo; m <= info.hi; m += STEP) {
    core.schedule({ type: 'noteOn', midi: m, velocity: 96 }, core.frame + 64);
    core.schedule({ type: 'noteOff', midi: m }, core.frame + Math.round(0.08 * FS));
    const ts = run(Math.round((0.1 * FS) / 128));
    all.push(...ts);
    passes[pass].push({ m, ms: Math.max(ts[0], ts[1]) });
  }
}
const sorted = [...all].sort((a, b) => a - b);
const med = sorted[sorted.length >> 1];
const budget = (128 / FS) * 1000;
for (const [i, p] of passes.entries()) {
  const s = [...p].sort((a, b) => b.ms - a.ms);
  const over = p.filter((x) => x.ms > budget).length;
  console.log(`${inst}${preset ? ' ' + preset : ''} pass ${i + 1}: strike block median ${[...p].sort((a, b) => a.ms - b.ms)[p.length >> 1].ms.toFixed(3)} ms, worst ${s.slice(0, 5).map((x) => `m${x.m} ${x.ms.toFixed(2)}`).join(', ')} ms; ${over} over the ${budget.toFixed(2)} ms budget (all blocks' median ${med.toFixed(3)} ms)`);
}
