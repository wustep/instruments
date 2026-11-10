// Reference recordings for the violin, viola, cello, double bass and flute, used ONLY for
// analysis (never as the instruments' sound): University of Iowa Musical
// Instrument Samples (pre-2012 sets), anechoic chamber, Neumann KM 84 at ~5 ft,
// 16-bit/44.1 kHz mono. Violin: J. Jean-Francois; viola: C. Taylor (1996);
// cello: J. Montes on a 1736 Stradivarius (2001); double bass: the MIS "Double Bass" arco set
// (https://theremin.music.uiowa.edu/MISdoublebass.html); flute: S. Feig (2000), non-vibrato; oboe: the
// MIS "Oboe" set (https://theremin.music.uiowa.edu/MISoboe.html), B♭3–A♭6, pp/mf/ff.
// Terms: "may be downloaded and used for any projects, without restrictions" —
// https://theremin.music.uiowa.edu/MIS.html
//
// Each file is a chromatic run on one string (or one flute register). We keep
// only the notes the model plays on the same string (first position), segment
// the run into notes and analyse each one with analyzeSustained().
//   npx tsx scripts/ensemble-refs.ts          fetch + analyse (cached in .cache/iowa-ens)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeSustained, decodeWav, identifyNote, segmentNotes, type SustainedAnalysis } from '../packages/engine/src/analysis/index.ts';

export type EnsInstrument = 'violin' | 'viola' | 'cello' | 'bass' | 'flute' | 'trumpet' | 'oboe';
export type Dyn = 'pp' | 'mf' | 'ff';
export const ENS_DYN: Dyn[] = ['pp', 'mf', 'ff'];
export const ENS_CACHE = join(import.meta.dirname, '..', '.cache', 'iowa-ens');
const ANALYSIS = join(ENS_CACHE, 'analysis-v1.json');

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export function noteMidi(s: string): number {
  const m = /^([A-G]b?)(\d)$/.exec(s);
  if (!m) throw new Error(`bad note ${s}`);
  return NAMES.indexOf(m[1]) + 12 * (+m[2] + 1);
}
function rangeOf(tag: string): [number, number] {
  const m = /^([A-G]b?\d)([A-G]b?\d)?$/.exec(tag);
  if (!m) throw new Error(`bad range ${tag}`);
  const lo = noteMidi(m[1]);
  return [lo, m[2] ? noteMidi(m[2]) : lo];
}

export interface RefFile {
  instrument: EnsInstrument;
  dyn: Dyn;
  file: string;
  url: string;
  /** chromatic range recorded in the file */
  range: [number, number];
  /** notes kept (played on the same string by the model) */
  use: [number, number];
  /** segmentation: gaps bridged (10 ms frames; analysis segmentNotes, default 12). The Iowa oboe's
   *  runs leave 50–100 ms between notes, which the default bridges into one long note */
  merge?: number;
}

const BASE = 'https://theremin.music.uiowa.edu/sound%20files/MIS';
function strings(instrument: 'violin' | 'cello' | 'bass', spec: Record<Dyn, [string, string, number, number][]>): RefFile[] {
  const out: RefFile[] = [];
  const Cap = instrument === 'violin' ? 'Violin' : instrument === 'cello' ? 'Cello' : 'Bass';
  const dir = instrument === 'bass' ? 'doublebass' : instrument;
  for (const dyn of ENS_DYN)
    for (const [str, tag, lo, hi] of spec[dyn]) {
      const file = `${Cap}.arco.${dyn}.sul${str}.${tag}.aiff`;
      out.push({ instrument, dyn, file, url: `${BASE}/Strings/${dir}/${file}`, range: rangeOf(tag), use: [lo, hi] });
    }
  return out;
}

