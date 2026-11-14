// The board's knock under a pluck, the recordings' and the model's. When the finger lets a string go, its
// pull on the soundboard is let go at once, and the board's own modes ring for a few hundredths of a second:
// the "tock" under a harp's note, plainest under the top strings, whose own tone is small and lies well
// above it. Read here where a string's partials leave room to see it: under the fundamentals of the strings
// from D6 up, the first 80 ms's spectrum summed over 150–380 Hz and over 380–850 Hz (where the recorded
// board's modes are: --modes), against the tone's own level (RMS, 80–240 ms after the pluck).
//   npx tsx scripts/harp-knock.ts [--engine <core/index.ts>] [--voice v.json]
//   npx tsx scripts/harp-knock.ts --modes     the board's own modes: the peaks of the first 80 ms that are no
//                                             partial of the plucked string, counted over the plucks from G3 up
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderInstrument } from '../packages/engine/src/core/index.ts';
import { HARP_CACHE, harpRefs, loadMono, type HarpRef } from './harp-refs.ts';

const MARK_VEL: Record<string, number> = { p: 40, mp: 55, mf: 70, f: 95 };
const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const RENDER: typeof renderInstrument = opt('--engine') ? (await import(pathToFileURL(opt('--engine')!).href)).renderInstrument : renderInstrument;
const voice = opt('--voice') ? JSON.parse(readFileSync(opt('--voice')!, 'utf8')) : undefined;

const onsetOf = (x: Float32Array): number => {
  let pk = 0;
  for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.05 * pk) return i;
  return 0;
};
const toneOf = (x: Float32Array, fs: number, on: number): number => {
  let s = 0;
  const i0 = on + Math.round(0.08 * fs);
  const i1 = on + Math.round(0.24 * fs);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (i1 - i0) + 1e-14);
};
/** the first 80 ms's spectrum (a Hann window, every 6 Hz) summed over a band (dB re the tone) */
function bandOf(x: Float32Array, fs: number, on: number, tone: number, lo: number, hi: number): number {
  const n = Math.round(0.08 * fs);
  let e = 0;
  for (let f = lo; f < hi; f += 6) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const xi = x[on + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n));
      re += xi * Math.cos((2 * Math.PI * f * i) / fs);
      im += xi * Math.sin((2 * Math.PI * f * i) / fs);
    }
    e += (re * re + im * im) / n / n;
  }
  return 10 * Math.log10(e + 1e-14) - tone;
}
/** the knock under a string: the bands 150–380 Hz and 380–850 Hz of its first 80 ms (dB re the tone), and how
 *  the second dies: the same over 40–120 ms */
export function knockOf(x: Float32Array, fs: number): [number, number, number] {
  const on = onsetOf(x);
  const tone = toneOf(x, fs, on);
  return [bandOf(x, fs, on, tone, 150, 380), bandOf(x, fs, on, tone, 380, 850), bandOf(x, fs, on + Math.round(0.04 * fs), tone, 380, 850)];
}
const modelOf = (r: HarpRef): Float32Array => {
  const out = RENDER({ sampleRate: 44100, instrument: 'harp' as never, dry: true, params: { human: 0, voice } as never, events: [{ time: 0.05, event: { type: 'noteOn', midi: r.midi, velocity: MARK_VEL[r.mark] ?? 70 } }], duration: 1 });
  const m = new Float32Array(out.left.length);
  for (let i = 0; i < m.length; i++) m[i] = 0.5 * (out.left[i] + out.right[i]);
  return m;
};

const refs = await harpRefs();
if (args.includes('--modes')) {
  const hist = new Map<number, { lv: number[]; who: Set<string> }>();
  for (const r of refs.filter((r) => r.midi >= 55)) {
    const { x, fs } = loadMono(join(HARP_CACHE, r.file));
    const on = onsetOf(x);
    const n = Math.round(0.08 * fs);
    const tone = toneOf(x, fs, on);
    const sp: [number, number][] = [];
    for (let f = 120; f < 1500; f += 6) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < n; i++) {
        const xi = x[on + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n));
        re += xi * Math.cos((2 * Math.PI * f * i) / fs);
        im += xi * Math.sin((2 * Math.PI * f * i) / fs);
      }
      sp.push([f, 10 * Math.log10((re * re + im * im) / n / n + 1e-14)]);
    }
    // (a peak at least 40 Hz from every partial of the plucked string, within 34 dB of the tone)
    for (let i = 1; i < sp.length - 1; i++) {
      const [f, v] = sp[i];
      if (!(v > sp[i - 1][1] && v >= sp[i + 1][1]) || Math.abs(f / r.f0 - Math.round(f / r.f0)) * r.f0 <= 40 || v - tone <= -34) continue;
      const b = Math.round(f / 12) * 12;
      const h = hist.get(b) ?? hist.set(b, { lv: [], who: new Set() }).get(b)!;
      h.lv.push(v - tone);
      h.who.add(r.name);
    }
  }
  for (const b of [...hist.keys()].sort((a, b) => a - b)) {
    const h = hist.get(b)!;
    if (h.lv.length >= 4) console.log(`${String(b).padStart(5)} Hz  under ${String(h.lv.length).padStart(2)} plucks, ${h.lv.sort((a, b) => a - b)[h.lv.length >> 1].toFixed(0)} dB re the tone (a median)   ${[...h.who].join(' ')}`);
  }
} else {
  console.log('the first 80 ms under the fundamental, dB re the tone: 150–380 Hz, 380–850 Hz (and that band 40 ms on): the recording | the model');
  const diffs: Record<string, number[]> = { fit: [], held: [] };
  // (the strings from D6 up: their fundamentals lie over 1.1 kHz, clear of the band)
  for (const r of refs.filter((r) => r.midi >= 86)) {
    const rec = loadMono(join(HARP_CACHE, r.file));
    const a = knockOf(rec.x, rec.fs);
    const b = knockOf(modelOf(r), 44100);
    diffs[r.held ? 'held' : 'fit'].push(b[1] - a[1]);
    console.log(`${r.name.padEnd(3)} ${r.mark.padEnd(2)}${r.held ? '*' : ' '} ${a.map((v) => v.toFixed(1).padStart(6)).join('')} |${b.map((v) => v.toFixed(1).padStart(6)).join('')}`);
  }
  const stat = (v: number[]) => `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)} dB (mean), ${(v.reduce((a, b) => a + Math.abs(b), 0) / v.length).toFixed(1)} apart`;
  console.log(`the model's knock over the recording's, 380–850 Hz: fit strings ${stat(diffs.fit)}; held-out (*) ${stat(diffs.held)}`);
}
