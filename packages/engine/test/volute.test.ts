// The volute: one key bows a string, blows a pipe and strikes a bar; all three share a hub with
// twelve sympathetic strings. One choir is heard alone with the weave at its end (and the swell
// at 1/√2: the effort it has with the weave in the middle).
import { describe, expect, it } from 'vitest';
import { VoluteCore, createCore, renderInstrument, voluteCeleste, voluteGeometry, VOLUTE_HI, VOLUTE_LO } from '../src/core/index.ts';
import { analyzeSustained, peakIn, spectrum } from '../src/analysis/index.ts';

const FS = 48000;
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);
const STRINGS = { weave: 0, swell: Math.SQRT1_2, strike: 0, halo: 0 };
const PIPES = { weave: 1, swell: Math.SQRT1_2, strike: 0, halo: 0 };
const BARS = { swell: 0, halo: 0 };
type Ev = { time: number; event: Record<string, unknown> };
const on = (m: number, t = 0.02, velocity = 80): Ev => ({ time: t, event: { type: 'noteOn', midi: m, velocity } });
const off = (m: number, t: number): Ev => ({ time: t, event: { type: 'noteOff', midi: m } });
function play(events: Ev[], dur: number, params: Record<string, unknown> = {}, fs = FS, dry = true) {
  const r = renderInstrument({ sampleRate: fs, instrument: 'volute', dry, params, duration: dur, events: events as never });
  const x = new Float32Array(r.left.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (r.left[i] + r.right[i]);
  return { ...r, x, core: r.core as VoluteCore };
}
const rmsDb = (x: Float32Array, a: number, b: number, fs = FS) => {
  let s = 0;
  for (let i = Math.round(a * fs); i < Math.round(b * fs); i++) s += x[i] * x[i];
  return 10 * Math.log10(s / ((b - a) * fs) + 1e-30);
};
const level = (x: Float32Array, f: number, t0: number, dur: number) => {
  const p = peakIn(spectrum(x, FS, Math.round(t0 * FS), Math.round(dur * FS), 1 << 16), f * 0.985, f * 1.015);
  return 20 * Math.log10((p?.mag ?? 0) + 1e-12);
};

describe('volute: tuning', () => {
  it('the strings sound at pitch under the band (±5 ¢) at 44.1 and 48 kHz', () => {
    for (const fs of [44100, 48000])
      for (let m = VOLUTE_LO; m <= VOLUTE_HI; m += 4) {
        const r = play([on(m)], 1.8, STRINGS, fs);
        const c = analyzeSustained(r.x, fs, { start: Math.round(1.0 * fs), end: r.x.length }, m).cents;
        expect(Math.abs(c), `m${m} @${fs}`).toBeLessThan(5);
      }
  });
  it('the pipes sound a fraction of a hertz above them (the céleste: ±1.5 ¢ of it)', () => {
    for (const fs of [44100, 48000])
      for (let m = 48; m <= VOLUTE_HI; m += 4) {
        const r = play([on(m)], 1.8, PIPES, fs);
        const c = analyzeSustained(r.x, fs, { start: Math.round(1.0 * fs), end: r.x.length }, m).cents;
        const target = 1200 * Math.log2(1 + voluteCeleste(m) / et(m));
        expect(target).toBeGreaterThan(1.5);
        expect(Math.abs(c - target), `m${m} @${fs}`).toBeLessThan(1.5);
      }
  });
  it('the bars’ partials stand at 1 : 4 : 10, and a harder blow is brighter', () => {
    const lv = (vel: number, k: number) => level(play([on(60, 0.02, vel)], 0.5, BARS).x, k * et(60), 0.025, 0.08);
    for (const k of [1, 4, 10]) expect(lv(110, k), `partial ${k}`).toBeGreaterThan(lv(110, 1) - 45);
    for (const k of [2, 3, 5]) expect(lv(110, k), `no partial at ${k}`).toBeLessThan(lv(110, 1) - 45);
    expect(lv(120, 4) - lv(120, 1)).toBeGreaterThan(lv(40, 4) - lv(40, 1) + 6);
  });
});

describe('volute: three choirs from one key', () => {
  it('the weave turns from the strings alone to the pipes alone, about as loud', () => {
    const s = play([on(60)], 1.6, STRINGS);
    const p = play([on(60)], 1.6, PIPES);
    const notes = (c: VoluteCore) => (c.getVisual() as { volute: { notes: { sLevel: number; pLevel: number; pipeMidi: number }[] } }).volute.notes;
    expect(notes(s.core)[0].pLevel).toBeLessThan(1e-6);
    expect(notes(s.core)[0].sLevel).toBeGreaterThan(1e-3);
    expect(notes(p.core)[0].sLevel).toBeLessThan(1e-6);
    expect(Math.abs(rmsDb(s.x, 1, 1.5) - rmsDb(p.x, 1, 1.5))).toBeLessThan(3);
  });
  it('the string blooms while the key is held and is damped when it is let go; the bar rings from the blow', () => {
    const s = play([on(48), off(48, 1.2)], 2, STRINGS);
    expect(rmsDb(s.x, 0.8, 1.2)).toBeGreaterThan(rmsDb(s.x, 0.02, 0.1) + 6);
    expect(rmsDb(s.x, 1.6, 2)).toBeLessThan(rmsDb(s.x, 0.8, 1.2) - 40);
    const b = play([on(60, 0.02, 100)], 1.2, BARS);
    expect(rmsDb(b.x, 0.02, 0.12)).toBeGreaterThan(rmsDb(b.x, 0.8, 1.2) + 6);
    // no mallets: no bar
    expect(rmsDb(play([on(60, 0.02, 100)], 0.3, { ...BARS, strike: 0 }).x, 0, 0.3)).toBeLessThan(-150);
  });
  it('a harder key is louder in every choir', () => {
    for (const p of [STRINGS, PIPES]) expect(rmsDb(play([on(60, 0.02, 120)], 1.4, p).x, 0.9, 1.4)).toBeGreaterThan(rmsDb(play([on(60, 0.02, 30)], 1.4, p).x, 0.9, 1.4) + 5);
  });
  it('the lowest octave borrows the pipes and bars an octave above', () => {
    const g = voluteGeometry().notes;
    expect(g[0].pipeMidi).toBe(48);
    expect(g[12].pipeMidi).toBe(48);
    const x = play([on(36)], 1.6, PIPES).x;
    expect(level(x, et(48), 0.9, 0.6)).toBeGreaterThan(level(x, et(36), 0.9, 0.6) + 30);
  });
  it('the mod wheel swells the held choirs; CC 74 turns the weave', () => {
    const ev = (cc: number, v: number): Ev[] => [on(60), { time: 0.8, event: { type: 'control', cc, value: v } }];
    expect(rmsDb(play(ev(1, 1), 1.6, STRINGS).x, 1.2, 1.6)).toBeGreaterThan(rmsDb(play(ev(1, 0), 1.6, STRINGS).x, 1.2, 1.6) + 4);
    const toPipes = play(ev(74, 1), 1.8, STRINGS);
    expect((toPipes.core.getVisual() as { volute: { weave: number } }).volute.weave).toBeGreaterThan(0.99);
  });
});

describe('volute: the hub and the halo', () => {
  it('the sympathetic strings take up what the hub does at their harmonics, and ring on', () => {
    const halo = (c: VoluteCore) => (c.getVisual() as { volute: { halo: Float32Array } }).volute.halo;
    // C4 is the C3 string's second harmonic and the F3 string's third is C5: C3 rings, C♯3 does not
    const r = play([on(60), off(60, 1.2)], 1.6, { halo: 1 });
    const h = halo(r.core);
    expect(h[0]).toBeGreaterThan(5 * h[1]);
    // after the key is let go the halo is what remains: far above the same note without it
    const without = play([on(60), off(60, 1.2)], 2.2, { halo: 0 });
    const withH = play([on(60), off(60, 1.2)], 2.2, { halo: 1 });
    expect(rmsDb(withH.x, 1.8, 2.2)).toBeGreaterThan(rmsDb(without.x, 1.8, 2.2) + 20);
    expect(rmsDb(withH.x, 1.8, 2.2)).toBeLessThan(rmsDb(withH.x, 0.8, 1.2) - 6);
  });
  it('the hub’s first modes are a free plate’s (Leissa): 1, 1.73, 2.33, 3.91 × 60 Hz', () => {
    const f = createCore({ sampleRate: FS, instrument: 'volute' }).modeFrequencies;
    expect(Array.from(f.slice(0, 4)).map((v) => +(v / 60).toFixed(2))).toEqual([1, 1.73, 2.33, 3.91]);
  });
});

describe('volute: keys, pedal, limits', () => {
  it('held keys sound; the pedal holds them; ten voices at most', () => {
    const core = createCore({ sampleRate: FS, instrument: 'volute', dry: true });
    const L = new Float32Array(256);
    const R = new Float32Array(256);
    const step = (ev?: Record<string, unknown>) => {
      if (ev) core.schedule(ev);
      core.process(L, R, 256);
      return [...core.sounding()].sort((a, b) => a - b);
    };
    expect(step({ type: 'noteOn', midi: 60, velocity: 90 })).toEqual([60]);
    expect(step({ type: 'noteOn', midi: 64, velocity: 90 })).toEqual([60, 64]);
    expect(step({ type: 'sustain', value: 1 })).toEqual([60, 64]);
    expect(step({ type: 'noteOff', midi: 60 })).toEqual([60, 64]);
    expect(step({ type: 'sustain', value: 0 })).toEqual([64]);
    expect(step({ type: 'noteOff', midi: 64 })).toEqual([]);
    for (let m = 40; m < 54; m++) core.schedule({ type: 'noteOn', midi: m, velocity: 90 });
    expect(step().length).toBe(10);
    expect(core.activeVoiceCount).toBe(10);
  });
  it('every key at velocity 1 and 127 is finite; a fortissimo cluster with the room stays under full scale', () => {
    const core = createCore({ sampleRate: FS, instrument: 'volute', dry: true });
    const L = new Float32Array(128);
    const R = new Float32Array(128);
    for (let m = VOLUTE_LO - 2; m <= VOLUTE_HI + 2; m++)
      for (const vel of [1, 127]) {
        core.allSoundOff();
        core.schedule({ type: 'noteOn', midi: m, velocity: vel });
        for (let i = 0; i < 60; i++) {
          core.process(L, R, 128);
          for (const v of L) if (!Number.isFinite(v) || Math.abs(v) > 20) throw new Error(`m${m} v${vel}: ${v}`);
        }
      }
    for (const p of [{ weave: 0, swell: 2, strike: 2, halo: 2, room: 1 }, { weave: 1, swell: 2, strike: 2, halo: 2, room: 0 }]) {
      const r = play([36, 43, 48, 52, 55, 60, 64, 67, 72, 76, 79, 84].map((m, i) => on(m, 0.01 + 0.002 * i, 127)), 1.5, p, FS, false);
      for (const v of r.left) expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
    }
  });
  it('after the keys are let go everything runs down to exact silence', () => {
    const core = createCore({ sampleRate: FS, instrument: 'volute', dry: true });
    const L = new Float32Array(4096);
    const R = new Float32Array(4096);
    for (const m of [36, 60, 84]) core.schedule({ type: 'noteOn', midi: m, velocity: 120 });
    core.process(L, R, 4096);
    for (const m of [36, 60, 84]) core.schedule({ type: 'noteOff', midi: m });
    for (let i = 0; i < 40 * FS; i += 4096) core.process(L, R, 4096);
    expect(core.activeVoiceCount).toBe(0);
    expect(core.activeSympatheticCount).toBe(0);
    expect(L.every((v) => v === 0)).toBe(true);
  });
  it('a second player is a few cents off the first', () => {
    const a = renderInstrument({ sampleRate: FS, instrument: 'volute', dry: true, params: PIPES, duration: 1.5, events: [on(67)] as never });
    const b = renderInstrument({ sampleRate: FS, instrument: 'volute', dry: true, params: PIPES, duration: 1.5, events: [on(67)] as never, player: 1 });
    const c = (r: typeof a) => analyzeSustained(r.left, FS, { start: Math.round(0.9 * FS), end: r.left.length }, 67).cents;
    expect(c(b) - c(a)).toBeGreaterThan(3);
    expect(c(b) - c(a)).toBeLessThan(5);
  });
});
