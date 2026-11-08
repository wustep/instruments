// Regression renders for the Chimera-review engine changes (block-size independence, gliding
// room): the same passages through an earlier engine (before) and this one (after), MP3 +
// spectrogram each, and the numbers in artifacts/round3/chimera/README.md.
//   npx tsx scripts/render-chimera.ts --before <repo>/packages/engine/src/core/index.ts [--out dir]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { spectrogramPng } from './spectrogram.ts';

type Core = typeof import('../packages/engine/src/core/index.ts');
const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'chimera'))!);
const engines: [string, Core][] = [
  ['before', (await import(pathToFileURL(resolve(opt('--before')!)).href)) as Core],
  ['after', (await import('../packages/engine/src/core/index.ts')) as Core],
];
mkdirSync(OUT, { recursive: true });
const FS = 48000;

function save(name: string, tag: string, L: Float32Array, R: Float32Array, dur: number): void {
  let pk = 0;
  for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const g = Math.pow(10, -1 / 20) / pk;
  const l = L.map((v) => v * g);
  const r = R.map((v) => v * g);
  const wav = join(OUT, `${name}-${tag}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [l, r] }, 16));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '192k', join(OUT, `${name}-${tag}.mp3`)]);
  rmSync(wav);
  spectrogramPng(join(OUT, `${name}-${tag}.png`), [{ data: l.map((v, i) => 0.5 * (v + r[i])), fs: FS }], { dur, fmax: 16000, win: 1024, hop: 96, height: 300 });
}

/** a held note or chord while a control is dragged (a new value every ~10 ms, as pointer events come) */
function drag(E: Core, inst: string, param: 'room' | 'lid', path: [number, number][], notes: number[], dur: number): { L: Float32Array; R: Float32Array } {
  const core = E.createCore({ instrument: inst as never, sampleRate: FS } as never) as any;
  core.setParams({ [param]: path[0][1] });
  if (inst === 'piano') core.schedule({ type: 'sustain', value: 1 }, core.frame);
  for (const m of notes) core.schedule({ type: 'noteOn', midi: m, velocity: 84 }, core.frame + 200);
  const n = Math.round(dur * FS);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const bl = new Float32Array(128);
  const br = new Float32Array(128);
  const at = (t: number) => {
    for (let k = 1; k < path.length; k++) {
      const [t0, v0] = path[k - 1];
      const [t1, v1] = path[k];
      if (t <= t1) return v0 + ((v1 - v0) * Math.max(0, t - t0)) / (t1 - t0);
    }
    return path[path.length - 1][1];
  };
  for (let i = 0; i < n; i += 128) {
    if ((i / 128) % 4 === 0) core.setParams({ [param]: at(i / FS) });
    core.process(bl, br, 128);
    L.set(bl.subarray(0, Math.min(128, n - i)), i);
    R.set(br.subarray(0, Math.min(128, n - i)), i);
  }
  return { L, R };
}

const roomPath: [number, number][] = [[0, 0.2], [0.8, 0.2], [1.8, 0.9], [2.6, 0.9], [3.4, 0.2], [4.2, 0.2]];
const lidPath: [number, number][] = [[0, 1], [0.8, 1], [1.8, 0], [2.6, 0], [3.4, 1], [4.2, 1]];
const passages: [string, string, 'room' | 'lid', [number, number][], number[]][] = [
  ['room-drag-piano', 'piano', 'room', roomPath, [48, 55, 64, 72]],
  ['room-drag-violin', 'violin', 'room', roomPath, [69]],
  ['room-drag-flute', 'flute', 'room', roomPath, [74]],
  ['room-drag-trumpet', 'trumpet', 'room', roomPath, [67]],
  ['lid-drag-piano', 'piano', 'lid', lidPath, [48, 55, 64, 72]],
];
const metrics: Record<string, Record<string, number>> = {};
const hfMaxDb = (x: Float32Array, a: number, b: number) => {
  let m = -Infinity;
  for (let i = Math.round(a * FS); i + 96 < Math.round(b * FS); i += 96) {
    let s = 0;
    for (let j = 0; j < 96; j++) {
      const d = x[i + j] - 2 * x[i + j - 1] + x[i + j - 2];
      s += d * d;
    }
    m = Math.max(m, 10 * Math.log10(s / 96 + 1e-30));
  }
  return m;
};
for (const [tag, E] of engines) {
  for (const [name, inst, param, path, notes] of passages) {
    const r = drag(E, inst, param, path, notes, 4.6);
    save(name, tag, r.L, r.R, 4.6);
    // clicks: the loudest 2 ms of high frequencies while dragging, over the louder of the two ends held still
    const lo = drag(E, inst, param, [[0, path[0][1]]], notes, 4.6).L;
    const hi = drag(E, inst, param, [[0, path[2][1]]], notes, 4.6).L;
    const ex = hfMaxDb(r.L, 0.8, 3.4) - Math.max(hfMaxDb(lo, 0.8, 3.4), hfMaxDb(hi, 0.8, 3.4));
    (metrics[name] ??= {})[tag] = ex;
    console.log(`${name}-${tag}: drag HF excess ${ex.toFixed(1)} dB`);
  }
}
// host block size: a phrase at 128 frames per call (Web Audio) and at 37 (an odd host)
const phrase = (m: number) => [0, 1, 2, 3].flatMap((i) => [
  { time: 0.1 + i * 0.45, event: { type: 'noteOn', midi: m + [0, 4, 7, 12][i], velocity: 70 + 10 * i } },
  { time: 0.1 + i * 0.45 + 0.38, event: { type: 'noteOff', midi: m + [0, 4, 7, 12][i] } },
]);
const env = (x: Float32Array) => {
  const w = 960;
  const e: number[] = [];
  for (let i = 0; i + w <= x.length; i += w) {
    let s = 0;
    for (let j = 0; j < w; j++) s += x[i + j] ** 2;
    e.push(10 * Math.log10(s / w + 1e-20));
  }
  return e;
};
const envDiff = (a: number[], b: number[]) => a.reduce((m, v, i) => (v > -70 ? Math.max(m, Math.abs(v - b[i])) : m), 0);
for (const [inst, m] of [['violin', 67], ['trumpet', 60], ['flute', 72], ['piano', 60]] as const) {
  for (const [tag, E] of engines) {
    const at = (quantum: number) => E.renderInstrument({ instrument: inst as never, sampleRate: FS, events: phrase(m) as never, duration: 2.4, quantum } as never);
    const q128 = at(128);
    const q37 = at(37);
    save(`blocksize-${inst}-q37`, tag, q37.left, q37.right, 2.4);
    if (tag === 'after') save(`blocksize-${inst}-q128`, tag, q128.left, q128.right, 2.4);
    const d = envDiff(env(q128.left), env(q37.left));
    (metrics[`blocksize-${inst}`] ??= {})[tag] = d;
    console.log(`blocksize-${inst}-${tag}: 37 vs 128 frames per call, loudness differs by up to ${d.toFixed(1)} dB (20 ms frames)`);
  }
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 1) + '\n');
