// The flute stepping up across its register breaks (C♯5 | D5, the octave; C♯6 | D6, the twelfth). The tube's
// length used to be glided to every new note, its standing wave carried along: C♯5→D5 then began on the D4
// tube's first mode and took 150–250 ms to overblow (a crack on every step up), and a rise to the third
// register took whichever mode the last note's ring was nearest (audio audit 3: 526 of 1008 rises not on
// their note; scripts/flute-rise.ts). Then a fingering that changed register replaced the tube and the notes
// fingered with a vent had one: the rises arrived, late. Now the tube's wave goes with the note (flute.ts
// CARRY, VENT; packages/engine/test/legato.test.ts for how soon).
import { describe, expect, it } from 'vitest';
import { renderInstrument } from '../src/core/index.ts';
import type { TimedEvent } from '../src/core/render.ts';

const FS = 48000;
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** two notes as a file's (told ahead), the lower for 200 ms, then the upper for `len`: slurred (the lower
 *  held 30 ms into it) or tongued (it ends where the upper begins) */
function rise(from: number, to: number, slur: boolean, len: number, vel = 80, quantum = 128): { x: Float32Array; a: number; b: number } {
  const t1 = 0.3;
  const over = slur ? 0.03 : 0;
  const events: TimedEvent[] = [
    { time: 0.1, event: { type: 'foresee', midi: from, velocity: vel, dur: 0.2 + over } as never },
    { time: t1, event: { type: 'foresee', midi: to, velocity: vel, dur: len } as never },
    { time: 0.1, event: { type: 'noteOn', midi: from, velocity: vel } },
    ...(slur ? [] : [{ time: t1, event: { type: 'noteOff', midi: from } } as TimedEvent]),
    { time: t1, event: { type: 'noteOn', midi: to, velocity: vel } },
    ...(slur ? [{ time: t1 + over, event: { type: 'noteOff', midi: from } } as TimedEvent] : []),
    { time: t1 + len, event: { type: 'noteOff', midi: to } },
  ];
  const r = renderInstrument({ instrument: 'flute', sampleRate: FS, events, duration: t1 + len + 0.1, dry: true, quantum });
  return { x: r.left, a: Math.round(t1 * FS), b: Math.round((t1 + len) * FS) };
}

/** the power on a pitch's harmonics, and all the power, in a Hann window over [a, b) */
function onPitch(x: Float32Array, f0: number, a: number, b: number): { own: number; all: number } {
  const W = b - a;
  let sw = 0;
  let sw2 = 0;
  let all = 0;
  for (let i = 0; i < W; i++) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / W);
    sw += h;
    sw2 += h * h;
    all += (h * x[a + i]) ** 2;
  }
  let own = 0;
  for (let k = 1; k * f0 < 0.45 * FS && k <= 10; k++) {
    const w = (2 * Math.PI * k * f0) / FS;
    let re = 0;
    let im = 0;
    for (let i = 0; i < W; i++) {
      const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / W);
      re += x[a + i] * h * Math.cos(w * i);
      im += x[a + i] * h * Math.sin(w * i);
    }
    own += (2 * (re * re + im * im)) / (sw * sw);
  }
  return { own, all: all / sw2 };
}

/** the same note held alone: its power on its own harmonics once it has settled */
function held(m: number, vel = 80): number {
  const r = renderInstrument({ instrument: 'flute', sampleRate: FS, events: [{ time: 0.05, event: { type: 'noteOn', midi: m, velocity: vel } }], duration: 1, dry: true });
  return onPitch(r.left, et(m), Math.round(0.6 * FS), Math.round(0.9 * FS)).own;
}

/** the upper note over its 40–90 %: the share of its power at its own pitch, and its level against the held note (dB) */
function upper(from: number, to: number, slur: boolean, len: number): { share: number; reach: number } {
  const { x, a, b } = rise(from, to, slur, len);
  const p = onPitch(x, et(to), Math.round(a + 0.4 * (b - a)), Math.round(a + 0.9 * (b - a)));
  return { share: p.own / p.all, reach: 10 * Math.log10(p.own / held(to)) };
}

describe('the flute rising across a register break', () => {
  it('a step up across each break is on its note within a 150 ms note, slurred and tongued (it was the octave or the twelfth below)', () => {
    // (before: share 0.09–0.3 and 10–30 dB under the held note, each of these)
    for (const [from, to] of [[73, 74], [72, 74], [73, 75], [85, 86], [84, 86], [83, 86]])
      for (const slur of [true, false]) {
        const u = upper(from, to, slur, 0.15);
        expect(u.share, `${from}→${to} ${slur ? 'slurred' : 'tongued'}: share at its pitch`).toBeGreaterThan(0.8);
        expect(u.reach, `${from}→${to} ${slur ? 'slurred' : 'tongued'}: dB of the held note`).toBeGreaterThan(-6);
      }
  });
  it('a leap to the third register arrives, where no finger moves in this model too (G5→D6, A5→E6: they never did)', () => {
    // (before: share under 0.1 after 300 ms, on the tube's second or fourth mode)
    for (const [from, to] of [[79, 86], [81, 88], [81, 86], [84, 91], [72, 86]])
      for (const slur of [true, false]) {
        const u = upper(from, to, slur, 0.3);
        expect(u.share, `${from}→${to} ${slur ? 'slurred' : 'tongued'}: share at its pitch`).toBeGreaterThan(0.8);
        expect(u.reach, `${from}→${to} ${slur ? 'slurred' : 'tongued'}: dB of the held note`).toBeGreaterThan(-6);
      }
  });
  it('the vent takes nothing from a note on its own mode: a slurred third-register note settles at the held note’s level', () => {
    const { x, a } = rise(84, 88, true, 0.9);
    const p = onPitch(x, et(88), a + Math.round(0.5 * FS), a + Math.round(0.8 * FS));
    expect(Math.abs(10 * Math.log10(p.own / held(88)))).toBeLessThan(1);
    expect(p.own / p.all).toBeGreaterThan(0.97);
  });
  it('the same sound whatever the host block size, through a change of tube and a vent', () => {
    const r = [128, 37, 500].map((q) => rise(85, 86, true, 0.2, 80, q).x);
    for (const k of [1, 2]) {
      let d = 0;
      for (let i = 0; i < r[0].length; i++) d = Math.max(d, Math.abs(r[k][i] - r[0][i]));
      expect(d).toBe(0);
    }
  });
});
