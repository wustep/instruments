// The glockenspiel's reference: the University of Iowa Musical Instrument Samples "Bells" (orchestra bells,
// C5–E8, recorded 2001 in the anechoic chamber; plastic mallets pp/mf/ff and brass mallets), analysis only,
// in .cache/iowa-bells (never committed, never played as the instrument). Each file is a chromatic run of
// strokes left to ring; each stroke is analysed as a note that is set going once (analysis/ring.ts), its
// partials looked for near the six families the recordings show (FAMILY_AT).
//   npx tsx scripts/glock-refs.ts            # fetch (if missing), analyse, print a table
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeRing, decodeWav, type RingAnalysis } from '../packages/engine/src/analysis/index.ts';

export const GLOCK_CACHE = join(import.meta.dirname, '..', '.cache', 'iowa-bells');
const ANALYSIS = join(GLOCK_CACHE, 'analysis-v2.json');
const BASE = 'https://theremin.music.uiowa.edu/sound%20files/MIS/Percussion/bells';
export type GlockMark = 'pp' | 'mf' | 'ff' | 'brass';
/** the runs: the mallet and dynamic, the file's first and last notes (as they sound) */
export const GLOCK_FILES: { file: string; mark: GlockMark; lo: number; hi: number }[] = (['pp', 'mf', 'ff', 'brass'] as GlockMark[]).flatMap((mark) =>
  ([['C5B5', 72, 83], ['C6B6', 84, 95], ['C7B7', 96, 107], ['C8E8', 108, 112]] as const).map(([r, lo, hi]) => ({ file: mark === 'brass' ? `bells.brass.${r}.aif` : `bells.plastic.${mark}.${r}.aif`, mark, lo, hi })),
);

/** The families of partials the recordings show, as ratios to the bar's pitch on the bar at `midi`: the
 *  pitch; edgewise bending 1 (3.28 at C5, falling 5 % an octave); twisting 1 (4.84, falling 20 %); edgewise 2
 *  (7.21, 13 %); twisting 2 (11.30, as 1/√f); edgewise 3 (16.39, 14 %). The search is ±6 % round each;
 *  NaN: not looked for on that bar. */
export const FAMILY_AT = (midi: number): number[] => {
  const o = (midi - 72) / 12;
  const r = [1, 3.28 * 2 ** (-0.075 * o), 4.84 * 2 ** (-0.33 * o), 7.21 * 2 ** (-0.2 * o), 11.3 * 2 ** (-0.5 * o), 16.39 * 2 ** (-0.218 * o)];
  // (up the compass the twisting families come down onto the edgewise ones: within 8 % they are one peak,
  // looked for once)
  if (r[2] / r[1] < 1.08) r[2] = NaN;
  if (r[4] / r[3] < 1.08) r[4] = NaN;
  return r;
};
/** how a stroke is read (the recording and the model alike) */
export const glockRing = (midi: number) => ({ ratios: FAMILY_AT(midi), tol: 0.06, early: 0.25, follow: 4, band: [200, 18000] as [number, number] });

export interface GlockRef extends RingAnalysis {
  midi: number;
  mark: GlockMark;
  file: string;
  /** held out of the fit: every second bar */
  held: boolean;
  /** seconds of the stroke in the file (to its next) */
  length: number;
  /** a clean stroke: within 9 dB of its run's median level, its pitch within 40 ¢ of its note (a few are cut
   *  short at the head of a file or lost in its noise: they are left out of the fit and the judge) */
  ok: boolean;
}

const wavOf = (file: string) => join(GLOCK_CACHE, 'wav', file.replace(/\.aif$/, '.wav'));

export async function fetchRefs(): Promise<void> {
  mkdirSync(join(GLOCK_CACHE, 'wav'), { recursive: true });
  for (const f of GLOCK_FILES) {
    const aif = join(GLOCK_CACHE, f.file);
    if (!existsSync(aif)) {
      const res = await fetch(`${BASE}/${f.file}`, { headers: { 'User-Agent': 'calibration-client' } });
      if (!res.ok) throw new Error(`${res.status} ${f.file}`);
      writeFileSync(aif, Buffer.from(await res.arrayBuffer()));
    }
    if (!existsSync(wavOf(f.file))) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', aif, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', wavOf(f.file)]);
  }
}

/** A run's strokes, one for each of its notes lo … hi: a note's stroke is where the level at its own pitch (a
 *  40 ms window every 10 ms, the bars being 10–30 ¢ sharp) is highest in the run; it begins where that level
 *  last was 25 dB lower, within the half second before. (The quiet runs are gated between their notes and
 *  their noise comes and goes: the level alone does not find the strokes.) */
