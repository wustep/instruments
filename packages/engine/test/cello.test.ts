// The cello's v2 model (realistic-3d round): radiation from the body's acceleration through the
// bridge's resonances, a high-frequency path that survives a mono sum, loosely coupled idle
// strings (no absorber dips an octave above the open strings), torsion at the bow, pitch over
// 40 harmonics, and the same behaviour at 44.1 and 48 kHz. The violin and viola keep the
// round-2 chain bit for bit (their golden snapshots check that).
import { describe, expect, it } from 'vitest';
import { BOWED, renderInstrument } from '../src/core/index.ts';
import { analyzeSustained, spectrum } from '../src/analysis/index.ts';

const et = (m: number) => 440 * 2 ** ((m - 69) / 12);
function play(m: number, dur: number, params: Record<string, unknown> = {}, fs = 48000, vel = 80) {
  return renderInstrument({ sampleRate: fs, instrument: 'cello', dry: true, params, duration: dur, events: [{ time: 0.01, event: { type: 'noteOn' as const, midi: m, velocity: vel } }] });
}
const mono = (r: { left: Float32Array; right: Float32Array }) => r.left.map((v, i) => 0.5 * (v + r.right[i]));
function db(x: Float32Array, fs: number, t0: number, t1: number): number {
  let s = 0;
  for (let i = Math.round(t0 * fs); i < Math.round(t1 * fs); i++) s += x[i] * x[i];
  return 10 * Math.log10(s / ((t1 - t0) * fs) + 1e-30);
}

