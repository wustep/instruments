// Reference recordings for the harp, used ONLY for analysis (never as the instrument's sound): the Versilian
// Community Sample Library (Versilian Studios, Sam Gossner; https://github.com/sgossner/VCSL, CC0 1.0),
// Chordophones/Composite Chordophones/Concert Harp: a concert pedal harp, twenty-three strings from E1 to F7
// (every second or third string: E1 G1 B1 D2 F2 A2 C3 E3 G3 B3 D4 F4 A4 C5 E5 G5 B5 D6 F6 A6 B6 D7 F7), each
// plucked and left to ring at two dynamics: the library's f, and a softer one (mf; G1 mp; D7 and F7 p; E1 has
// its f alone): forty-five plucks, 16-bit/44.1 kHz stereo. It is the harp of VSCO 2 Community Edition
// (sgossner/VSCO-2-CE, CC0), whose Strings/Harp has the softer pluck of each string only: the voicing was
// first fitted to those twenty-three (#64), and one pluck a string could not tell a fitted voicing from one
// set by hand. The University of Iowa MIS has no harp. The files end in a fade: only their first 85 % is read.
//   npx tsx scripts/harp-refs.ts            download (if needed) + analyse (cached in .cache/vcsl-harp)
//   npx tsx scripts/harp-refs.ts --table    … and print each pluck's measures
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeRing, decodeWav, type RingAnalysis } from '../packages/engine/src/analysis/index.ts';

export const HARP_CACHE = join(import.meta.dirname, '..', '.cache', 'vcsl-harp');
const ANALYSIS = join(HARP_CACHE, 'analysis-v1.json');
const RAW = 'https://raw.githubusercontent.com/sgossner/VCSL/master/Chordophones/Composite%20Chordophones/Concert%20Harp';

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** the strings recorded, low to high: the softer pluck's mark and take ('' : none), and the f pluck's take */
const STRINGS: [string, string, string][] = [
  ['E1', '', 'f1'], ['G1', 'mp1', 'f1'], ['B1', 'mf1', 'f1'], ['D2', 'mf1', 'f1'], ['F2', 'mf1', 'f1'], ['A2', 'mf1', 'f1'], ['C3', 'mf3', 'f2'], ['E3', 'mf1', 'f1'], ['G3', 'mf1', 'f1'], ['B3', 'mf1', 'f1'], ['D4', 'mf1', 'f1'], ['F4', 'mf1', 'f1'],
  ['A4', 'mf1', 'f1'], ['C5', 'mf1', 'f1'], ['E5', 'mf1', 'f1'], ['G5', 'mf1', 'f1'], ['B5', 'mf1', 'f1'], ['D6', 'mf1', 'f1'], ['F6', 'mf1', 'f1'], ['A6', 'mf1', 'f1'], ['B6', 'mf1', 'f1'], ['D7', 'p1', 'f1'], ['F7', 'p1', 'f1'],
];
/** every recorded pluck: the string's name, its place among the recorded strings, the library's dynamic mark
 *  (p, mp, mf, f) and the file */
export const HARP_FILES: { name: string; string: number; mark: string; file: string }[] = STRINGS.flatMap(([name, soft, loud], i) =>
  [soft, loud].filter((t) => t).map((take) => ({ name, string: i, mark: take.replace(/\d+$/, ''), file: `KSHarp_${name}_${take}.wav` })),
);
const midiOf = (s: string): number => {
  const m = /^([A-G]b?)(\d)$/.exec(s)!;
  return NAMES.indexOf(m[1]) + 12 * (+m[2] + 1);
};
/** a plucked string's partials: its first twelve harmonics */
export const HARP_RATIOS = Array.from({ length: 12 }, (_, i) => i + 1);
/** how the analysis reads a harp note (the recording and the model alike): the start over a quarter second
 *  (0.4 s below C2: the low strings' partials are 30–40 Hz apart), partials within 5 % of a harmonic (a wound
 *  bass string's upper partials are sharp), decays followed for 4 s */
export const harpRing = (midi: number) => ({ ratios: HARP_RATIOS, tol: 0.05, early: midi < 36 ? 0.4 : 0.25, follow: 4, band: [30, 12000] as [number, number] });

export interface HarpRef extends RingAnalysis {
  name: string;
  midi: number;
  /** the recording's pitch as a (fractional) MIDI note */
  pitch: number;
  mark: string;
  file: string;
  /** held out of every fit: every second recorded string, both its plucks */
  held: boolean;
}

export function loadMono(path: string): { x: Float32Array; fs: number } {
  const a = decodeWav(new Uint8Array(readFileSync(path)));
  const L = a.channels[0];
  const R = a.channels[1] ?? L;
  const x = new Float32Array(L.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (L[i] + R[i]);
  return { x, fs: a.sampleRate };
}

export async function fetchRefs(): Promise<void> {
  if (!existsSync(HARP_CACHE)) mkdirSync(HARP_CACHE, { recursive: true });
  for (const { file } of HARP_FILES) {
    const path = join(HARP_CACHE, file);
    if (existsSync(path)) continue;
    const res = await fetch(`${RAW}/${file}`, { headers: { 'User-Agent': 'calibration-client' } });
    if (!res.ok) throw new Error(`${res.status} ${file}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
}

export async function harpRefs(opts: { refresh?: boolean } = {}): Promise<HarpRef[]> {
  if (!opts.refresh && existsSync(ANALYSIS)) return JSON.parse(readFileSync(ANALYSIS, 'utf8')) as HarpRef[];
  await fetchRefs();
  const out: HarpRef[] = HARP_FILES.map(({ name, string, mark, file }) => {
    const { x, fs } = loadMono(join(HARP_CACHE, file));
    const midi = midiOf(name);
    const a = analyzeRing(x, fs, 440 * 2 ** ((midi - 69) / 12), { ...harpRing(midi), use: 0.85 });
    return { ...a, name, midi, pitch: 69 + 12 * Math.log2(a.f0 / 440), mark, file, held: string % 2 === 1 };
  });
  writeFileSync(ANALYSIS, JSON.stringify(out));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const refs = await harpRefs({ refresh: process.argv.includes('--refresh') });
  const f = (v: number, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  for (const r of refs)
    console.log(
      `${r.name.padEnd(3)} ${r.mark.padEnd(2)} ${r.held ? 'held' : 'fit '} f0 ${f(r.f0, 1).padStart(7)} (${f(100 * (r.pitch - r.midi)).padStart(4)} c) lvl ${f(r.level).padStart(4)} ring20 ${f(r.ring20, 2).padStart(5)} ring40 ${f(r.ring40, 2).padStart(5)} cen ${f(r.centroid).padStart(5)}→${f(r.centroidLate).padStart(5)} att ${f(r.attack, 1).padStart(5)} | lv ${r.levels.slice(0, 10).map((v) => f(v).padStart(4)).join('')} | dec ${r.decays.slice(0, 6).map((v) => f(v).padStart(4)).join('')} | B ${r.ratios.slice(1, 8).map((v, k) => f(1e4 * ((v / (k + 2)) ** 2 - 1) / ((k + 2) ** 2 - 1), 1)).join(' ')}`,
    );
}
