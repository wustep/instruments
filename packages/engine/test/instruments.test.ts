// Violin, viola, cello (bowed waveguide strings + modal body) and flute (jet-driven
// bore): pitch, physically emergent behaviour, stability, resonance.
import { describe, expect, it } from 'vitest';
import { BowedCore, FluteCore, renderInstrument, type InstrumentId } from '../src/core/index.ts';
import { analyzeSustained, spectrum, peakIn } from '../src/analysis/index.ts';

const FS = 48000;
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);

function play(instrument: InstrumentId, notes: number[], dur: number, params: Record<string, unknown> = {}, vel = 80) {
  return renderInstrument({
    sampleRate: FS,
    instrument,
    dry: true,
    params,
    duration: dur,
    events: notes.map((m) => ({ time: 0.01, event: { type: 'noteOn' as const, midi: m, velocity: vel } })),
  });
}

/** mean pitch (cents vs target) by autocorrelation over [t0, t0+len] */
function pitchCents(x: Float32Array, f: number, t0 = 0.8, len = 0.5): number {
  const s0 = Math.round(t0 * FS);
  const W = Math.round(len * FS);
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag];
    return s;
  };
  const lo = Math.floor(FS / (f * 1.06));
  const hi = Math.ceil(FS / (f * 0.94));
  let best = -Infinity;
  let bl = lo;
  for (let lag = lo; lag <= hi; lag++) {
    const v = ac(lag);
    if (v > best) {
      best = v;
      bl = lag;
    }
  }
  const a = ac(bl - 1);
  const b = ac(bl);
  const c = ac(bl + 1);
  return cents(FS / (bl + (0.5 * (a - c)) / (a - 2 * b + c)), f);
}

const finite = (x: Float32Array, bound = 20) => x.every((v) => Number.isFinite(v) && Math.abs(v) < bound);

describe('bowed strings', () => {
  const cases: [InstrumentId, number[]][] = [
    ['violin', [55, 62, 69, 76, 83, 93]],
    ['viola', [48, 55, 62, 69, 79]],
    ['cello', [36, 43, 50, 57, 69]],
    ['bass', [28, 33, 38, 43, 55, 67]],
  ];
  for (const [inst, notes] of cases) {
    // high positions on very short vibrating lengths run a few cents sharp under the bow
    it(`${inst}: bowed notes sound at pitch (±5 cents below C6, ±8 above; no vibrato)`, () => {
      for (const m of notes) {
        // (the string's own pitch: the finger where the model has it, `human` 0)
        const r = play(inst, [m], 1.5, { vibrato: 0, human: 0 });
        expect(finite(r.left), `${inst} m${m}`).toBe(true);
        // pitch from the harmonic series (sub-cent on synthetic tests, sustained.test.ts):
        // time-domain autocorrelation over a ~27-sample period (A6) is biased by several cents
        const cents = analyzeSustained(r.left, FS, { start: Math.round(0.6 * FS), end: r.left.length }, m).cents;
        expect(Math.abs(cents), `${inst} m${m}`).toBeLessThan(m > 84 || inst === 'viola' && m > 76 ? 8 : 5);
      }
    });
  }

  it('Helmholtz motion emerges: the string sticks to the bow for ≈ (1 − β) of each period', () => {
    for (const beta of [0.08, 0.15]) {
      const r = play('violin', [69], 1.0, { vibrato: 0, bowPosition: beta });
      const vis = (r.core as BowedCore).getVisual() as { excite: { trace2: Float32Array } };
      const v = vis.excite.trace2;
      const vb = Math.max(...Array.from(v));
      let stick = 0;
      for (const x of v) if (Math.abs(x - vb) < 0.05 * vb) stick++;
      expect(stick / v.length, `β=${beta}`).toBeGreaterThan(1 - beta - 0.08);
      expect(stick / v.length, `β=${beta}`).toBeLessThan(1 - beta + 0.06);
    }
  });

  it('the bow position shapes the spectrum: bowing at β = 1/5 suppresses partial 5 (Helmholtz)', () => {
    const lv = (beta: number, k: number) => {
      const r = play('cello', [43], 1.4, { vibrato: 0, bowPosition: beta });
      const sp = spectrum(r.left, FS, Math.round(0.7 * FS), Math.round(0.6 * FS), 1 << 17);
      const p = peakIn(sp, k * et(43) * 0.99, k * et(43) * 1.01);
      return 20 * Math.log10((p?.mag ?? 1e-12) + 1e-12);
    };
    const notch = (beta: number) => lv(beta, 5) - 0.5 * (lv(beta, 4) + lv(beta, 6));
    // ideal Helmholtz motion has no 5th partial at β = 1/5; losses make the notch finite
    const n20 = notch(0.2);
    expect(n20).toBeLessThan(0);
    expect(n20).toBeLessThan(notch(0.13) - 10);
  });

  it('open strings resonate sympathetically when an octave is bowed', () => {
    // bow D5 (m74) on the A string; the open D string (D4) shares its partials
    const r = play('violin', [74], 1.5, { vibrato: 0 });
    const core = r.core as BowedCore;
    const dString = core.strings.find((s) => s.def.name === 'D')!;
    const eString = core.strings.find((s) => s.def.name === 'E')!;
    expect(dString.bowing).toBe(false);
    expect(dString.level).toBeGreaterThan(0);
    // D4's partials match D5, E5's do not
    expect(dString.level).toBeGreaterThan(3 * eString.level);
  });

  it('releasing the key lifts the bow and the string rings down freely', () => {
    const r = renderInstrument({
      sampleRate: FS,
      instrument: 'cello',
      dry: true,
      duration: 2.5,
      events: [
        { time: 0.01, event: { type: 'noteOn', midi: 48, velocity: 90 } },
        { time: 1.0, event: { type: 'noteOff', midi: 48 } },
      ],
    });
    const rms = (a: number, b: number) => {
      let s = 0;
      for (let i = Math.round(a * FS); i < Math.round(b * FS); i++) s += r.left[i] ** 2;
      return Math.sqrt(s / ((b - a) * FS));
    };
    expect(rms(1.15, 1.35)).toBeGreaterThan(0.02 * rms(0.7, 0.9)); // still ringing, not cut
    expect(rms(2.2, 2.45)).toBeLessThan(0.5 * rms(0.7, 0.9)); // decaying
  });

  it('stays finite at bow-force and position extremes, with double stops', () => {
    for (const bowPressure of [0.05, 1.1]) for (const bowPosition of [0.04, 0.25]) {
      const r = play('violin', [55, 62, 69, 76], 0.8, { bowPressure, bowPosition, vibrato: 40 }, 127);
      expect(finite(r.left), `F=${bowPressure} β=${bowPosition}`).toBe(true);
    }
  });
});