export function strokes(x: ArrayLike<number>, fs: number, lo: number, hi: number): { start: number; end: number }[] {
  const N = Math.round(0.04 * fs);
  const hop = Math.round(0.01 * fs);
  const frames = Math.max(0, Math.floor((x.length - N) / hop));
  const ons: number[] = [];
  for (let m = lo; m <= hi; m++) {
    const pw = new Float64Array(frames);
    for (const det of [1.004, 1.01, 1.016]) {
      const w = (2 * Math.PI * 440 * 2 ** ((m - 69) / 12) * det) / fs;
      const c = 2 * Math.cos(w);
      for (let fr = 0; fr < frames; fr++) {
        let s1 = 0;
        let s2 = 0;
        const o = fr * hop;
        for (let i = 0; i < N; i++) {
          const s0 = x[o + i] + c * s1 - s2;
          s2 = s1;
          s1 = s0;
        }
        const p = s1 * s1 + s2 * s2 - c * s1 * s2;
        if (p > pw[fr]) pw[fr] = p;
      }
    }
    let top = 0;
    for (let fr = 1; fr < frames; fr++) if (pw[fr] > pw[top]) top = fr;
    let on = top;
    for (let fr = top; fr >= Math.max(0, top - 50); fr--) {
      on = fr;
      if (pw[fr] < pw[top] * 0.00316) break;
    }
    ons.push(on * hop);
  }
  const sorted = ons.slice().sort((a, b) => a - b);
  return ons.map((o) => {
    const next = sorted.find((t) => t > o + fs);
    return { start: Math.max(0, o - Math.round(0.01 * fs)), end: next === undefined ? x.length : next - Math.round(0.05 * fs) };
  });
}

export async function glockRefs(opts: { refresh?: boolean } = {}): Promise<GlockRef[]> {
  if (!opts.refresh && existsSync(ANALYSIS)) return (JSON.parse(readFileSync(ANALYSIS, 'utf8')) as GlockRef[]).map((r) => ({ ...r, bands: r.bands.map((b) => b ?? -200) }));
  await fetchRefs();
  const out: GlockRef[] = [];
  for (const f of GLOCK_FILES) {
    const a = decodeWav(readFileSync(wavOf(f.file)));
    const x = a.channels[0];
    const fs = a.sampleRate;
    const segs = strokes(x, fs, f.lo, f.hi);
    segs.forEach((s, i) => {
      const seg = Float32Array.from({ length: s.end - s.start }, (_, k) => x[s.start + k]);
      const midi = f.lo + i;
      const an = analyzeRing(seg, fs, 440 * 2 ** ((midi - 69) / 12) * 1.01, glockRing(midi));
      out.push({ ...an, midi, mark: f.mark, file: f.file, held: midi % 2 === 1, length: (s.end - s.start) / fs, ok: true });
    });
  }
  for (const f of GLOCK_FILES) {
    const run = out.filter((r) => r.file === f.file);
    const lv = run.map((r) => r.level).sort((a, b) => a - b);
    const med = lv[Math.floor(lv.length / 2)];
    for (const r of run) r.ok = Math.abs(r.level - med) <= 9 && Math.abs(1200 * Math.log2(r.f0 / (440 * 2 ** ((r.midi - 69) / 12)))) < 40;
  }
  writeFileSync(ANALYSIS, JSON.stringify(out));
  return out;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const refs = await glockRefs({ refresh: process.argv.includes('--refresh') });
  const f = (v: number, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const name = (m: number) => ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][m % 12] + (Math.floor(m / 12) - 1);
  console.log('bar  mark   cents | ratios 2–6 | levels 1–6 (dB re the strongest) | decays 1–6 (dB/s) | ring20 s | centroid | attack | level');
  for (const r of refs) {
    if (process.argv.includes('--ff') && r.mark !== 'ff') continue;
    console.log(`${name(r.midi).padEnd(4)}${r.ok ? ' ' : '!'}${r.mark.padEnd(5)} ${f(1200 * Math.log2(r.f0 / (440 * 2 ** ((r.midi - 69) / 12)))).padStart(4)} | ${r.ratios.slice(1).map((v) => f(v, 2).padStart(6)).join('')} | ${r.levels.map((v) => f(v).padStart(4)).join('')} | ${r.decays.map((v) => f(v).padStart(4)).join('')} | ${f(r.ring20, 2).padStart(5)} | ${f(r.centroid).padStart(5)} | ${f(r.attack, 1).padStart(5)} | ${f(r.level, 1)}`);
  }
  console.log(`${refs.length} strokes, ${refs.filter((r) => !r.ok).length} left out`);
}