export const REF_FILES: RefFile[] = [
  // violin: G 55–61, D 62–68, A 69–75, E 76+ (the model's string choice)
  ...strings('violin', {
    pp: [['G', 'G3B3', 55, 61], ['D', 'D4Bb4', 62, 68], ['A', 'A4B4', 69, 71], ['A', 'C5A5', 72, 75], ['E', 'E5A5', 76, 83]],
    mf: [['G', 'G3B3', 55, 61], ['D', 'D4A4', 62, 68], ['A', 'A4B4', 69, 71], ['A', 'C5C6', 72, 75], ['E', 'E5B5', 76, 83]],
    ff: [['G', 'G3B3', 55, 61], ['D', 'D4B4', 62, 68], ['A', 'A4B4', 69, 71], ['A', 'C5Db6', 72, 75], ['E', 'E5B5', 76, 83]],
  }),
  // cello: C 36–42, G 43–49, D 50–56, A 57+
  ...strings('cello', {
    pp: [['C', 'C2Gb2', 36, 42], ['G', 'G2Bb2', 43, 49], ['D', 'D3B3', 50, 56], ['A', 'A3B3', 57, 59], ['A', 'C4Bb4', 60, 64]],
    mf: [['C', 'C2Ab2', 36, 42], ['G', 'G2Bb2', 43, 49], ['D', 'D3B3', 50, 56], ['A', 'A3B3', 57, 59], ['A', 'C4C5', 60, 64]],
    ff: [['C', 'C2A2', 36, 42], ['G', 'G2B2', 43, 49], ['D', 'D3B3', 50, 56], ['A', 'A3B3', 57, 59], ['A', 'C4B4', 60, 64]],
  }),
  // double bass: E 28–32, A 33–37, D 38–42, G 43+ (the MIS has no mf run above B3 on the G string)
  ...strings('bass', {
    pp: [['E', 'E1B1', 28, 32], ['A', 'A1B1', 33, 35], ['A', 'C2B2', 36, 37], ['D', 'D2B2', 38, 42], ['G', 'G2B2', 43, 47], ['G', 'C3B3', 48, 59], ['G', 'C4G4', 60, 67]],
    mf: [['E', 'E1B1', 28, 32], ['A', 'A1B1', 33, 35], ['A', 'C2B2', 36, 37], ['D', 'D2B2', 38, 42], ['G', 'G2B2', 43, 47], ['G', 'C3B3', 48, 59]],
    ff: [['E', 'E1B1', 28, 32], ['A', 'A1B1', 33, 35], ['A', 'C2B2', 36, 37], ['D', 'D2B2', 38, 42], ['G', 'G2B2', 43, 47], ['G', 'C3B3', 48, 59], ['G', 'C4G4', 60, 67]],
  }),
  // viola (file names put the string before the dynamic): C 48–54, G 55–61, D 62–68, A 69+
  ...ENS_DYN.flatMap((dyn) =>
    ([['C', 'C3B3', 48, 54], ['G', 'G3B3', 55, 61], ['D', 'D4B4', 62, 68], ['A', 'A4B4', 69, 71], ['A', 'C5B5', 72, 76]] as [string, string, number, number][]).map(([str, tag, lo, hi]) => {
      const file = `Viola.arco.sul${str}.${dyn}.${tag}.aiff`;
      return { instrument: 'viola' as const, dyn, file, url: `${BASE}/Strings/viola/${file}`, range: rangeOf(tag), use: [lo, hi] as [number, number] };
    }),
  ),
  // flute, non-vibrato
  ...([
    ['pp', 'B3B4'], ['pp', 'B4Bb5'], ['pp', 'C6Bb6'],
    ['mf', 'B3B4'], ['mf', 'C5B5'], ['mf', 'C6B6'], ['mf', 'C7'],
    ['ff', 'B3B4'], ['ff', 'C5B5'], ['ff', 'C6B6'], ['ff', 'C7Db7'],
  ] as [Dyn, string][]).map(([dyn, tag]) => {
    const file = `Flute.nonvib.${dyn}.${tag}.aiff`;
    return { instrument: 'flute' as const, dyn, file, url: `${BASE}/Woodwinds/flute/${file}`, range: rangeOf(tag), use: [60, 96] as [number, number] };
  }),
  // B♭ trumpet, non-vibrato (round 3b), the model's range E3–D6
  ...([
    ['pp', 'E3B3'], ['pp', 'C4B4'], ['pp', 'C5B5'], ['pp', 'C6Eb6'],
    ['mf', 'E3B3'], ['mf', 'C4B4'], ['mf', 'C5B5'], ['mf', 'C6D6'],
    ['ff', 'E3B3'], ['ff', 'C4B4'], ['ff', 'C5B5'], ['ff', 'C6Eb6'],
  ] as [Dyn, string][]).map(([dyn, tag]) => {
    const file = `Trumpet.novib.${dyn}.${tag}.aiff`;
    return { instrument: 'trumpet' as const, dyn, file, url: `${BASE}/Brass/Bbtrumpet/${file}`, range: rangeOf(tag), use: [52, 86] as [number, number] };
  }),
  // oboe (concert pitch, as recorded), the model's range B♭3–A6
  ...ENS_DYN.flatMap((dyn) =>
    ['Bb3B3', 'C4B4', 'C5B5', 'C6Ab6'].map((tag) => {
      const file = `Oboe.${dyn}.${tag}.aiff`;
      return { instrument: 'oboe' as const, dyn, file, url: `${BASE}/Woodwinds/oboe/${file}`, range: rangeOf(tag), use: [58, 93] as [number, number], merge: 2 };
    }),
  ),
];

