// Flexible decay sweep: each case is a JSON patch over the calibration (and optional
// design/params). Prints per-key median (partials 1-3) model/ref ratios of early and
// late T60, plus register medians as computed by calibrate.ts.
//   npx tsx scripts/sweep2.ts cases.json [--keys 33,37,41]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { analyzeNote, type NoteAnalysis } from '../packages/engine/src/analysis/index.ts';
import { DEFAULT_CALIBRATION as C, PRESETS, referenceB, renderNote, type Calibration } from '../packages/engine/src/core/index.ts';
import { CACHE, REF_KEYS, available } from './references.ts';

interface Case { name: string; cal?: Partial<Calibration>; design?: Record<string, unknown>; params?: Record<string, unknown> }

function evalCase(c: Case, m: number, d: 'mf' | 'ff'): NoteAnalysis {
  Object.assign(PRESETS.grand, c.design ?? {});
  const cal = { ...C, ...(c.cal ?? {}) } as Calibration;
  const dur = m < 48 ? 22 : m < 72 ? 18 : m < 90 ? 12 : 8;
  const r = renderNote(m, d === 'mf' ? 70 : 112, dur, { sampleRate: 44100, dry: true, calibration: cal, params: { ...(c.params ?? {}) } as never });
  return analyzeNote([r.left, r.right], 44100, m, { Bguess: referenceB(m, C), maxDur: 30 });
}

if (!isMainThread) {
  const { c, m, d } = workerData as { c: Case; m: number; d: 'mf' | 'ff' };
  parentPort!.postMessage(evalCase(c, m, d));
} else {
  const ref: Record<string, NoteAnalysis | null> = JSON.parse(readFileSync(join(CACHE, 'analysis-v3.json'), 'utf8'));
  const cases: Case[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const ki = process.argv.indexOf('--keys');
  const KEYS = ki >= 0 ? process.argv[ki + 1].split(',').map(Number) : REF_KEYS;
  const jobs = cases.flatMap((c) => KEYS.map((m) => ({ c, m, d: (available(m, 'mf') ? 'mf' : 'ff') as 'mf' | 'ff' })));
  const out = new Map<string, NoteAnalysis>();
  const q = jobs.slice();
  await Promise.all(Array.from({ length: Math.min(q.length, cpus().length - 2) }, async () => {
    while (q.length) {
      const j = q.shift()!;
      const a = await new Promise<NoteAnalysis>((res, rej) => {
        const w = new Worker(new URL(import.meta.url), { workerData: j, execArgv: ['--import', 'tsx'] });
        w.on('message', res);
        w.on('error', rej);
      });
      out.set(`${j.c.name}|${j.m}`, a);
    }
  }));
  const med = (xs: number[]) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  const bins: [string, number, number][] = [['A0-B1', 21, 35], ['C2-B3', 36, 59], ['C4-B5', 60, 83], ['C6-C8', 84, 108]];
  for (const c of cases) {
    const pairs: { m: number; w: 'e' | 'l'; v: number }[] = [];
    const cols = KEYS.map((m) => {
      const d = available(m, 'mf') ? 'mf' : 'ff';
      const r = ref[`ref:${m}:${d}`];
      const a = out.get(`${c.name}|${m}`)!;
      const ratios = (w: 'e' | 'l') => [1, 2, 3].map((k) => {
        const rd = r?.decays.find((x) => x.k === k);
        const md = a.decays.find((x) => x.k === k);
        if (!rd || !md) return NaN;
        const v = Math.log2((w === 'e' ? md.t60Early : md.t60Late) / (w === 'e' ? rd.t60Early : rd.t60Late));
        if (Number.isFinite(v)) pairs.push({ m, w, v });
        return v;
      });
      return `${m}:${Math.pow(2, med(ratios('e'))).toFixed(2)}/${Math.pow(2, med(ratios('l'))).toFixed(2)}`;
    });
    const regs = bins.map(([n, lo, hi]) => `${n} ${Math.pow(2, med(pairs.filter((p) => p.w === 'e' && p.m >= lo && p.m <= hi).map((p) => p.v))).toFixed(2)}/${Math.pow(2, med(pairs.filter((p) => p.w === 'l' && p.m >= lo && p.m <= hi).map((p) => p.v))).toFixed(2)}`);
    console.log(`${c.name}\n   ${cols.join('  ')}\n   ${regs.join('  ')}`);
  }
}
