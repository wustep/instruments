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
    const ls = ps.map(level);
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