export interface RefNote extends SustainedAnalysis {
  instrument: EnsInstrument;
  dyn: Dyn;
  file: string;
}

const wavOf = (f: RefFile) => join(ENS_CACHE, 'wav', f.file.replace(/\.aiff$/, '.wav'));

async function fetchOne(f: RefFile): Promise<void> {
  const aiff = join(ENS_CACHE, 'aiff', f.file);
  if (!existsSync(aiff) || statSync(aiff).size < 10000) {
    const res = await fetch(f.url, { headers: { 'User-Agent': 'piano-model-calibration' } });
    if (!res.ok) throw new Error(`${res.status} ${f.url}`);
    writeFileSync(aiff, Buffer.from(await res.arrayBuffer()));
  }
  if (!existsSync(wavOf(f))) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', wavOf(f)]);
}

/** Segment one run and analyse the notes in its `use` range. */
export function analyseFile(f: RefFile): RefNote[] {
  const a = decodeWav(readFileSync(wavOf(f)));
  const x = a.channels[0];
  const fs = a.sampleRate;
  const segs = segmentNotes(x, fs, f.merge ? { merge: f.merge } : {});
  const [lo, hi] = f.range;
  const expected = hi - lo + 1;
  const picks = new Map<number, { seg: (typeof segs)[number]; len: number }>();
  segs.forEach((seg, i) => {
    // sequential assignment when the count matches, else nearest identified pitch
    const id = identifyNote(x, fs, seg, Math.max(lo - 1, 24), hi + 1);
    const m = segs.length === expected && Math.abs(id.midi - (lo + i)) <= 1 ? lo + i : id.midi;
    if (m < f.use[0] || m > f.use[1] || m < lo || m > hi) return;
    const len = seg.end - seg.start;
    const prev = picks.get(m);
    if (!prev || len > prev.len) picks.set(m, { seg, len });
  });
  const out: RefNote[] = [];
  for (const [m, { seg }] of [...picks].sort((p, q) => p[0] - q[0])) {
    const s = analyzeSustained(x, fs, seg, m);
    // reject mis-identified segments (more than 60 cents off the note)
    if (!Number.isFinite(s.f0) || Math.abs(s.cents) > 60) continue;
    out.push({ ...s, instrument: f.instrument, dyn: f.dyn, file: f.file });
  }
  return out;
}

/** Fetch (on demand) and analyse all reference files; cached by file name. */
export async function referenceNotes(opts: { refresh?: boolean; log?: boolean } = {}): Promise<RefNote[]> {
  for (const d of ['aiff', 'wav']) if (!existsSync(join(ENS_CACHE, d))) mkdirSync(join(ENS_CACHE, d), { recursive: true });
  const cache: Record<string, RefNote[]> = !opts.refresh && existsSync(ANALYSIS) ? JSON.parse(readFileSync(ANALYSIS, 'utf8')) : {};
  const todo = REF_FILES.filter((f) => !(f.file in cache));
  const q = todo.slice();
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (q.length) {
        const f = q.shift()!;
        try {
          await fetchOne(f);
        } catch (e) {
          console.error(`failed ${f.file}: ${(e as Error).message}`);
        }
      }
    }),
  );
  let changed = false;
  for (const f of todo) {
    if (!existsSync(wavOf(f))) continue;
    cache[f.file] = analyseFile(f);
    changed = true;
    if (opts.log) console.log(`${f.file}: ${cache[f.file].map((n) => n.midi).join(' ')}`);
  }
  if (changed) writeFileSync(ANALYSIS, JSON.stringify(cache));
  return REF_FILES.flatMap((f) => cache[f.file] ?? []);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const notes = await referenceNotes({ refresh: process.argv.includes('--refresh'), log: true });
  console.log(`${notes.length} reference notes`);
}