describe('cello (v2)', () => {
  it('only the cello uses the v2 chain', () => {
    expect(BOWED.cello.radiation).toBeDefined();
    expect(BOWED.cello.torsion).toBeDefined();
    for (const id of ['violin', 'viola']) {
      expect(BOWED[id].radiation, id).toBeUndefined();
      expect(BOWED[id].torsion, id).toBeUndefined();
      // (audio audit 3: the viola's idle open strings are loosely coupled too, by the ratio whose release
      // tails are the recording's: scripts/strings-tails.ts; the violin's are as they were)
      if (id === 'violin') expect(BOWED[id].idleCoupling, id).toBeUndefined();
      else expect(BOWED[id].idleCoupling, id).toBe(0.2);
      expect(BOWED[id].bowWidth, id).toBeUndefined();
      // (NEXT5: the violin's and viola's rosin noise is fitted to their recordings now, as the cello's
      // was, and the viola's attack: see bowed-fit.json; their bodies are design.body)
      expect(BOWED[id].body, id).toBeDefined();
    }
    expect(BOWED.cello.body).toBeUndefined();
    // the hair ribbon's contact: a physical width, about a centimetre
    expect(BOWED.cello.bowWidth).toBeGreaterThan(0.004);
    expect(BOWED.cello.bowWidth).toBeLessThan(0.016);
  });

  it('an octave above an open string is not swallowed by it (C3, G3, D4 within 4 dB of the open strings left out)', () => {
    for (const m of [48, 55, 62]) {
      const on = db(mono(play(m, 1.6, { vibrato: 0 })), 48000, 0.8, 1.55);
      const off = db(mono(play(m, 1.6, { vibrato: 0, sympathetic: false })), 48000, 0.8, 1.55);
      expect(on - off, `m${m}`).toBeGreaterThan(-4);
    }
  });

  it('bowed notes sound at pitch within ±3 ¢ across the four strings (no vibrato), at 44.1 and 48 kHz', () => {
    for (const fs of [44100, 48000])
      for (const m of [36, 40, 43, 47, 50, 55, 57, 62]) {
        const x = mono(play(m, 1.5, { vibrato: 0 }, fs));
        expect(x.every((v) => Number.isFinite(v) && Math.abs(v) < 20)).toBe(true);
        const c = analyzeSustained(x, fs, { start: Math.round(0.6 * fs), end: x.length }, m).cents;
        expect(Math.abs(c), `fs ${fs} m${m}`).toBeLessThan(3);
      }
  });

  it('the high-frequency radiation survives a mono sum (no inverted copy between the channels)', () => {
    const r = play(57, 1.2, { vibrato: 0 });
    const x = mono(r);
    const band = (y: Float32Array) => {
      const sp = spectrum(y, 48000, Math.round(0.6 * 48000), 16384, 16384);
      let s = 0;
      for (let k = 0; k < sp.mag.length; k++) {
        const f = (k * 48000) / 16384;
        if (f > 4000 && f < 8000) s += sp.mag[k] ** 2;
      }
      return 10 * Math.log10(s + 1e-30);
    };
    expect(band(x) - band(r.left)).toBeGreaterThan(-6);
  });

  it('a sawtooth-rich tone: the A string at mf reaches past 2 kHz like the recording (centroid > 600 Hz)', () => {
    const x = mono(play(57, 1.4, { vibrato: 0 }, 48000, 70));
    const sp = spectrum(x, 48000, Math.round(0.6 * 48000), 32768, 32768);
    let num = 0;
    let den = 0;
    for (let k = 1; k < sp.mag.length; k++) {
      const p = sp.mag[k] ** 2;
      num += ((k * 48000) / 32768) * p;
      den += p;
    }
    expect(num / den).toBeGreaterThan(600);
    void et;
  });

  // power centroid of the steady part (1.5–2.2 s of a 2.6 s note) below 10 kHz, Hz
  const centroid = (x: Float32Array, fs: number) => {
    const sp = spectrum(x, fs, Math.round(1.5 * fs), 32768, 32768);
    let num = 0;
    let den = 0;
    for (let k = 1; k * sp.binHz < 10000; k++) {
      num += k * sp.binHz * sp.mag[k] ** 2;
      den += sp.mag[k] ** 2;
    }
    return num / den;
  };

  const NOTES = [36, 43, 50, 57, 62];
  const meanAbs = (xs: number[], abs = true) => xs.reduce((a, b) => a + (abs ? Math.abs(b) : b), 0) / xs.length;

  it('a soft note is not much brighter than a loud one on the same string (the bow keeps Helmholtz motion at pp)', () => {
    // mean log2(centroid pp / ff), steady part: the Iowa cello −0.7 (ff ~1.6× brighter); the point
    // bow on whole samples slipped several times per period at pp and read +0.92 here; the bow of
    // finite width +0.26, its pp slips cut short by a ripple trapped between bow and bridge; with the
    // bridge hill (realistic-3d round 2) −0.02 (pp no brighter than ff; still not as much darker as
    // the recording: see final-r2/cello-audio/README.md)
    const r = NOTES.map((m) => Math.log2(centroid(mono(play(m, 2.6, { vibrato: 0 }, 48000, 30)), 48000) / centroid(mono(play(m, 2.6, { vibrato: 0 }, 48000, 112)), 48000)));
    expect(meanAbs(r, false), r.map((v) => v.toFixed(2)).join(' ')).toBeLessThan(0.2);
  });

  it('the soft tone is the same instrument at 44.1 and 96 kHz (G2, D3, A3 pp: centroid within 0.2 octave)', () => {
    // realistic-3d round 2: the soft G2 and D3 sat between a ripple-locked and a multiply slipping
    // motion, and the sample rate chose which (+0.69 and +0.52 octave of centroid at 96 kHz); the
    // bridge hill (design.bridgeMass) and the rate-invariant constants keep them in Helmholtz motion
    // (+0.11, +0.13)
    const d = [43, 50, 57].map((m) => Math.log2(centroid(mono(play(m, 2.6, { vibrato: 0 }, 96000, 30)), 96000) / centroid(mono(play(m, 2.6, { vibrato: 0 }, 44100, 30)), 44100)));
    for (const [i, m] of [43, 50, 57].entries()) expect(Math.abs(d[i]), `m${m}: ${d.map((v) => v.toFixed(2)).join(' ')}`).toBeLessThan(0.2);
  });

  it('stays finite at bow-force and position extremes, with double stops', () => {
    for (const bowPressure of [0.05, 1.1])
      for (const bowPosition of [0.04, 0.25]) {
        const r = renderInstrument({ sampleRate: 48000, instrument: 'cello', dry: true, params: { bowPressure, bowPosition, vibrato: 40 }, duration: 0.8, events: [36, 43, 50, 57].map((m) => ({ time: 0.01, event: { type: 'noteOn' as const, midi: m, velocity: 127 } })) });
        expect(r.left.every((v) => Number.isFinite(v) && Math.abs(v) < 20), `F=${bowPressure} β=${bowPosition}`).toBe(true);
      }
  });
});
