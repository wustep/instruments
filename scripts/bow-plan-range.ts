// How slow and how fast a planned stroke may be drawn (bowed.ts K_LO, K_HI, and the tap limit): one
// held note per string, position and dynamic, its bow speed and contact point both scaled by k (so
// the string's amplitude v/β is the dynamic's); printed for each k: the level against k = 1 (dB) and
// how periodic the sound is (the autocorrelation at the note's period: 1 a clean Helmholtz motion).
//   npx tsx scripts/bow-plan-range.ts [violin|viola|cello|bass …]
import { BowedCore } from '../packages/engine/src/core/index.ts';

const FS = 48000;
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);
function run(inst: 'violin' | 'viola' | 'cello' | 'bass', midi: number, vel: number, k: number) {
  const core = new BowedCore({ sampleRate: FS, instrument: inst, dry: true, params: { vibrato: 0, bowChanges: false } });
  core.schedule({ type: 'noteOn', midi, velocity: vel }, 0);
  const n = Math.round(3 * FS);
  const x = new Float32Array(n);
  const L = new Float32Array(64);
  const R = new Float32Array(64);
  let beta = 0;
  let tap = 0;
  for (let i = 0; i + 64 <= n; i += 64) {
    core.process(L, R, 64);
    x.set(L, i);
    if (i === 0) {
      const s = core.strings.find((q) => q.bowing)!;
      s.kBow = k;
      (core as unknown as { bowTargets(s: unknown, v: number): void }).bowTargets(s, vel);
      beta = s.beta;
      tap = (0.5 * beta * FS) / et(midi);
    }
  }
  let sq = 0;
  for (let i = FS; i < 2.5 * FS; i++) sq += x[i] * x[i];
  const P = FS / et(midi);
  let best = 0;
  for (let p = Math.floor(P) - 1; p <= Math.ceil(P) + 1; p++) {
    let a = 0;
    let b = 0;
    for (let i = FS; i < 2 * FS; i++) {
      a += x[i] * x[i + p];
      b += x[i] * x[i];
    }
    best = Math.max(best, a / b);
  }
  return { beta, tap, db: 10 * Math.log10(sq / (1.5 * FS) + 1e-20), per: best };
}
const KS = [1, 1.5, 1.25, 0.8, 0.7, 0.6, 0.5, 0.45];
const OPEN = { violin: [55, 62, 69, 76], viola: [48, 55, 62, 69], cello: [36, 43, 50, 57], bass: [28, 33, 38, 43] };
const want = process.argv.slice(2);
for (const inst of ['violin', 'viola', 'cello', 'bass'] as const) {
  if (want.length && !want.includes(inst)) continue;
  console.log(inst, '  note, dynamic, the contact at k = 1 in samples; then level/periodicity at k =', KS.join(', '));
  // (the highest string takes every note above it: the others are played to a fourth up)
  for (const o of OPEN[inst])
    for (const up of o === OPEN[inst][3] ? [0, 5, 12, 19] : [0, 4])
      for (const vel of [45, 80, 110]) {
        const r = KS.map((k) => run(inst, o + up, vel, k));
        console.log(`  ${o + up} v${vel} tap ${r[0].tap.toFixed(1)}  ` + r.map((q, i) => (i ? `${(q.db - r[0].db >= 0 ? '+' : '') + (q.db - r[0].db).toFixed(1)}/${q.per.toFixed(2)}` : `${q.db.toFixed(1)}/${q.per.toFixed(2)}`)).join('  '));
      }
}
