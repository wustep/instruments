// How peaky a held note is: its crest factor (peak over RMS, dB) over the steady part, the recorded player's
// (University of Iowa MIS, analysis only) beside the engine's dry note at the same dynamic. A model whose
// harmonics all crest together peaks far over a recorded instrument of the same loudness, and meets its
// limiter that much sooner.
//   npx tsx scripts/crest.ts --instrument tuba [--dyn ff] [--engine <core/index.ts>]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav, segmentNotes, identifyNote } from '../packages/engine/src/analysis/index.ts';
import { ENS_CACHE, REF_FILES } from './ensemble-refs.ts';
import { DYN_VEL, useEngine } from './calibrate-ensemble.ts';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const id = (opt('--instrument') ?? 'tuba') as 'tuba';
const dyn = (opt('--dyn') ?? 'ff') as 'ff';
await useEngine(opt('--engine'));
const E = (await import(opt('--engine') ? pathToFileURL(resolve(opt('--engine')!)).href : '../packages/engine/src/core/index.ts')) as typeof import('../packages/engine/src/core/index.ts');
const crest = (x: ArrayLike<number>, a: number, b: number) => {
  let pk = 0, e = 0;
  for (let i = a; i < b; i++) { const v = Math.abs(x[i]); if (v > pk) pk = v; e += x[i] * x[i]; }
  return 20 * Math.log10(pk / Math.sqrt(e / (b - a)));
};
const rows: { midi: number; ref: number; model: number }[] = [];
for (const f of REF_FILES.filter((r) => r.instrument === id && r.dyn === dyn && !r.variant)) {
  const w = decodeWav(new Uint8Array(readFileSync(join(ENS_CACHE, 'wav', f.file.replace(/\.aiff$/, '.wav')))));
  const x = w.channels[0];
  for (const s of segmentNotes(x, w.sampleRate)) {
    const dur = (s.end - s.start) / w.sampleRate;
    if (dur < 0.8) continue;
    const a = s.start + Math.round(0.3 * w.sampleRate), b = s.end - Math.round(0.2 * w.sampleRate);
    const midi = identifyNote(x, w.sampleRate, s, E.INSTRUMENT_INFO[id].lo, E.INSTRUMENT_INFO[id].hi).midi;
    const o = E.renderInstrument({ sampleRate: 44100, instrument: id, dry: true, params: { human: 0 } as never, events: [{ time: 0.1, event: { type: 'noteOn', midi, velocity: DYN_VEL[dyn] } }, { time: 1.6, event: { type: 'noteOff', midi } }], duration: 1.7 });
    rows.push({ midi, ref: crest(x, a, b), model: crest(o.left, Math.round(0.6 * 44100), Math.round(1.5 * 44100)) });
  }
}
rows.sort((p, q) => p.midi - q.midi);
console.log(`${id} ${dyn}: crest factor, dB (recorded / model dry)`);
console.log(rows.map((r) => `${E.midiName(r.midi)} ${r.ref.toFixed(0)}/${r.model.toFixed(0)}`).join('  '));
const med = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1];
console.log(`median: recorded ${med(rows.map((r) => r.ref)).toFixed(1)} dB, model ${med(rows.map((r) => r.model)).toFixed(1)} dB (${rows.length} notes)`);
