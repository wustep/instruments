// Which register does each oboe note settle in? Every note B♭3–A6 at pp, mf and ff, at the sample
// rates the site meets: 1 = its fundamental (right), 2 = the octave, 3 = the twelfth, . = silent. Read
// off the harmonics of the note's last 0.2 s (see regime()).
//   npx tsx scripts/oboe-regimes.ts [--fs 22050,44100,48000,96000] [--voice '{"zeta":0.8}']
// The engine's comment (core/oboe.ts) on why the bore is a two-tube one came from this survey.
import { OboeCore } from '../packages/engine/src/core/oboe.ts';

export function regime(m: number, vel: number, fs: number, voice?: object): string {
  const c = new OboeCore({ sampleRate: fs, dry: true, params: { vibrato: 0, ...(voice ? { voice } : {}) } as never });
  c.schedule({ type: 'noteOn', midi: m, velocity: vel }, 0);
  const bl = new Float32Array(128);
  const br = new Float32Array(128);
  const N = Math.ceil((0.75 * fs) / 128);
  const out = new Float32Array(N * 128);
  for (let b = 0; b < N; b++) {
    c.process(bl, br, 128);
    out.set(bl, b * 128);
  }
  const f = 440 * 2 ** ((m - 69) / 12);
  const W = Math.round(0.2 * fs);
  const s0 = out.length - W;
  let e = 0;
  for (let i = 0; i < W; i++) e += out[s0 + i] ** 2;
  if (10 * Math.log10(e / W + 1e-30) < -75) return '.';
  // the harmonics k·f (Hann-windowed), dB: on the octave every odd harmonic is gone, on the twelfth all
  // but every third; a note on its fundamental keeps them, however weak its first harmonic is (the
  // radiation favours the second: an autocorrelation at half the period is fooled by that)
  const h = (k: number) => {
    if (k * f >= 0.45 * fs) return -300;
    let re = 0;
    let im = 0;
    for (let i = 0; i < W; i++) {
      const hw = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
      const w = (2 * Math.PI * k * f * i) / fs;
      re += out[s0 + i] * hw * Math.cos(w);
      im += out[s0 + i] * hw * Math.sin(w);
    }
    return 20 * Math.log10(Math.hypot(re, im) + 1e-30);
  };
  const H = Array.from({ length: 9 }, (_, k) => h(k + 1));
  const top = Math.max(...H);
  const odd = Math.max(H[0], H[2], H[4], H[6]);
  const not3 = Math.max(H[0], H[1], H[3], H[4], H[6], H[7]);
  if (not3 < top - 25) return '3';
  if (odd < top - 25) return '2';
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
      for (let m = 58; m <= 93; m++) {
        const r = regime(m, vel, fs, voice);
        row += r;
        all++;
        if (r !== '1') wrong++;
      }
      console.log(`${String(fs).padStart(5)} v${String(vel).padStart(3)} ${row}`);
    }
  console.log(`B♭3…A6: ${all - wrong} of ${all} on their fundamental`);
}
