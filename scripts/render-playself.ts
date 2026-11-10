// Each instrument's own piece (orchestra/pieces.ts DEMOS), offline, as the play icon plays it: the
// file through demoSong() into one engine core, as the solo player schedules it. Checks every note
// is in the instrument's range and prints the level, the most notes at once and the cost; writes
// one MP3 per instrument.
//   npx tsx scripts/render-playself.ts [--out artifacts/realistic-3d/final-next5/2-playself/audio] [--only cello] [--seconds 30]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTRUMENT_INFO, INSTRUMENT_IDS } from '../packages/engine/src/core/instrument.ts';
import { renderInstrument, type TimedEvent } from '../packages/engine/src/core/render.ts';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { DEMOS, demoSong } from '../apps/web/src/orchestra/pieces.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = opt('--out', 'artifacts/realistic-3d/final-next5/2-playself/audio');
const ONLY = opt('--only', '');
const SECONDS = Number(opt('--seconds', '0'));
const FS = 48000;
mkdirSync(OUT, { recursive: true });
const db = (x: number) => (20 * Math.log10(x + 1e-12)).toFixed(1);

const rows: Record<string, unknown>[] = [];
for (const id of INSTRUMENT_IDS) {
  if (ONLY && id !== ONLY) continue;
  const d = DEMOS[id];
  const b = readFileSync(join('apps/web/public/pieces', d.file));
  const song = demoSong(parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), d);
  const { lo, hi } = INSTRUMENT_INFO[id];
  const events: TimedEvent[] = [];
  let out = 0;
  let held = 0;
  let poly = 0;
  // (the player starts 0.12 s ahead; the same lead here)
  const lead = 0.12;
  const dur = SECONDS || song.duration + 3;
  for (const e of song.events) {
    if (e.t > dur) break;
    if (e.kind === 'on') {
      if (e.midi < lo || e.midi > hi) out++;
      poly = Math.max(poly, ++held);
      events.push({ time: e.t + lead, event: { type: 'noteOn', midi: e.midi, velocity: e.vel } });
    } else if (e.kind === 'off') {
      held--;
      events.push({ time: e.t + lead, event: { type: 'noteOff', midi: e.midi } });
    } else {
      const type = e.cc === 64 ? 'sustain' : e.cc === 66 ? 'sostenuto' : 'soft';
      events.push({ time: e.t + lead, event: { type, value: e.value } as TimedEvent['event'] });
    }
  }
  const r = renderInstrument({ sampleRate: FS, instrument: id, events, duration: dur });
  let pk = 0;
  let s2 = 0;
  let loud = 0;
  const n = r.left.length;
  // the loudest second (RMS over 1 s windows), the level a listener sets the volume by
  const win = FS;
  for (let i = 0; i < n; i++) {
    pk = Math.max(pk, Math.abs(r.left[i]), Math.abs(r.right[i]));
    s2 += r.left[i] * r.left[i] + r.right[i] * r.right[i];
  }
  for (let i = 0; i + win <= n; i += win / 2) {
    let w = 0;
    for (let j = i; j < i + win; j++) w += r.left[j] * r.left[j] + r.right[j] * r.right[j];
    loud = Math.max(loud, Math.sqrt(w / (2 * win)));
  }
  const row = { instrument: id, piece: `${d.composer}, ${d.title}`, seconds: +song.duration.toFixed(1), notes: song.events.filter((e) => e.kind === 'on').length, outOfRange: out, mostAtOnce: poly, peakDb: +db(pk), rmsDb: +db(Math.sqrt(s2 / (2 * n))), loudestSecondDb: +db(loud), realTimePct: +((r.cpuMs / dur) / 10).toFixed(1) };
  rows.push(row);
  console.log(`${id.padEnd(8)} ${row.piece}: ${row.seconds} s, ${row.notes} notes (${out} out of range, ${poly} at once), peak ${row.peakDb} dBFS, rms ${row.rmsDb}, loudest second ${row.loudestSecondDb} dBFS, ${row.realTimePct} % of real time`);
  const wav = join(OUT, `${id}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [r.left, r.right] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '160k', join(OUT, `${id}.mp3`)]);
  rmSync(wav);
}
if (!ONLY && !SECONDS) writeFileSync(join(OUT, 'levels.json'), JSON.stringify(rows, null, 1) + '\n');
