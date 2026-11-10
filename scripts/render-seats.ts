// A roll call across the stage: each instrument of a lineup plays alone in turn (a short rising phrase
// in its own register), then all of them together, from the middle of the stage (--flat, as before
// seating) or from their seats (orchestra/seats.ts). On headphones the players should walk from left to
// right. Bus at 1/√n as the browser mixes it; writes an MP3.
//   npx tsx scripts/render-seats.ts [--lineup violin,violin,viola,cello] [--flat] [--out dir] [--name x]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderInstrument, type TimedEvent } from '../packages/engine/src/core/render.ts';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { VOICE_INFO, VOICES, type Voice } from '../apps/web/src/orchestra/assign.ts';
import { busGain } from '../apps/web/src/orchestra/mix.ts';
import { soundSeats } from '../apps/web/src/orchestra/seats.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const lineup = opt('--lineup', 'violin,violin,viola,cello').split(',') as Voice[];
for (const v of lineup) if (!VOICES.includes(v)) throw new Error(`no voice ${v}`);
const FLAT = args.includes('--flat');
const OUT = opt('--out', 'artifacts/realistic-3d/final-next5/orchestra-opus/audio');
const NAME = opt('--name', `roll-${lineup.join('-')}`) + (FLAT ? '-before' : '-after');
const FS = 48000;
const TURN = 1.6;
const seats = soundSeats(lineup.map((v) => VOICE_INFO[v]));
const dur = lineup.length * TURN + 3.2;
const n = Math.ceil(dur * FS);
const L = new Float32Array(n);
const R = new Float32Array(n);
const g = busGain(lineup.length);
lineup.forEach((v, k) => {
  const info = VOICE_INFO[v];
  // a phrase near the middle of its range: root, third, fifth (a piano plays them as a chord)
  const root = Math.round(info.centre / 12) * 12 + (v === 'cello' ? -5 : 0);
  const t0 = 0.2 + k * TURN;
  const ev: TimedEvent[] = [];
  const steps = [0, 4, 7];
  steps.forEach((s, j) => {
    const on = info.instrument === 'piano' ? t0 : t0 + j * 0.42;
    ev.push({ time: on, event: { type: 'noteOn', midi: root + s, velocity: 84 } });
    ev.push({ time: t0 + (info.instrument === 'piano' ? 1.2 : j * 0.42 + 0.4), event: { type: 'noteOff', midi: root + s } });
  });
  // all together at the end: each its root, a long note
  const tAll = 0.2 + lineup.length * TURN;
  ev.push({ time: tAll, event: { type: 'noteOn', midi: root + (k % 2 ? 7 : 0), velocity: 84 } });
  ev.push({ time: tAll + 2.2, event: { type: 'noteOff', midi: root + (k % 2 ? 7 : 0) } });
  const r = renderInstrument({ sampleRate: FS, instrument: info.instrument, preset: info.preset, events: ev, duration: dur, params: FLAT ? undefined : { seat: seats[k] } });
  for (let i = 0; i < n; i++) {
    L[i] += g * r.left[i];
    R[i] += g * r.right[i];
  }
});
mkdirSync(OUT, { recursive: true });
const wav = join(OUT, `${NAME}.wav`);
writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }));
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '160k', join(OUT, `${NAME}.mp3`)]);
rmSync(wav);
console.log(`${NAME}: ${lineup.map((v, k) => `${v} ${FLAT ? 'middle' : seats[k].map((x) => x.toFixed(2)).join(',')}`).join(' · ')}`);
