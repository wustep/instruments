// How a woodwind player's held notes move (the University of Iowa MIS flute, oboe, clarinet and bassoon:
// analysis only), read as scripts/tuba-variation.ts reads the tuba's (scripts/variation-lib.ts): over each
// recorded note's held part, how far the level wanders about its own shape (dB, a standard deviation, from one
// tenth of a second to the next), how far the brightness wanders (the spectral centroid, cents) and the pitch
// (cents); where the level peaks and how it falls. These are what a player in the woodwinds' engines would be
// given to vary by (`human`, as the tuba's and the trombone's have).
//   npx tsx scripts/winds-variation.ts [--instrument flute,oboe,clarinet,bassoon] [--model] [--params '{"human":0}']
//   (--model: the engine's own notes, read the same way)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav, segmentNotes } from '../packages/engine/src/analysis/index.ts';
import { INSTRUMENT_INFO, renderInstrument, type InstrumentId } from '../packages/engine/src/core/index.ts';
import { ENS_CACHE, REF_FILES } from './ensemble-refs.ts';
import { look, q, type Row } from './variation-lib.ts';

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const IDS = (arg('--instrument') ?? 'flute,oboe,clarinet,bassoon').split(',') as InstrumentId[];
const PARAMS = arg('--params') ? (JSON.parse(arg('--params')!) as Record<string, unknown>) : undefined;
const MODEL = process.argv.includes('--model');

for (const id of IDS) {
  const rows: Row[] = [];
  if (MODEL) {
    const fs = 44100;
    const { lo, hi } = INSTRUMENT_INFO[id];
    // (each dynamic's notes in one sitting, as the recordings' runs are: a player's stream runs on)
    for (const [dyn, vel] of [['pp', 30], ['mf', 70], ['ff', 112]] as const) {
      const ms: number[] = [];
      for (let m = lo + 1; m <= hi - 1; m += 2) ms.push(m);
      const events = ms.flatMap((m, i) => [{ time: 0.05 + 2.8 * i, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 2.25 + 2.8 * i, event: { type: 'noteOff', midi: m } }]);
      const out = renderInstrument({ sampleRate: fs, instrument: id, dry: true, params: PARAMS, events, duration: 2.8 * ms.length } as never);
      ms.forEach((_, i) => {
        const r = look(out.left, fs, Math.round((0.05 + 2.8 * i) * fs), Math.round((2.35 + 2.8 * i) * fs), dyn);
        if (r) rows.push(r);
      });
    }
  } else {
    for (const f of REF_FILES.filter((r) => r.instrument === id)) {
      const a = decodeWav(readFileSync(join(ENS_CACHE, 'wav', f.file.replace(/\.aiff$/, '.wav'))));
      const x = a.channels[0];
      for (const seg of segmentNotes(x, a.sampleRate, f.merge ? { merge: f.merge } : {})) {
        const r = look(x, a.sampleRate, seg.start, seg.end, f.dyn);
        if (r) rows.push(r);
      }
    }
  }
  console.log(`${id}${MODEL ? ` (the engine${PARAMS ? ` ${JSON.stringify(PARAMS)}` : ''})` : ' (the recordings)'}`);
  for (const dyn of ['pp', 'mf', 'ff']) {
    const rs = rows.filter((r) => r.dyn === dyn);
    const f = (k: keyof Row, d = 2) => [0.25, 0.5, 0.75].map((p) => q(rs.map((r) => r[k] as number), p).toFixed(d)).join(' / ');
    console.log(`  ${dyn} (${rs.length} notes, held ${q(rs.map((r) => r.dur), 0.5).toFixed(1)} s): the level peaks ${f('peakAt')} of the way through; falls ${f('fall', 1)} dB/s; wanders ${f('levelSd')} dB; brightness ${f('centSd', 0)} ¢; pitch ${f('pitchSd', 1)} ¢   (quartiles)`);
  }
}
