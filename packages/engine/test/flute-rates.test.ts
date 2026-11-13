// The flute at the sample rates the site meets beyond 44.1 and 48 kHz (a 96 kHz interface, a 22.05 kHz
// headset): its voicing table (flute-tuning.json, scripts/tune-flute.ts) had only the two, and another
// rate took the nearest row. At 96 kHz the low register then sounded up to 32 cents sharp (C4 +32,
// G4 +22; audio audit, Nov 2026).
import { describe, expect, it } from 'vitest';
import { createCore, FluteCore } from '../src/core/index.ts';

/** the sounding pitch's offset from equal temperament (cents), as scripts/tune-flute.ts measures it */
function cents(fs: number, m: number, viaFactory = false): number {
  // (the factory runs the flute at twice the rate under 32 kHz: core/oversample.ts)
  // (the model alone: the player (human) puts its own few cents and its vibrato on every note)
  const c = viaFactory ? createCore({ sampleRate: fs, instrument: 'flute', dry: true, params: { vibrato: 0, noise: 0.3, human: 0 } }) : new FluteCore({ sampleRate: fs, dry: true, params: { vibrato: 0, noise: 0.3, human: 0 } });
  c.schedule({ type: 'noteOn', midi: m, velocity: 80 }, 64);
  const n = Math.round((1.3 * fs) / 128) * 128;
  const L = new Float32Array(n);
  const bl = new Float32Array(128);
  const br = new Float32Array(128);
  for (let i = 0; i < n; i += 128) {
    c.process(bl, br, 128);
    L.set(bl, i);
  }
  const f = 440 * 2 ** ((m - 69) / 12);
  const s0 = Math.round(0.6 * fs);
  const W = Math.round(0.6 * fs);
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i < W; i++) s += L[s0 + i] * L[s0 + i + lag];
    return s;
  };
  const lo = Math.floor(fs / (f * 1.08));
  const hi = Math.ceil(fs / (f * 0.93));
  let best = -Infinity;
  let at = lo;
  for (let lag = lo; lag <= hi; lag++) {
    const v = ac(lag);
    if (v > best) {
      best = v;
      at = lag;
    }
  }
  const a = ac(at - 1);
  const b = ac(at);
  const cc = ac(at + 1);
  return 1200 * Math.log2(fs / (at + (0.5 * (a - cc)) / (a - 2 * b + cc)) / f);
}

describe('the flute in tune at 96 and 22.05 kHz', () => {
  it('96 kHz: C4 and G4 within 5 cents (were +32 and +22)', () => {
    for (const m of [60, 67]) expect(Math.abs(cents(96000, m)), `m${m}`).toBeLessThan(5);
  });
  it('22.05 kHz: the low and middle register within 5 cents (C4 was +14.5)', () => {
    for (const m of [60, 72, 84]) expect(Math.abs(cents(22050, m)), `m${m}`).toBeLessThan(5);
  });
  it('22.05 kHz, as the instrument is made (run at 44.1 kHz and decimated): the top register on its own notes, within 5 cents', () => {
    // (the bare core there: C♯6 up sounded another mode, 2–17 semitones off; audio audit 2)
    for (const m of [85, 88, 91, 93, 96]) expect(Math.abs(cents(22050, m, true)), `m${m}`).toBeLessThan(5);
  });
  it('22.05 kHz, run at twice the rate: the same sound whatever the host block size', () => {
    const run = (block: number) => {
      const c = createCore({ sampleRate: 22050, instrument: 'flute', params: { vibrato: 0, human: 0 } });
      c.schedule({ type: 'noteOn', midi: 88, velocity: 90 }, 100);
      c.schedule({ type: 'noteOff', midi: 88 }, 9000);
      const out = new Float32Array(12000);
      const L = new Float32Array(block);
      const R = new Float32Array(block);
      for (let i = 0; i < out.length; i += block) {
        const n = Math.min(block, out.length - i);
        c.process(L, R, n);
        out.set(L.subarray(0, n), i);
      }
      return out;
    };
    const a = run(128);
    const b = run(37);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
    expect(diff).toBe(0);
    expect(Math.max(...a.map(Math.abs))).toBeGreaterThan(1e-3);
  });
});
