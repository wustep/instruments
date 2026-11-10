// An ensemble render's stereo picture, from its WAV (scripts/render-orchestra.ts --wav): how alike the
// two channels are (their correlation: 1 is every part in the middle), the level each channel carries,
// and what a mono sum keeps (a phone's one speaker): its loss against the channels' mean power, and
// its ⅓-octave spectrum against another render's (the comb filtering a delay between the channels
// could leave in mono).
//   npx tsx scripts/stage-image.ts <seated.wav> [<flat.wav>]
import { readFileSync } from 'node:fs';
import { decodeWav } from '../packages/engine/src/analysis/wav.ts';
import { fft } from '../packages/engine/src/analysis/fft.ts';
import { THIRD_OCT } from '../packages/engine/src/analysis/note.ts';

const [a, b] = process.argv.slice(2);
const db = (x: number) => 10 * Math.log10(x + 1e-30);

function stats(path: string) {
  const w = decodeWav(new Uint8Array(readFileSync(path)));
  const [L, R] = w.channels;
  let ll = 0;
  let rr = 0;
  let lr = 0;
  for (let i = 0; i < L.length; i++) {
    ll += L[i] * L[i];
    rr += R[i] * R[i];
    lr += L[i] * R[i];
  }
  const mono = (ll + rr + 2 * lr) / 4;
  return { fs: w.sampleRate, L, R, corr: lr / Math.sqrt(ll * rr), lDb: db(ll / L.length), rDb: db(rr / L.length), monoLoss: db(mono / ((ll + rr) / 2)) };
}

/** the mono sum's mean power in each ⅓ octave (dB) */
function thirds(L: Float32Array, R: Float32Array, fs: number): number[] {
  const N = 8192;
  const acc = new Float64Array(N / 2);
  for (let o = 0; o + N <= L.length; o += N / 2) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = ((L[o + i] + R[o + i]) / 2) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
  }
  return THIRD_OCT.map((fc) => {
    const lo = Math.ceil((fc / Math.pow(2, 1 / 6) / fs) * N);
    const hi = Math.floor((fc * Math.pow(2, 1 / 6) / fs) * N);
    let s = 0;
    for (let k = Math.max(1, lo); k <= Math.min(N / 2 - 1, hi); k++) s += acc[k];
    return db(s);
  });
}

const A = stats(a);
const line = (n: string, s: ReturnType<typeof stats>) => console.log(`${n.padEnd(8)} correlation ${s.corr.toFixed(3)}  L ${s.lDb.toFixed(1)} dB  R ${s.rDb.toFixed(1)} dB  mono sum ${s.monoLoss.toFixed(2)} dB`);
line('this', A);
if (b) {
  const B = stats(b);
  line('other', B);
  const ta = thirds(A.L, A.R, A.fs);
  const tb = thirds(B.L, B.R, B.fs);
  // (the level difference overall taken out: the spectrum's shape)
  const d = ta.map((v, i) => v - tb[i]);
  const mean = d.slice(4, 24).reduce((s, v) => s + v, 0) / 20;
  const dev = d.map((v) => v - mean);
  console.log(`mono ⅓-octave shape, this − other (80 Hz–8 kHz, mean ${mean.toFixed(1)} dB taken out): max ${Math.max(...dev.slice(4, 24)).toFixed(1)} dB, min ${Math.min(...dev.slice(4, 24)).toFixed(1)} dB`);
  console.log(THIRD_OCT.slice(4, 24).map((f, i) => `${f}:${dev[i + 4].toFixed(1)}`).join(' '));
}
