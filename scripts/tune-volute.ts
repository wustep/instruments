// The volute's tuning and regulation tables (packages/engine/src/core/volute-tuning.json), measured
// on the model itself: there is no recording of a volute to fit.
//   npx tsx scripts/tune-volute.ts
// · string: a string under the band sounds a few cents off its free length (the stick–slip's corner
//   is rounded by the loop's losses); pipe: a saturated jet runs sharp of the small-signal phase
//   condition the bore's length is set by. Each note is rendered alone at mezzo-forte (velocity 80),
//   its pitch measured from its harmonic series, and the loop lengthened by the error; three passes.
//   At 22.05, 44.1, 48 and 96 kHz.
// · pipeLevel: the rank's regulation. Each pipe's level (dB) is trimmed so the rank is even and as
//   loud as the strings' mean at mezzo-forte (48 kHz; the same trims at every rate).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VoluteCore, renderInstrument, voluteCeleste, VOLUTE_HI, VOLUTE_LO, VOLUTE_PIPE_LO } from '../packages/engine/src/core/index.ts';
import { analyzeSustained } from '../packages/engine/src/analysis/index.ts';

const RATES = [22050, 44100, 48000, 96000];
// (one choir alone, at the effort it has with the weave in the middle: its share is √2·swell at its end)
const CHOIR = { string: { weave: 0, swell: Math.SQRT1_2, strike: 0, halo: 0 }, pipe: { weave: 1, swell: Math.SQRT1_2, strike: 0, halo: 0 } };
const mid = (r: { left: Float32Array; right: Float32Array }) => r.left.map((v, i) => 0.5 * (v + r.right[i]));
function note(kind: 'string' | 'pipe', fs: number, m: number): { cents: number; rmsDb: number } {
  const r = renderInstrument({ sampleRate: fs, instrument: 'volute', dry: true, params: CHOIR[kind], duration: 2.2, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: 80 } }] });
  const a = analyzeSustained(mid(r), fs, { start: Math.round(1.2 * fs), end: Math.round(2.15 * fs) }, m);
  // the pipes' target is their céleste tuning, a fraction of a hertz above the strings
  const target = kind === 'pipe' ? 1200 * Math.log2(1 + voluteCeleste(m) / (440 * 2 ** ((m - 69) / 12))) : 0;
  return { cents: a.cents - target, rmsDb: a.rmsDb };
}
const notes = { string: Array.from({ length: VOLUTE_HI - VOLUTE_LO + 1 }, (_, i) => VOLUTE_LO + i), pipe: Array.from({ length: VOLUTE_HI - VOLUTE_PIPE_LO + 1 }, (_, i) => VOLUTE_PIPE_LO + i) };
const table = { fs: RATES, string: RATES.map(() => notes.string.map(() => 0)), pipe: RATES.map(() => notes.pipe.map(() => 0)), pipeLevel: notes.pipe.map(() => 0) };
VoluteCore.tuning = table;
for (let pass = 0; pass < 3; pass++) {
  let worst = 0;
  for (const kind of ['string', 'pipe'] as const)
    RATES.forEach((fs, k) => {
      notes[kind].forEach((m, i) => {
        const e = note(kind, fs, m).cents;
        if (!Number.isFinite(e)) throw new Error(`${kind} m${m} @${fs}: no pitch`);
        worst = Math.max(worst, Math.abs(e));
        table[kind][k][i] = +(table[kind][k][i] + e).toFixed(2);
      });
    });
  console.log(`pass ${pass}: worst error before this correction ${worst.toFixed(2)} ¢`);
}
// regulation
const sLevel = notes.string.map((m) => note('string', 48000, m).rmsDb);
const target = sLevel.reduce((a, b) => a + b, 0) / sLevel.length;
const before = notes.pipe.map((m) => note('pipe', 48000, m).rmsDb);
table.pipeLevel = before.map((v) => +(target - v).toFixed(1));
console.log(`strings at mf: mean ${target.toFixed(1)} dB, ${Math.min(...sLevel).toFixed(1)} … ${Math.max(...sLevel).toFixed(1)}; pipes before regulation ${Math.min(...before).toFixed(1)} … ${Math.max(...before).toFixed(1)}`);
// what is left
for (const kind of ['string', 'pipe'] as const)
  RATES.forEach((fs) => {
    const es = notes[kind].map((m) => note(kind, fs, m).cents);
    console.log(`${kind} @${fs}: residual max ${Math.max(...es.map(Math.abs)).toFixed(2)} ¢, rms ${Math.sqrt(es.reduce((s, e) => s + e * e, 0) / es.length).toFixed(2)} ¢; correction ${Math.min(...table[kind][RATES.indexOf(fs)]).toFixed(1)} … ${Math.max(...table[kind][RATES.indexOf(fs)]).toFixed(1)} ¢`);
  });
const after = notes.pipe.map((m) => note('pipe', 48000, m).rmsDb);
console.log(`pipes after regulation ${Math.min(...after).toFixed(1)} … ${Math.max(...after).toFixed(1)} dB`);
writeFileSync(join(import.meta.dirname, '..', 'packages', 'engine', 'src', 'core', 'volute-tuning.json'), JSON.stringify(table) + '\n');
