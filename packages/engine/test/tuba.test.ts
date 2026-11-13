// The tuba (core/tuba.ts): the horn's engine (core/lipcone.ts) at the contrabass tuba in C's compass and
// voicing. Its four-valve fingering (the fourth in place of 1+3, the usual chart), concert pitch across its
// compass, every note on its own partial at pp, mf and ff, the low notes' weak fundamental under harmonics
// gathered near 300–600 Hz and the top notes nearly their fundamental and second, louder and brighter with
// velocity, a note outside the compass at its end, a second player its own; and the engine it shares: the
// valve search is the trumpet's and the horn's (core/valves.ts). Its player (`human`): the intonation he
// leaves on valves together and on the fifth partial, no two notes alike, a held note's bloom and wander.
import { describe, expect, it } from 'vitest';
import { createCore, renderInstrument, HornCore, LipConeCore, TubaCore, TUBA_HI, TUBA_LENGTH, TUBA_LO, TUBA_VOICE, VALVES3, VALVES4, hornFingering, partialCents, trumpetFingering, tubaFingering, tubaIntonation, tubaTubeLength, tubaValveSharp, valveFingering, valvesDown } from '../src/core/index.ts';
import { regime } from '../../../scripts/horn-regimes.ts';
import { measureCents } from '../../../scripts/tune-horn.ts';

const FS = 48000;
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  const i0 = Math.round(a * FS);
  const i1 = Math.round(b * FS);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (i1 - i0) + 1e-20);
};
const held = (m: number, vel: number, dur = 1.6, player?: number) =>
  renderInstrument({ sampleRate: FS, instrument: 'tuba', dry: true, params: { vibrato: 0 } as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: vel } }] as never, duration: dur, player }).left;
/** the note's harmonics 1…n (dB, Hann-windowed, 0.9–1.5 s) */
const harmonics = (x: Float32Array, m: number, n: number) => {
  const f = 440 * 2 ** ((m - 69) / 12);
  const W = Math.round(0.6 * FS);
  const s0 = Math.round(0.9 * FS);
  return Array.from({ length: n }, (_, j) => {
    let re = 0;
    let im = 0;
    for (let i = 0; i < W; i++) {
      const hw = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
      re += x[s0 + i] * hw * Math.cos((2 * Math.PI * (j + 1) * f * i) / FS);
      im += x[s0 + i] * hw * Math.sin((2 * Math.PI * (j + 1) * f * i) / FS);
    }
    return 20 * Math.log10(Math.hypot(re, im) + 1e-30);
  });
};

