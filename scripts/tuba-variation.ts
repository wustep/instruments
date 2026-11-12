// How a tubist's held notes move (the University of Iowa MIS tuba, analysis only): over each recorded note's
// held part, the level's shape (where it peaks, how it falls: dB/s), how far the level wanders about that
// shape (dB, a standard deviation, from one tenth of a second to the next), how far the brightness wanders (the spectral centroid, cents),
// and the pitch (cents). These are what the engine's player is given to vary by (core/lipcone.ts `human`).
//   npx tsx scripts/tuba-variation.ts [--model]   (--model: the engine's own notes, read the same way)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav, segmentNotes } from '../packages/engine/src/analysis/index.ts';
import { renderInstrument } from '../packages/engine/src/core/index.ts';
import { ENS_CACHE, REF_FILES } from './ensemble-refs.ts';

import { look, q, type Row } from './variation-lib.ts';

const MODEL = process.argv.includes('--model');
const rows: Row[] = [];
if (MODEL) {
  const fs = 44100;
  for (const [dyn, vel] of [['pp', 30], ['mf', 70], ['ff', 112]] as const)
    for (let m = 26; m <= 60; m += 2) {
      const out = renderInstrument({ sampleRate: fs, instrument: 'tuba', dry: true, events: [{ time: 0.05, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 1.65, event: { type: 'noteOff', midi: m } }], duration: 2 });
      const r = look(out.left, fs, Math.round(0.05 * fs), Math.round(1.75 * fs), dyn);
      if (r) rows.push(r);
    }
} else {
  for (const f of REF_FILES.filter((r) => r.instrument === 'tuba')) {
    const a = decodeWav(readFileSync(join(ENS_CACHE, 'wav', f.file.replace(/\.aiff$/, '.wav'))));
    const x = a.channels[0];
    for (const seg of segmentNotes(x, a.sampleRate, f.merge ? { merge: f.merge } : {})) {
      const r = look(x, a.sampleRate, seg.start, seg.end, f.dyn);
      if (r) rows.push(r);
    }
  }
}
for (const dyn of ['pp', 'mf', 'ff']) {
  const rs = rows.filter((r) => r.dyn === dyn);
  const f = (k: keyof Row, d = 2) => [0.25, 0.5, 0.75].map((p) => q(rs.map((r) => r[k] as number), p).toFixed(d)).join(' / ');
  console.log(`${dyn} (${rs.length} notes, held ${q(rs.map((r) => r.dur), 0.5).toFixed(1)} s): the level peaks ${f('peakAt')} of the way through; falls ${f('fall', 1)} dB/s; wanders ${f('levelSd')} dB; brightness ${f('centSd', 0)} ¢; pitch ${f('pitchSd', 1)} ¢   (quartiles)`);
}
