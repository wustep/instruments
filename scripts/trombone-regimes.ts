// Which partial does each trombone note settle on? Every note of a size's compass at pp, mf and ff, at the
// sample rates the site meets, held 2 s: 1 = the partial its fingering asks for (right), +1/−1 … = a
// neighbouring one (a cracked note), . = silent, x = no clear pitch (the lips between two). Read off the
// pressure in the mouthpiece's cup over the held note's last 0.3 s at the multiples of the tube's own
// pedal for the fingering (the note over its partial): a note on partial n has its energy at n, 2n, 3n …
// (a pedal note, partial 1, at every multiple).
//   npx tsx scripts/trombone-regimes.ts [--size tenor] [--fs 22050,44100,48000,96000] [--voice '{…}'] [--dur 2]
import { TromboneCore, tromboneFingering, TROMBONE_SIZES, type TromboneSize } from '../packages/engine/src/core/trombone.ts';

export function regime(m: number, vel: number, fs: number, size: TromboneSize, voice?: object, dur = 2): string {
  const c = new TromboneCore({ sampleRate: fs, dry: true, params: { size, vibrato: 0, ...(voice ? { voice } : {}) } as never });
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
  const fg = tromboneFingering(m, size);
  const fb = f / fg.partial;
  const W = Math.round(0.3 * fs);
  const s0 = n - W;
  let mean = 0;
  for (let i = 0; i < W; i++) mean += out[s0 + i];
  mean /= W;
  let e = 0;
  for (let i = 0; i < W; i++) e += (out[s0 + i] - mean) ** 2;
  // (silent: under 20 Pa RMS in the cup; a note buzzes at hundreds to thousands)
  if (e / W < 400) return '.';
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
  const J = Math.min(40, Math.floor((0.45 * fs) / fb));
  const M = Array.from({ length: J }, (_, j) => at((j + 1) * fb));
  const top = Math.max(...M);
  let ns = M.findIndex((v) => v > top - 15) + 1;
  if (ns < 1) return 'x';
  const stray = M.some((v, j) => (j + 1) % ns !== 0 && v > top - 20);
  if (stray) return 'x';
  // (a half-tube note: the off-series energy between partials marks no pitch of the series at all)
  const mid = Math.max(...Array.from({ length: Math.min(J, 12) }, (_, j) => at((j + 1.5) * fb)));
  if (mid > top - 12) return 'x';
  const d = ns - fg.partial;
  return d === 0 ? '1' : d > 0 ? `+${d}` : `${d}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const sizes = (opt('--size') ?? 'tenor').split(',') as TromboneSize[];
  const fss = (opt('--fs') ?? '44100').split(',').map(Number);
  const voice = opt('--voice') ? JSON.parse(opt('--voice')!) : undefined;
  const dur = +(opt('--dur') ?? 2);
  const vels = (opt('--vel') ?? '30,70,112').split(',').map(Number);
  for (const size of sizes)
    for (const fs of fss) {
      const B = TROMBONE_SIZES[size];
      let ok = 0;
      let tot = 0;
      const rows: string[] = [];
      for (const vel of vels) {
        let row = '';
        for (let m = B.lo; m <= B.hi; m++) {
          const r = regime(m, vel, fs, size, voice, dur);
          row += r.padStart(3);
          tot++;
          if (r === '1') ok++;
        }
        rows.push(`v${String(vel).padStart(3)} ${row}`);
      }
      console.log(`${size} @${fs}: ${ok}/${tot} on their partial (notes ${B.lo}–${B.hi})`);
      for (const r of rows) console.log(r);
    }
}
