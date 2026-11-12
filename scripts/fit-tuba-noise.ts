// The tuba's breath noise, fitted again on the fit half of the Iowa notes (even MIDI numbers). The first fit
// held the noise under 0.4 and ended on that bound at the bottom of the compass: the model's soft low notes
// were 6 dB cleaner than the recordings' (harmonics over noise 33 dB against 27), its middle and top at mf
// and ff 2–4 dB noisier. Three numbers are stepped one at a time, the judge's own score on the fit half
// (harmonics, centroid, noise, attack: each error over the recording's spread) kept where it falls: the
// noise at the bottom of the compass and at the top, and how much airier a soft note is (noiseSoft).
//   npx tsx scripts/fit-tuba-noise.ts
import { TUBA_VOICE } from '../packages/engine/src/core/index.ts';
import { compareAll, harmErr } from './calibrate-ensemble.ts';
import { isHeldOut, sustainedErrors } from './judge.ts';

const MEASURES = ['harmonics', 'centroid', 'noise', 'attack'];
async function score(voice: Record<string, number>): Promise<{ all: number; per: Record<string, number> }> {
  const pairs = await compareAll({ only: ['tuba'], params: { tuba: { voice } } });
  const { errs, measures } = sustainedErrors(pairs as never, harmErr);
  const fit = errs.filter((e) => !isHeldOut(e));
  const per: Record<string, number> = {};
  for (const m of measures.filter((x) => MEASURES.includes(x.name))) {
    const v = fit.map((e) => Math.abs(e.errs[m.name]) / m.spread).filter(Number.isFinite);
    per[m.name] = v.reduce((a, b) => a + b, 0) / v.length;
  }
  return { all: MEASURES.reduce((t, k) => t + per[k], 0) / MEASURES.length, per };
}
const V: Record<string, number> = { noise: TUBA_VOICE.noise, noiseTop: TUBA_VOICE.noiseTop, noiseSoft: TUBA_VOICE.noiseSoft ?? 0 };
let best = await score(V);
console.log(`start ${JSON.stringify(V)}: ${best.all.toFixed(3)} ${JSON.stringify(best.per)}`);
const GRID: Record<string, number[]> = { noise: [0.55, 0.75, 1.0, 1.3], noiseTop: [0.08, 0.14, 0.2], noiseSoft: [0.5, 1, 1.6] };
for (const round of [0, 1]) {
  for (const k of Object.keys(GRID)) {
    const keep = V[k];
    let bestX = keep;
    for (const x of round ? [keep * 0.8, keep * 1.25] : GRID[k]) {
      V[k] = +x.toFixed(3);
      const s = await score(V);
      console.log(`  ${k} ${V[k]}: ${s.all.toFixed(3)} (noise ${s.per.noise.toFixed(2)}, harmonics ${s.per.harmonics.toFixed(2)}, centroid ${s.per.centroid.toFixed(2)}, attack ${s.per.attack.toFixed(2)})`);
      if (s.all < best.all - 0.002) {
        best = s;
        bestX = V[k];
      }
    }
    V[k] = bestX;
  }
  console.log(`round ${round}: ${JSON.stringify(V)}: ${best.all.toFixed(3)}`);
}
console.log(JSON.stringify(V));
