// Reference recordings used ONLY for analysis (never as the instrument's sound):
// University of Iowa Musical Instrument Samples, Steinway & Sons model B, recorded
// 2001 (two Neumann KM 84 mics 8" above the bass and treble strings, 16-bit/44.1 kHz,
// input gain fixed across dynamics). Terms: "may be downloaded and used for any
// projects, without restrictions" — https://theremin.music.uiowa.edu/MIS.html
import { closeSync, existsSync, mkdirSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';

export const CACHE = join(import.meta.dirname, '..', '.cache', 'iowa');
export const DYNAMICS = ['pp', 'mf', 'ff'] as const;
export type Dyn = (typeof DYNAMICS)[number];

const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const iowaName = (m: number) => `${FLAT[m % 12]}${Math.floor(m / 12) - 1}`;

/** Analysis set: every 4th key from A0 (A, C#, F across the compass) plus C8. */
export const REF_KEYS: number[] = (() => {
  const ks: number[] = [];
  for (let m = 21; m <= 105; m += 4) ks.push(m);
  ks.push(108);
  return ks;
})();

/** Iowa has no pp A0 and no mf A0/Bb0. */
export const available = (m: number, d: Dyn) => !((d === 'pp' && m < 22) || (d === 'mf' && m < 23));

export const url = (m: number, d: Dyn) =>
  `https://theremin.music.uiowa.edu/sound%20files/MIS/Piano_Other/piano/Piano.${d}.${iowaName(m)}.aiff`;
export const wavPath = (m: number, d: Dyn) => join(CACHE, 'wav', `Piano.${d}.${iowaName(m)}.wav`);

export function ensureDirs(): void {
  for (const d of ['aiff', 'wav']) if (!existsSync(join(CACHE, d))) mkdirSync(join(CACHE, d), { recursive: true });
}

/** Length of a reference recording in seconds, from its WAV header (NaN if missing). */
export function wavSeconds(path: string): number {
  if (!existsSync(path)) return NaN;
  const fd = openSync(path, 'r');
  const b = Buffer.alloc(8192);
  const n = readSync(fd, b, 0, b.length, 0);
  closeSync(fd);
  let o = 12;
  let nch = 1;
  let sr = 44100;
  let bits = 16;
  while (o + 8 <= n) {
    const id = b.toString('latin1', o, o + 4);
    const len = b.readUInt32LE(o + 4);
    if (id === 'fmt ') {
      nch = b.readUInt16LE(o + 10);
      sr = b.readUInt32LE(o + 12);
      bits = b.readUInt16LE(o + 22);
    } else if (id === 'data') return len / (sr * nch * (bits / 8));
    o += 8 + len + (len & 1);
  }
  return NaN;
}
