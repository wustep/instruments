// Voicing pass for the trombone model: play every note of each size (vibrato off, mf), measure the sounding
// pitch (autocorrelation, 0.6–0.95 s), and store the correction in cents per size and sample rate (it moves
// the slide and the lips by as much: a player tuning with the slide). Three iterations converge to about a
// cent. Run after any change to the voicing: npx tsx scripts/tune-trombone.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { TromboneCore, TROMBONE_SIZES, TROMBONE_SIZE_IDS, type TromboneSize } from '../packages/engine/src/core/trombone.ts';

const OUT = join(import.meta.dirname, '..', 'packages/engine/src/core/trombone-tuning.json');
const FSS = [22050, 44100, 48000, 96000];
type Table = Record<string, { fs: number[]; midi: number[]; cents: number[][] }>;

export function measureCents(fs: number, m: number, size: TromboneSize, vel = 70, voice?: object): number {
  const c = new TromboneCore({ sampleRate: fs, dry: true, params: { size, vibrato: 0, noise: 0, human: 0, ...(voice ? { voice } : {}) } as never });
  c.schedule({ type: 'noteOn', midi: m, velocity: vel }, 64);
  const n = Math.round((1.1 * fs) / 128) * 128;
  const L = new Float32Array(n);
  const bl = new Float32Array(128);
  const br = new Float32Array(128);
  for (let i = 0; i < n; i += 128) {
    c.process(bl, br, 128);
    L.set(bl, i);
  }
  const f = 440 * 2 ** ((m - 69) / 12);
  const s0 = Math.round(0.6 * fs);
  const W = Math.round(0.35 * fs);
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i < W; i++) s += L[s0 + i] * L[s0 + i + lag];
    return s;
  };
  const lo = Math.floor(fs / (f * 1.08));
  const hi = Math.ceil(fs / (f * 0.93));
  let best = -Infinity;
  let bl2 = lo;
  for (let lag = lo; lag <= hi; lag++) {
    const v = ac(lag);
    if (v > best) {
      best = v;
      bl2 = lag;
    }
  }
  const a = ac(bl2 - 1);
  const b = ac(bl2);
  const cc = ac(bl2 + 1);
  const p = (0.5 * (a - cc)) / (a - 2 * b + cc);
  return 1200 * Math.log2(fs / (bl2 + p) / f);
}

interface Job { size: TromboneSize; fs: number; m: number; table: Table; voice?: object }
if (!isMainThread && workerData?.tuneTbn) {
  parentPort!.on('message', (jobs: Job[]) => {
    TromboneCore.tuningTable = jobs[0]?.table ?? {};
    parentPort!.postMessage(jobs.map((j) => ({ ...j, table: undefined, err: measureCents(j.fs, j.m, j.size, 70, j.voice) })));
  });
}

/** measure every note of every size at every rate against `table`, in parallel */
export async function measureAll(table: Table, voice?: object): Promise<{ size: TromboneSize; fs: number; m: number; err: number }[]> {
  const jobs: Job[] = [];
  for (const size of TROMBONE_SIZE_IDS) for (const fs of FSS) for (let m = TROMBONE_SIZES[size].lo; m <= TROMBONE_SIZES[size].hi; m++) jobs.push({ size, fs, m, table, voice });
  const n = Math.max(1, cpus().length - 2);
  const pool = Array.from({ length: n }, () => new Worker(new URL(import.meta.url), { workerData: { tuneTbn: true }, execArgv: ['--import', 'tsx'] }));
  const out: { size: TromboneSize; fs: number; m: number; err: number }[] = [];
  await Promise.all(pool.map((w, i) => new Promise<void>((resolve) => {
    w.once('message', (r) => { out.push(...r); resolve(); });
    w.postMessage(jobs.filter((_, j) => j % n === i));
  })));
  for (const w of pool) void w.terminate();
  return out;
}

/** iterate the table to convergence */
export async function tune(voice?: object, iters = 3, log = true): Promise<Table> {
  let table: Table = {};
  for (let it = 0; it < iters; it++) {
    const res = await measureAll(table, voice);
    const next: Table = {};
    for (const size of TROMBONE_SIZE_IDS) {
      const B = TROMBONE_SIZES[size];
      const midi = Array.from({ length: B.hi - B.lo + 1 }, (_, i) => B.lo + i);
      next[size] = {
        fs: FSS,
        midi,
        cents: FSS.map((fs, fi) =>
          midi.map((m, mi) => {
            const err = res.find((r) => r.size === size && r.fs === fs && r.m === m)!.err;
            const prev = table[size]?.cents?.[fi]?.[mi] ?? 0;
            return Number.isFinite(err) && Math.abs(err) < 300 ? +(prev + err).toFixed(2) : prev;
          }),
        ),
      };
    }
    table = next;
    if (log) {
      const errs = res.map((r) => r.err).filter((e) => Number.isFinite(e) && Math.abs(e) < 300);
      console.log(`iteration ${it + 1}: RMS ${Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length).toFixed(1)} c, worst ${Math.max(...errs.map(Math.abs)).toFixed(1)} c`);
    }
  }
  return table;
}

if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const table = await tune(undefined, 4);
  writeFileSync(OUT, JSON.stringify(table) + '\n');
  const res = await measureAll(table);
  for (const size of TROMBONE_SIZE_IDS) for (const fs of FSS) console.log(`${size} @${fs} residual:`, res.filter((r) => r.size === size && r.fs === fs).sort((a, b) => a.m - b.m).map((r) => r.err.toFixed(0)).join(' '));
}