describe('tuba', () => {
  it('the four-valve fingering: the chart’s choices, the fourth valve in place of 1+3 and 2+4 of 1+2+3', () => {
    const f = (m: number) => {
      const x = tubaFingering(m);
      return `${x.valves} ${x.partial}`;
    };
    // C2 down to D♭1 on the second partial: open, 2, 1, 1+2, 2+3, 4, 2+4, 1+4, 1+2+4, 2+3+4, 1+3+4, 1+2+3+4
    expect([36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25].map(f)).toEqual(['0 2', '2 2', '1 2', '1+2 2', '2+3 2', '4 2', '2+4 2', '1+4 2', '1+2+4 2', '2+3+4 2', '1+3+4 2', '1+2+3+4 2']);
    // the pedal C1 is the open tube's own; above C2 the least lowering on the lowest partial
    expect(f(24)).toBe('0 1');
    expect([38, 41, 43, 48, 50, 52, 55, 60, 62, 64, 65].map(f)).toEqual(['4 3', '1 3', '0 3', '0 4', '1 5', '0 5', '0 6', '0 8', '0 9', '0 10', '1 12']);
    for (let m = TUBA_LO; m <= TUBA_HI; m++) {
      const x = tubaFingering(m);
      expect(24 - x.lower + Math.round(12 * Math.log2(x.partial)), `MIDI ${m}`).toBe(m);
      // (never 1+3 or 1+2+3: the fourth valve stands in for them)
      expect(['1+3', '1+2+3']).not.toContain(x.valves);
    }
    expect(tubaTubeLength(tubaFingering(36))).toBeCloseTo(TUBA_LENGTH, 6);
    expect(tubaTubeLength(tubaFingering(31))).toBeCloseTo(TUBA_LENGTH * 2 ** (5 / 12), 6);
    expect(valvesDown('1+2+4', 4)).toEqual([true, true, false, true]);
    expect(valvesDown('0', 4)).toEqual([false, false, false, false]);
  });

  it('the valves are the brass’s own: one search for the trumpet, the horn and the tuba', () => {
    // (the trumpet's and the horn's fingerings are this search's, as they were before it was shared)
    expect([trumpetFingering(58), trumpetFingering(60), trumpetFingering(67)]).toEqual([{ partial: 2, lower: 0, valves: 'open' }, { partial: 3, lower: 5, valves: '1+3' }, { partial: 4, lower: 3, valves: '1+2' }]);
    expect(valveFingering(53, 29, [2, 3, 4, 5, 6], VALVES3)).toEqual({ valves: '0', lower: 0, partial: 4 });
    expect(hornFingering(53)).toMatchObject({ side: 'F', valves: '0', partial: 4 });
    expect(valveFingering(31, 24, [2, 3, 4], VALVES4)).toEqual({ valves: '4', lower: 5, partial: 2 });
    expect(valveFingering(20, 24, [2, 3, 4], VALVES4)).toBeNull();
    // and the engine: the horn and the tuba are the same core at their own compass and voicing
    const horn = new HornCore({ sampleRate: FS, dry: true });
    const tuba = new TubaCore({ sampleRate: FS, dry: true });
    expect(horn).toBeInstanceOf(LipConeCore);
    expect(tuba).toBeInstanceOf(LipConeCore);
    expect([horn.id, tuba.id]).toEqual(['horn', 'tuba']);
    expect(tuba.keySummary().length).toBe(TUBA_HI - TUBA_LO + 1);
    expect(tuba.keySummary()[1].preparation).toBe('valves 1+2+3+4, partial 2');
  });

  it('plays at concert pitch from C1 to F4 (within 6 ¢ at 44.1 and 48 kHz)', () => {
    for (const fs of [44100, 48000])
      for (let m = TUBA_LO; m <= TUBA_HI; m += 7) {
        const c = measureCents(fs, m, 70, 'tuba');
        expect(Math.abs(c), `${fs} Hz, MIDI ${m}: ${c.toFixed(1)} ¢`).toBeLessThan(6);
      }
  });

  it('every note holds its own partial at pp, mf and ff (never a neighbour: a cracked note)', () => {
    // (held 1.5 s, read in the mouthpiece: scripts/horn-regimes.ts --instrument tuba; the whole compass at
    // four rates is the fit's: 504 of 504)
    for (const vel of [30, 70, 112]) for (let m = TUBA_LO; m <= TUBA_HI; m += 4) expect(regime(m, vel, FS, undefined, 1.5, 'tuba'), `MIDI ${m}, velocity ${vel}`).toBe('1');
  });

  it('the low notes’ fundamental is weak under harmonics gathered near 300–700 Hz; the top notes are their first two', () => {
    // the recordings (Iowa MIS tuba, mf): C1–B1 the fundamental 16–35 dB under the strongest harmonic, which
    // lies at 250–450 Hz; from C3 the first and second harmonics lead and the rest fall away
    for (const m of [24, 29, 33, 36]) {
      const H = harmonics(held(m, 70), m, 20);
      const f = 440 * 2 ** ((m - 69) / 12);
      const k = H.indexOf(Math.max(...H));
      expect((k + 1) * f, `MIDI ${m}: strongest harmonic ${k + 1}`).toBeGreaterThan(200);
      expect((k + 1) * f, `MIDI ${m}: strongest harmonic ${k + 1}`).toBeLessThan(750);
      expect(H[k] - H[0], `MIDI ${m}`).toBeGreaterThan(10);
    }
    for (const m of [55, 60, 64]) {
      const H = harmonics(held(m, 70), m, 6);
      expect(Math.max(H[0], H[1]) - Math.max(H[3], H[4], H[5]), `MIDI ${m}`).toBeGreaterThan(8);
    }
  });

  it('louder and brighter with velocity: ff at least 8 dB over pp, its upper harmonics stronger', () => {
    for (const m of [29, 41, 53, 62]) {
      const pp = held(m, 30);
      const ff = held(m, 112);
      expect(rmsDb(ff, 0.8, 1.4) - rmsDb(pp, 0.8, 1.4), `MIDI ${m}`).toBeGreaterThan(8);
      const hp = harmonics(pp, m, 6);
      const hf = harmonics(ff, m, 6);
      expect(hf[5] - hf[1], `MIDI ${m}: the sixth harmonic against the second`).toBeGreaterThan(hp[5] - hp[1]);
    }
  });

  it('a note outside the compass sounds at its nearest end; the voicing is the fitted one', () => {
    const L = new Float32Array(256);
    const R = new Float32Array(256);
    for (const [m, at] of [[20, TUBA_LO], [72, TUBA_HI]]) {
      const c = createCore({ instrument: 'tuba', sampleRate: FS, dry: true } as never);
      c.schedule({ type: 'noteOn', midi: m, velocity: 80 });
      c.process(L, R, 256);
      expect(c.sounding()).toEqual([at]);
    }
    // (a wide bell lets go of the highs lower than a horn's)
    expect(TUBA_VOICE.bellFc).toBeLessThan(1213);
    expect(TUBA_VOICE.gammaHi).toBeGreaterThan(TUBA_VOICE.gammaLo);
  });

  it('intonation: valves together stand sharp (each loop is cut for the open tube) and the fifth partial flat; the player leaves a little of both, the tube alone none', () => {
    // what the valves leave before anything is done about it (cents sharp)
    expect(tubaValveSharp('0')).toBeCloseTo(0, 9);
    for (const v of ['1', '2', '4']) expect(tubaValveSharp(v)).toBeCloseTo(0, 9);
    expect(tubaValveSharp('1+2')).toBeCloseTo(10.5, 0);
    expect(tubaValveSharp('2+4')).toBeCloseTo(24.5, 0);
    expect(tubaValveSharp('1+4')).toBeCloseTo(48, 0);
    expect(tubaValveSharp('1+2+4')).toBeCloseTo(79, 0);
    expect(tubaValveSharp('1+2+3+4')).toBeGreaterThan(160);
    // (the fourth valve in place of 1+3, and 2+4 of 1+2+3: what they would have left)
    expect(tubaValveSharp('1+3')).toBeGreaterThan(25);
    expect(tubaValveSharp('1+2+3')).toBeGreaterThan(45);
    expect(partialCents(5)).toBeCloseTo(-13.7, 1);
    expect(partialCents(3)).toBeCloseTo(2, 0);
    expect(partialCents(8)).toBeCloseTo(0, 9);
    // what the player leaves: nothing on an open or one-valve octave partial, a few cents on two valves, never
    // more than 12 on the low four-valve notes, the fifth partial 7 ¢ flat
    for (const m of [24, 31, 34, 35, 36, 48, 59, 60]) expect(Math.abs(tubaIntonation(tubaFingering(m))), `MIDI ${m}`).toBeLessThan(1.1);
    expect(tubaIntonation(tubaFingering(33))).toBeCloseTo(1.6, 1);
    expect(tubaIntonation(tubaFingering(30))).toBeCloseTo(3.7, 1);
    expect(tubaIntonation(tubaFingering(29))).toBeCloseTo(7.2, 1);
    for (const m of [25, 26, 27, 28]) {
      expect(tubaIntonation(tubaFingering(m)), `MIDI ${m}`).toBeGreaterThan(11);
      expect(tubaIntonation(tubaFingering(m)), `MIDI ${m}`).toBeLessThanOrEqual(12);
    }
    for (const m of [50, 51, 52]) expect(tubaIntonation(tubaFingering(m)), `MIDI ${m}`).toBeCloseTo(-6.8, 1);
    // played: against a note the player leaves where it is (G1, the fourth valve alone; the same player's
    // wander is under both), E1 on 1+2+4 is 12 ¢ sharper, E3 on the fifth partial 7 ¢ flatter; the tube alone
    // plays them all at pitch
    const with_ = (m: number) => measureCents(FS, m, 70, 'tuba', { human: 1 });
    const g1 = with_(31);
    expect(with_(28) - g1).toBeGreaterThan(9);
    expect(with_(28) - g1).toBeLessThan(15);
    expect(with_(52) - g1).toBeLessThan(-4);
    expect(with_(52) - g1).toBeGreaterThan(-10);
    for (const m of [28, 31, 52]) expect(Math.abs(measureCents(FS, m, 70, 'tuba')), `the tube alone, MIDI ${m}`).toBeLessThan(1.5);
  });

  it('a player: no two notes alike (their level, their first moments), a held note blooms and its pitch wanders; `human` 0 is the model alone; the same notes give the same samples', () => {
    const six = (human: number) => {
      const ev: { time: number; event: unknown }[] = [];
      for (let k = 0; k < 6; k++) ev.push({ time: 0.05 + k * 1.3, event: { type: 'noteOn', midi: 41, velocity: 84 } }, { time: 0.05 + k * 1.3 + 0.5, event: { type: 'noteOff', midi: 41 } });
      return renderInstrument({ sampleRate: FS, instrument: 'tuba', dry: true, params: { vibrato: 0, noise: 0, human } as never, events: ev as never, duration: 8 }).left;
    };
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const alone = six(0);
    const played = six(1);
    const body = (x: Float32Array) => [1, 2, 3, 4, 5].map((k) => rmsDb(x, 0.3 + k * 1.3, 0.5 + k * 1.3));
    const start = (x: Float32Array) => [1, 2, 3, 4, 5].map((k) => rmsDb(x, 0.05 + k * 1.3, 0.13 + k * 1.3) - rmsDb(x, 0.3 + k * 1.3, 0.5 + k * 1.3));
    // (the model alone, without its breath's noise: each note from silence is the last one over again)
    expect(spread(body(alone))).toBeLessThan(0.05);
    expect(spread(start(alone))).toBeLessThan(0.3);
    // a player's: a few tenths of a decibel to a decibel or two apart, each attack its own
    expect(spread(body(played))).toBeGreaterThan(0.25);
    expect(spread(body(played))).toBeLessThan(3.5);
    expect(spread(start(played))).toBeGreaterThan(0.5);
    // a held note: the breath comes up over its first quarter second (the model alone begins at its full level)
    const long = (human: number) => renderInstrument({ sampleRate: FS, instrument: 'tuba', dry: true, params: { vibrato: 0, noise: 0, human } as never, events: [{ time: 0.05, event: { type: 'noteOn', midi: 36, velocity: 80 } }] as never, duration: 5 }).left;
    const l0 = long(0);
    const l1 = long(1);
    const bloom = (x: Float32Array) => rmsDb(x, 0.6, 0.9) - rmsDb(x, 0.1, 0.22);
    expect(bloom(l1) - bloom(l0)).toBeGreaterThan(0.4);
    // … and sags a little as the air is spent, where the model alone holds
    const sag = (x: Float32Array) => rmsDb(x, 3.8, 4.8) - rmsDb(x, 0.6, 0.9);
    expect(sag(l1) - sag(l0)).toBeLessThan(-0.5);
    expect(sag(l1) - sag(l0)).toBeGreaterThan(-3);
    // its pitch wanders by a cent or two (the period from one tenth of a second to the next), the model's not
    const wander = (x: Float32Array) => {
      const f0 = 440 * 2 ** ((36 - 69) / 12);
      const cs: number[] = [];
      for (let t = 0.8; t < 4.6; t += 0.1) {
        // (the phase of the fundamental over 0.2 s, against the next 0.2 s: its advance is the pitch)
        const ph = (t0: number) => {
          let re = 0;
          let im = 0;
          const n = Math.round(0.2 * FS);
          const i0 = Math.round(t0 * FS);
          for (let i = 0; i < n; i++) {
            const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
            re += x[i0 + i] * w * Math.cos((2 * Math.PI * f0 * (i0 + i)) / FS);
            im -= x[i0 + i] * w * Math.sin((2 * Math.PI * f0 * (i0 + i)) / FS);
          }
          return Math.atan2(im, re);
        };
        let d = ph(t + 0.1) - ph(t);
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        cs.push((1200 * Math.log2(1 + d / (2 * Math.PI * f0 * 0.1))));
      }
      const m = cs.reduce((a, b) => a + b, 0) / cs.length;
      return Math.sqrt(cs.reduce((a, b) => a + (b - m) ** 2, 0) / cs.length);
    };
    expect(wander(l0)).toBeLessThan(0.6);
    expect(wander(l1)).toBeGreaterThan(1);
    expect(wander(l1)).toBeLessThan(8);
    // the same notes, the same samples (a seeded stream); another player, another stream
    const again = long(1);
    let d = 0;
    for (let i = 0; i < l1.length; i++) d = Math.max(d, Math.abs(l1[i] - again[i]));
    expect(d).toBe(0);
  });

  it('a second player of the same part is another player: other noise, a few cents off', () => {
    const a = held(41, 80, 1.0, 0);
    const b = held(41, 80, 1.0, 1);
    let d = 0;
    for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
    expect(d).toBeGreaterThan(1e-4);
    expect(Math.abs(rmsDb(a, 0.5, 0.95) - rmsDb(b, 0.5, 0.95))).toBeLessThan(3);
  });
});
