// Fit the flute's jet/labium/radiation voicing (FLUTE_VOICE) to the Iowa MIS
// non-vibrato flute: per register (C4–B4, C5–B5, C6–C7) and dynamic (pp/mf/ff)
// the median harmonic profile H1–H8, even/odd balance, harmonic-to-noise ratio
// and the pp→mf→ff level spread. Physical constraints are part of the loss: the
// note must speak at its pitch on its register, and blowing 2.5× harder must
// still overblow the low register to the octave.
//   npx tsx scripts/fit-flute.ts [--iters 40] [--lambda 12]
// Prints the best voicing as JSON (pasted into FLUTE_VOICE by hand after review).
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { analyzeSustained, spectrum, peakIn } from '../packages/engine/src/analysis/index.ts';
import { FluteCore, FLUTE_VOICE } from '../packages/engine/src/core/flute.ts';
import { ENS_CACHE } from './ensemble-refs.ts';

type Voice = typeof FLUTE_VOICE;
const FS = 44100;
const VEL = { pp: 30, mf: 70, ff: 112 } as const;
type Dyn = keyof typeof VEL;
const REG: [number, number][] = [[60, 71], [72, 83], [84, 96]];
const NOTES = [[62, 67], [74, 79], [86, 91]];
const median = (a: number[]) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);

function render(v: Voice, m: number, vel: number, breath = 1, dur = 1.4): Float32Array {
  Object.assign(FLUTE_VOICE, v);
  const core = new FluteCore({ sampleRate: FS, dry: true, params: { vibrato: 0, breath } });
  core.schedule({ type: 'noteOn', midi: m, velocity: vel }, 0);
  const N = Math.round((dur * FS) / 128) * 128;
  const out = new Float32Array(N);
  const L = new Float32Array(128);
  const R = new Float32Array(128);
  for (let i = 0; i < N; i += 128) {
    core.process(L, R, 128);
    for (let t = 0; t < 128; t++) out[i + t] = 0.5 * (L[t] + R[t]);
  }
  return out;
}

interface Stats { harm: number[]; eo: number; hnr: number; rms: number; cents: number }
function stats(x: Float32Array, m: number): Stats {
  const a = analyzeSustained(x, FS, { start: Math.round(0.35 * FS), end: x.length - 128 }, m);
  return { harm: a.harm.slice(0, 8), eo: a.evenOddDb, hnr: a.hnrDb, rms: a.rmsDb, cents: a.cents };
}

/** Loss of one voicing against the reference group medians. */
function loss(v: Voice, ref: Record<string, Stats>): { total: number; parts: Record<string, number> } {
  let harm = 0;
  let eo = 0;
  let hnr = 0;
  let lvl = 0;
  let pitch = 0;
  let n = 0;
  const regMf = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    const lv: Record<string, number> = {};
    for (const d of Object.keys(VEL) as Dyn[]) {
      const ss = NOTES[r].map((m) => stats(render(v, m, VEL[d]), m));
      const g = ref[`${r}${d}`];
      const mh = Array.from({ length: 8 }, (_, k) => median(ss.map((s) => s.harm[k])));
      let e = 0;
      for (let k = 0; k < 8; k++) e += (Math.max(-50, Number.isFinite(mh[k]) ? mh[k] : -50) - Math.max(-50, g.harm[k])) ** 2;
      harm += Math.sqrt(e / 8);
      eo += Math.abs(median(ss.map((s) => s.eo)) - g.eo);
      hnr += Math.abs(median(ss.map((s) => s.hnr)) - g.hnr);
      lv[d] = median(ss.map((s) => s.rms));
      for (const s of ss) if (!Number.isFinite(s.cents) || Math.abs(s.cents) > 35) pitch += 1;
      n++;
    }
    const rr = (d: Dyn) => ref[`${r}${d}`].rms;
    lvl += Math.abs(lv.ff - lv.pp - (rr('ff') - rr('pp'))) + Math.abs(lv.mf - lv.pp - (rr('mf') - rr('pp')));
    regMf[r] = lv.mf;
  }
  // balance between registers at mf (the recording's high register is louder)
  const rm = (r: number) => ref[`${r}mf`].rms;
  lvl += Math.abs(regMf[1] - regMf[0] - (rm(1) - rm(0))) + Math.abs(regMf[2] - regMf[0] - (rm(2) - rm(0)));
  // overblowing: D4 at 2.5× breath must jump to the octave
  const ob = render(v, 62, 80, 2.5, 1.4);
  const sp = spectrum(ob, FS, Math.round(0.8 * FS), Math.round(0.5 * FS), 1 << 16);
  const f1 = peakIn(sp, et(62) * 0.97, et(62) * 1.03)?.mag ?? 0;
  const f2 = peakIn(sp, et(74) * 0.95, et(74) * 1.03)?.mag ?? 0;
  const over = f2 > 10 * f1 ? 0 : 1;
  const parts = { harm: harm / n, eo: eo / n, hnr: hnr / n, lvl: lvl / 3, pitch, over };
  return { total: parts.harm + 0.5 * parts.eo + 0.25 * parts.hnr + 0.5 * parts.lvl + 20 * pitch + 30 * over, parts };
}

