// The harp (core/harp.ts): 47 strings C1–G7, seven to the octave, the Cs red and the Fs black, wire, gut and
// nylon; seven pedals that set every string of a name flat, natural or sharp; a note asked for by its pitch
// finds its string, and moves the pedal that reaches it when no string is there (the one that retunes no
// ringing string and keeps the notes known to be coming playable); a glissando's notes are strings, at the
// pitches the pedals give; plucked strings ring on by themselves (the bass for many seconds, the top for
// less than one), brighter and louder with the velocity, stopped by the hand when `damp` asks; the other
// strings answer; the same sound whatever the host's block size. A harder pluck is brighter, with more of
// the finger's noise, and rattles a wire string against its disc; a player's plucks are no two alike
// (`human`), a chord's from the bottom up, and a ringing string is touched before it is plucked again.
import { describe, expect, it } from 'vitest';
import { createCore, renderInstrument, HarpCore, HARP_HI, HARP_LO, HARP_PEDALS, HARP_STRINGS, HARP_VOICE, harpPedalsFor, harpStringFor, harpStringOf, harpStrings } from '../src/core/index.ts';

const FS = 48000;
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);
const rmsDb = (x: ArrayLike<number>, a: number, b: number) => {
  let s = 0;
  const i0 = Math.round(a * FS);
  const i1 = Math.round(b * FS);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (i1 - i0) + 1e-20);
};
const pluck = (m: number, vel = 80, dur = 2, params?: object, extra: { time: number; event: unknown }[] = []) =>
  renderInstrument({ sampleRate: FS, instrument: 'harp', dry: true, params: params as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: vel } }, ...extra] as never, duration: dur }).left;
/** the level (dB) at frequency f over [a, b] s (Hann) */
const at = (x: Float32Array, f: number, a: number, b: number) => {
  const i0 = Math.round(a * FS);
  const W = Math.round((b - a) * FS);
  let re = 0;
  let im = 0;
  for (let i = 0; i < W; i++) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
    re += x[i0 + i] * h * Math.cos((2 * Math.PI * f * i) / FS);
    im += x[i0 + i] * h * Math.sin((2 * Math.PI * f * i) / FS);
  }
  return 20 * Math.log10(Math.hypot(re, im) / W + 1e-30);
};
/** the strongest frequency within ±60 ¢ of f (Hz) */
const pitchNear = (x: Float32Array, f: number, a = 0.1, b = 0.9) => {
  let best = f;
  let bv = -Infinity;
  for (let c = -60; c <= 60; c += 2) {
    const v = at(x, f * 2 ** (c / 1200), a, b);
    if (v > bv) [bv, best] = [v, f * 2 ** (c / 1200)];
  }
  return best;
};
const core = (params?: object) => new HarpCore({ sampleRate: FS, dry: true, params: params as never });
const run = (c: HarpCore, seconds: number) => {
  const L = new Float32Array(256);
  const R = new Float32Array(256);
  for (let i = 0; i < (seconds * FS) / 256; i++) c.process(L, R, 256);
};

