// The zephyr (core/zephyr.ts): sixty-one ribbons, C2–C7, each bowed by a sheet of air from its key's slot. A
// note begins from the air (nothing strikes or plucks it), speaks in a tenth of a second in the bass and a
// fiftieth at the top, is on its pitch at mezzo-forte, louder and brighter the harder its key, and is gone a
// few periods after the wind stops (no damper). A ribbon square to the wind sounds odd harmonics only;
// tilted, all of them. The file's dynamics move the wind under a held note; a tremulant rocks it; the pedal
// holds the slots. The same notes give the same samples; a player's are no two alike; told the notes to
// come, a key is begun ahead and a short note speaks sooner.
import { describe, expect, it } from 'vitest';
import { CC_DYNAMICS, ZEPHYR_HI, ZEPHYR_LO, ZEPHYR_SLOT, ZEPHYR_STRINGS, ZephyrCore, renderInstrument, zephyrStringOf, zephyrStrings } from '../src/core/index.ts';

const FS = 48000;
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);
type Ev = { time: number; event: unknown };
const play = (events: Ev[], dur: number, params: object = { human: 0 }, fs = FS) => renderInstrument({ sampleRate: fs, instrument: 'zephyr', dry: true, params: params as never, events: events as never, duration: dur }).left;
const note = (m: number, vel = 75, hold = 1.2, params: object = { human: 0 }, fs = FS, tail = 0.5) => play([{ time: 0.05, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 0.05 + hold, event: { type: 'noteOff', midi: m } }], 0.05 + hold + tail, params, fs);
const rmsDb = (x: ArrayLike<number>, a: number, b: number, fs = FS) => {
  let s = 0;
  const i0 = Math.round(a * fs);
  const i1 = Math.min(x.length, Math.round(b * fs));
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, i1 - i0) + 1e-20);
};
/** the phase and level about f over [a, a + w) (Hann) */
const demod = (x: Float32Array, f: number, a: number, w: number, fs = FS) => {
  const i0 = Math.round(a * fs);
  const W = Math.round(w * fs);
  let re = 0;
  let im = 0;
  for (let i = 0; i < W; i++) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
    re += x[i0 + i] * h * Math.cos((2 * Math.PI * f * i) / fs);
    im -= x[i0 + i] * h * Math.sin((2 * Math.PI * f * i) / fs);
  }
  return { ph: Math.atan2(im, re), db: 20 * Math.log10((4 * Math.hypot(re, im)) / W + 1e-30) };
};
/** a note's pitch over [a, b] (¢ from f): how far the fundamental's phase turns from one window to the next */
const cents = (x: Float32Array, f: number, a: number, b: number, fs = FS) => {
  const win = Math.max(0.12, 12 / f);
  const hop = 0.04;
  let f0 = f;
  for (let pass = 0; pass < 2; pass++) {
    let sum = 0;
    let n = 0;
    for (let t = a; t + hop + win <= b; t += hop) {
      let d = demod(x, f0, t + hop, win, fs).ph - demod(x, f0, t, win, fs).ph - 2 * Math.PI * f0 * hop;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      sum += d / (2 * Math.PI * hop);
      n++;
    }
    f0 += sum / n;
  }
  return 1200 * Math.log2(f0 / f);
};
/** when a note first reaches a share of its steady level (s from its key at 0.05 s) */
const speaks = (x: Float32Array, f: number, share = 0.5, hold = 1.2) => {
  const w = Math.round((1.5 * FS) / f);
  const env = (t: number) => Math.sqrt(10 ** (rmsDb(x, t, t + w / FS) / 10));
  const level = env(0.05 + 0.7 * hold);
  for (let t = 0.05; t < 0.05 + hold; t += 0.002) if (env(t) >= share * level) return t + w / (2 * FS) - 0.05;
  return NaN;
};
const core = (params: object = { human: 0 }) => new ZephyrCore({ sampleRate: FS, dry: true, params: params as never });
const run = (c: ZephyrCore, seconds: number) => {
  const L = new Float32Array(256);
  const R = new Float32Array(256);
  for (let n = Math.round((seconds * FS) / 256); n > 0; n--) c.process(L, R, 256);
};
type Vis = { zephyr: { amp: Float32Array; swing: Float32Array; wind: Float32Array; shapes: { string: number; shape: Float32Array }[]; last: number; ago: number; vel: number; chest: number }; focus: { midi: number; shapes: Float32Array[] } };
const vis = (c: ZephyrCore) => c.getVisual() as Vis;

