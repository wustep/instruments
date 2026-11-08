import { renderNote, DEFAULT_CALIBRATION } from '../packages/engine/src/core/index.ts';
import { spectrum, peakIn } from '../packages/engine/src/analysis/index.ts';

const rigid = process.argv.includes('--rigid');
const cal = rigid
  ? { ...DEFAULT_CALIBRATION, board: { ...DEFAULT_CALIBRATION.board, modalMass: 1e7 }, bridgeY: { midi: [21, 108], val: [1e-7, 1e-7] } }
  : DEFAULT_CALIBRATION;
for (const midi of [21, 33, 45, 60, 72, 84, 96, 108]) {
  const r = renderNote(midi, 80, 2.5, { dry: true, calibration: cal, params: { unisonDetune: 0, sympathetic: false, phantom: false } });
  const v = r.core.voices[midi - 21];
  const spec = r.core.specs[midi - 21];
  const st = spec.strings[0];
  const sp = spectrum(r.left, r.sampleRate, 4800, 96000, 1 << 20);
  const devs: string[] = [];
  for (let k = 1; k <= 30; k++) {
    const f = k * st.f0 * Math.sqrt(1 + st.B * k * k);
    if (f > 9000) break;
    const pk = peakIn(sp, f - 0.15 * st.f0, f + 0.15 * st.f0);
    if (!pk) { devs.push('--'); continue; }
    devs.push((1200 * Math.log2(pk.f / f)).toFixed(1));
  }
  console.log(`m${midi} S=${v.dispS[0]} comp=${v.bridgeComp[0].toFixed(3)} rms=${v.dispRms[0].toFixed(2)} max=${v.dispMax[0].toFixed(2)} K=${v.dispK[0]} N=${v.N[0]} | ${devs.join(' ')}`);
}
