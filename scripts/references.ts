// Reference recordings used ONLY for analysis (never as the instrument's sound):
// University of Iowa Musical Instrument Samples, Steinway & Sons model B, recorded
// 2001 (two Neumann KM 84 mics 8" above the bass and treble strings, 16-bit/44.1 kHz,
// input gain fixed across dynamics). Terms: "may be downloaded and used for any
// projects, without restrictions" — https://theremin.music.uiowa.edu/MIS.html
import { existsSync, mkdirSync } from 'node:fs';
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
