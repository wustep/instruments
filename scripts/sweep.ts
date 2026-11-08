// Parameter sweep against cached reference analyses (register medians of
// partial 1-3 early/late T60 ratios). Used between calibration rounds to pick
// physically meaningful levers before running the bounded fit.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { analyzeNote, type NoteAnalysis } from '../packages/engine/src/analysis/index.ts';
import { DEFAULT_CALIBRATION as C, PRESETS, renderNote, type Calibration } from '../packages/engine/src/core/index.ts';
import { CACHE } from './references.ts';

const KEYS = [29, 37, 45, 53, 61, 69, 77, 85, 93];
interface Case { name: string; cal: Calibration; design: Record<string, number>; params: Record<string, number> }

function evalCase(c: Case, m: number): NoteAnalysis {
  Object.assign(PRESETS.grand, c.design);
  const r = renderNote(m, 70, m < 50 ? 20 : 14, { sampleRate: 44100, dry: true, calibration: c.cal, params: { ...c.params, sympathetic: false } as never });
  return analyzeNote([r.left, r.right], 44100, m, { maxDur: 30 });
}

if (!isMainThread) {
  const { c, m } = workerData as { c: Case; m: number };
  parentPort!.postMessage(evalCase(c, m));
} else {
  const ref: Record<string, NoteAnalysis | null> = JSON.parse(readFileSync(join(CACHE, 'analysis-v3.json'), 'utf8'));
  const scale = (b: { midi: number[]; val: number[] }, f: number) => ({ midi: b.midi, val: b.val.map((v) => v * f) });
  const mk = (name: string, calMod: Partial<Calibration>, design: Record<string, number> = {}, params: Record<string, number> = {}): Case => ({ name, cal: { ...C, ...calMod }, design, params });
  const arg = process.argv[2] ?? 'default';
  const cases: Case[] =
    arg === 'board'
      ? [mk('base', {}), mk('mass x2', { board: { ...C.board, modalMass: C.board.modalMass * 2 } }), mk('mass x4', { board: { ...C.board, modalMass: C.board.modalMass * 4 } })]
      : arg === 'zones'
        ? [
            mk('zones 1,1,1', {}),
            mk('zones .5,1,1', { board: { ...C.board, zoneCoupling: [0.5, 1, 1] } }),
            mk('zones .5,.7,.5', { board: { ...C.board, zoneCoupling: [0.5, 0.7, 0.5] } }),
            mk('zones .35,.7,.35', { board: { ...C.board, zoneCoupling: [0.35, 0.7, 0.35] } }),
          ]
      : arg === 'unison'
        ? [
            mk('imb .05 det 1', {}),
            mk('imb .15 det 1', {}, { hammerImbalance: 0.15 }),
            mk('imb .15 det 2', {}, { hammerImbalance: 0.15 }, { unisonDetune: 2 }),
            mk('imb .25 det 1.5', {}, { hammerImbalance: 0.25 }, { unisonDetune: 1.5 }),
          ]
        : [mk('base', {}), mk('bridgeY x0.5', { bridgeY: scale(C.bridgeY, 0.5) }), mk('t60Low x2', { t60Low: scale(C.t60Low, 2) })];
  const jobs = cases.flatMap((c) => KEYS.map((m) => ({ c, m })));
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
  for (const c of cases) {
    const cols = KEYS.map((m) => {
      const r = ref[`ref:${m}:mf`];
      const a = out.get(`${c.name}|${m}`)!;
      const ratios = (w: 'e' | 'l') => [1, 2, 3].map((k) => {
        const rd = r?.decays.find((d) => d.k === k);
        const md = a.decays.find((d) => d.k === k);
        if (!rd || !md) return NaN;
        return Math.log2((w === 'e' ? md.t60Early : md.t60Late) / (w === 'e' ? rd.t60Early : rd.t60Late));
      });
      return `${m}:${Math.pow(2, med(ratios('e'))).toFixed(1)}/${Math.pow(2, med(ratios('l'))).toFixed(1)}`;
    });
    console.log(c.name.padEnd(16), cols.join('  '));
  }
}