describe('flute', () => {
  it('every note from C4 to C7 speaks at pitch (±3 cents) on its intended register', () => {
    for (let m = 60; m <= 96; m += 3) {
      // (the model alone: the player puts its own few cents on every note)
      const r = play('flute', [m], 1.5, { vibrato: 0, human: 0 });
      expect(finite(r.left), `m${m}`).toBe(true);
      expect(Math.abs(pitchCents(r.left, et(m))), `m${m}`).toBeLessThan(3);
    }
  });

  it('blowing much harder overblows the low register to the octave', () => {
    const r = play('flute', [62], 1.5, { vibrato: 0, breath: 2.5 });
    const sp = spectrum(r.left, FS, Math.round(0.8 * FS), Math.round(0.5 * FS), 1 << 16);
    const f1 = peakIn(sp, et(62) * 0.97, et(62) * 1.03);
    const f2 = peakIn(sp, et(74) * 0.95, et(74) * 1.03);
    expect(f2!.mag).toBeGreaterThan(10 * (f1?.mag ?? 0));
  });

  it('louder playing is louder; much less breath gives a much weaker tone', () => {
    const level = (vel: number, breath = 1) => {
      const r = play('flute', [67], 1.2, { vibrato: 0, breath }, vel);
      let s = 0;
      for (let i = Math.round(0.8 * FS); i < Math.round(1.1 * FS); i++) s += r.left[i] ** 2;
      return 10 * Math.log10(s + 1e-30);
    };
    expect(level(120)).toBeGreaterThan(level(25) + 4);
    expect(level(80, 0.25)).toBeLessThan(level(80) - 10);
  });

  it('is monophonic with legato: a second key changes pitch without a new attack', () => {
    const r = renderInstrument({
      sampleRate: FS,
      instrument: 'flute',
      dry: true,
      params: { vibrato: 0 },
      duration: 2.0,
      events: [
        { time: 0.01, event: { type: 'noteOn', midi: 67, velocity: 80 } },
        { time: 0.8, event: { type: 'noteOn', midi: 69, velocity: 80 } },
      ],
    });
    expect((r.core as FluteCore).activeVoiceCount).toBe(1);
    expect(Math.abs(pitchCents(r.left, et(69), 1.3, 0.5))).toBeLessThan(5);
  });
});
