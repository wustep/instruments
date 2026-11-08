// Stability for all keys and parameter extremes, no NaN/Inf, no denormals after decay.
import { describe, expect, it } from 'vitest';
import { KEY_HI, KEY_LO, PRESET_IDS, PianoCore } from '../src/core/index.ts';
import { FS, off, on, ped, render, rmsDb } from './helpers.ts';

function finiteAndBounded(x: Float32Array, bound = 50): void {
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!Number.isFinite(v) || Math.abs(v) > bound) throw new Error(`sample ${i} = ${v}`);
  }
}

describe('stability', () => {
  it('every key at velocity 1 and 127 renders finite, bounded audio', () => {
    for (let m = KEY_LO; m <= KEY_HI; m++) {
      for (const vel of [1, 127]) {
        const r = render([on(0.005, m, vel)], 0.35);
        finiteAndBounded(r.x);
      }
    }
  });

  const extremes: Record<string, number[]> = {
    hammerHardness: [0.25, 4],
    stringStiffness: [0, 5],
    unisonDetune: [0, 30],
    soundboardDamping: [0.25, 5],
    sustain: [0.3, 2.5],
    lid: [0, 1],
    room: [0, 1],
  };
  for (const [param, vals] of Object.entries(extremes)) {
    it(`stays stable and decays at ${param} extremes (all presets)`, () => {
      for (const preset of PRESET_IDS) {
        for (const v of vals) {
          // a loud cluster with the pedal down excites everything: struck strings,
          // sympathetic strings, preparations, soundboard
          const ev = [ped(0, 1), ...[21, 33, 45, 52, 60, 64, 67, 72, 84, 96, 108].map((m, i) => on(0.01 + i * 0.003, m, 127))];
          // physical model alone (no room/limiter): passive, so energy must fall
          const dry = render(ev, 3.0, { preset, dry: true, params: { [param]: v } });
          finiteAndBounded(dry.x);
          expect(rmsDb(dry.x, 2.5, 3.0), `${preset} ${param}=${v}`).toBeLessThan(rmsDb(dry.x, 0.05, 0.55) - 3);
          // full output chain: finite and never above full scale
          const live = render(ev, 1.0, { preset, dry: false, params: { [param]: v } });
          finiteAndBounded(live.x, 1.0001);
        }
      }
    });
  }
});

describe('no denormals / clean shutdown', () => {
  it('after notes decay, voices are freed and every state array is exactly zero or normal', () => {
    const core = new PianoCore({ sampleRate: FS, dry: true });
    render([ped(0, 0), on(0.01, 40, 120), on(0.01, 64, 120), on(0.01, 100, 120), off(0.3, 40), off(0.3, 64), off(0.3, 100)], 2, {}, core);
    // long silence
    render([], 60, {}, core);
    expect(core.activeVoiceCount).toBe(0);
    const tiny = (a: ArrayLike<number>) => {
      for (let i = 0; i < a.length; i++) {
        const v = Math.abs(a[i]);
        if (v !== 0 && v < 1e-200) return true;
      }
      return false;
    };
    for (const v of [...core.voices, ...core.lights]) for (const b of v.bufs) expect(tiny(b)).toBe(false);
    expect(tiny(core.board.s1)).toBe(false);
    expect(tiny(core.board.s2)).toBe(false);
    const out = render([], 0.5, {}, core);
    expect(rmsDb(out.x, 0, 0.5)).toBeLessThan(-200);
  });
});
