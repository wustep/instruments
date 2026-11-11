// Loudness of each Orchestra voice at its own centre (VOICE_INFO.centre − 7, centre, + 7 semitones),
// held notes at pp / mf / ff (velocity 28 / 72 / 118): each note's integrated loudness (BS.1770,
// LUFS), the median per dynamic, as the Orchestra hears each part before its bus (the room on, no seat).
//   npx tsx scripts/audio-levels.ts [--engine <core/index.ts>] [--json out.json] [--only trombone,…]
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VOICE_INFO, VOICES } from '../apps/web/src/orchestra/assign.ts';
import { lufs } from './audio-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts')));
const JSON_OUT = opt('--json', '');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const eng = (await import(pathToFileURL(ENGINE).href)) as typeof import('../packages/engine/src/core/index.ts');
const FS = 48000;
const out: Record<string, Record<string, number>> = {};
const med = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1];
for (const v of VOICES) {
  if (ONLY.length && !ONLY.includes(v)) continue;
  const info = VOICE_INFO[v];
  const row: Record<string, number> = {};
  for (const [d, vel] of [['pp', 28], ['mf', 72], ['ff', 118]] as const) {
    const ls: number[] = [];
    for (const m of [info.centre - 7, info.centre, info.centre + 7].map((m) => Math.max(info.lo, Math.min(info.hi, m)))) {
      const r = eng.renderInstrument({ sampleRate: FS, instrument: info.instrument, preset: info.preset, events: [{ time: 0.05, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 2.05, event: { type: 'noteOff', midi: m } }] as never, duration: 2.6 });
      ls.push(lufs(r.left, r.right, FS));
    }
    row[d] = +med(ls).toFixed(1);
  }
  out[v] = row;
  console.log(`${v.padEnd(9)} pp ${row.pp.toFixed(1).padStart(6)}  mf ${row.mf.toFixed(1).padStart(6)}  ff ${row.ff.toFixed(1).padStart(6)} LUFS`);
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
