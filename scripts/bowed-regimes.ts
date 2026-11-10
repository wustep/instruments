// How often a bowed note starts (or stays) in a wrong regime: every note of an instrument's lowest
// two octaves and a half at five velocities, 44.1 and 48 kHz, no vibrato, rendered dry; a note is
// faulty in a window when it is more than 15 ¢ off or its first two harmonics are both 20 dB under
// its strongest (a higher partial has taken over, or multiple slipping). Windows 0.35–0.85 s (a
// start) and 0.85–1.5 s (settled).
//   npx tsx scripts/bowed-regimes.ts [bass,cello] [--engine <other>/packages/engine/src/core/index.ts]
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

type Job = { inst: string; m: number; v: number; fs: number };
const LOW: Record<string, number> = { violin: 55, viola: 48, cello: 36, bass: 28 };

async function run(j: Job, engine: string) {
  const { renderInstrument } = await import(pathToFileURL(engine).href);
  const { analyzeSustained } = await import('../packages/engine/src/analysis/index.ts');
  const r = renderInstrument({ sampleRate: j.fs, instrument: j.inst, dry: true, params: { vibrato: 0 }, events: [{ time: 0.1, event: { type: 'noteOn', midi: j.m, velocity: j.v } }], duration: 1.5 });
  const x = r.left.map((s: number, i: number) => 0.5 * (s + r.right[i]));
  return {
    ...j,
    bad: [
      [0.35, 0.85],
      [0.85, 1.5],
    ].map(([a, b]) => {
      const s = analyzeSustained(x, j.fs, { start: Math.round(a * j.fs), end: Math.round(b * j.fs) }, j.m);
      return !(Math.abs(s.cents) < 15) || (s.harm[0] < -20 && s.harm[1] < -20);
    }),
  };
}

if (!isMainThread) {
  const res = [];
  for (const j of workerData.jobs) res.push(await run(j, workerData.engine));
  parentPort!.postMessage(res);
} else {
  const args = process.argv.slice(2);
  const engine = resolve(args.includes('--engine') ? args[args.indexOf('--engine') + 1] : join(import.meta.dirname, '../packages/engine/src/core/index.ts'));
  const insts = (args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--engine') + 1]) ?? 'bass,cello').split(',');
  const jobs: Job[] = [];
  for (const inst of insts) for (const fs of [44100, 48000]) for (let m = LOW[inst]; m <= LOW[inst] + 27; m++) for (const v of [30, 50, 70, 90, 110]) jobs.push({ inst, m, v, fs });
  const n = Math.max(1, cpus().length - 2);
  const parts = Array.from({ length: n }, (_, k) => jobs.filter((_, i) => i % n === k));
  const res = (
    await Promise.all(
      parts.map(
        (p) =>
          new Promise<(Job & { bad: boolean[] })[]>((ok, ko) => {
            const w = new Worker(new URL(import.meta.url), { workerData: { jobs: p, engine }, execArgv: ['--import', 'tsx'] });
            w.on('message', ok);
            w.on('error', ko);
          }),
      ),
    )
  ).flat();
  for (const inst of insts) {
    const r = res.filter((x) => x.inst === inst);
    const early = r.filter((x) => x.bad[0]);
    const late = r.filter((x) => x.bad[1]);
    console.log(`${inst}: ${r.length} notes; faulty 0.35–0.85 s ${early.length} (${((100 * early.length) / r.length).toFixed(1)} %), 0.85–1.5 s ${late.length} (${((100 * late.length) / r.length).toFixed(1)} %)`);
    console.log(`  still faulty after 0.85 s: ${late.map((x) => `${x.fs / 1000} kHz ${x.m}/${x.v}`).join(', ') || 'none'}`);
  }
}
