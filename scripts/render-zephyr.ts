// The zephyr's clips, offline (there is no engine before it and no recording: these are what it sounds like).
//   npx tsx scripts/render-zephyr.ts [--out artifacts/round3/zephyr] [--only still-air]
//
//   still-air     its own piece (orchestra/pieces.ts DEMOS.zephyr), as the file player plays it: each note
//                 told ahead (`foresee`), the player in the engine
//   still-air-0   the same notes, `human` 0 and nothing told: the model alone
//   scale         C2 to C7 in fourths, each held 1.4 s, pp then mf then ff
//   tilt          one chord with the ribbons square to the wind, then at 4°, then at 8°
//   swell         one chord, the file's dynamics taking it from pp to ff and back (CC_DYNAMICS)
// Each as an MP3 with its loudness and peak; --wav keeps the WAV beside it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CC_DYNAMICS } from '../packages/engine/src/core/instrument.ts';
import { renderInstrument, type TimedEvent } from '../packages/engine/src/core/render.ts';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { DEMOS, demoSong } from '../apps/web/src/orchestra/pieces.ts';
import { lufs, peakDb } from './audio-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = opt('--out', 'artifacts/round3/zephyr');
const ONLY = opt('--only', '');
const FS = 48000;
mkdirSync(OUT, { recursive: true });

function piece(told: boolean): { events: TimedEvent[]; duration: number } {
  const d = DEMOS.zephyr;
  const b = readFileSync(join('apps/web/public/pieces', d.file));
  const song = demoSong(parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), d);
  const events: TimedEvent[] = [];
  const lead = 0.2;
  // each note's length: its 'off' (first in, first out per pitch)
  const open = new Map<number, number[]>();
  const durs = new Map<number, number>();
  song.events.forEach((e, i) => {
    if (e.kind === 'on') open.set(e.midi, [...(open.get(e.midi) ?? []), i]);
    else if (e.kind === 'off') {
      const k = open.get(e.midi)?.shift();
      if (k !== undefined) durs.set(k, e.t - song.events[k].t);
    }
  });
  song.events.forEach((e, i) => {
    if (e.kind === 'on') {
      if (told) events.push({ time: e.t + lead, event: { type: 'foresee', midi: e.midi, velocity: e.vel, dur: durs.get(i) ?? 1 } });
      events.push({ time: e.t + lead, event: { type: 'noteOn', midi: e.midi, velocity: e.vel } });
    } else if (e.kind === 'off') events.push({ time: e.t + lead, event: { type: 'noteOff', midi: e.midi } });
  });
  return { events, duration: song.duration + 3 };
}

const held = (ps: number[], t: number, len: number, vel: number): TimedEvent[] => ps.flatMap((p, k) => [{ time: t + 0.012 * k, event: { type: 'noteOn', midi: p, velocity: vel } }, { time: t + len, event: { type: 'noteOff', midi: p } }] as TimedEvent[]);

const CLIPS: Record<string, () => { events: TimedEvent[]; duration: number; params?: Record<string, unknown>[]; at?: number[] }> = {
  'still-air': () => piece(true),
  'still-air-0': () => ({ ...piece(false), params: [{ human: 0 }], at: [0] }),
  scale: () => {
    const events: TimedEvent[] = [];
    let t = 0.2;
    for (const vel of [22, 75, 120]) {
      for (let m = 36; m <= 96; m += 5) {
        events.push(...held([m], t, 1.4, vel));
        t += 1.7;
      }
      t += 0.5;
    }
    return { events, duration: t + 1 };
  },
  tilt: () => ({ events: [0, 1, 2].flatMap((k) => held([39, 51, 58, 63, 67, 74], 0.2 + 4 * k, 3.4, 84)), duration: 13, params: [{ tilt: 0 }, { tilt: 0.5 }, { tilt: 1 }], at: [0, 4, 8] }),
  swell: () => {
    const events = held([44, 51, 60, 63, 68, 75], 0.2, 9, 30);
    for (let k = 0; k <= 80; k++) {
      const u = k / 80;
      events.push({ time: 0.6 + 8 * u, event: { type: 'control', cc: CC_DYNAMICS, value: 64 * Math.sin(Math.PI * u) } });
    }
    return { events, duration: 11 };
  },
};

const rows: string[] = [];
for (const [name, make] of Object.entries(CLIPS)) {
  if (ONLY && name !== ONLY) continue;
  const c = make();
  // (a clip in parts with different settings is rendered part by part on one core's own clock)
  let L = new Float32Array(0);
  let R = new Float32Array(0);
  const parts = c.params ?? [{}];
  const at = c.at ?? [0];
  for (let k = 0; k < parts.length; k++) {
    const t0 = at[k];
    const t1 = at[k + 1] ?? c.duration;
    const events = c.events.filter((e) => e.time >= t0 && e.time < t1).map((e) => ({ ...e, time: e.time - t0 }));
    const r = renderInstrument({ sampleRate: FS, instrument: 'zephyr', params: parts[k] as never, events, duration: t1 - t0 });
    const l = new Float32Array(L.length + r.left.length);
    l.set(L);
    l.set(r.left, L.length);
    const rr = new Float32Array(R.length + r.right.length);
    rr.set(R);
    rr.set(r.right, R.length);
    L = l;
    R = rr;
  }
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, Buffer.from(encodeWav({ sampleRate: FS, channels: [L, R] })));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '2', join(OUT, `${name}.mp3`)]);
  if (!args.includes('--wav')) rmSync(wav);
  rows.push(`${name.padEnd(12)} ${(L.length / FS).toFixed(1).padStart(6)} s   ${lufs(L, R, FS).toFixed(1).padStart(6)} LUFS   peak ${peakDb(L, R).toFixed(1).padStart(6)} dB`);
}
console.log(rows.join('\n'));
