// Reference recordings for the timpani, used ONLY for analysis (never as the instrument's sound): VSCO 2
// Community Edition (Versilian Studios, Sam Gossner & Simon Dalzell; https://github.com/sgossner/VSCO-2-CE,
// released CC0 1.0: "You are permitted to use these samples for ANY purpose"), Percussion/Timpani: five
// pedal drums, each struck at three dynamics (the library's velocity layers v1, v3, v4: pp, mf, ff; the
// low drum at v1 and v3 only), two takes each ("round robins"), 16-bit/44.1 kHz stereo, the close and room
// microphones summed (only the first 60 % of each file is used: they are faded out at their ends). The
// University of Iowa MIS has no timpani.
//   npx tsx scripts/timpani-refs.ts            download (if needed) + analyse (cached in .cache/vsco-timpani)
//
// Each drum is identified by its principal tone, the (1,1) mode, measured (the library's sampler key
// centres, 42 46 49 52 54, are about half a semitone under it): drum 1 89.7 Hz, 2 122.6, 3 142.8, 4 170.0,
// 5 190.7 (F2+47 c, B2−12 c, C♯3+52 c, E3+54 c, F♯3+52 c). Drums 2 and 4 are held out of every fit.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeStruck, decodeWav, type StruckAnalysis } from '../packages/engine/src/analysis/index.ts';

export type Dyn = 'pp' | 'mf' | 'ff';
export const TIMP_CACHE = join(import.meta.dirname, '..', '.cache', 'vsco-timpani');
const ANALYSIS = join(TIMP_CACHE, 'analysis-v1.json');
const RAW = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani';

/** the library's velocity layers as dynamics */
const LAYER: Record<string, Dyn> = { v1: 'pp', v3: 'mf', v4: 'ff' };
/** each drum's principal tone, measured (the search starts here, ±3 %) */
export const DRUM_F11 = [89.7, 122.6, 142.8, 170.0, 190.7];
/** drums held out of every fit */
export const HELD_DRUMS = [2, 4];

export interface TimpRef extends StruckAnalysis {
  drum: number;
  dyn: Dyn;
  rr: number;
  file: string;
  /** the principal tone as a (fractional) MIDI note */
  midi: number;
  held: boolean;
}

export function refFiles(): { drum: number; dyn: Dyn; rr: number; file: string }[] {
  const out: { drum: number; dyn: Dyn; rr: number; file: string }[] = [];
  for (let drum = 1; drum <= 5; drum++)
    for (const v of ['v1', 'v3', 'v4'])
      for (const rr of [1, 2]) {
        if (drum === 1 && v === 'v4') continue;
        out.push({ drum, dyn: LAYER[v], rr, file: `Timpani${drum}_Hit_${v}_rr${rr}_Sum.wav` });
      }
  return out;
}

export function loadMono(path: string): { x: Float32Array; fs: number } {
  const a = decodeWav(new Uint8Array(readFileSync(path)));
  const L = a.channels[0];
  const R = a.channels[1] ?? L;
  const x = new Float32Array(L.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (L[i] + R[i]);
  return { x, fs: a.sampleRate };
}

export function fetchRefs(): void {
  if (!existsSync(TIMP_CACHE)) mkdirSync(TIMP_CACHE, { recursive: true });
  for (const r of refFiles()) {
    const p = join(TIMP_CACHE, r.file);
    if (!existsSync(p)) execFileSync('curl', ['-sfL', `${RAW}/${r.file}`, '-o', p]);
  }
}

const midiOf = (f: number) => 69 + 12 * Math.log2(f / 440);

export function timpaniRefs(opts: { fresh?: boolean } = {}): TimpRef[] {
  if (!opts.fresh && existsSync(ANALYSIS)) return JSON.parse(readFileSync(ANALYSIS, 'utf8')) as TimpRef[];
  fetchRefs();
  const out: TimpRef[] = [];
  for (const r of refFiles()) {
    const { x, fs } = loadMono(join(TIMP_CACHE, r.file));
    // (the library's files are faded to digital silence at their ends, where each stroke met the room's
    // noise: only the first 60 % is analysed, so a fade is not read as the drum's decay)
    const a = analyzeStruck(x.subarray(0, Math.floor(0.6 * x.length)), fs, DRUM_F11[r.drum - 1]);
    out.push({ ...r, ...a, midi: midiOf(a.f11), held: HELD_DRUMS.includes(r.drum) });
  }
  writeFileSync(ANALYSIS, JSON.stringify(out));
  return out;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const refs = timpaniRefs({ fresh: true });
  const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '  —');
  console.log('drum dyn rr   f11    midi   r21   r31   r41   r51 | L21  L31  L41  L51 | dec11 dec21 ring  centroid attack level glide');
  for (const r of refs)
    console.log(
      `${r.drum}${r.held ? '*' : ' '}  ${r.dyn}  ${r.rr}  ${f(r.f11)}  ${f(r.midi, 2)}  ${r.ratios.map((x) => f(x, 3)).join(' ')} | ${r.levels.map((x) => f(x, 0).padStart(4)).join(' ')} | ${f(r.decay11).padStart(5)} ${f(r.decay21).padStart(5)} ${f(r.ring, 2)}  ${f(r.centroid, 0).padStart(6)}  ${f(r.attack).padStart(5)} ${f(r.level).padStart(6)} ${f(r.glide).padStart(5)}`,
    );
}
