// Short, clearly labelled reference excerpts for side-by-side listening on the
// measurements page. Source: University of Iowa MIS (Steinway B, 2001), whose terms
// allow use "for any projects, without restrictions". They are never used by the
// synthesizer. Mono, 5 s, 96 kbps MP3 (~60 KB each).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav, onsetIndex } from '../packages/engine/src/analysis/index.ts';
import { iowaName, wavPath, type Dyn } from './references.ts';

export const EXCERPTS: { midi: number; dyn: Dyn }[] = [
  { midi: 21, dyn: 'ff' },
  { midi: 41, dyn: 'mf' },
  { midi: 61, dyn: 'mf' },
  { midi: 69, dyn: 'pp' },
  { midi: 77, dyn: 'ff' },
  { midi: 97, dyn: 'mf' },
];
const OUT = join(import.meta.dirname, '..', 'apps/web/public/ref');
mkdirSync(OUT, { recursive: true });
for (const { midi, dyn } of EXCERPTS) {
  const src = wavPath(midi, dyn);
  const a = decodeWav(readFileSync(src));
  const mono = a.channels[0].map((v, i) => 0.5 * (v + a.channels[1][i]));
  const on = Math.max(0, onsetIndex(mono) / a.sampleRate - 0.05);
  const out = join(OUT, `iowa-steinway-b-${dyn}-${iowaName(midi)}.mp3`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', on.toFixed(3), '-t', '5', '-i', src, '-ac', '1', '-af', 'afade=t=out:st=4.4:d=0.6', '-b:a', '96k', out]);
  console.log(out);
}
writeFileSync(
  join(OUT, 'LICENSE.txt'),
  `Reference excerpts (5 s, mono MP3) cut from the University of Iowa Musical Instrument Samples:
Steinway & Sons model B, recorded November 2001 by the University of Iowa Electronic Music Studios
(https://theremin.music.uiowa.edu/MISpiano.html). The MIS page states the recordings "may be
downloaded and used for any projects, without restrictions".
They are provided only for side-by-side listening on the measurements page and are NOT used by
the piano model, which synthesizes every sound.
`,
);
