// Orchestra mode: a second player of the same instrument (the `player` option). Player 0 is the
// instrument exactly as it is; another player has its own random stream (vibrato, bow, breath and
// hammer noise, a piano's own unisons) and a few cents of its own intonation, so two violins on one
// tune are two players and not one violin twice as loud.
import { describe, expect, it } from 'vitest';
import { renderInstrument } from '../src/core/render.ts';
import { playerCents } from '../src/core/util.ts';
import { cents, FS, measurePeak } from './helpers.ts';

const note = (m: number, dur: number) => [
  { time: 0.02, event: { type: 'noteOn' as const, midi: m, velocity: 90 } },
  { time: dur - 0.3, event: { type: 'noteOff' as const, midi: m } },
];
const run = (instrument: 'piano' | 'violin' | 'flute' | 'trumpet', m: number, player?: number, dur = 1.6) => renderInstrument({ sampleRate: FS, instrument, preset: 'grand', events: note(m, dur), duration: dur, dry: true, player }).left;
const lvl = (x: Float32Array) => 10 * Math.log10(x.subarray(Math.round(0.4 * FS), Math.round(1.2 * FS)).reduce((s, v) => s + v * v, 0));
/** the flute's mean level over eight notes in one sitting (dB), as player `player` plays them */
const sitting = (player: number) => {
  const ms = [72, 74, 76, 77, 79, 77, 76, 74];
  const ev = ms.flatMap((m, i) => [{ time: 0.02 + 1.2 * i, event: { type: 'noteOn' as const, midi: m, velocity: 90 } }, { time: 1.02 + 1.2 * i, event: { type: 'noteOff' as const, midi: m } }]);
  const x = renderInstrument({ sampleRate: FS, instrument: 'flute', events: ev, duration: 1.2 * ms.length, dry: true, player }).left;
  return ms.reduce((s, _, i) => s + 10 * Math.log10(x.subarray(Math.round((0.3 + 1.2 * i) * FS), Math.round((1.0 + 1.2 * i) * FS)).reduce((a, v) => a + v * v, 0)), 0) / ms.length;
};
/** normalised correlation over [t0, t1] s */
const corr = (a: Float32Array, b: Float32Array, t0: number, t1: number) => {
  let xy = 0;
  let xx = 0;
  let yy = 0;
  for (let i = Math.round(t0 * FS); i < Math.round(t1 * FS); i++) {
    xy += a[i] * b[i];
    xx += a[i] * a[i];
    yy += b[i] * b[i];
  }
  return xy / Math.sqrt(xx * yy);
};

describe('a second player of the same instrument', () => {
  it('player 0 is the instrument as it is, sample for sample', () => {
    const a = run('violin', 67, undefined, 0.8);
    const b = run('violin', 67, 0, 0.8);
    expect(a.every((x, i) => x === b[i])).toBe(true);
  });

  it('another player plays the same note as a different player: not one instrument twice', () => {
    for (const [inst, m, most] of [
      ['violin', 67, 0.6],
      ['flute', 76, 0.6],
      ['trumpet', 67, 0.6],
      ['piano', 60, 0.9],
    ] as const) {
      const a = run(inst, m, 0);
      const b = run(inst, m, 1);
      const r = corr(a, b, 0.4, 1.2);
      expect(r, inst).toBeLessThan(most);
      // as loud (within 1 dB): the same instrument, played as well
      if (inst === 'violin') continue;
      // (the flute's player puts its own breath on each note, ±0.6 dB: its two players are compared over eight
      // notes in one sitting, where one note is one draw)
      if (inst === 'flute') {
        expect(Math.abs(sitting(0) - sitting(1)), inst).toBeLessThan(1);
        continue;
      }
      expect(Math.abs(lvl(a) - lvl(b)), inst).toBeLessThan(1);
    }
    // a bowed string's level on one note depends on where its stick–slip settles, which another
    // player's random stream moves (on main, five players of this G4 already spanned 5 dB): the violin
    // is as loud on average over twelve notes (over four, two players stood 1.6–1.7 dB apart at another
    // dynamic before the hand's vibrato wandered and after it alike; over twelve, four players are within
    // 0.8 dB of each other: one note is one draw)
    const ms = [57, 59, 61, 64, 67, 69, 71, 74, 76, 78, 81, 83];
    const mean = (p: number) => ms.reduce((s, m) => s + lvl(run('violin', m, p)), 0) / ms.length;
    expect(Math.abs(mean(0) - mean(1))).toBeLessThan(1);
  });

  it('its intonation is a few cents off the first player’s (+4, −4, +8 ¢), the trumpet’s too', () => {
    expect([0, 1, 2, 3, 4].map(playerCents)).toEqual([0, 4, -4, 8, -8]);
    const f = 440 * Math.pow(2, (67 - 69) / 12);
    // (the players' own tuning, not where each happens to put this note: `human` 0)
    const tpt = (player: number) => renderInstrument({ sampleRate: FS, instrument: 'trumpet', events: note(67, 1.4), duration: 1.4, dry: true, player, params: { human: 0 } as never }).left;
    const a = measurePeak(tpt(0), f, 0.5, 0.6)!;
    const b = measurePeak(tpt(1), f, 0.5, 0.6)!;
    expect(cents(b.f, a.f)).toBeGreaterThan(2.5);
    expect(cents(b.f, a.f)).toBeLessThan(5.5);
  });
});
