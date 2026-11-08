// Tuning accuracy (cents) and inharmonicity of rendered notes vs. the design targets.
import { describe, expect, it } from 'vitest';
import { designDispersion2, onePolePhaseDelay, referenceB, DEFAULT_CALIBRATION, KEY_LO, KEY_HI } from '../src/core/index.ts';
import { fitStiffString } from '../src/analysis/index.ts';
import { FS, cents, measurePeak, on, render } from './helpers.ts';

describe('dispersion filter design', () => {
  it('reproduces stiff-string partial frequencies within fractions of a cent (A#0–C8)', () => {
    for (const fs of [44100, 48000]) {
      for (let m = KEY_LO + 1; m <= KEY_HI; m++) {
        const B = referenceB(m, DEFAULT_CALIBRATION);
        const f1 = 440 * 2 ** ((m - 69) / 12);
        const d = designDispersion2(f1 / Math.sqrt(1 + B), B, fs, {
          fMax: m < 33 ? 3000 : m < 45 ? 4000 : 5000,
          kMax: 120,
          maxSections: 64,
          tolCents: 0.3,
          extraDelay: (w) => onePolePhaseDelay(-0.05, w),
        });
        // A0..B0 exceed the refinement cap; everything else is refined
        expect(d.maxCents, `m${m} @${fs}`).toBeLessThan(m < 24 ? 8 : 1.0);
      }
    }
  });
});

describe('rendered tuning', () => {
  // All 88 keys. Perceived pitch is judged as the level-weighted mean deviation of
  // partials 1–6 (soundboard resonances split individual partials by a few cents,
  // as on a real piano; the tuning compensation targets their average).
  it('every key is within 2 cents of its stretched target, RMS < 0.6 cents', () => {
    const errs: number[] = [];
    for (let m = KEY_LO; m <= KEY_HI; m++) {
      const r = render([on(0.01, m, 90)], 1.6, { params: { unisonDetune: 0, sympathetic: false } });
      const spec = r.core.specs[m - KEY_LO];
      let num = 0;
      let den = 0;
      for (let k = 1; k <= 6; k++) {
        const fk = k * spec.f0 * Math.sqrt(1 + spec.B * k * k);
        if (fk > 9000) break;
        const p = measurePeak(r.x, fk, 0.2, 1.3, 0.006);
        if (!p) continue;
        const w = Math.pow(10, p.db / 20);
        num += w * cents(p.f, fk);
        den += w;
      }
      expect(den, `m${m}`).toBeGreaterThan(0);
      const e = num / den;
      errs.push(e);
      expect(Math.abs(e), `m${m}`).toBeLessThan(2);
    }
    const rmsErr = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
    expect(rmsErr).toBeLessThan(0.6);
  });

  it('stretch tuning: treble sharp, bass flat relative to equal temperament', () => {
    const r = render([], 0.01);
    const s = r.core.specs;
    const c = (m: number) => cents(s[m - KEY_LO].f1, 440 * 2 ** ((m - 69) / 12));
    expect(c(69)).toBeCloseTo(0, 5);
    expect(c(108)).toBeGreaterThan(15);
    expect(c(21)).toBeLessThan(-5);
    // monotone in the treble
    for (let m = 70; m + 6 <= 108; m += 6) expect(c(m + 6)).toBeGreaterThan(c(m) - 0.5);
  });
});

describe('inharmonicity', () => {
  it('B fitted from rendered partials matches the target within 10%', () => {
    for (const m of [26, 36, 48, 60, 72, 84]) {
      const r = render([on(0.01, m, 100)], 2.2, { params: { unisonDetune: 0, sympathetic: false } });
      const spec = r.core.specs[m - KEY_LO];
      const ps: { k: number; f: number }[] = [];
      for (let k = 1; k <= 16; k++) {
        const fk = k * spec.f0 * Math.sqrt(1 + spec.B * k * k);
        if (fk > 5000) break;
        const p = measurePeak(r.x, fk, 0.15, 1.8, 0.004);
        if (p && p.db > -110) ps.push({ k, f: p.f });
      }
      expect(ps.length, `m${m}`).toBeGreaterThanOrEqual(4);
      const [, B] = fitStiffString(ps);
      expect(Math.abs(Math.log(B / spec.B)), `m${m}: B=${B} target ${spec.B}`).toBeLessThan(Math.log(1.1));
    }
  });

  it('string stiffness 0 gives a harmonic series; 3x stiffness triples B', () => {
    const ps = (stiff: number) => {
      const r = render([on(0.01, 48, 100)], 1.6, { params: { stringStiffness: stiff, unisonDetune: 0, sympathetic: false } });
      const spec = r.core.specs[48 - KEY_LO];
      const out: { k: number; f: number }[] = [];
      for (let k = 1; k <= 12; k++) {
        const fk = k * spec.f0 * Math.sqrt(1 + spec.B * k * k);
        const p = measurePeak(r.x, fk, 0.15, 1.3, 0.004);
        if (p) out.push({ k, f: p.f });
      }
      return { B: fitStiffString(out)[1], target: spec.B };
    };
    const h = ps(0);
    expect(h.B).toBeLessThan(2e-6);
    const s3 = ps(3);
    expect(Math.abs(Math.log(s3.B / s3.target))).toBeLessThan(Math.log(1.1));
  });
});
