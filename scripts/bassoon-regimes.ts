// Which register does each bassoon note settle in? Every note B♭1–E5 at pp, mf and ff, at the sample
// rates the site meets: 1 = its fundamental (right), 2 = the octave, 3 = the twelfth, . = silent, e = on its
// fundamental in the bore but radiating its odd harmonics 15 dB under its even ones (heard as its octave). Read
// off the harmonics of the pressure in the bocal over a held note's last 0.3 s of 2 s (see regime()): with
// light losses in the loop a note could speak on its fundamental and slide to its octave over a second or
// two, which a shorter look missed.
//   npx tsx scripts/bassoon-regimes.ts [--fs 22050,44100,48000,96000] [--voice '{"zeta":0.8}']
// (The oboe's survey, scripts/oboe-regimes.ts, is where the two-tube bore the bassoon shares was chosen.)
import { BassoonCore } from '../packages/engine/src/core/bassoon.ts';

export function regime(m: number, vel: number, fs: number, voice?: object, dur = 2): string {
  const c = new BassoonCore({ sampleRate: fs, dry: true, params: { vibrato: 0, ...(voice ? { voice } : {}) } as never });
  c.schedule({ type: 'noteOn', midi: m, velocity: vel }, 0);
  const bl = new Float32Array(128);
  const br = new Float32Array(128);
  const N = Math.ceil((dur * fs) / 128);
  // the pressure in the bocal, from the core's trace (the radiated sound is the flow the open end lets
  // through, tilted towards the high harmonics: a note on its fundamental can radiate its first harmonic
  // 25 dB under its second, which reads as the octave)
  const core = c as unknown as { trP: Float32Array; trI: number };
  const out = new Float32Array(N * 128 + 256);
  const rad = new Float32Array(N * 128);
  let n = 0;
  let last = core.trI;
  for (let b = 0; b < N; b++) {
    c.process(bl, br, 128);
    rad.set(bl, b * 128);
    while (last !== core.trI && n < out.length) {
      out[n++] = core.trP[last];
      last = (last + 1) & (core.trP.length - 1);
    }
  }
  const f = 440 * 2 ** ((m - 69) / 12);
  const W = Math.round(0.3 * fs);
  const s0 = n - W;
  let e = 0;
  for (let i = 0; i < W; i++) e += out[s0 + i] ** 2;
  if (10 * Math.log10(e / W + 1e-30) < -60) return '.';
  // the harmonics k·f (Hann-windowed), dB: on the octave every odd harmonic is gone, on the twelfth all
  // but every third; a note on its fundamental keeps them, however weak its first harmonic is (the
  // radiation favours the second: an autocorrelation at half the period is fooled by that)
  const h = (k: number, x: Float32Array = out, at = s0) => {
    if (k * f >= 0.45 * fs) return -300;
    let re = 0;
    let im = 0;
    for (let i = 0; i < W; i++) {
      const hw = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
      const w = (2 * Math.PI * k * f * i) / fs;
      re += x[at + i] * hw * Math.cos(w);
      im += x[at + i] * hw * Math.sin(w);
    }
    return 20 * Math.log10(Math.hypot(re, im) + 1e-30);
  };
  const H = Array.from({ length: 9 }, (_, k) => h(k + 1));
  const top = Math.max(...H);
  const odd = Math.max(H[0], H[2], H[4], H[6]);
  const not3 = Math.max(H[0], H[1], H[3], H[4], H[6], H[7]);
  if (not3 < top - 25) return '3';
  if (odd < top - 25) return '2';
  // on its fundamental: is it heard there? (the radiated sound's odd harmonics against its even ones)
  const R0 = Array.from({ length: 8 }, (_, k) => h(k + 1, rad, rad.length - W));
  const rTop = Math.max(...R0);
  const R = R0.map((v) => Math.max(v - rTop, -60));
  const mean = (ks: number[]) => ks.reduce((a, k) => a + R[k - 1], 0) / ks.length;
  if (mean([1, 3, 5, 7]) - mean([2, 4, 6, 8]) < -15) return 'e';
  return '1';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const fss = opt('--fs', '22050,44100,48000,96000').split(',').map(Number);
  const voice = args.includes('--voice') ? JSON.parse(opt('--voice', '{}')) : undefined;
  let wrong = 0;
  let all = 0;
  for (const fs of fss)
    for (const vel of [30, 70, 112]) {
      let row = '';
      for (let m = 34; m <= 76; m++) {
        const r = regime(m, vel, fs, voice);
        row += r;
        all++;
        if (r !== '1') wrong++;
      }
      console.log(`${String(fs).padStart(5)} v${String(vel).padStart(3)} ${row}`);
    }
  console.log(`B♭1…E5: ${all - wrong} of ${all} on their fundamental`);
}