// ---- parameter space (log for scale-like quantities)
// physical constraints: some open-foot radiation always; players blow harder (never softer) to
// play louder, so the pressure range is parameterised as pressLo + a non-negative rise
const SPACE: { key: keyof Voice | 'offset0' | 'offset1' | 'pressRise'; lo: number; hi: number; log?: boolean }[] = [
  { key: 'jetGain', lo: 0.1, hi: 0.7, log: true },
  { key: 'offset0', lo: 0, hi: 2 },
  { key: 'offset1', lo: 0, hi: 2 },
  { key: 'vortex', lo: 0.001, hi: 0.3, log: true },
  { key: 'jetLp', lo: 1.2, hi: 8, log: true },
  { key: 'radFoot', lo: 0.05, hi: 4, log: true },
  { key: 'radDflow', lo: 0.05, hi: 8, log: true },
  { key: 'noise', lo: 0.01, hi: 1, log: true },
  { key: 'noiseOut', lo: 0, hi: 3 },
  { key: 'driveLo', lo: 0.08, hi: 0.8, log: true },
  { key: 'driveHi', lo: 0.6, hi: 2.5, log: true },
  { key: 'driveCurve', lo: 0.5, hi: 3, log: true },
  { key: 'pressLo', lo: 0.7, hi: 1.1 },
  { key: 'pressRise', lo: 0, hi: 0.4 },
];
const toVoice = (z: number[]): Voice => {
  const v: Voice = { ...FLUTE_VOICE, offset: [...FLUTE_VOICE.offset] as [number, number] };
  SPACE.forEach((p, i) => {
    const t = Math.min(1, Math.max(0, z[i]));
    const x = p.log ? Math.exp(Math.log(p.lo) + t * (Math.log(p.hi) - Math.log(p.lo))) : p.lo + t * (p.hi - p.lo);
    if (p.key === 'offset0') v.offset[0] = x;
    else if (p.key === 'offset1') v.offset[1] = x;
    else if (p.key !== 'pressRise') (v as Record<string, unknown>)[p.key] = x;
  });
  const rise = SPACE.findIndex((p) => p.key === 'pressRise');
  v.pressHi = v.pressLo + SPACE[rise].lo + Math.min(1, Math.max(0, z[rise])) * (SPACE[rise].hi - SPACE[rise].lo);
  return v;
};
const fromVoice = (v: Voice): number[] =>
  SPACE.map((p) => {
    const x = p.key === 'offset0' ? v.offset[0] : p.key === 'offset1' ? v.offset[1] : p.key === 'pressRise' ? Math.max(0, v.pressHi - v.pressLo) : (v[p.key as keyof Voice] as number);
    const t = p.log ? (Math.log(Math.max(x, p.lo)) - Math.log(p.lo)) / (Math.log(p.hi) - Math.log(p.lo)) : (x - p.lo) / (p.hi - p.lo);
    return Math.min(1, Math.max(0, t));
  });