describe('harp', () => {
  it('47 strings, C1 to G7, seven to the octave: every C red and every F black; twelve of wire, twenty-six of gut, nine of nylon; 1.54 m to 66 mm', () => {
    const S = harpStrings();
    expect(S.length).toBe(47);
    expect(HARP_STRINGS).toBe(47);
    expect([S[0].letter + S[0].octave, S[0].midi]).toEqual(['C1', 24]);
    expect([S[46].letter + S[46].octave, S[46].midi]).toEqual(['G7', 103]);
    expect([HARP_LO, HARP_HI]).toEqual([24, 103]);
    for (let i = 1; i < 47; i++) {
      expect(S[i].midi).toBeGreaterThan(S[i - 1].midi);
      expect(S[i].midi - S[i - 1].midi).toBeLessThanOrEqual(2);
      expect(S[i].length).toBeLessThan(S[i - 1].length);
    }
    for (const s of S) expect(s.colour).toBe(s.letter === 'C' ? 'red' : s.letter === 'F' ? 'black' : 'plain');
    expect(S.filter((s) => s.material === 'wire').length).toBe(12);
    expect(S.filter((s) => s.material === 'gut').length).toBe(26);
    expect(S.filter((s) => s.material === 'nylon').length).toBe(9);
    expect(S[0].length).toBeCloseTo(1.544, 3);
    expect(S[46].length).toBeCloseTo(0.066, 3);
    // a white key is a string; a black key is none
    expect(harpStringOf(60)).toBe(21);
    expect(harpStringOf(61)).toBe(-1);
    expect(harpStringOf(23)).toBe(-1);
    expect(HARP_PEDALS.join(' ')).toBe('D C B E F G A');
  });

  it('the pedals are the key: which string plays a pitch, and the setting a scale or a chord asks for', () => {
    const nat = [0, 0, 0, 0, 0, 0, 0];
    // all in the middle: the white keys only
    expect(harpStringFor(60, nat)).toBe(21);
    expect(harpStringFor(61, nat)).toBe(-1);
    // (by letter, C … B) the Cs sharp: C♯4 on the C string; the Ds flat as well: either, the nearer its natural… both are one away: the lower
    expect(harpStringFor(61, [1, 0, 0, 0, 0, 0, 0])).toBe(21);
    expect(harpStringFor(61, [0, -1, 0, 0, 0, 0, 0])).toBe(22);
    // B♯ is C: with the Bs sharp the C4 key has two strings, the C's own first
    expect(harpStringFor(60, [0, 0, 0, 0, 0, 0, 1])).toBe(21);
    expect(harpStringFor(60, [-1, 0, 0, 0, 0, 0, 1])).toBe(20);
    // the settings (in the pedals' order, D C B | E F G A)
    expect(harpPedalsFor([0, 2, 4, 5, 7, 9, 11])).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(harpPedalsFor([3, 5, 7, 8, 10, 0, 2])).toEqual([0, 0, -1, -1, 0, 0, -1]); // E♭ major: B♭ E♭ A♭
    expect(harpPedalsFor([2, 4, 6, 7, 9, 11, 1])).toEqual([0, 1, 0, 0, 1, 0, 0]); // D major: F♯ C♯
    // a diminished seventh, C E♭ G♭ A: every string on a note of it (D♯ C B♯ | E♭ F♯ G♭ A)
    expect(harpPedalsFor([0, 3, 6, 9])).toEqual([1, 0, 1, -1, 1, -1, 0]);
  });

  it('a note asked for by its pitch finds its string; one no string has moves the pedal that reaches it, and every string of that name with it', () => {
    const c = core();
    c.schedule({ type: 'noteOn', midi: 60, velocity: 80 });
    run(c, 0.05);
    expect(c.pedals).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(c.sounding()).toEqual([60]);
    // F♯4: the F pedal down (or the G's up); no F or G string is ringing, the natural's neighbour moves least
    c.schedule({ type: 'noteOn', midi: 66, velocity: 80 });
    run(c, 0.05);
    const p = c.pedals;
    expect(p.filter((v) => v !== 0).length).toBe(1);
    expect([p[4], p[5]]).toEqual(expect.arrayContaining([0]));
    expect(p[4] === 1 || p[5] === -1).toBe(true);
    expect(c.sounding().sort()).toEqual([60, 66]);
    // the pedal as a parameter says so too (the page's knobs follow it), and the frame shows it
    const moved = p[4] === 1 ? 'pedalF' : 'pedalG';
    expect((c.params as unknown as Record<string, number>)[moved]).toBe(p[4] === 1 ? 1 : -1);
    const v = c.getVisual() as { harp: { set: number[]; pedals: number[]; amp: Float32Array; last: number } };
    expect(v.harp.set).toEqual(p);
    expect(v.harp.amp.length).toBe(47);
    expect(v.harp.amp[21]).toBeGreaterThan(0.01);
  });

  it('a pedal is not moved under a ringing string when another spelling will do; the notes known to be coming choose the spelling', () => {
    // G4 ringing, then F♯4: the G pedal up would retune the ringing G; the F pedal goes down instead
    const c = core();
    c.schedule({ type: 'noteOn', midi: 67, velocity: 90 });
    run(c, 0.1);
    c.schedule({ type: 'noteOn', midi: 66, velocity: 80 });
    run(c, 0.05);
    expect(c.pedals[4]).toBe(1);
    expect(c.pedals[5]).toBe(0);
    // nothing ringing, an F natural told to be coming: F♯ is spelt G♭, so the F string stays for it
    const d = core();
    const at2 = Math.round(0.4 * FS);
    d.schedule({ type: 'foresee', midi: 65, velocity: 80, dur: 0.3 }, at2);
    d.schedule({ type: 'noteOn', midi: 66, velocity: 80 });
    run(d, 0.05);
    expect(d.pedals[5]).toBe(-1);
    expect(d.pedals[4]).toBe(0);
    // and with a G natural coming it is F♯
    const e = core();
    e.schedule({ type: 'foresee', midi: 67, velocity: 80, dur: 0.3 }, at2);
    e.schedule({ type: 'noteOn', midi: 66, velocity: 80 });
    run(e, 0.05);
    expect(e.pedals[4]).toBe(1);
    expect(e.pedals[5]).toBe(0);
  });

  it('a glissando follows the pedals: each white key its string at the pitch its pedal gives, a black key no string; no pedal moves', () => {
    // E♭ major's pedals set by hand; the keys C4 D4 E4 … drawn across
    const c = core({ pedalB: -1, pedalE: -1, pedalA: -1 });
    expect(c.pedals).toEqual([0, 0, -1, -1, 0, 0, -1]);
    const keys = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72];
    keys.forEach((m, k) => c.schedule({ type: 'noteOn', midi: m, velocity: 70, gliss: true }, Math.round(k * 0.03 * FS)));
    run(c, 0.6);
    expect(c.pedals).toEqual([0, 0, -1, -1, 0, 0, -1]);
    // eight strings sound (the white keys'), at E♭ major's notes
    expect(c.sounding().sort((a, b) => a - b)).toEqual([60, 62, 63, 65, 67, 68, 70, 72]);
    // the same keys played as pitches: thirteen notes, the pedals moved for them
    const d = core({ pedalB: -1, pedalE: -1, pedalA: -1 });
    keys.forEach((m, k) => d.schedule({ type: 'noteOn', midi: m, velocity: 70 }, Math.round(k * 0.03 * FS)));
    run(d, 0.6);
    expect(d.pedals).not.toEqual([0, 0, -1, -1, 0, 0, -1]);
    // a pedal set while its string rings retunes it: C4 with the C pedal pressed sounds C♯4
    const x = pluck(60, 90, 1.2, undefined, []);
    const e = renderInstrument({ sampleRate: FS, instrument: 'harp', dry: true, events: [{ time: 0.02, event: { type: 'noteOn', midi: 60, velocity: 90, gliss: true } }] as never, duration: 1.2, params: { pedalC: 1 } as never }).left;
    expect(Math.abs(1200 * Math.log2(pitchNear(x, et(60)) / et(60)))).toBeLessThan(4);
    expect(Math.abs(1200 * Math.log2(pitchNear(e, et(61)) / et(61)))).toBeLessThan(4);
  });

  it('plays at pitch across the compass (within 3 ¢), a note outside it in its nearest octave inside', () => {
    for (const fs of [44100, 48000])
      for (const m of [24, 31, 41, 48, 55, 60, 69, 77, 86, 96, 103]) {
        const r = renderInstrument({ sampleRate: fs, instrument: 'harp', dry: true, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: 80 } }] as never, duration: 1.1 }).left;
        // (the strongest of the first four partials: a bass string's fundamental is hardly radiated)
        let best = 0;
        let bv = -Infinity;
        const W = Math.round(0.9 * fs);
        const i0 = Math.round(0.1 * fs);
        for (let h = 1; h <= 4; h++)
          for (let c = -40; c <= 40; c += 1) {
            const f = h * et(m) * 2 ** (c / 1200);
            let re = 0;
            let im = 0;
            for (let i = 0; i < W; i += 3) {
              const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
              re += r[i0 + i] * w * Math.cos((2 * Math.PI * f * i) / fs);
              im += r[i0 + i] * w * Math.sin((2 * Math.PI * f * i) / fs);
            }
            const v = Math.hypot(re, im);
            if (v > bv) [bv, best] = [v, c - (h > 1 ? 1200 * Math.log2(Math.sqrt(1 + HARP_VOICE.stiff * h * h)) : 0)];
          }
        expect(Math.abs(best), `${fs} Hz, MIDI ${m}: ${best.toFixed(1)} ¢`).toBeLessThan(m > 96 ? 6 : 4);
      }
    const c = core();
    c.schedule({ type: 'noteOn', midi: 21, velocity: 80 });
    c.schedule({ type: 'noteOn', midi: 108, velocity: 80 });
    run(c, 0.05);
    expect(c.sounding().sort((a, b) => a - b)).toEqual([33, 96]);
  });

  it('rings on by itself: the bass for many seconds, the middle for a few, the top under a second; the upper partials die first', () => {
    const fall = (m: number, a: number, b: number, c: number, d: number) => {
      const x = pluck(m, 85, d + 0.1);
      return (rmsDb(x, a, b) - rmsDb(x, c, d)) / ((c + d) / 2 - (a + b) / 2);
    };
    const bass = fall(36, 0.2, 0.6, 2.4, 2.9);
    const mid = fall(60, 0.2, 0.6, 1.4, 1.9);
    const top = fall(96, 0.05, 0.15, 0.4, 0.5);
    expect(bass).toBeGreaterThan(0.3);
    expect(bass).toBeLessThan(8);
    expect(mid).toBeGreaterThan(bass);
    expect(mid).toBeLessThan(30);
    expect(top).toBeGreaterThan(mid * 2);
    // no key holds it: the string rings after the key is let go (laissez vibrer)
    const lv = pluck(60, 85, 1.5, undefined, [{ time: 0.1, event: { type: 'noteOff', midi: 60 } }]);
    const held = pluck(60, 85, 1.5);
    expect(Math.abs(rmsDb(lv, 0.8, 1.2) - rmsDb(held, 0.8, 1.2))).toBeLessThan(0.01);
    // … unless the hand stops it (damp 1): 0.3 s after, what is left is the other strings' answer (the harp's
    // halo: they ring on in their slow plane), 15 dB and more under the string itself; with none of that
    // (resonance 0), nothing
    const off = [{ time: 0.1, event: { type: 'noteOff', midi: 60 } }];
    const damped = pluck(60, 85, 1.5, { damp: 1 }, off);
    expect(rmsDb(damped, 0.45, 0.6)).toBeLessThan(rmsDb(lv, 0.45, 0.6) - 15);
    expect(rmsDb(damped, 0.45, 0.6)).toBeGreaterThan(rmsDb(lv, 0.45, 0.6) - 40);
    expect(rmsDb(pluck(60, 85, 1.5, { damp: 1, resonance: 0 }, off), 0.45, 0.6)).toBeLessThan(rmsDb(lv, 0.45, 0.6) - 70);
    // the third partial against the first: lower later than at the pluck (the brightness goes first)
    const x = pluck(55, 90, 2.2);
    expect(at(x, 3 * et(55), 1.6, 2.1) - at(x, et(55), 1.6, 2.1)).toBeLessThan(at(x, 3 * et(55), 0.05, 0.4) - at(x, et(55), 0.05, 0.4));
  });

  it('louder and brighter with the velocity; the finger’s place changes the colour (by the board: thin; the middle: hollow)', () => {
    for (const m of [43, 60, 79]) {
      const pp = pluck(m, 30, 0.8);
      const ff = pluck(m, 112, 0.8);
      expect(rmsDb(ff, 0.03, 0.5) - rmsDb(pp, 0.03, 0.5), `MIDI ${m}`).toBeGreaterThan(15);
      expect(rmsDb(ff, 0.03, 0.5) - rmsDb(pp, 0.03, 0.5), `MIDI ${m}`).toBeLessThan(32);
      const k = m === 79 ? 3 : 5;
      expect(at(ff, k * et(m), 0.03, 0.3) - at(ff, et(m), 0.03, 0.3), `MIDI ${m}`).toBeGreaterThan(at(pp, k * et(m), 0.03, 0.3) - at(pp, et(m), 0.03, 0.3));
    }
    // by the board the fourth partial is far stronger than at the middle (where the even ones nearly vanish)
    const mid = pluck(55, 85, 0.8, { pluck: 0.5 });
    const table = pluck(55, 85, 0.8, { pluck: 0.12 });
    const rel = (x: Float32Array) => at(x, 4 * et(55), 0.03, 0.4) - at(x, et(55), 0.03, 0.4);
    expect(rel(table)).toBeGreaterThan(rel(mid) + 10);
  });

  it('the other strings answer: C2 plucked sets the C3 and G3 strings ringing; with no resonance they stay still', () => {
    const c = core();
    c.schedule({ type: 'noteOn', midi: 36, velocity: 100 });
    run(c, 0.1);
    const v = c.getVisual() as { sympathetic: number; voices: number; harp: { amp: Float32Array; plucked: number[] } };
    expect(v.voices).toBe(1);
    expect(v.sympathetic).toBeGreaterThan(3);
    expect(v.harp.amp[14]).toBeGreaterThan(0); // C3: its first partial is the C2's second
    expect(v.harp.amp[18]).toBeGreaterThan(0); // G3: the third
    expect(v.harp.plucked[14]).toBe(-1);
    expect(v.harp.plucked[7]).toBeGreaterThanOrEqual(0);
    // they are heard, a little: the plucked string stopped, the others still ring
    expect(c.sounding()).toEqual([36]);
    const d = core({ resonance: 0 });
    d.schedule({ type: 'noteOn', midi: 36, velocity: 100 });
    run(d, 0.1);
    expect((d.getVisual() as { sympathetic: number }).sympathetic).toBe(0);
  });

  it('the same sound whatever the host’s block size; never louder than full scale; silent again after all sound off', () => {
    const events = [24, 36, 48, 55, 60, 64, 67, 72, 79, 84, 91, 96, 61, 66, 70].map((m, k) => ({ f: Math.round((0.01 + 0.07 * k) * FS), ev: { type: 'noteOn', midi: m, velocity: 60 + 4 * k } }));
    const render = (block: number) => {
      const c = createCore({ instrument: 'harp', sampleRate: FS });
      for (const e of events) c.schedule(e.ev, e.f);
      const n = Math.round(1.6 * FS);
      const out = new Float32Array(n);
      const L = new Float32Array(block);
      const R = new Float32Array(block);
      for (let i = 0; i < n; i += block) {
        const len = Math.min(block, n - i);
        c.process(L, R, len);
        out.set(L.subarray(0, len), i);
      }
      return { out, c };
    };
    const a = render(128);
    for (const block of [37, 500]) {
      const b = render(block);
      let same = true;
      for (let i = 0; i < a.out.length; i++) if (a.out[i] !== b.out[i]) same = false;
      expect(same, `${block} frames a call`).toBe(true);
    }
    let pk = 0;
    for (let i = 0; i < a.out.length; i++) pk = Math.max(pk, Math.abs(a.out[i]));
    expect(pk).toBeGreaterThan(0.01);
    expect(pk).toBeLessThanOrEqual(1);
    a.c.allSoundOff();
    const L = new Float32Array(512);
    const R = new Float32Array(512);
    a.c.process(L, R, 512);
    a.c.process(L, R, 512);
    expect(Math.max(...L.map(Math.abs))).toBeLessThan(1e-6);
    expect(a.c.sounding()).toEqual([]);
  });
  it('a harder pluck is not the same pluck louder: brighter, its attack stronger; a wire string swung wide rattles against its disc, a soft one does not', () => {
    // (the voicing itself, `human` 0: one string at mezzo-forte and at forte)
    const one = (m: number, vel: number, voice?: object) => pluck(m, vel, 1.2, { human: 0, ...(voice ? { voice } : {}) });
    const centroid = (x: Float32Array, f0: number) => {
      let num = 0;
      let den = 0;
      for (let k = 1; k <= 16; k++) {
        const p = 10 ** (at(x, k * f0, 0.03, 0.28) / 10);
        num += k * p;
        den += p;
      }
      return num / den;
    };
    for (const m of [60, 67, 76]) {
      const mf = one(m, 70);
      const f = one(m, 100);
      expect(rmsDb(f, 0.03, 0.5) - rmsDb(mf, 0.03, 0.5), `MIDI ${m}: louder`).toBeGreaterThan(3);
      expect(centroid(f, et(m)) / centroid(mf, et(m)), `MIDI ${m}: brighter`).toBeGreaterThan(1.02);
    }
    expect(HARP_VOICE.slopeVel).toBeGreaterThan(0);
    // the pluck's noise: the first 12 ms carry more above 2 kHz with it than without, on a wire string most
    const high = (x: Float32Array, a: number, b: number) => {
      // (a first difference twice over: what is left is the top of the spectrum)
      let s = 0;
      for (let i = Math.round(a * FS) + 2; i < Math.round(b * FS); i++) s += (x[i] - 2 * x[i - 1] + x[i - 2]) ** 2;
      return 10 * Math.log10(s / ((b - a) * FS) + 1e-30);
    };
    expect(HARP_VOICE.noise).toBeGreaterThan(0);
    expect(high(one(60, 100), 0.02, 0.032) - high(one(60, 100, { noise: 0 }), 0.02, 0.032)).toBeGreaterThan(0.5);
    // the rattle: a C2 plucked hard has it for its first moments, plucked softly none at all
    expect(HARP_VOICE.buzz).toBeGreaterThan(0);
    const hard = high(one(36, 120), 0.05, 0.35) - high(one(36, 120, { buzz: 0 }), 0.05, 0.35);
    const soft = high(one(36, 45), 0.05, 0.35) - high(one(36, 45, { buzz: 0 }), 0.05, 0.35);
    expect(hard).toBeGreaterThan(0.5);
    expect(Math.abs(soft)).toBeLessThan(0.05);
    // … and it dies as the string does: gone from the third second
    expect(Math.abs(high(pluck(36, 120, 4, { human: 0 }), 3, 3.9) - high(pluck(36, 120, 4, { human: 0, voice: { buzz: 0 } }), 3, 3.9))).toBeLessThan(0.3);
    // a gut string has none whatever the pluck
    expect(Math.abs(high(one(60, 125), 0.05, 0.35) - high(one(60, 125, { buzz: 0 }), 0.05, 0.35))).toBeLessThan(1e-6);
  });

  it('a player’s plucks: no two alike (their level, their colour, their instant); a chord from the bottom string up; `human` 0 is the voicing itself, on the instant', () => {
    // one string six times, stopped between (damp) so that each pluck meets a string at rest
    const six = (human: number) => {
      const ev: { time: number; event: unknown }[] = [];
      for (let k = 0; k < 6; k++) ev.push({ time: 0.02 + k * 0.7, event: { type: 'noteOn', midi: 60, velocity: 84 } }, { time: 0.02 + k * 0.7 + 0.35, event: { type: 'noteOff', midi: 60 } });
      // (no other string answering: what answers rings on between the plucks, and is not the hand's doing)
      return renderInstrument({ sampleRate: FS, instrument: 'harp', dry: true, params: { damp: 1, human, resonance: 0, voice: { noise: 0 } } as never, events: ev as never, duration: 4.3 }).left;
    };
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const alone = six(0);
    const played = six(1);
    const f1 = et(60);
    const lv = (x: Float32Array, h: number) => [0, 1, 2, 3, 4, 5].map((k) => at(x, h * f1, 0.04 + k * 0.7, 0.3 + k * 0.7));
    expect(spread(lv(alone, 1))).toBeLessThan(0.05);
    expect(spread(lv(alone, 3))).toBeLessThan(0.05);
    expect(spread(lv(played, 1))).toBeGreaterThan(0.4);
    expect(spread(lv(played, 1))).toBeLessThan(6);
    // (its colour: the third partial against the first, pluck to pluck)
    const colour = lv(played, 3).map((v, k) => v - lv(played, 1)[k]);
    expect(spread(colour)).toBeGreaterThan(0.5);
    // on average the player's pluck is the voicing's (within 1.5 dB over sixty plucks)
    const c = core({ damp: 1 });
    const m = core({ damp: 1, human: 0 });
    const one = (k: HarpCore) => {
      const L = new Float32Array(9600);
      const R = new Float32Array(9600);
      k.schedule({ type: 'noteOn', midi: 60, velocity: 84 });
      k.process(L, R, 9600);
      k.schedule({ type: 'noteOff', midi: 60 });
      run(k, 0.4);
      return rmsDb(L, 0.01, 0.2);
    };
    const mach = one(m);
    let sum = 0;
    for (let k = 0; k < 60; k++) sum += one(c);
    expect(Math.abs(sum / 60 - mach)).toBeLessThan(1.5);
    // a chord's four notes: the voicing plucks them on one instant; a player from the bottom string up, each a
    // few milliseconds after the one below, the whole within a twentieth of a second
    const chord = (human: number) => {
      const k = core({ human });
      for (const n of [72, 48, 64, 55]) k.schedule({ type: 'noteOn', midi: n, velocity: 80 }, 480);
      run(k, 0.2);
      const v = (k.getVisual() as { harp: { plucked: number[] } }).harp.plucked;
      return [48, 55, 64, 72].map((n) => v[harpStringOf(n)]);
    };
    const flat = chord(0);
    expect(spread(flat)).toBe(0);
    const rolled = chord(1);
    for (let k = 1; k < 4; k++) expect(rolled[k], `note ${k} after the one below`).toBeLessThan(rolled[k - 1] - 0.002);
    expect(rolled[0] - rolled[3]).toBeLessThan(0.05);
    // the same notes give the same samples; another player's hands are another's
    const again = six(1);
    let d = 0;
    for (let i = 0; i < played.length; i++) d = Math.max(d, Math.abs(played[i] - again[i]));
    expect(d).toBe(0);
    const other = renderInstrument({ sampleRate: FS, instrument: 'harp', dry: true, player: 1, events: [{ time: 0.02, event: { type: 'noteOn', midi: 60, velocity: 84 } }] as never, duration: 0.5 }).left;
    const mine = renderInstrument({ sampleRate: FS, instrument: 'harp', dry: true, events: [{ time: 0.02, event: { type: 'noteOn', midi: 60, velocity: 84 } }] as never, duration: 0.5 }).left;
    let d2 = 0;
    for (let i = 0; i < mine.length; i++) d2 = Math.max(d2, Math.abs(mine[i] - other[i]));
    expect(d2).toBeGreaterThan(1e-5);
  });

  it('told the notes to come, the finger is on a ringing string before it plucks it again: the old note is stopped a twentieth of a second early; a key in the hand plucks without warning', () => {
    const twice = (told: boolean, human = 1) => {
      const ev: { time: number; event: unknown }[] = [{ time: 0.02, event: { type: 'noteOn', midi: 48, velocity: 90 } }];
      if (told) ev.push({ time: 0.8, event: { type: 'foresee', midi: 48, velocity: 90, dur: 0.5 } });
      ev.push({ time: 0.8, event: { type: 'noteOn', midi: 48, velocity: 90 } });
      return renderInstrument({ sampleRate: FS, instrument: 'harp', dry: true, params: { human } as never, events: ev as never, duration: 1.6 }).left;
    };
    const f = et(48);
    const before = (x: Float32Array) => at(x, f, 0.775, 0.798) - at(x, f, 0.6, 0.7);
    // (not told: the string rings on into the pluck, a decibel or so lower than a tenth of a second before)
    expect(before(twice(false))).toBeGreaterThan(-4);
    // told: the finger has been on it for some hundredths of a second
    expect(before(twice(true))).toBeLessThan(before(twice(false)) - 5);
    // the voicing alone places no finger
    expect(before(twice(true, 0))).toBeGreaterThan(-4);
    // and the note itself is plucked either way
    for (const x of [twice(true), twice(false)]) expect(rmsDb(x, 0.82, 1.2)).toBeGreaterThan(rmsDb(x, 0.6, 0.78) - 3);
    // a file that stops: the finger is not placed for a note that will not come (forget)
    const c = core();
    c.schedule({ type: 'noteOn', midi: 48, velocity: 90 }, 0);
    c.schedule({ type: 'foresee', midi: 48, velocity: 90, dur: 0.5 }, Math.round(0.8 * FS));
    run(c, 0.3);
    const ringing = (c.getVisual() as { harp: { amp: Float32Array } }).harp.amp[harpStringOf(48)];
    c.forget();
    run(c, 0.6);
    const later = (c.getVisual() as { harp: { amp: Float32Array } }).harp.amp[harpStringOf(48)];
    expect(later).toBeGreaterThan(0.25 * ringing);
  });
});
