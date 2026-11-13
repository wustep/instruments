// Which partial does each horn note settle on? Every note B♭1–F5 at pp, mf and ff, at the sample rates the
// site meets, held 2 s: 1 = the partial its fingering asks for (right), +1/−1 … = a neighbouring one (a
// cracked note: on the horn they are a tone or less apart high up), . = silent, x = no clear pitch (the
// lips on two partials at once). Read off the pressure in the mouthpiece over the held note's last 0.3 s,
// at the multiples of the tube's own fundamental (the note over its partial): a note on partial n has its
// energy at n, 2n, 3n …, its lowest strong one n.
// The tuba is the same engine (lipcone.ts) and is surveyed the same way: --instrument tuba (C1–F4).
//   npx tsx scripts/horn-regimes.ts [--human 1] [--instrument horn|tuba] [--fs 22050,44100,48000,96000] [--voice '{"lipQ":8}'] [--dur 2]
import { HornCore, hornFingering, HORN_HI, HORN_LO } from '../packages/engine/src/core/horn.ts';
import { TubaCore, tubaFingering, TUBA_HI, TUBA_LO } from '../packages/engine/src/core/tuba.ts';

/** the model alone (`human` 0: what is tuned and fitted), or with its player: --human 1 */
const HUMAN = process.argv.includes('--human') ? Number(process.argv[process.argv.indexOf('--human') + 1]) : 0;

/** the instruments on the lips-and-cone engine */
export const LIPCONE = {
  horn: { Core: HornCore, fingering: hornFingering, lo: HORN_LO, hi: HORN_HI, span: 'B♭1…F5' },
  tuba: { Core: TubaCore, fingering: tubaFingering, lo: TUBA_LO, hi: TUBA_HI, span: 'C1…F4' },
} as const;
export type LipConeName = keyof typeof LIPCONE;

export function regime(m: number, vel: number, fs: number, voice?: object, dur = 2, inst: LipConeName = 'horn'): string {
  const I = LIPCONE[inst];
  const c = new I.Core({ sampleRate: fs, dry: true, params: { vibrato: 0, human: HUMAN, ...(voice ? { voice } : {}) } as never });
  c.schedule({ type: 'noteOn', midi: m, velocity: vel }, 0);
  const bl = new Float32Array(128);
  const br = new Float32Array(128);
  const N = Math.ceil((dur * fs) / 128);
  const core = c as unknown as { trP: Float32Array; trI: number };
  const out = new Float32Array(N * 128 + 256);
  let n = 0;
  let last = core.trI;
  for (let b = 0; b < N; b++) {
    c.process(bl, br, 128);
    while (last !== core.trI && n < out.length) {
      out[n++] = core.trP[last];
      last = (last + 1) & (core.trP.length - 1);
    }
  }
  const f = 440 * 2 ** ((m - 69) / 12);
  const fg = I.fingering(m);
  const fb = f / fg.partial;
  const W = Math.round(0.3 * fs);
  const s0 = n - W;
  let mean = 0;
  for (let i = 0; i < W; i++) mean += out[s0 + i];
  mean /= W;
  let e = 0;
  for (let i = 0; i < W; i++) e += (out[s0 + i] - mean) ** 2;
  // (silent: the lips not buzzing, only the breath's noise; a note buzzes at 0.1–1 in these units)
  if (10 * Math.log10(e / W + 1e-30) < -35) return '.';
  // the tube's partials j·fb (Hann-windowed), dB
  const at = (fr: number) => {
    if (fr >= 0.45 * fs) return -300;
    let re = 0;
    let im = 0;
    for (let i = 0; i < W; i++) {
      const hw = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
      const w = (2 * Math.PI * fr * i) / fs;
      const x = out[s0 + i] - mean;
      re += x * hw * Math.cos(w);
      im += x * hw * Math.sin(w);
    }
    return 20 * Math.log10(Math.hypot(re, im) + 1e-30);
  };
  const J = Math.min(48, Math.floor((0.45 * fs) / fb));
  const M = Array.from({ length: J }, (_, j) => at((j + 1) * fb));
  const top = Math.max(...M);
  // the sounding partial: the lowest strong one
  let ns = M.findIndex((v) => v > top - 15) + 1;
  if (ns < 1) return 'x';
  // …and every strong one is a multiple of it (else the lips are on two at once)
  const stray = M.some((v, j) => (j + 1) % ns !== 0 && v > top - 20);
  if (stray) {
    // (a common divisor of the strong ones: the lowest strong partial may be a harmonic of the sound's own)
    const strong = M.map((v, j) => (v > top - 20 ? j + 1 : 0)).filter(Boolean);
    const g = strong.reduce((a, b) => gcd(a, b));
    if (g >= 1 && g !== ns && strong.every((s) => s % g === 0) && g >= Math.max(1, fg.partial - 4)) ns = g;
    else return 'x';
  }
  const d = ns - fg.partial;
  return d === 0 ? '1' : d > 0 ? (d > 9 ? '>' : String.fromCharCode(64 + d)) : d < -9 ? '<' : String.fromCharCode(96 - d);
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const fss = opt('--fs', '22050,44100,48000,96000').split(',').map(Number);
  const voice = args.includes('--voice') ? JSON.parse(opt('--voice', '{}')) : undefined;
  const dur = +opt('--dur', '2');
  const inst = opt('--instrument', 'horn') as LipConeName;
  const I = LIPCONE[inst];
  let wrong = 0;
  let all = 0;
  console.log('(1 right; A, B … one, two partials above; a, b … below; . silent; x no clear pitch)');
  for (const fs of fss)
    for (const vel of [30, 70, 112]) {
      let row = '';
      for (let m = I.lo; m <= I.hi; m++) {
        const r = regime(m, vel, fs, voice, dur, inst);
        row += r;
        all++;
        if (r !== '1') wrong++;
      }
      console.log(`${String(fs).padStart(5)} v${String(vel).padStart(3)} ${row}`);
    }
  console.log(`${I.span}: ${all - wrong} of ${all} on their partial`);
}
