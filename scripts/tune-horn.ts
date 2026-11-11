// Voicing pass for the horn model: play every note (vibrato off, mf), measure the sounding pitch
// (autocorrelation, 0.6–1.0 s), and store the correction in cents per sample rate (it lengthens the bore
// and lowers the lips by as much). Two iterations
// converge to about a cent. Run after any change to the voicing: npx tsx scripts/tune-horn.ts
// The tuba is the same engine (lipcone.ts) and is voiced the same way: npx tsx scripts/tune-horn.ts --instrument tuba
// (its low notes are measured later and over longer: a C1's period is 31 ms).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HornCore, HORN_HI, HORN_LO } from '../packages/engine/src/core/horn.ts';
import { TubaCore, TUBA_HI, TUBA_LO } from '../packages/engine/src/core/tuba.ts';

const TUBA = process.argv.includes('--instrument') && process.argv[process.argv.indexOf('--instrument') + 1] === 'tuba';
const Core = TUBA ? TubaCore : HornCore;
const [LO, HI] = TUBA ? [TUBA_LO, TUBA_HI] : [HORN_LO, HORN_HI];
const OUT = join(import.meta.dirname, '..', `packages/engine/src/core/${TUBA ? 'tuba' : 'horn'}-tuning.json`);
const midis = Array.from({ length: HI - LO + 1 }, (_, i) => LO + i);
const FSS = [22050, 44100, 48000, 96000];

/** the pitch a held note settles at, cents from equal temperament (`inst`: the horn, or the tuba, read later
 *  and over longer: a C1's period is 31 ms) */
export function measureCents(fs: number, m: number, vel = 70, inst: 'horn' | 'tuba' = TUBA ? 'tuba' : 'horn'): number {
  const [T0, TW] = inst === 'tuba' ? [1.0, 0.6] : [0.6, 0.35];
  const c = new (inst === 'tuba' ? TubaCore : HornCore)({ sampleRate: fs, dry: true, params: { vibrato: 0, noise: 0 } });
  c.schedule({ type: 'noteOn', midi: m, velocity: vel }, 64);
  const n = Math.round(((T0 + TW + 0.15) * fs) / 128) * 128;
  const L = new Float32Array(n);
  const bl = new Float32Array(128);
  const br = new Float32Array(128);
  for (let i = 0; i < n; i += 128) {
    c.process(bl, br, 128);
    L.set(bl, i);
  }
  const f = 440 * 2 ** ((m - 69) / 12);
  const s0 = Math.round(T0 * fs);
  const W = Math.round(TW * fs);
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i < W; i++) s += L[s0 + i] * L[s0 + i + lag];
    return s;
  };
  const lo = Math.floor(fs / (f * 1.08));
  const hi = Math.ceil(fs / (f * 0.93));
  let best = -Infinity;
  let bl2 = lo;
  for (let lag = lo; lag <= hi; lag++) {
    const v = ac(lag);
    if (v > best) {
      best = v;
      bl2 = lag;
    }
  }
  const a = ac(bl2 - 1);
  const b = ac(bl2);
  const cc = ac(bl2 + 1);
  const p = (0.5 * (a - cc)) / (a - 2 * b + cc);
  return 1200 * Math.log2(fs / (bl2 + p) / f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (let iter = 0; iter < 3; iter++) {
    const cur = JSON.parse(readFileSync(OUT, 'utf8'));
    Core.tuningTable = cur;
    const table: number[][] = FSS.map((fs, fi) =>
      midis.map((m, mi) => {
        const err = measureCents(fs, m);
        const prev = cur.midi?.length ? (cur.cents?.[fi]?.[mi] ?? 0) : 0;
        // the correction lengthens the bore by the cents it played sharp
        return Number.isFinite(err) && Math.abs(err) < 300 ? +(prev + err).toFixed(2) : prev;
      }),
    );
    writeFileSync(OUT, JSON.stringify({ fs: FSS, midi: midis, cents: table }) + '\n');
  }
  Core.tuningTable = JSON.parse(readFileSync(OUT, 'utf8'));
  for (const fs of FSS) console.log(`residual cents @${fs}`, midis.map((m) => measureCents(fs, m).toFixed(1)).join(' '));
}
