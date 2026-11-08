// Sound-audit passages, rendered by this engine or another checkout's (--engine) for
// before/after pairs. Original material written for the audit.
//   npx tsx scripts/render-audit.ts --out <dir> [--engine <repo>/packages/engine/src/core/index.ts] [--tag before|after]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts')));
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'audit')));
const TAG = opt('--tag', 'after');
const { renderInstrument } = (await import(pathToFileURL(ENGINE).href)) as typeof import('../packages/engine/src/core/index.ts');
mkdirSync(OUT, { recursive: true });
const FS = 48000;
type Ev = { time: number; event: Record<string, unknown> };
type Note = [number, number, number, number];
const notes = (ns: Note[]): Ev[] => ns.flatMap(([m, t, d, v]) => [{ time: t, event: { type: 'noteOn', midi: m, velocity: v } }, { time: t + d, event: { type: 'noteOff', midi: m } }]);
const ev = (time: number, event: Record<string, unknown>): Ev => ({ time, event });
function save(name: string, inst: string, events: Ev[], dur: number, params: Record<string, unknown> = {}) {
  const r = renderInstrument({ sampleRate: FS, instrument: inst as never, params: params as never, events: events as never, duration: dur });
  let pk = 0;
  for (let i = 0; i < r.left.length; i++) pk = Math.max(pk, Math.abs(r.left[i]), Math.abs(r.right[i]));
  const g = pk > 0 ? Math.min(1, Math.pow(10, -1 / 20) / pk) : 1;
  const L = r.left.map((v) => v * g);
  const R = r.right.map((v) => v * g);
  const wav = join(OUT, `${name}-${TAG}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }, 16));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '192k', join(OUT, `${name}-${TAG}.mp3`)]);
  // a spectrogram of the same render, for the audit write-up
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-lavfi', 'aformat=channel_layouts=mono,showspectrumpic=s=960x320:legend=0:scale=log:fscale=lin:stop=8000:color=intensity', join(OUT, `${name}-${TAG}.png`)]);
  rmSync(wav);
  console.log(`${name}-${TAG}.mp3`);
}
// piano: a held A2 (where the unisons' comb was clearest), repeated C4s and treble staccato
// (attack and knock), and a pedalled chorale in the tenor
save('piano-a2-held', 'piano', notes([[45, 0.1, 4.5, 72]]), 5.5);
save('piano-attacks', 'piano', notes([[60, 0.1, 0.45, 76], [60, 0.6, 0.45, 76], [60, 1.1, 0.45, 76], [60, 1.6, 0.45, 76], [84, 2.3, 0.18, 88], [88, 2.55, 0.18, 88], [91, 2.8, 0.18, 88], [96, 3.05, 0.6, 92]]), 4.6);
{
  const chords = [[43, 50, 55, 59, 67], [45, 52, 57, 60, 69], [41, 48, 53, 57, 65], [43, 50, 55, 59, 62]];
  const ns: Note[] = [];
  const evs: Ev[] = [];
  chords.forEach((c, i) => {
    const t = 0.2 + i * 2;
    c.forEach((m, j) => ns.push([m, t + j * 0.01, 1.95, 62 + (j === c.length - 1 ? 10 : 0)]));
    evs.push(ev(t - 0.05 + (i ? 0.1 : 0), { type: 'sustain', value: 0 }), ev(t + 0.12, { type: 'sustain', value: 1 }));
  });
  evs.push(ev(8.6, { type: 'sustain', value: 0 }));
  save('piano-chorale', 'piano', [...notes(ns), ...evs], 10);
}
// cello: a long D3 with vibrato, then a phrase
save('cello-d3-long', 'cello', notes([[50, 0.1, 5, 84]]), 5.8, { vibrato: 17 });
save('cello-phrase', 'cello', notes([[48, 0.1, 1.2, 80], [52, 1.35, 0.6, 82], [55, 2.0, 0.6, 84], [60, 2.65, 1.6, 90], [59, 4.3, 0.6, 84], [57, 4.95, 0.6, 80], [55, 5.6, 2.2, 82]]), 8.6, { vibrato: 17 });
