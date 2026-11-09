// The bow in the hand (controllers 128–130), rendered: for each bowed instrument, six strokes of a
// hand on the bow (slow, then fast, down and up), first on the open string the bow finds, then with a
// key held. An MP3 with the site's room, and a spectrogram. There is no "before": without these
// controllers the engine is unchanged (golden.test.ts).
//   npx tsx scripts/render-hand-bow.ts [--out artifacts/round3/hand-bow]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { CC_HAND_BOW_OFF, CC_HAND_BOW_POS, CC_HAND_BOW_SPEED, renderInstrument } from '../packages/engine/src/core/index.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const OUT = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : join(import.meta.dirname, '..', 'artifacts', 'round3', 'hand-bow'));
mkdirSync(OUT, { recursive: true });
const FS = 48000;
type Ev = { time: number; event: Record<string, unknown> };
const cc = (time: number, c: number, value: number): Ev => ({ time, event: { type: 'control', cc: c, value } });

for (const [inst, key] of [['violin', 76], ['viola', 67], ['cello', 57]] as const) {
  const ev: Ev[] = [];
  // a hand's stroke: speed rises and falls as a raised cosine, sent every 10 ms as a pointer would
  let pos = 0.1;
  const stroke = (t0: number, dur: number, peak: number, dir: 1 | -1) => {
    for (let t = 0; t < dur; t += 0.01) {
      const v = dir * peak * 0.5 * (1 - Math.cos((2 * Math.PI * t) / dur));
      pos = Math.min(1, Math.max(0, pos + (v * 0.01) / 0.65));
      ev.push(cc(t0 + t, CC_HAND_BOW_SPEED, v), cc(t0 + t, CC_HAND_BOW_POS, pos));
    }
    ev.push(cc(t0 + dur, CC_HAND_BOW_SPEED, 0));
  };
  ev.push(cc(0.05, CC_HAND_BOW_SPEED, 0));
  stroke(0.2, 1.2, 0.12, 1);
  stroke(1.5, 1.2, 0.12, -1);
  stroke(2.9, 0.5, 0.45, 1);
  stroke(3.5, 0.5, 0.45, -1);
  ev.push({ time: 4.2, event: { type: 'noteOn', midi: key, velocity: 90 } });
  stroke(4.4, 1.0, 0.25, 1);
  stroke(5.5, 1.0, 0.25, -1);
  ev.push({ time: 6.7, event: { type: 'noteOff', midi: key } }, cc(6.8, CC_HAND_BOW_OFF, 0));
  const r = renderInstrument({ sampleRate: FS, instrument: inst, events: ev as never, duration: 8 });
  let peak = 0;
  let nan = 0;
  for (const v of r.left) {
    if (!Number.isFinite(v)) nan++;
    peak = Math.max(peak, Math.abs(v));
  }
  const wav = join(OUT, `${inst}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [r.left, r.right] }, 16));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '128k', join(OUT, `${inst}.mp3`)]);
  const mono = new Float32Array(r.left.length);
  for (let i = 0; i < mono.length; i++) mono[i] = 0.5 * (r.left[i] + r.right[i]);
  spectrogramPng(join(OUT, `${inst}.png`), [{ data: mono, fs: FS }], { start: 0, dur: 8, fmax: 8000, win: 2048, hop: 256, height: 260 });
  rmSync(wav);
  console.log(`${inst}: peak ${peak.toFixed(3)}, non-finite ${nan}, sounding at the end ${JSON.stringify((r.core as unknown as { sounding(): number[] }).sounding())}`);
}
