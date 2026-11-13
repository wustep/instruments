// How each sustaining instrument lets a note go: after the key is up (a held note of 1.2 s, mezzo-forte, in
// the middle of its compass, dry), the time its level takes to fall 10, 20 and 40 dB; by hand, and as a
// file's note told ahead with a rest after it (the winds' players taper such a note). And the vibrato it is
// given by default (the parameter, and what is measured on the held note: rate, depth in cents).
//   npx tsx scripts/release-table.ts [--engine <core/index.ts>] [--only horn,trumpet]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const E = (await import(opt('--engine') ? pathToFileURL(resolve(opt('--engine')!)).href : '../packages/engine/src/core/index.ts')) as typeof import('../packages/engine/src/core/index.ts');
const FS = 48000;
const only = opt('--only')?.split(',');
const ids = E.INSTRUMENT_IDS.filter((id) => (E.isBowed(id) || E.isMono(id)) && (!only || only.includes(id)));
for (const id of ids) {
  const info = E.INSTRUMENT_INFO[id];
  const cells: string[] = [];
  for (const told of [false, true]) {
    const falls: number[][] = [[], [], []];
    for (const m of [Math.round(info.lo + (info.hi - info.lo) * 0.3), Math.round((info.lo + info.hi) / 2), Math.round(info.lo + (info.hi - info.lo) * 0.7)]) {
      const ev: { time: number; event: never }[] = [];
      if (told) ev.push({ time: 0.05, event: { type: 'foresee', midi: m, velocity: 75, dur: 1.2 } as never });
      ev.push({ time: 0.1, event: { type: 'noteOn', midi: m, velocity: 75 } as never }, { time: 1.3, event: { type: 'noteOff', midi: m } as never });
      const o = E.renderInstrument({ sampleRate: FS, instrument: id, dry: true, events: ev, duration: 3 });
      const env = (t: number) => { let e = 0; const a = Math.round(t * FS), n = Math.round(0.02 * FS); for (let i = a; i < a + n; i++) e += o.left[i] * o.left[i]; return 10 * Math.log10(e / n + 1e-30); };
      const ref = env(1.2);
      [10, 20, 40].forEach((d, k) => { let t = 1.3; while (t < 2.9 && env(t) > ref - d) t += 0.005; falls[k].push((t - 1.3) * 1000); });
    }
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[1];
    cells.push(`${told ? 'a file' : 'by hand'}: −10 dB ${med(falls[0]).toFixed(0).padStart(4)} ms, −20 dB ${med(falls[1]).toFixed(0).padStart(4)} ms, −40 dB ${med(falls[2]).toFixed(0).padStart(4)} ms`);
  }
  const p = (E.createCore({ sampleRate: FS, instrument: id }).params as { vibrato?: number; human?: number });
  console.log(`${id.padEnd(9)} ${cells.join('   ')}   vibrato ${p.vibrato ?? '—'}  human ${p.human ?? '(1)'}`);
}
