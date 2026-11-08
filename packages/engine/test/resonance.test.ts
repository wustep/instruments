// Sympathetic resonance through the shared bridge/soundboard, double decay of unisons,
// hammer physics, phantom partials.
import { describe, expect, it } from 'vitest';
import { PianoCore } from '../src/core/index.ts';
import { analyzeNote } from '../src/analysis/index.ts';
import { FS, off, on, ped, render } from './helpers.ts';

describe('sympathetic resonance', () => {
  it('with the pedal down, struck C3 excites the undamped strings of its harmonics, not unrelated ones', () => {
    const core = new PianoCore({ sampleRate: FS, dry: true });
    render([ped(0, 1), on(0.05, 48, 110), off(0.3, 48)], 1.5, {}, core);
    const lvl = (m: number) => core.lights[m - 21].level;
    // C4 (2nd partial), G4 (3rd), C5 (4th) vs. C#4, F#4 (no shared partials)
    const related = Math.min(lvl(60), lvl(67), lvl(72));
    const unrelated = Math.max(lvl(61), lvl(66));
    expect(related).toBeGreaterThan(0);
    expect(20 * Math.log10(related / unrelated)).toBeGreaterThan(12);
  });

  it('with the pedal up only the undamped top strings resonate', () => {
    const core = new PianoCore({ sampleRate: FS, dry: true });
    render([on(0.05, 48, 110)], 1.0, {}, core);
    for (const v of core.active) if (v.light) expect(v.midi).toBeGreaterThan(core.design.damperTop);
  });
});

describe('unison coupling', () => {
  it('a trichord shows double decay: the late slope is slower than the prompt one', () => {
    const r = render([on(0.01, 64, 90)], 14, { params: { sympathetic: false } });
    const a = analyzeNote([r.L, r.R], FS, 64, {});
    const d1 = a.decays.find((d) => d.k === 1)!;
    expect(d1.t60Late).toBeGreaterThan(1.5 * d1.t60Early);
  });
  it('detuning the unison produces beating that perfectly tuned strings do not', () => {
    // envelope ripple of partial 1 over 3 s
    const ripple = (detune: number) => {
      const r = render([on(0.01, 69, 90)], 4, { params: { unisonDetune: detune, sympathetic: false } });
      const a = analyzeNote([r.L, r.R], FS, 69, {});
      return a; // decays carry range/knee; use partial levels via envelope below
    };
    void ripple;
    const env = (detune: number) => {
      const r = render([on(0.01, 69, 90)], 4, { params: { unisonDetune: detune, sympathetic: false } });
      // short-time energy at 440 Hz via a heterodyne
      const f = r.core.specs[69 - 21].f1;
      const hop = FS / 50;
      const out: number[] = [];
      for (let s = Math.round(0.3 * FS); s + hop < 3.8 * FS; s += hop) {
        let re = 0, im = 0;
        for (let i = 0; i < hop; i++) {
          const ph = (2 * Math.PI * f * (s + i)) / FS;
          re += r.x[s + i] * Math.cos(ph);
          im += r.x[s + i] * Math.sin(ph);
        }
        out.push(20 * Math.log10(Math.hypot(re, im) + 1e-20));
      }
      // ripple = residual around a straight-line fit
      const n = out.length;
      const mx = (n - 1) / 2;
      const my = out.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0;
      out.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
      const sl = num / den;
      return Math.sqrt(out.reduce((a, y, i) => a + (y - (my + sl * (i - mx))) ** 2, 0) / n);
    };
    expect(env(6)).toBeGreaterThan(env(0) + 1);
  });
});

describe('hammer', () => {
  const strike = (m: number, vel: number) => {
    const core = new PianoCore({ sampleRate: FS, dry: true });
    render([on(0.01, m, vel)], 0.1, {}, core);
    return core.voices[m - 21].lastStrike!;
  };
  it('contact gets shorter and force grows faster than velocity (nonlinear felt)', () => {
    for (const m of [33, 60, 84]) {
      const soft = strike(m, 30);
      const loud = strike(m, 120);
      expect(loud.duration).toBeLessThan(soft.duration);
      expect(loud.peak / soft.peak).toBeGreaterThan(loud.vHammer / soft.vHammer);
    }
  });
  it('contact time falls from bass to treble (≈4 ms → <1 ms, Askenfelt & Jansson)', () => {
    const d21 = strike(21, 70).duration;
    const d60 = strike(60, 70).duration;
    const d100 = strike(100, 70).duration;
    expect(d21).toBeGreaterThan(0.0025);
    expect(d21).toBeGreaterThan(d60);
    expect(d60).toBeGreaterThan(d100);
    expect(d100).toBeLessThan(0.0015);
  });
  it('felt hysteresis: more force on compression than on release at the same compression', () => {
    const s = strike(60, 100);
    let ip = 0;
    for (let i = 0; i < s.force.length; i++) if (s.compression[i] > s.compression[ip]) ip = i;
    const xm = s.compression[ip] * 0.5;
    let fUp = 0, fDown = 0;
    for (let i = 1; i < ip; i++) if (s.compression[i - 1] < xm && s.compression[i] >= xm) fUp = s.force[i];
    for (let i = ip + 1; i < s.force.length; i++) if (s.compression[i - 1] > xm && s.compression[i] <= xm) { fDown = s.force[i]; break; }
    expect(fUp).toBeGreaterThan(fDown * 1.05);
  });
});

describe('phantom partials', () => {
  it('the longitudinal contribution grows faster than the transverse sound with velocity', () => {
    const diffDb = (vel: number) => {
      const a = render([on(0.01, 28, vel)], 0.8, { params: { phantom: true, sympathetic: false } });
      const b = render([on(0.01, 28, vel)], 0.8, { params: { phantom: false, sympathetic: false } });
      let d = 0, s = 0;
      for (let i = 0; i < a.x.length; i++) { d += (a.x[i] - b.x[i]) ** 2; s += b.x[i] ** 2; }
      return 10 * Math.log10(d / s);
    };
    // quadratic generation: relative level rises ~ +20 dB per 10x in force
    expect(diffDb(120) - diffDb(30)).toBeGreaterThan(6);
  });
});
