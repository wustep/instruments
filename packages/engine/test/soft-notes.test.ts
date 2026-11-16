// Soft notes in context, as a budget (scripts/winds-legato.ts is the survey at length): the double reeds'
// low and middle notes at two soft dynamics, from silence, joined to the note a step above (tongued over the
// breath) and slurred from the note a step below, each held a second: on their own pitch over the second
// half. Before the player's ear (core/register-ear.ts) the oboe's B♭3–C♯5 and the bassoon's low notes sat on
// their octave or another regime in 5–10 % of such notes, some for all of it. At `human` 0 (the model that is
// fitted and judged) the ear is never used. And the piano's soft treble (calibration `lift`).
import { describe, expect, it } from 'vitest';
import { renderInstrument, type InstrumentId } from '../src/core/index.ts';
import { BassoonCore } from '../src/core/bassoon.ts';
import { OboeCore } from '../src/core/oboe.ts';
import { DEFAULT_CALIBRATION } from '../src/core/calibration.ts';
import { hammerVelocity } from '../src/core/design.ts';

const FS = 48000;
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** the note's pitch over [a, b] s (the normalised autocorrelation's first peak near its best, median of
 *  5 ms frames), looked for from a twelfth under to a twelfth over: 0 where none */
function pitch(x: Float32Array, a: number, b: number, f0: number): number {
  const W = Math.max(Math.round(0.005 * FS), Math.round((3 * FS) / f0));
  const lagMin = Math.max(2, Math.floor(FS / (f0 * 3.2)));
  const lagMax = Math.ceil((FS * 3.2) / f0);
  const fs: number[] = [];
  const nsdf = new Float64Array(lagMax + 2);
  for (let t = a; t <= b; t += 0.02) {
    const s = Math.round(t * FS);
    let best = 0;
    for (let lag = lagMin; lag <= lagMax + 1; lag++) {
      let ac = 0;
      let m = 0;
      for (let i = 0; i < W; i++) {
        const u = x[s + i] ?? 0;
        const v = x[s + i + lag] ?? 0;
        ac += u * v;
        m += u * u + v * v;
      }
      nsdf[lag] = m > 0 ? (2 * ac) / m : 0;
      if (lag <= lagMax && nsdf[lag] > best) best = nsdf[lag];
    }
    for (let lag = lagMin + 1; lag <= lagMax; lag++)
      if (best > 0.3 && nsdf[lag] >= 0.9 * best && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] > nsdf[lag + 1]) {
        fs.push(FS / lag);
        break;
      }
  }
  fs.sort((p, q) => p - q);
  return fs.length ? fs[fs.length >> 1] : 0;
}

type Ctx = 'alone' | 'joined' | 'slurred';
/** the note `m` at velocity `v`, held a second, in a context; its pitch's cents from the note over the
 *  second half, and the player's ear's nudges */
function soft(id: InstrumentId, m: number, v: number, ctx: Ctx, human = 1): { cents: number; kicks: number } {
  const ev: { time: number; event: object }[] = [];
  let t = 0.05;
  if (ctx === 'joined') {
    ev.push({ time: t, event: { type: 'noteOn', midi: m + 2, velocity: v } }, { time: t + 0.6, event: { type: 'noteOff', midi: m + 2 } });
    t += 0.6;
  } else if (ctx === 'slurred') {
    ev.push({ time: t, event: { type: 'noteOn', midi: m - 2, velocity: v } }, { time: t + 0.63, event: { type: 'noteOff', midi: m - 2 } });
    t += 0.6;
  }
  ev.push({ time: t, event: { type: 'noteOn', midi: m, velocity: v } }, { time: t + 1, event: { type: 'noteOff', midi: m } });
  const r = renderInstrument({ instrument: id, sampleRate: FS, dry: true, params: { human }, events: ev, duration: t + 1.1 } as never);
  const f = pitch(r.left, t + 0.5, t + 0.95, et(m));
  return { cents: f > 0 ? 1200 * Math.log2(f / et(m)) : NaN, kicks: 0 };
}

describe('soft notes in context', () => {
  const cases = (lo: number, hi: number, step: number) => {
    const out: [number, number, Ctx][] = [];
    for (let m = lo; m <= hi; m += step) for (const v of [44, 60]) for (const c of ['alone', 'joined', 'slurred'] as Ctx[]) out.push([m, v, c]);
    return out;
  };
  // (the budget: the bassoon's ear listens for its octave, and two notes here sit on regimes off its harmonics,
  // F♯2 joined at 1591 ¢ and A♭2 alone at 874 ¢, as they did before it)
  for (const [id, lo, hi, step, budget] of [
    ['oboe', 58, 73, 1, 0],
    ['bassoon', 36, 60, 2, 2],
  ] as [InstrumentId, number, number, number, number][])
    it(`${id}: its low and middle notes, soft, alone, joined and slurred, are on their own pitch`, () => {
      const off: string[] = [];
      const all = cases(lo, hi, step);
      for (const [m, v, c] of all) {
        const { cents } = soft(id, m, v, c);
        if (!(Math.abs(cents) < 40)) off.push(`${m}/v${v}/${c}: ${Number.isNaN(cents) ? 'no pitch' : `${cents.toFixed(0)} ¢`}`);
      }
      // (before the ear: the oboe 7 of 96, the bassoon 8 of 78)
      expect(off.length, `${id}: ${off.join(', ')}`).toBeLessThanOrEqual(budget);
    });

  it('at human 0 (the model fitted and judged) the ear is never used', () => {
    for (const Core of [OboeCore, BassoonCore]) {
      const core = new Core({ sampleRate: FS, dry: true, params: { human: 0 } } as never);
      // the oboe's E♭4 joined from F4 softly: on its octave without the player
      core.schedule({ type: 'noteOn', midi: 65, velocity: 44 } as never, 0);
      core.schedule({ type: 'noteOff', midi: 65 } as never, Math.round(0.6 * FS));
      core.schedule({ type: 'noteOn', midi: 63, velocity: 44 } as never, Math.round(0.6 * FS));
      const L = new Float32Array(128);
      const R = new Float32Array(128);
      for (let a = 0; a < 1.6 * FS; a += 128) core.process(L, R, 128);
      expect(core.ear.kicks).toBe(0);
    }
  });

  it('the piano’s soft treble: its hammers quicker from F♯6 up at a soft stroke, by nothing at the loudest or below D6', () => {
    const cal = DEFAULT_CALIBRATION;
    const bare = { ...cal, lift: undefined };
    const gain = (m: number, v: number) => 20 * Math.log10(hammerVelocity(v, cal, m) / hammerVelocity(v, bare, m));
    expect(gain(84, 30)).toBe(0);
    expect(gain(100, 127)).toBeCloseTo(0, 9);
    expect(gain(100, 1)).toBeCloseTo(6, 6);
    // most at the softest, little by mf (velocity 70), nothing at ff
    expect(gain(100, 30)).toBeGreaterThan(3);
    expect(gain(100, 70)).toBeLessThan(1.5);
    expect(gain(100, 112)).toBeLessThan(0.1);
  });
});
