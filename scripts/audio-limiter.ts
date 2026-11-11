// What the core's own limiter does to each note of a range walk: the output's peak before the
// limiter in the note's attack (first 60 ms) and in its steady part (its last 150 ms held), and the
// deepest cut in each. A peak at the attack well above the steady tone ducks the whole note for the
// limiter's release (0.18 s): heard as a dip after every loud attack.
//   npx tsx scripts/audio-limiter.ts <instrument> [--vel 118] [--preset grand] [--engine <core/index.ts>] [--step 2]
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts')));
const eng = (await import(pathToFileURL(ENGINE).href)) as typeof import('../packages/engine/src/core/index.ts');
const inst = args[0];
const VEL = Number(opt('--vel', '118'));
const STEP = Number(opt('--step', '2'));
const preset = opt('--preset', inst === 'piano' ? 'grand' : '');
const FS = 48000;
const info = eng.INSTRUMENT_INFO[inst as keyof typeof eng.INSTRUMENT_INFO];
const core = eng.createCore({ sampleRate: FS, instrument: inst as never, preset: preset || undefined });
const lim = (core as unknown as { limiter: { process: (L: Float64Array, R: Float64Array, n: number) => void; reduction: number } }).limiter;
const pre = new Float32Array(Math.ceil(FS * 60));
const gain = new Float32Array(pre.length);
let w = 0;
const p = lim.process.bind(lim);
lim.process = (L, R, n) => {
  for (let t = 0; t < n; t++) pre[w + t] = Math.max(Math.abs(L[t]), Math.abs(R[t]));
  p(L, R, n);
  // (the limiter's gain per block: its deepest)
  for (let t = 0; t < n; t++) gain[w + t] = lim.reduction;
  w += n;
};
const notes: number[] = [];
for (let m = info.lo; m <= info.hi; m += STEP) notes.push(m);
let t = 0.1;
for (const m of notes) {
  core.schedule({ type: 'noteOn', midi: m, velocity: VEL }, Math.round(t * FS));
  core.schedule({ type: 'noteOff', midi: m }, Math.round((t + 0.6) * FS));
  t += 0.9;
}
const n = Math.round((t + 0.5) * FS);
const bl = new Float32Array(128), br = new Float32Array(128);
for (let i = 0; i < n; i += 128) core.process(bl, br, Math.min(128, n - i));
const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));
let worst = 0;
const rows: string[] = [];
t = 0.1;
for (const m of notes) {
  const a = Math.round(t * FS);
  let pa = 0, ps = 0, ga = 1, gs = 1;
  for (let i = a; i < a + 0.06 * FS; i++) { pa = Math.max(pa, pre[i]); ga = Math.min(ga, gain[i]); }
  for (let i = a + 0.45 * FS; i < a + 0.6 * FS; i++) { ps = Math.max(ps, pre[i]); gs = Math.min(gs, gain[i]); }
  worst = Math.min(worst, db(gs));
  if (ga < 0.999 || gs < 0.999) rows.push(`  m${m}: before the limiter, attack ${db(pa).toFixed(1)} dBFS, steady ${db(ps).toFixed(1)} dBFS (attack over steady ${(db(pa) - db(ps)).toFixed(1)} dB); cut ${db(ga).toFixed(1)} dB in the attack, ${db(gs).toFixed(1)} dB in the held tone`);
  t += 0.9;
}
console.log(`${inst}${preset ? ' ' + preset : ''} v${VEL}: ${rows.length} of ${notes.length} notes limited; the deepest cut in a held tone ${worst.toFixed(1)} dB`);
console.log(rows.join('\n'));
