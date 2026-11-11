// The audio audit's before/after clips: the passages where each fixed defect is heard, rendered by an
// earlier checkout's engine (--before) and by this one, as MP3s with a spectrogram of each (the room on,
// as played). Float WAVs go to --wav for the close-ups (scripts/audio-audit-figures.py).
//   npx tsx scripts/render-audio-audit.ts --before <repo>/packages/engine/src/core/index.ts
//       [--out artifacts/realistic-3d/final-symphony/audio-audit] [--wav .cache/audio-audit/clips]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BEFORE = resolve(opt('--before', ''));
const AFTER = resolve(join(import.meta.dirname, '../packages/engine/src/core/index.ts'));
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'final-symphony', 'audio-audit')));
const WAV = resolve(opt('--wav', '.cache/audio-audit/clips'));
mkdirSync(OUT, { recursive: true });
mkdirSync(WAV, { recursive: true });

type Ev = { time: number; event: Record<string, unknown> };
const on = (time: number, midi: number, velocity: number): Ev => ({ time, event: { type: 'noteOn', midi, velocity } });
const off = (time: number, midi: number): Ev => ({ time, event: { type: 'noteOff', midi } });
interface Clip {
  name: string;
  instrument: string;
  events: Ev[];
  seconds: number;
  fs?: number;
}
const clips: Clip[] = [];
{
  // the flute: detached notes a whole tone apart, mf (each begins over the last one's tail)
  const ev: Ev[] = [];
  let t = 0.1;
  for (const m of [62, 64, 66, 68, 70, 72]) {
    ev.push(on(t, m, 72), off(t + 0.4, m));
    t += 0.6;
  }
  clips.push({ name: 'flute-attacks', instrument: 'flute', events: ev, seconds: t + 0.6 });
}
{
  // the flute: a low note repeated, ff and f in turn
  const ev: Ev[] = [];
  let t = 0.1;
  for (let i = 0; i < 12; i++) {
    ev.push(on(t, 65, i % 2 ? 84 : 104), off(t + 0.085, 65));
    t += 0.12;
  }
  clips.push({ name: 'flute-repeat', instrument: 'flute', events: ev, seconds: t + 0.6 });
}
{
  // the flute: a held note, the mod wheel flicked between far positions (each move one MIDI message, as a
  // device sends a quick flick), then moved in single steps
  const ev: Ev[] = [on(0.1, 72, 64)];
  let t = 0.5;
  for (let i = 0; i < 10; i++) ev.push({ time: (t += 0.23), event: { type: 'control', cc: 1, value: (i % 2 ? 30 : 120) / 127 } });
  for (let v = 30; v <= 110; v++) ev.push({ time: (t += 0.02), event: { type: 'control', cc: 1, value: v / 127 } });
  ev.push(off(t + 0.5, 72));
  clips.push({ name: 'flute-mod-wheel', instrument: 'flute', events: ev, seconds: t + 1 });
}
{
  // the flute at 96 kHz: a scale from C4 (sharp before: the voicing table had no 96 kHz row)
  const ev: Ev[] = [];
  let t = 0.1;
  for (const m of [60, 62, 64, 65, 67, 69, 71, 72]) {
    ev.push(on(t, m, 72), off(t + 0.45, m));
    t += 0.5;
  }
  clips.push({ name: 'flute-96k-scale', instrument: 'flute', events: ev, seconds: t + 0.6, fs: 96000 });
}
{
  // the trombone re-tongued at alternating dynamics, high then middle
  const ev: Ev[] = [];
  let t = 0.1;
  for (const m of [72, 53])
    for (let i = 0; i < 8; i++) {
      ev.push(on(t, m, i % 2 ? 84 : 104), off(t + 0.085, m));
      t += 0.12;
    }
  clips.push({ name: 'trombone-retongue', instrument: 'trombone', events: ev, seconds: t + 0.6 });
}
{
  // the bassoon: low B♭1-ish repeated, then a leap of two octaves and more
  const ev: Ev[] = [];
  let t = 0.1;
  for (const m of [39, 71, 39, 71])
    for (let i = 0; i < 4; i++) {
      ev.push(on(t, m, i % 2 ? 84 : 104), off(t + 0.085, m));
      t += 0.12;
    }
  clips.push({ name: 'bassoon-leap', instrument: 'bassoon', events: ev, seconds: t + 0.6 });
}
{
  // the timpani: a run that needs drums retuned while they ring (ff), then a slow walk (pp)
  const ev: Ev[] = [];
  let t = 0.1;
  for (const m of [45, 47, 49, 51, 52, 54, 52, 51, 49, 47, 45]) {
    ev.push(on(t, m, 110));
    t += 0.15;
  }
  t += 0.6;
  for (const m of [38, 40, 42, 44, 46, 48]) {
    ev.push(on(t, m, 40));
    t += 0.6;
  }
  clips.push({ name: 'timpani-retune', instrument: 'timpani', events: ev, seconds: t + 1 });
}

// each clip's events (for the close-ups: scripts/audio-audit-figures.py)
writeFileSync(join(WAV, 'clips.json'), JSON.stringify(clips.map((c) => ({ name: c.name, fs: c.fs ?? 48000, events: c.events.map((e) => ({ t: e.time, type: e.event.type })) }))));
for (const [tag, path] of [['before', BEFORE], ['after', AFTER]] as const) {
  const { renderInstrument } = (await import(pathToFileURL(path).href)) as typeof import('../packages/engine/src/core/index.ts');
  for (const c of clips) {
    const fs = c.fs ?? 48000;
    const r = renderInstrument({ sampleRate: fs, instrument: c.instrument as never, events: c.events as never, duration: c.seconds });
    const raw = join(WAV, `${c.name}-${tag}.wav`);
    writeFileSync(raw, encodeWav({ sampleRate: fs, channels: [r.left, r.right] }, 32));
    // (as played: the room on, no normalising)
    const tmp = join(OUT, `${c.name}-${tag}.wav`);
    writeFileSync(tmp, encodeWav({ sampleRate: fs, channels: [r.left, r.right] }, 16));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-ar', '48000', '-b:a', '160k', join(OUT, `${c.name}-${tag}.mp3`)]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-lavfi', 'aformat=channel_layouts=mono,showspectrumpic=s=960x300:legend=0:scale=log:fscale=lin:stop=16000:color=intensity', join(OUT, `${c.name}-${tag}.png`)]);
    rmSync(tmp);
    console.log(`${c.name}-${tag}.mp3`);
  }
}