function referenceGroups(): Record<string, Stats> {
  const c = JSON.parse(readFileSync(join(ENS_CACHE, 'analysis-v1.json'), 'utf8')) as Record<string, (Stats & { instrument: string; dyn: Dyn; midi: number; harm: number[]; evenOddDb: number; hnrDb: number; rmsDb: number })[]>;
  const notes = Object.values(c).flat().filter((x) => x.instrument === 'flute');
  const out: Record<string, Stats> = {};
  REG.forEach(([lo, hi], r) => {
    for (const d of Object.keys(VEL) as Dyn[]) {
      const s = notes.filter((x) => x.dyn === d && x.midi >= lo && x.midi <= hi);
      out[`${r}${d}`] = { harm: Array.from({ length: 8 }, (_, k) => median(s.map((x) => x.harm[k]))), eo: median(s.map((x) => x.evenOddDb)), hnr: median(s.map((x) => x.hnrDb)), rms: median(s.map((x) => x.rmsDb)), cents: 0 };
    }
  });
  return out;
}

function report(v: Voice, ref: Record<string, Stats>): void {
  for (let r = 0; r < 3; r++)
    for (const d of Object.keys(VEL) as Dyn[]) {
      const ss = NOTES[r].map((m) => stats(render(v, m, VEL[d]), m));
      const g = ref[`${r}${d}`];
      const mh = Array.from({ length: 8 }, (_, k) => median(ss.map((x) => x.harm[k])));
      console.log(`reg ${r} ${d} ref ${g.harm.map((x) => x.toFixed(0).padStart(4)).join('')} eo ${g.eo.toFixed(1)} hnr ${g.hnr.toFixed(0)} rms ${g.rms.toFixed(1)}`);
      console.log(`         mod ${mh.map((x) => x.toFixed(0).padStart(4)).join('')} eo ${median(ss.map((x) => x.eo)).toFixed(1)} hnr ${median(ss.map((x) => x.hnr)).toFixed(0)} rms ${median(ss.map((x) => x.rms)).toFixed(1)} cents ${ss.map((x) => x.cents.toFixed(0)).join(',')}`);
    }
}

if (!isMainThread) {
  const { z, ref } = workerData as { z: number[]; ref: Record<string, Stats> };
  parentPort!.postMessage(loss(toVoice(z), ref));
} else {
  const args = process.argv.slice(2);
  const iters = +(args[args.indexOf('--iters') + 1] || 40);
  const lambda = +(args[args.indexOf('--lambda') + 1] || Math.max(4, cpus().length - 2));
  const ref = referenceGroups();
  if (args.includes('--report')) {
    const fi2 = args.indexOf('--from');
    if (fi2 >= 0) Object.assign(FLUTE_VOICE, JSON.parse(args[fi2 + 1]));
    report({ ...FLUTE_VOICE }, ref);
    process.exit(0);
  }
  const evalZ = (z: number[]) =>
    new Promise<{ total: number; parts: Record<string, number> }>((res, rej) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { z, ref }, execArgv: ['--import', 'tsx'] });
      w.on('message', res);
      w.on('error', rej);
    });
  let rand = 12345;
  const rnd = () => ((rand = (rand * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const fi = args.indexOf('--from');
  if (fi >= 0) Object.assign(FLUTE_VOICE, JSON.parse(args[fi + 1]));
  let best = fromVoice(FLUTE_VOICE);
  let bestL = await evalZ(best);
  console.log('start', bestL.total.toFixed(2), JSON.stringify(bestL.parts));
  let sigma = 0.15;
  for (let it = 0; it < iters; it++) {
    const cands = Array.from({ length: lambda }, () => best.map((x) => Math.min(1, Math.max(0, x + sigma * gauss()))));
    const ls = await Promise.all(cands.map(evalZ));
    let bi = -1;
    ls.forEach((l, i) => {
      if (l.total < (bi < 0 ? bestL.total : ls[bi].total)) bi = i;
    });
    if (bi >= 0 && ls[bi].total < bestL.total) {
      best = cands[bi];
      bestL = ls[bi];
      sigma = Math.min(0.3, sigma * 1.15);
    } else sigma = Math.max(0.02, sigma * 0.8);
    console.log(`it ${it} sigma ${sigma.toFixed(3)} best ${bestL.total.toFixed(2)} ${JSON.stringify(Object.fromEntries(Object.entries(bestL.parts).map(([k, v]) => [k, +v.toFixed(2)])))}`);
  }
  const v = toVoice(best);
  const round = (x: number) => +x.toPrecision(3);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Array.isArray(x) ? x.map(round) : round(x as number)]))));
}
