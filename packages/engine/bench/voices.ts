// CPU benchmark: cost per struck voice and with sustain-pedal sympathetic resonance.
// Usage: pnpm bench   (prints a markdown table)
import { PianoCore } from '../src/core/index.ts';
import os from 'node:os';

const fs = 48000;
const seconds = 4;

function run(nVoices: number, opts: { sustain: boolean; sympathetic: boolean }): { pct: number; voices: number; sym: number } {
  const core = new PianoCore({ sampleRate: fs, params: { sympathetic: opts.sympathetic }, maxVoices: 128 });
  if (opts.sustain) core.schedule({ type: 'sustain', value: 1 }, 0);
  // spread notes over the keyboard, struck in quick succession, all held
  const keys: number[] = [];
  for (let i = 0; i < nVoices; i++) keys.push(21 + Math.round((i * 87) / Math.max(1, nVoices - 1)));
  keys.forEach((k, i) => core.schedule({ type: 'noteOn', midi: k, velocity: 90 }, 64 + i * 32));
  const L = new Float32Array(128);
  const R = new Float32Array(128);
  // warm-up 0.5 s (JIT + attack), then measure steady state
  for (let i = 0; i < (0.5 * fs) / 128; i++) core.process(L, R, 128);
  const blocks = (seconds * fs) / 128;
  let peakV = 0;
  let peakS = 0;
  const t0 = performance.now();
  for (let i = 0; i < blocks; i++) {
    core.process(L, R, 128);
    if ((i & 63) === 0) {
      peakV = Math.max(peakV, core.activeVoiceCount);
      peakS = Math.max(peakS, core.activeSympatheticCount);
    }
  }
  const ms = performance.now() - t0;
  return { pct: (ms / (seconds * 1000)) * 100, voices: peakV, sym: peakS };
}

const rows: string[] = [];
rows.push(`Machine: ${os.cpus()[0].model}, ${os.cpus().length} cores, Node ${process.version}, fs=${fs}`);
rows.push('');
rows.push('| struck notes | pedal | sympathetic strings | CPU % of one core (real time) | per struck note |');
rows.push('|---:|:---:|---:|---:|---:|');
const base = run(0, { sustain: false, sympathetic: false });
rows.push(`| 0 (board + post only) | up | 0 | ${base.pct.toFixed(1)} | – |`);
for (const n of [1, 8, 16, 32, 48, 64, 88]) {
  const r = run(n, { sustain: false, sympathetic: true });
  rows.push(`| ${r.voices} | up | ${r.sym} | ${r.pct.toFixed(1)} | ${((r.pct - base.pct) / Math.max(1, r.voices)).toFixed(2)} |`);
}
for (const n of [8, 32, 64]) {
  const r = run(n, { sustain: true, sympathetic: true });
  rows.push(`| ${r.voices} | down | ${r.sym} | ${r.pct.toFixed(1)} | ${((r.pct - base.pct) / Math.max(1, r.voices)).toFixed(2)} |`);
}
console.log(rows.join('\n'));
