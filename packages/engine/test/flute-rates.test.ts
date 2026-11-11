// The flute at the sample rates the site meets beyond 44.1 and 48 kHz (a 96 kHz interface, a 22.05 kHz
// headset): its voicing table (flute-tuning.json, scripts/tune-flute.ts) had only the two, and another
// rate took the nearest row. At 96 kHz the low register then sounded up to 32 cents sharp (C4 +32,
// G4 +22; audio audit, Nov 2026).
import { describe, expect, it } from 'vitest';
import { FluteCore } from '../src/core/index.ts';

/** the sounding pitch's offset from equal temperament (cents), as scripts/tune-flute.ts measures it */
function cents(fs: number, m: number): number {
  const c = new FluteCore({ sampleRate: fs, dry: true, params: { vibrato: 0, noise: 0.3 } });
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
    // (the top of the compass at 22.05 kHz, a period of ten samples, sounds another mode: left as it was)
    for (const m of [60, 72, 84]) expect(Math.abs(cents(22050, m)), `m${m}`).toBeLessThan(5);
  });
});
