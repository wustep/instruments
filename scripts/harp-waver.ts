// How a plucked string's partials move while they ring, the recordings' and the model's. A real string's
// partial is never one dying sine: its two polarisations lie a little apart in pitch and die at different
// rates, and the other strings answer it, so its level wavers as it falls (the VCSL harp's A4: the
// fundamental 20 dB down at a tenth of a second, back up 12 dB by a quarter). A model whose partials are
// single exponentials has none of it, and no measure of the judge's sees that (levels over a quarter second,
// a decay's slope). For each recorded pluck (scripts/harp-refs.ts) and the model's pluck of the same string
// at the same dynamic (`human` 0), each of the first partials followed every 10 ms from 30 ms after the
// pluck until it has fallen 30 dB (1.5 s at most):
//   waver: how far its level stands from the straight fall fitted to it (dB, RMS)
//   rate:  how often that crosses the fall (Hz: half the crossings a second)
//   start: its level over the first 40 ms above the fall's own start (dB): the pluck's first moment against
//          what rings on
//   npx tsx scripts/harp-waver.ts [--engine <core/index.ts>] [--voice v.json] [--per] [--partials 4]
//   --average: the voicing's one string (`own` 0: what is fitted and judged), not this harp's own strings
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderInstrument } from '../packages/engine/src/core/index.ts';
import { HARP_CACHE, harpRefs, loadMono } from './harp-refs.ts';
import { onsetOf, waverOf, type Waver } from './waver-lib.ts';

const MARK_VEL: Record<string, number> = { p: 40, mp: 55, mf: 70, f: 95 };
const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const RENDER: typeof renderInstrument = opt('--engine') ? (await import(pathToFileURL(opt('--engine')!).href)).renderInstrument : renderInstrument;
const voice = opt('--voice') ? JSON.parse(readFileSync(opt('--voice')!, 'utf8')) : undefined;
const NP = Number(opt('--partials') ?? 4);

const refs = await harpRefs();
const med = (xs: number[]): number => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};
const q = (xs: number[], p: number): number => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : NaN;
};
const rows: { name: string; mark: string; midi: number; k: number; ref: Waver; mod: Waver }[] = [];
for (const r of refs) {
  const rec = loadMono(join(HARP_CACHE, r.file));
  const out = RENDER({ sampleRate: 44100, instrument: 'harp' as never, dry: true, params: { human: 0, ...(args.includes('--average') ? { own: 0 } : {}), voice } as never, events: [{ time: 0.05, event: { type: 'noteOn', midi: r.midi, velocity: MARK_VEL[r.mark] ?? 70 } }], duration: 2.2 });
  const m = new Float32Array(out.left.length);
  for (let i = 0; i < m.length; i++) m[i] = 0.5 * (out.left[i] + out.right[i]);
  const f0m = 440 * 2 ** ((r.midi - 69) / 12);
  for (let k = 0; k < NP; k++) {
    if (!(r.levels[k] > -30) || !Number.isFinite(r.ratios[k])) continue;
    const a = waverOf(rec.x, rec.fs, r.f0 * r.ratios[k], onsetOf(rec.x));
    // (the model's partial at the recording's own stretch is near enough: its window is 33 Hz wide)
    const b = waverOf(m, 44100, f0m * r.ratios[k], onsetOf(m));
    if (!a || !b) continue;
    rows.push({ name: r.name, mark: r.mark, midi: r.midi, k: k + 1, ref: a, mod: b });
    if (args.includes('--per')) console.log(`${r.name.padEnd(3)} ${r.mark.padEnd(2)} partial ${k + 1}  waver ${a.waver.toFixed(1).padStart(5)} / ${b.waver.toFixed(1).padStart(5)} dB   rate ${a.rate.toFixed(1).padStart(4)} / ${b.rate.toFixed(1).padStart(4)} Hz   start ${a.start.toFixed(1).padStart(5)} / ${b.start.toFixed(1).padStart(5)} dB   fall ${a.fall.toFixed(0).padStart(4)} / ${b.fall.toFixed(0).padStart(4)} dB/s`);
  }
}
console.log('the recordings / the model (medians; the quartiles in brackets)');
const line = (name: string, rs: typeof rows) => {
  const g = (f: (w: Waver) => number, who: 'ref' | 'mod') => `${med(rs.map((r) => f(r[who]))).toFixed(1)} [${q(rs.map((r) => f(r[who])), 0.25).toFixed(1)}–${q(rs.map((r) => f(r[who])), 0.75).toFixed(1)}]`;
  console.log(`${name.padEnd(22)} n ${String(rs.length).padStart(3)}  waver ${g((w) => w.waver, 'ref')} / ${g((w) => w.waver, 'mod')} dB   rate ${g((w) => w.rate, 'ref')} / ${g((w) => w.rate, 'mod')} Hz   start ${g((w) => w.start, 'ref')} / ${g((w) => w.start, 'mod')} dB`);
};
line('every partial', rows);
for (let k = 1; k <= NP; k++) line(`partial ${k}`, rows.filter((r) => r.k === k));
line('wire strings (< A2)', rows.filter((r) => r.midi < 45));
line('gut, A2–B4', rows.filter((r) => r.midi >= 45 && r.midi < 72));
line('C5 and above', rows.filter((r) => r.midi >= 72));
line('forte', rows.filter((r) => r.mark === 'f'));
line('softer', rows.filter((r) => r.mark !== 'f'));
