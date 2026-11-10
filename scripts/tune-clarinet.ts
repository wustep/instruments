// Voicing pass for the clarinet model: play every note (vibrato off; mf, then pp and ff), measure the
// sounding pitch (autocorrelation, 0.6–1.0 s), and store the correction in cents per sample rate (pp and ff
// as offsets from mf). Two iterations
// converge to about a cent. Run after any change to the voicing: npx tsx scripts/tune-clarinet.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClarinetCore } from '../packages/engine/src/core/clarinet.ts';

const OUT = join(import.meta.dirname, '..', 'packages/engine/src/core/clarinet-tuning.json');
const midis = Array.from({ length: 45 }, (_, i) => 50 + i);
const FSS = [22050, 44100, 48000, 96000];

export function measureCents(fs: number, m: number, vel = 70): number {
  const c = new ClarinetCore({ sampleRate: fs, dry: true, params: { vibrato: 0, noise: 0 } });
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
  // mf first (the table's rows), then pp and ff as offsets from it
  const fix = (fi: number, mi: number, prev: number, err: number) => (Number.isFinite(err) && Math.abs(err) < 300 ? +(prev + err).toFixed(2) : prev);
  for (let iter = 0; iter < 3; iter++) {
    const cur = JSON.parse(readFileSync(OUT, 'utf8'));
    ClarinetCore.tuningTable = cur;
    const table: number[][] = FSS.map((fs, fi) => midis.map((m, mi) => fix(fi, mi, cur.midi?.length ? (cur.cents?.[fi]?.[mi] ?? 0) : 0, measureCents(fs, m))));
    writeFileSync(OUT, JSON.stringify({ fs: FSS, midi: midis, cents: table, pp: cur.pp, ff: cur.ff }) + '\n');
  }
  for (let iter = 0; iter < 3; iter++) {
    const cur = JSON.parse(readFileSync(OUT, 'utf8'));
    ClarinetCore.tuningTable = cur;
    const off = (k: 'pp' | 'ff', vel: number) => FSS.map((fs, fi) => midis.map((m, mi) => fix(fi, mi, cur[k]?.[fi]?.[mi] ?? 0, measureCents(fs, m, vel))));
    writeFileSync(OUT, JSON.stringify({ ...cur, pp: off('pp', 30), ff: off('ff', 112) }) + '\n');
  }
  ClarinetCore.tuningTable = JSON.parse(readFileSync(OUT, 'utf8'));
  for (const vel of [30, 70, 112]) for (const fs of FSS) console.log(`residual cents v${vel} @${fs}`, midis.map((m) => measureCents(fs, m, vel).toFixed(1)).join(' '));
}
