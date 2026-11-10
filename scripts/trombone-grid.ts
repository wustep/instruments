// Register survey over a set of voicings, in parallel (a worker per core): for each voicing, how many notes of
// a size's compass at pp/mf/ff settle on their partial (scripts/trombone-regimes.ts), and the misses.
//   npx tsx scripts/trombone-grid.ts --grid '[{"lipQ":5},{"lipQ":20}]' [--size tenor] [--fs 44100] [--dur 1.2] [--every 1]
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { regime } from './trombone-regimes.ts';
import { TROMBONE_SIZES, type TromboneSize } from '../packages/engine/src/core/trombone.ts';

interface Job { k: number; m: number; vel: number; fs: number; size: TromboneSize; voice: object; dur: number }
if (!isMainThread && workerData?.tgrid) {
  parentPort!.on('message', (jobs: Job[]) => parentPort!.postMessage(jobs.map((j) => ({ k: j.k, m: j.m, vel: j.vel, fs: j.fs, r: regime(j.m, j.vel, j.fs, j.size, j.voice, j.dur) }))));
}

export async function survey(voices: object[], opt: { size?: TromboneSize; fss?: number[]; dur?: number; every?: number; vels?: number[] } = {}) {
  const size = opt.size ?? 'tenor';
  const B = TROMBONE_SIZES[size];
  const fss = opt.fss ?? [44100];
  const vels = opt.vels ?? [30, 70, 112];
  const jobs: Job[] = [];
  voices.forEach((voice, k) => {
    for (const fs of fss) for (const vel of vels) for (let m = B.lo; m <= B.hi; m += opt.every ?? 1) jobs.push({ k, m, vel, fs, size, voice, dur: opt.dur ?? 1.2 });
  });
  const n = Math.max(1, cpus().length - 2);
  const pool = Array.from({ length: n }, () => new Worker(new URL(import.meta.url), { workerData: { tgrid: true }, execArgv: ['--import', 'tsx'] }));
  const res: { k: number; m: number; vel: number; fs: number; r: string }[] = [];
  await Promise.all(pool.map((w, i) => new Promise<void>((resolve) => {
    w.once('message', (out) => { res.push(...out); resolve(); });
    w.postMessage(jobs.filter((_, j) => j % n === i));
  })));
  for (const w of pool) void w.terminate();
  return voices.map((voice, k) => {
    const mine = res.filter((x) => x.k === k).sort((a, b) => a.fs - b.fs || a.vel - b.vel || a.m - b.m);
    const ok = mine.filter((x) => x.r === '1').length;
    const rows = fss.flatMap((fs) => vels.map((vel) => `${fs === 44100 ? '' : fs + ' '}v${vel}: ` + mine.filter((x) => x.fs === fs && x.vel === vel).map((x) => x.r === '1' ? '·' : x.r === '.' ? '_' : x.r === 'x' ? 'x' : x.r.replace('+', '').replace('-', '−')).join('')));
    return { voice, ok, tot: mine.length, rows };
  });
}

if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const grid = JSON.parse(opt('--grid') ?? '[{}]');
  const out = await survey(grid, { size: (opt('--size') ?? 'tenor') as TromboneSize, fss: (opt('--fs') ?? '44100').split(',').map(Number), dur: +(opt('--dur') ?? 1.2), every: +(opt('--every') ?? 1), vels: opt('--vel')?.split(',').map(Number) });
  out.sort((a, b) => b.ok - a.ok);
  for (const o of out.slice(0, +(opt('--top') ?? 12))) {
    console.log(`${o.ok}/${o.tot} ${JSON.stringify(o.voice)}`);
    if (args.includes('--rows')) for (const r of o.rows) console.log('   ' + r);
  }
}
