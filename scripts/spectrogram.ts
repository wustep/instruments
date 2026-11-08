// A spectrogram PNG of one or more WAVs, stacked top to bottom, on the same scale, so model and
// recording can be compared by eye (and by an agent reading the image).
//   npx tsx scripts/spectrogram.ts out.png a.wav [b.wav …] [--start 0] [--dur 0.3] [--fmax 12000]
//       [--win 512] [--hop 32] [--range 80] [--height 300] [--log]
// Each panel's level is relative to its own peak; time runs left to right, frequency upwards.
// --win and --hop are in samples at 48 kHz (scaled for other rates).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { decodeWav, fft } from '../packages/engine/src/analysis/index.ts';

export interface SpecOpts { start?: number; dur?: number; fmax?: number; win?: number; hop?: number; range?: number; height?: number; log?: boolean }
export interface Mono { data: Float32Array; fs: number }

// a perceptual dark-to-bright ramp (inferno-like)
const STOPS = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
function colour(v: number): number[] {
  const x = Math.max(0, Math.min(1, v)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x)), f = x - i;
  return STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f));
}

/** Writes a PNG of one panel per input, stacked, each relative to its own peak. */
export function spectrogramPng(out: string, inputs: Mono[], o: SpecOpts = {}): void {
  const START = o.start ?? 0, DUR = o.dur ?? 0.3, FMAX = o.fmax ?? 12000, WIN = o.win ?? 512, HOP = o.hop ?? 32;
  const RANGE = o.range ?? 80, H = o.height ?? 300, LOG = !!o.log;
  const panels: number[][][] = [];
  let W = 0;
  for (const { data: x, fs } of inputs) {
    const a = Math.round(START * fs), n = Math.round(DUR * fs);
    const hop = Math.max(1, Math.round((HOP * fs) / 48000));
    const win = Math.round((WIN * fs) / 48000);
    const cols = Math.floor(n / hop);
    W = Math.max(W, cols);
    let N = 1;
    while (N < win * 2) N *= 2;
    const re = new Float64Array(N), im = new Float64Array(N);
    const spec: number[][] = [];
    let peak = -Infinity;
    for (let c = 0; c < cols; c++) {
      re.fill(0);
      im.fill(0);
      const s0 = a + c * hop - (win >> 1);
      for (let i = 0; i < win; i++) re[i] = (x[s0 + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win));
      fft(re, im);
      const col: number[] = [];
      for (let r = 0; r < H; r++) {
        const fr = (H - 1 - r) / (H - 1);
        const hz = LOG ? 50 * Math.pow(FMAX / 50, fr) : fr * FMAX;
        const k = Math.min(N / 2, Math.round((hz * N) / fs));
        const db = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-30);
        col.push(db);
        if (db > peak) peak = db;
      }
      spec.push(col);
    }
    panels.push(spec.map((col) => col.map((db) => (db - peak + RANGE) / RANGE)));
  }
  const SEP = 4;
  const HT = panels.length * H + (panels.length - 1) * SEP;
  const px = Buffer.alloc(W * HT * 3, 40);
  panels.forEach((p, pi) => {
    for (let c = 0; c < p.length; c++)
      for (let r = 0; r < H; r++) {
        const at = ((pi * (H + SEP) + r) * W + c) * 3;
        const [R, G, B] = colour(p[c][r]);
        px[at] = R;
        px[at + 1] = G;
        px[at + 2] = B;
      }
  });
  const ppm = Buffer.concat([Buffer.from(`P6\n${W} ${HT}\n255\n`), px]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'ppm', '-i', '-', out], { input: ppm });
}

export function monoOf(path: string): Mono {
  const w = decodeWav(readFileSync(path));
  const x = w.channels.length > 1 ? w.channels[0].map((v, i) => 0.5 * (v + w.channels[1][i])) : w.channels[0];
  return { data: x, fs: w.sampleRate };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const val = (k: string) => (argv.includes(`--${k}`) ? +argv[argv.indexOf(`--${k}`) + 1] : undefined);
  const flags = new Set(['--start', '--dur', '--fmax', '--win', '--hop', '--range', '--height']);
  const files = argv.filter((a, i) => !a.startsWith('--') && !flags.has(argv[i - 1]));
  const out = files.shift();
  if (!out || !files.length) throw new Error('usage: spectrogram.ts out.png in.wav [more.wav]');
  spectrogramPng(out, files.map(monoOf), { start: val('start'), dur: val('dur'), fmax: val('fmax'), win: val('win'), hop: val('hop'), range: val('range'), height: val('height'), log: argv.includes('--log') });
  console.log(`wrote ${out} (${files.length} panel${files.length > 1 ? 's' : ''})`);
}
