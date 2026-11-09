// Damper and pedal behaviour: release damping, sustain, continuous half-pedal,
// undamped top keys, sostenuto, una corda.
import { describe, expect, it } from 'vitest';
import { PianoCore } from '../src/core/index.ts';
import { FS, off, on, ped, render, rmsDb } from './helpers.ts';

const C4 = 60;

describe('dampers', () => {
  it('releasing a key damps it fast; holding it keeps it ringing', () => {
    const held = render([on(0.01, C4, 90)], 2.0);
    const rel = render([on(0.01, C4, 90), off(0.6, C4)], 2.0);
    const dHeld = rmsDb(held.x, 1.4, 1.6);
    const dRel = rmsDb(rel.x, 1.4, 1.6);
    expect(dHeld - dRel).toBeGreaterThan(35);
    // before release identical
    expect(Math.abs(rmsDb(held.x, 0.1, 0.5) - rmsDb(rel.x, 0.1, 0.5))).toBeLessThan(0.1);
  });

  it('with the sustain pedal down, a released note rings like a held one', () => {
    const held = render([on(0.01, C4, 90)], 2.5, { params: { sympathetic: false } });
    const pedal = render([ped(0, 1), on(0.01, C4, 90), off(0.4, C4)], 2.5, { params: { sympathetic: false } });
    expect(Math.abs(rmsDb(held.x, 2.0, 2.4) - rmsDb(pedal.x, 2.0, 2.4))).toBeLessThan(1.5);
  });

  it('half-pedal gives an intermediate, monotonic decay (continuous CC64)', () => {
    const level = (p: number) => {
      const r = render([ped(0, p), on(0.01, C4, 90), off(0.4, C4)], 1.6, { params: { sympathetic: false } });
      return rmsDb(r.x, 1.2, 1.5);
    };
    const ps = [0, 0.2, 0.3, 0.4, 0.5, 0.7, 1];
    // monotonic in the audible range: below −100 dB (fully damped residue, ~30 dB under
    // 16-bit silence) the order of numerical leftovers is meaningless
    const ls = ps.map(level).map((l) => Math.max(l, -100));
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeGreaterThanOrEqual(ls[i - 1] - 0.5);
    const at = (p: number) => ls[ps.indexOf(p)];
    // a usable half-pedal range: 40 % travel is clearly between no pedal and full pedal
    expect(at(0.4) - at(0)).toBeGreaterThan(15);
    expect(at(1) - at(0.4)).toBeGreaterThan(4);
  });

  it('keys above the damper range keep ringing after release', () => {
    const r = render([on(0.01, 100, 90), off(0.2, 100)], 1.2);
    const h = render([on(0.01, 100, 90)], 1.2);
    expect(Math.abs(rmsDb(r.x, 0.8, 1.1) - rmsDb(h.x, 0.8, 1.1))).toBeLessThan(1);
  });

  it('sostenuto keeps notes held at the moment of pressing undamped, but not later ones', () => {
    const core = new PianoCore({ sampleRate: FS, dry: true, params: { sympathetic: false } });
    render(
      [on(0.01, 48, 90), { t: 0.2, e: { type: 'sostenuto', value: 1 } }, off(0.3, 48), on(0.4, 64, 90), off(0.6, 64)],
      1.0,
      {},
      core,
    );
    expect(core.voices[48 - 21].damperTarget).toBe(0);
    expect(core.voices[64 - 21].damperTarget).toBeGreaterThan(0.9);
  });
});

describe('una corda', () => {
  it('moves the hammer off the third string of trichords and softens the tone', () => {
    const core = new PianoCore({ sampleRate: FS, dry: true });
    render([{ t: 0, e: { type: 'soft', value: 1 } }, on(0.01, 72, 100)], 0.3, {}, core);
    const v = core.voices[72 - 21];
    expect(v.hW[2]).toBe(0);
    expect(v.hW[0]).toBeGreaterThan(0.5);
    const normal = render([on(0.01, 72, 100)], 0.6);
    const soft = render([{ t: 0, e: { type: 'soft', value: 1 } }, on(0.01, 72, 100)], 0.6);
    expect(rmsDb(soft.x, 0.05, 0.5)).toBeLessThan(rmsDb(normal.x, 0.05, 0.5) - 1);
  });
});

describe('upright pedals', () => {
  // brightness: the first difference's level over the signal's (a high-frequency share)
  const bright = (x: Float32Array, t0: number, t1: number) => {
    const a = Math.round(t0 * FS);
    const b = Math.round(t1 * FS);
    let d = 0;
    let s = 0;
    for (let i = a + 1; i < b; i++) {
      d += (x[i] - x[i - 1]) ** 2;
      s += x[i] ** 2;
    }
    return 10 * Math.log10(d / Math.max(1e-30, s));
  };
  const up = { preset: 'upright' as const, params: { sympathetic: false } };
  const soft = { t: 0, e: { type: 'soft' as const, value: 1 } };
  const middle = { t: 0, e: { type: 'sostenuto' as const, value: 1 } };

  it('soft is the half-blow rail: every string struck, a little softer, no shift', () => {
    const core = new PianoCore({ sampleRate: FS, dry: true, ...up });
    render([soft, on(0.01, 72, 100)], 0.3, {}, core);
    const v = core.voices[72 - 21];
    expect(v.hW[2]).toBeGreaterThan(0.5); // the third string is still struck
    const normal = render([on(0.01, 72, 100)], 0.6, up);
    const half = render([soft, on(0.01, 72, 100)], 0.6, up);
    const dB = rmsDb(half.x, 0.05, 0.5) - rmsDb(normal.x, 0.05, 0.5);
    expect(dB).toBeLessThan(-0.8);
    expect(dB).toBeGreaterThan(-6);
  });

  it('the middle pedal lowers the practice muffler: much softer and darker, and it holds no dampers', () => {
    const normal = render([on(0.01, 60, 100)], 0.6, up);
    const muffled = render([middle, on(0.01, 60, 100)], 0.6, up);
    expect(rmsDb(muffled.x, 0.05, 0.5)).toBeLessThan(rmsDb(normal.x, 0.05, 0.5) - 6);
    expect(bright(muffled.x, 0.02, 0.3)).toBeLessThan(bright(normal.x, 0.02, 0.3) - 3);
    // not a sostenuto: a key held when it goes down is still damped on release
    const core = new PianoCore({ sampleRate: FS, dry: true, ...up });
    render([on(0.01, 48, 90), { t: 0.2, e: { type: 'sostenuto', value: 1 } }, off(0.3, 48)], 0.8, {}, core);
    expect(core.voices[48 - 21].damperTarget).toBeGreaterThan(0.9);
  });

  it('a grand ignores the muffler: its middle pedal stays a sostenuto', () => {
    const normal = render([on(0.01, 60, 100)], 0.4, { params: { sympathetic: false } });
    const mid = render([middle, on(0.01, 60, 100)], 0.4, { params: { sympathetic: false } });
    expect(Math.abs(rmsDb(mid.x, 0.05, 0.35) - rmsDb(normal.x, 0.05, 0.35))).toBeLessThan(0.01);
  });
});