describe('zephyr', () => {
  it('sixty-one ribbons, C2 to C7, each shorter and narrower than the one below and blown harder; a note outside is brought in by octaves', () => {
    const S = zephyrStrings();
    expect(S.length).toBe(ZEPHYR_STRINGS);
    expect([ZEPHYR_LO, ZEPHYR_HI, ZEPHYR_STRINGS]).toEqual([36, 96, 61]);
    expect(S[0]).toMatchObject({ midi: 36, name: 'C2', sharp: false });
    expect(S[60]).toMatchObject({ midi: 96, name: 'C7', sharp: false });
    expect(S.filter((s) => s.sharp).length).toBe(25);
    expect(S[0].length).toBeCloseTo(1.25, 6);
    expect(S[60].length).toBeCloseTo(0.11, 6);
    for (let i = 1; i < 61; i++) {
      expect(S[i].length).toBeLessThan(S[i - 1].length);
      expect(S[i].width).toBeLessThan(S[i - 1].width);
      expect(S[i].wind).toBeGreaterThan(S[i - 1].wind);
      expect(S[i].Q).toBeGreaterThan(S[i - 1].Q);
    }
    // the wind: an organ flue's range; the ribbons' Q in still air, low enough to need no damper
    expect(S[0].wind).toBeGreaterThan(5);
    expect(S[60].wind).toBeLessThan(30);
    expect(S[0].Q).toBeGreaterThan(10);
    expect(S[60].Q).toBeLessThan(80);
    // the wave speed is 2·L·f, and the air a ribbon carries is a sixth to a twentieth of its mass
    expect(S[24].c).toBeCloseTo(2 * S[24].length * et(60), 6);
    for (const s of S) expect(s.mu / (0.012 * s.width)).toBeGreaterThan(1.03);
    expect(S[0].mu / (0.012 * S[0].width)).toBeLessThan(1.3);
    expect(ZEPHYR_SLOT).toBeCloseTo(0.38, 6);
    expect(zephyrStringOf(60)).toBe(24);
    expect(zephyrStringOf(24)).toBe(0);
    expect(zephyrStringOf(35)).toBe(11);
    expect(zephyrStringOf(100)).toBe(52);
    expect(zephyrStringOf(108)).toBe(60);
  });

  it('every string is on its pitch at mezzo-forte: within 2 ¢ over the compass', () => {
    for (const m of [36, 41, 48, 55, 60, 67, 72, 79, 84, 91, 96]) expect(Math.abs(cents(note(m, 75, 1.3), et(m), 0.7, 1.3)), `midi ${m}`).toBeLessThan(2);
  });

  it('the pitch follows the wind a little: a whisper under, a shout over, more in the bass (the force is late, and partly a mass)', () => {
    const pp = cents(note(43, 20, 1.6), et(43), 0.9, 1.6);
    const ff = cents(note(43, 120, 1.6), et(43), 0.9, 1.6);
    expect(pp).toBeLessThan(-4);
    expect(pp).toBeGreaterThan(-18);
    expect(ff).toBeGreaterThan(1);
    expect(ff).toBeLessThan(8);
    const ppTop = cents(note(91, 20, 1.2), et(91), 0.6, 1.2);
    expect(Math.abs(ppTop)).toBeLessThan(Math.abs(pp));
  });

  it('a note begins from the air: nothing before the key, speaking in a tenth of a second in the bass and a fiftieth at the top', () => {
    const lo = note(36, 80);
    const mid = note(60, 80);
    const hi = note(96, 80);
    // (before the key: silence)
    expect(rmsDb(mid, 0, 0.049)).toBeLessThan(-150);
    const [a, b, c] = [speaks(lo, et(36)), speaks(mid, et(60)), speaks(hi, et(96))];
    expect(a).toBeGreaterThan(0.03);
    expect(a).toBeLessThan(0.16);
    expect(b).toBeGreaterThan(0.015);
    expect(b).toBeLessThan(0.09);
    expect(c).toBeLessThan(0.04);
    expect(c).toBeLessThan(b);
    expect(b).toBeLessThan(a);
    // a soft key speaks later than a hard one
    expect(speaks(note(60, 20), et(60))).toBeGreaterThan(speaks(note(60, 120), et(60)));
    // (and no louder as it speaks than as it is held: no accent at the key's fall, within 2 dB)
    let top = -200;
    for (let t = 0.05; t < 0.5; t += 0.01) top = Math.max(top, rmsDb(mid, t, t + 0.03));
    expect(top - rmsDb(mid, 0.8, 1.2)).toBeLessThan(2);
  });

  it('the wind stops and the note is gone: no damper, 30 dB down within a fifth of a second (a tenth at the top)', () => {
    const lo = note(36, 80, 1.0, { human: 0 }, FS, 0.6);
    const hi = note(84, 80, 1.0, { human: 0 }, FS, 0.6);
    const held = rmsDb(lo, 0.7, 1.0);
    expect(rmsDb(lo, 1.05 + 0.2, 1.05 + 0.3) - held).toBeLessThan(-30);
    expect(rmsDb(hi, 1.05 + 0.1, 1.05 + 0.2) - rmsDb(hi, 0.7, 1.0)).toBeLessThan(-30);
    // and what is left is nothing: the string comes to rest and is let be
    const c = core();
    c.schedule({ type: 'noteOn', midi: 60, velocity: 90 });
    run(c, 0.5);
    expect(c.activeVoiceCount).toBe(1);
    expect(c.sounding()).toEqual([60]);
    c.schedule({ type: 'noteOff', midi: 60 });
    run(c, 1);
    expect(c.activeVoiceCount).toBe(0);
    expect(c.sounding()).toEqual([]);
  });

  it('harder is louder and brighter: 8 dB and more from pp to ff, the upper harmonics coming up faster than the pitch', () => {
    for (const m of [43, 60, 79]) {
      const pp = note(m, 20, 1.4);
      const ff = note(m, 120, 1.4);
      const f = et(m);
      const gain = rmsDb(ff, 0.8, 1.4) - rmsDb(pp, 0.8, 1.4);
      expect(gain, `midi ${m}`).toBeGreaterThan(7);
      expect(gain, `midi ${m}`).toBeLessThan(18);
      const h = (x: Float32Array, k: number) => demod(x, k * f * 2 ** (cents(x, f, 0.8, 1.4) / 1200), 0.9, 0.4).db;
      expect(h(ff, 3) - h(ff, 1), `midi ${m}`).toBeGreaterThan(h(pp, 3) - h(pp, 1) + 6);
    }
  });

  it('a ribbon square to the wind sounds odd harmonics only; tilted, every harmonic (the force is not the same either way)', () => {
    const f = et(55);
    const h = (x: Float32Array, k: number) => demod(x, k * f * 2 ** (cents(x, f, 0.8, 1.4) / 1200), 0.9, 0.4).db;
    const square = note(55, 90, 1.4, { human: 0, tilt: 0 });
    const tilted = note(55, 90, 1.4, { human: 0, tilt: 1 });
    expect(h(square, 2) - h(square, 1)).toBeLessThan(-30);
    expect(h(square, 4) - h(square, 1)).toBeLessThan(-30);
    expect(h(square, 3) - h(square, 1)).toBeGreaterThan(-20);
    expect(h(tilted, 2) - h(tilted, 1)).toBeGreaterThan(-12);
    expect(h(tilted, 4) - h(tilted, 1)).toBeGreaterThan(-20);
  });

  it('the file’s dynamics move the wind under a held note; a tremulant rocks it five times a second; a bend retunes', () => {
    const ev: Ev[] = [{ time: 0.05, event: { type: 'noteOn', midi: 60, velocity: 40 } }, { time: 1.0, event: { type: 'control', cc: CC_DYNAMICS, value: 60 } }, { time: 2.0, event: { type: 'control', cc: CC_DYNAMICS, value: 0 } }];
    const x = play(ev, 3);
    const [soft, loud, back] = [rmsDb(x, 0.6, 1.0), rmsDb(x, 1.5, 2.0), rmsDb(x, 2.6, 3.0)];
    expect(loud - soft).toBeGreaterThan(4);
    expect(Math.abs(back - soft)).toBeLessThan(0.7);
    // (no step at the change: the wind glides)
    for (let t = 0.98; t < 1.1; t += 0.005) expect(Math.abs(rmsDb(x, t + 0.005, t + 0.015) - rmsDb(x, t, t + 0.01))).toBeLessThan(1.5);
    // the tremulant (the knob, or the wheel's upper half): the level swings at 5.4 Hz
    const swing = (y: Float32Array) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let t = 0.8; t < 1.75; t += 0.02) {
        const d = rmsDb(y, t, t + 0.04);
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
      return hi - lo;
    };
    const on = { time: 0.05, event: { type: 'noteOn', midi: 67, velocity: 80 } };
    expect(swing(play([on], 1.8))).toBeLessThan(0.5);
    expect(swing(play([on], 1.8, { human: 0, tremulant: 1 }))).toBeGreaterThan(2);
    expect(swing(play([on, { time: 0, event: { type: 'control', cc: 1, value: 1 } }], 1.8))).toBeGreaterThan(2);
    // (a keyboard's wheel at rest, and a file's, which comes as 0.5: none)
    expect(swing(play([on, { time: 0, event: { type: 'control', cc: 1, value: 0.5 } }], 1.8))).toBeLessThan(0.5);
    const bent = play([{ time: 0, event: { type: 'bend', value: 1 } }, on], 1.4);
    expect(Math.abs(cents(bent, et(68), 0.7, 1.4))).toBeLessThan(4);
  });

  it('the pedal holds the slots of the keys let go; all notes off is silence', () => {
    const c = core();
    c.schedule({ type: 'sustain', value: 1 });
    c.schedule({ type: 'noteOn', midi: 55, velocity: 80 });
    run(c, 0.4);
    c.schedule({ type: 'noteOff', midi: 55 });
    run(c, 0.6);
    expect(c.sounding()).toEqual([55]);
    expect(vis(c).zephyr.wind[19]).toBeGreaterThan(0.3);
    c.schedule({ type: 'sustain', value: 0 });
    run(c, 0.6);
    expect(c.sounding()).toEqual([]);
    c.schedule({ type: 'noteOn', midi: 60, velocity: 100 });
    c.schedule({ type: 'noteOn', midi: 64, velocity: 100 });
    run(c, 0.3);
    expect(c.activeVoiceCount).toBe(2);
    c.allSoundOff();
    expect(c.activeVoiceCount).toBe(0);
    const L = new Float32Array(512);
    const R = new Float32Array(512);
    c.process(L, R, 512);
    expect(Math.max(...L.map(Math.abs))).toBe(0);
  });

  it('the reservoir sags under a chord and comes back: a held note is a little softer while six more slots are open', () => {
    const ev: Ev[] = [{ time: 0.05, event: { type: 'noteOn', midi: 84, velocity: 70 } }];
    for (const m of [36, 40, 43, 48, 52, 55]) ev.push({ time: 1.0, event: { type: 'noteOn', midi: m, velocity: 127 } }, { time: 2.0, event: { type: 'noteOff', midi: m } });
    const c = core();
    for (const e of ev) c.schedule(e.event, Math.round(e.time * FS));
    run(c, 0.9);
    const alone = vis(c).zephyr;
    expect(alone.chest).toBeGreaterThan(0.97);
    run(c, 0.9);
    const under = vis(c).zephyr;
    expect(under.chest).toBeLessThan(0.93);
    expect(under.chest).toBeGreaterThan(0.8);
    expect(under.wind[48]).toBeLessThan(alone.wind[48] - 0.02);
    run(c, 1.6);
    expect(vis(c).zephyr.chest).toBeGreaterThan(0.97);
  });

  it('the same notes give the same samples; a player’s are no two alike, and the model alone’s are', () => {
    const ev: Ev[] = [];
    for (let k = 0; k < 4; k++) ev.push({ time: 0.05 + k * 0.6, event: { type: 'noteOn', midi: 62, velocity: 80 } }, { time: 0.45 + k * 0.6, event: { type: 'noteOff', midi: 62 } });
    const a = play(ev, 2.6, { human: 1 });
    const b = play(ev, 2.6, { human: 1 });
    expect(a).toEqual(b);
    const levels = (x: Float32Array) => [0, 1, 2, 3].map((k) => rmsDb(x, 0.25 + k * 0.6, 0.45 + k * 0.6));
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
    expect(spread(levels(a))).toBeGreaterThan(0.05);
    expect(spread(levels(a))).toBeLessThan(3);
    expect(spread(levels(play(ev, 2.6, { human: 0 })))).toBeLessThan(0.15);
    // another player of the same instrument is another instrument (its ribbons a few cents off, its own hands)
    const other = renderInstrument({ sampleRate: FS, instrument: 'zephyr', dry: true, player: 1, events: ev as never, duration: 2.6 }).left;
    expect(other).not.toEqual(a);
    // a player's ribbons are each within a few cents of their pitch
    expect(Math.abs(cents(note(60, 75, 1.3, { human: 1 }), et(60), 0.7, 1.3))).toBeLessThan(6);
  });

  it('told the notes to come: a key is begun ahead of a slow note, a short note speaks within its length, and what was foreseen can be forgotten', () => {
    const at = 0.3;
    const on = { time: at, event: { type: 'noteOn', midi: 38, velocity: 60 } };
    const off = { time: at + 0.9, event: { type: 'noteOff', midi: 38 } };
    const hand = play([on, off], 1.6, { human: 1 });
    const told = play([{ time: at, event: { type: 'foresee', midi: 38, velocity: 60, dur: 0.9 } }, on, off], 1.6, { human: 1 });
    const level = (x: Float32Array, t: number) => rmsDb(x, at + t, at + t + 0.03);
    // (ahead of its note the slot is open: something is heard before the key; by hand, nothing)
    expect(rmsDb(hand, 0, at)).toBeLessThan(-150);
    expect(rmsDb(told, at - 0.03, at)).toBeGreaterThan(-110);
    expect(level(told, 0.05)).toBeGreaterThan(level(hand, 0.05) + 2);
    // the model alone begins nothing ahead
    expect(rmsDb(play([{ time: at, event: { type: 'foresee', midi: 38, velocity: 60, dur: 0.9 } }, on, off], 1.6), 0, at)).toBeLessThan(-150);
    // a short note in the bass, told its length: more of the key's fall, so that it is there before it ends
    const short = (toldIt: boolean) => {
      const ev: Ev[] = [{ time: at, event: { type: 'noteOn', midi: 41, velocity: 40 } }, { time: at + 0.16, event: { type: 'noteOff', midi: 41 } }];
      if (toldIt) ev.unshift({ time: at, event: { type: 'foresee', midi: 41, velocity: 40, dur: 0.16 } });
      const x = play(ev, 1, { human: 1 });
      return rmsDb(x, at + 0.08, at + 0.16);
    };
    expect(short(true)).toBeGreaterThan(short(false) + 1);
    // a long note told ahead is breathed: its middle over its beginning and its end
    const long = play([{ time: 0.1, event: { type: 'foresee', midi: 67, velocity: 70, dur: 3 } }, { time: 0.1, event: { type: 'noteOn', midi: 67, velocity: 70 } }, { time: 3.1, event: { type: 'noteOff', midi: 67 } }], 3.4, { human: 1 });
    expect(rmsDb(long, 1.4, 1.8) - rmsDb(long, 0.4, 0.7)).toBeGreaterThan(0.5);
    expect(rmsDb(long, 1.4, 1.8) - rmsDb(long, 2.75, 3.05)).toBeGreaterThan(0.5);
    // the file stops: a key begun ahead whose note never comes is let go
    const c = core({ human: 1 });
    c.schedule({ type: 'foresee', midi: 36, velocity: 80, dur: 1 }, Math.round(0.2 * FS));
    run(c, 0.19);
    expect(vis(c).zephyr.wind[0]).toBeGreaterThan(0.2);
    c.forget();
    run(c, 0.5);
    expect(c.activeVoiceCount).toBe(0);
    // (and without forget(): the key waits a tenth of a second for its note and is let go)
    c.schedule({ type: 'foresee', midi: 36, velocity: 80, dur: 1 }, c.frame + Math.round(0.2 * FS));
    run(c, 0.19);
    expect(vis(c).zephyr.wind[0]).toBeGreaterThan(0.2);
    run(c, 0.8);
    expect(c.activeVoiceCount).toBe(0);
  });

  it('what the pictures are told: each ribbon’s swing and each slot’s wind, the loudest ribbons’ shapes fixed at both ends', () => {
    const c = core();
    expect(vis(c).zephyr.amp.length).toBe(61);
    expect(Math.max(...vis(c).zephyr.amp)).toBe(0);
    c.schedule({ type: 'noteOn', midi: 36, velocity: 120 });
    c.schedule({ type: 'noteOn', midi: 72, velocity: 60 });
    run(c, 0.8);
    const v = vis(c).zephyr;
    expect(v.amp[0]).toBeGreaterThan(0.5);
    expect(v.amp[36]).toBeGreaterThan(0.05);
    expect(v.amp[36]).toBeLessThan(v.amp[0]);
    expect(v.amp[12]).toBe(0);
    // a fortissimo in the bass swings the ribbon's middle a centimetre or so; a soft high note a fraction of a millimetre
    expect(v.swing[0]).toBeGreaterThan(0.004);
    expect(v.swing[0]).toBeLessThan(0.03);
    expect(v.swing[36]).toBeLessThan(0.002);
    expect(v.swing[36]).toBeLessThan(v.swing[0] / 4);
    expect(v.wind[0]).toBeGreaterThan(0.85);
    expect(v.wind[0]).toBeLessThan(1.4);
    expect(v.wind[36]).toBeLessThan(v.wind[0]);
    expect(v.wind[36]).toBeGreaterThan(0.2);
    expect(v.wind[10]).toBe(0);
    expect(v.shapes.map((s) => s.string)).toEqual([0, 36]);
    for (const s of v.shapes) {
      expect(s.shape.length).toBe(33);
      expect(s.shape[0]).toBe(0);
      expect(Math.abs(s.shape[32])).toBeLessThan(1e-9);
    }
    expect(Math.max(...v.shapes[0].shape.map(Math.abs))).toBeGreaterThan(0.001);
    expect(v.last).toBe(36);
    expect(v.vel).toBe(60);
    expect(vis(c).focus.midi).toBe(72);
    expect(vis(c).focus.shapes[0].length).toBe(160);
    expect(c.sounding()).toEqual([36, 72]);
    expect(c.keySummary().length).toBe(61);
    expect(c.modeFrequencies[0]).toBeCloseTo(et(72), 3);
  });

  it('every sample is finite and every note on its pitch at 22.05, 44.1 and 96 kHz', () => {
    for (const fs of [22050, 44100, 96000]) {
      for (const m of [36, 60, 96]) {
        const x = note(m, 100, 1.1, { human: 0 }, fs, 0.2);
        expect(x.every(Number.isFinite), `${fs} ${m}`).toBe(true);
        expect(rmsDb(x, 0.6, 1.1, fs), `${fs} ${m}`).toBeGreaterThan(-45);
        expect(Math.abs(cents(x, et(m), 0.6, 1.1, fs)), `${fs} ${m}`).toBeLessThan(m === 96 && fs < 30000 ? 14 : 8);
      }
    }
  });
});
