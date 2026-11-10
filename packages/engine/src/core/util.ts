// Small numeric helpers shared by the DSP core. No allocation on hot paths.

export const LN10 = Math.log(10);
/** Natural-log amplitude decay corresponding to -60 dB. */
export const LN1000 = Math.log(1000);

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Interpolate y over x breakpoints (x ascending). Clamps at the ends. */
export function interp(x: number, xs: readonly number[], ys: readonly number[]): number {
  if (x <= xs[0]) return ys[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 1;
  while (xs[i] < x) i++;
  const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
}

/** Interpolate log(y) linearly over x (for quantities spanning decades). */
export function interpLog(x: number, xs: readonly number[], ys: readonly number[]): number {
  return Math.exp(interp(x, xs, ys.map(Math.log)));
}

export const nextPow2 = (n: number): number => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};

export const midiToEtHz = (midi: number, a4 = 440): number => a4 * Math.pow(2, (midi - 69) / 12);

export const cents = (f: number, ref: number): number => 1200 * Math.log2(f / ref);

export const dbToAmp = (db: number): number => Math.pow(10, db / 20);
export const ampToDb = (a: number): number => 20 * Math.log10(Math.max(a, 1e-30));

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const midiName = (midi: number): string => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
export function nameToMidi(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`bad note name ${name}`);
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase() as 'c'];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return base + acc + (parseInt(m[3], 10) + 1) * 12;
}

/**
 * A player's own seed: player 0 is the instrument's seed itself (bit-identical); another player of
 * the same instrument (orchestra mode: two violins on one tune) gets its own random stream, so its
 * vibrato wander and bow, breath or hammer noise are its own and the two do not sum as one louder
 * instrument.
 */
export const playerSeed = (seed: number, player = 0): number => (player ? (seed + Math.imul(player, 0x9e3779b1)) >>> 0 : seed);
/** A player's vibrato: its starting phase (the golden angle apart, rad) and its rate as a factor. Two
 *  players' rates differ by a few per cent (flute vibrato is 4–6 Hz across players, Fletcher 1975,
 *  JASA 57, "Acoustical correlates of flute performance technique"; brass 5–7 Hz). Player 0: 0, 1. */
export const playerVibrato = (player = 0): { phase: number; rate: number } =>
  player ? { phase: player * 2.399963, rate: 1 + 0.04 * (player % 2 ? 1 : -1) * Math.ceil(player / 2) } : { phase: 0, rate: 1 };

/** A player's intonation (cents): players of one section in unison are a few cents apart, which is
 *  what makes a section sound like several players (pitch scatter of 5–15 ¢ among good choir singers,
 *  Ternström 2003, "Choir acoustics: an overview of scientific research published to date", Int. J.
 *  Research in Choral Singing 1). Player 0: 0; then +4, −4, +8, −8 ¢. */
export const playerCents = (player = 0): number => (player ? 4 * (player % 2 ? 1 : -1) * Math.ceil(player / 2) : 0);

/** Deterministic PRNG (mulberry32). Returns a function producing [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian sample via Box–Muller from a uniform generator. */
export function gauss(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
