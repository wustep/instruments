// Voicing pass for the horn model: play every note (vibrato off, mf), measure the sounding pitch
// (autocorrelation, 0.6–1.0 s), and store the correction in cents per sample rate (it lengthens the bore
// and lowers the lips by as much). Two iterations
// converge to about a cent. Run after any change to the voicing: npx tsx scripts/tune-horn.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HornCore, HORN_HI, HORN_LO } from '../packages/engine/src/core/horn.ts';

const OUT = join(import.meta.dirname, '..', 'packages/engine/src/core/horn-tuning.json');
const midis = Array.from({ length: HORN_HI - HORN_LO + 1 }, (_, i) => HORN_LO + i);
const FSS = [22050, 44100, 48000, 96000];

export function measureCents(fs: number, m: number, vel = 70): number {
  const c = new HornCore({ sampleRate: fs, dry: true, params: { vibrato: 0, noise: 0 } });
  c.schedule({ type: 'noteOn', midi: m, velocity: vel }, 64);
  const n = Math.round((1.1 * fs) / 128) * 128;
  const L = new Float32Array(n);
  const bl = new Float32Array(128);
  const br = new Float32Array(128);
  for (let i = 0; i < n; i += 128) {
    c.process(bl, br, 128);
    L.set(bl, i);
  }
  const f = 440 * 2 ** ((m - 69) / 12);
  const s0 = Math.round(0.6 * fs);
  const W = Math.round(0.35 * fs);
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
    HornCore.tuningTable = cur;
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
  HornCore.tuningTable = JSON.parse(readFileSync(OUT, 'utf8'));
  for (const fs of FSS) console.log(`residual cents @${fs}`, midis.map((m) => measureCents(fs, m).toFixed(1)).join(' '));
}
