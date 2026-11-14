// The wave a flute note settles at, for the jet's flow: what the jet's sharper aim leaves room for (flute.ts
// AIM_FULL). Each note held from silence, its bore's return at its peak (`level`) once it has settled, over its
// jet's flow scale (velScale) to the power AIM_POW; the line AIM_FULL draws, and how far each note is from it
// (its notes of 64 and more: a soft note's wave is a little under, and the line is set on the low side).
//   npx tsx scripts/flute-tube-full.ts [--fs 44100,48000] [--vel 40,64,84,110,127] [--pow 0.7]
import { AIM_FULL, AIM_POW, FLUTE_VOICE, FluteCore } from '../packages/engine/src/core/flute.ts';
import { interp } from '../packages/engine/src/core/util.ts';

const arg = (k: string, d: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const RATES = arg('--fs', '44100,48000').split(',').map(Number);
const VELS = arg('--vel', '40,64,84,110,127').split(',').map(Number);
const POW = Number(arg('--pow', String(AIM_POW)));
const line = (m: number) => interp(m, AIM_FULL.midi, AIM_FULL.full);
const V = FLUTE_VOICE;
const velScale = (vel: number) => V.driveLo + (V.driveHi - V.driveLo) * Math.pow(vel / 127, V.driveCurve);

let worst = 0;
for (const fs of RATES) {
  console.log(`${fs} Hz   note: level / velScale^${POW} at ${VELS.join(', ')}   (the line)`);
  for (let m = 60; m <= 96; m += 2) {
    const row: number[] = [];
    for (const vel of VELS) {
      const c = new FluteCore({ sampleRate: fs, dry: true, params: { human: 0 } });
      c.schedule({ type: 'noteOn', midi: m, velocity: vel }, 0);
      const L = new Float32Array(128);
      const R = new Float32Array(128);
      const lv: number[] = [];
      for (let i = 0; i < Math.round((1.4 * fs) / 128); i++) {
        c.process(L, R, 128);
        if (i * 128 > 1.0 * fs) lv.push((c as unknown as { level: number }).level);
      }
      lv.sort((a, b) => a - b);
      row.push(lv[lv.length >> 1] / Math.pow(velScale(vel), POW));
    }
    const spoke = row.filter((_, i) => VELS[i] >= 64);
    for (const r of spoke) worst = Math.max(worst, Math.abs(r / line(m) - 1));
    console.log(`  ${m}: ${row.map((r) => r.toFixed(1).padStart(5)).join(' ')}   (${line(m).toFixed(1)})`);
  }
}
console.log(`furthest from the line: ${(worst * 100).toFixed(0)} %`);
