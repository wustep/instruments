// The glockenspiel (core/glockenspiel.ts): thirty steel bars G5–C8 as they sound; a note outside that compass
// is read as written and brought into it by octaves; a struck bar is its pitch and the families of partials
// the recordings show (not a thin bar's 2.76 and 5.40), brighter and louder with the stroke, a brass mallet
// brighter still; it rings on by itself, the low bars for seconds and the top for less, its upper partials
// gone first; nothing damps it unless `damp` says so; two mallets, the engine's own hands; the same sound
// whatever the host's block size. A player's strokes are no two alike (`human`); a bar struck while it rings
// has the stroke added to its motion; a held key rolls (`roll`, the wheel).
import { describe, expect, it } from 'vitest';
import { GlockenspielCore, GLOCK_BARS, GLOCK_HI, GLOCK_LO, GLOCK_TEXTBOOK, GLOCK_VOICE, barShape, createCore, glockBarOf, glockBars, renderInstrument } from '../src/core/index.ts';

const FS = 48000;
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);
const rmsDb = (x: ArrayLike<number>, a: number, b: number) => {
  let s = 0;
  const i0 = Math.round(a * FS);
  const i1 = Math.round(b * FS);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (i1 - i0) + 1e-20);
};
const strike = (m: number, vel = 80, dur = 2, params?: object, extra: { time: number; event: unknown }[] = []) =>
  renderInstrument({ sampleRate: FS, instrument: 'glockenspiel', dry: true, params: params as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: vel } }, ...extra] as never, duration: dur }).left;
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
const core = (params?: object) => new GlockenspielCore({ sampleRate: FS, dry: true, params: params as never });
const run = (c: GlockenspielCore, seconds: number) => {
  const L = new Float32Array(256);
  const R = new Float32Array(256);
  for (let n = Math.round((seconds * FS) / 256); n > 0; n--) c.process(L, R, 256);
};
const vis = (c: GlockenspielCore) => (c.getVisual() as { glock: { amp: Float32Array; last: number; ago: number; vel: number; hits: { bar: number; ago: number; vel: number; hand: number }[]; hands: [number, number] } }).glock;

describe('glockenspiel', () => {
  it('thirty bars, G5 to C8 as they sound, each its length from its pitch; a note outside is brought in by octaves', () => {
    const B = glockBars();
    expect(B.length).toBe(GLOCK_BARS);
    expect([GLOCK_LO, GLOCK_HI, GLOCK_BARS]).toEqual([79, 108, 30]);
    expect(B[0]).toMatchObject({ midi: 79, name: 'G5', sharp: false });
    expect(B[29]).toMatchObject({ midi: 108, name: 'C8', sharp: false });
    expect(B.filter((b) => b.sharp).length).toBe(12);
    // a steel bar 9.5 mm thick: a quarter of a metre at G5, 11 cm at C8; f ∝ 1/L²
    expect(B[0].length).toBeGreaterThan(0.24);
    expect(B[0].length).toBeLessThan(0.26);
    expect(B[29].length).toBeGreaterThan(0.1);
    expect(B[29].length).toBeLessThan(0.115);
    for (let i = 1; i < 30; i++) expect((B[i - 1].length / B[i].length) ** 2).toBeCloseTo(2 ** (1 / 12), 6);
    // the part is written two octaves under: C4 is the C6 bar, G3 the G5; above the compass, down
    expect(glockBarOf(84)).toBe(5);
    expect(glockBarOf(60)).toBe(5);
    expect(glockBarOf(55)).toBe(0);
    expect(glockBarOf(79)).toBe(0);
    expect(glockBarOf(108)).toBe(29);
    expect(glockBarOf(110)).toBe(19);
    // a free bar's first mode: its middle one way, its ends the other, its nodes 0.224 from each end
    expect(barShape(0.5)).toBeCloseTo(1, 6);
    expect(barShape(0)).toBeLessThan(-1.5);
    expect(Math.abs(barShape(0.224))).toBeLessThan(0.02);
    expect(Math.abs(barShape(1 - 0.224))).toBeLessThan(0.02);
  });

  it('a struck bar sounds at its pitch (and a written C4 as C6); its partials are the recordings’ families, not a thin bar’s', () => {
    for (const m of [79, 84, 96, 108]) {
      const x = strike(m, 90, 1.2);
      let best = 0;
      let bv = -Infinity;
      for (let c = -40; c <= 40; c += 2) {
        const v = at(x, et(m) * 2 ** (c / 1200), 0.1, 0.9);
        if (v > bv) [bv, best] = [v, c];
      }
      expect(Math.abs(best), `MIDI ${m}`).toBeLessThanOrEqual(2);
    }
    const lo = strike(60, 90, 1);
    expect(at(lo, et(84), 0.1, 0.6)).toBeGreaterThan(at(lo, et(60), 0.1, 0.6) + 40);
    // C6 fortissimo, its first 60 ms: the edgewise and twisting families are there (3.1, 6.2, 8.0, 14 times
    // the pitch), a thin free bar's 2.76 and 5.40 are not
    const x = strike(84, 106, 0.5);
    const f = et(84);
    const lv = (r: number) => at(x, f * r, 0.021, 0.081) - at(x, f, 0.021, 0.081);
    const V = GLOCK_VOICE;
    for (const k of [1, 3, 4]) expect(lv(V.ratio[k]), `family ${k}`).toBeGreaterThan(-45);
    for (const r of [2.756, 5.404]) expect(lv(r), `ratio ${r}`).toBeLessThan(lv(V.ratio[3]) - 6);
    // the voicing first wired is the textbook's, kept for the judge: it does have them
    const t = strike(84, 106, 0.5, { voice: GLOCK_TEXTBOOK });
    expect(at(t, f * 2.756, 0.021, 0.081) - at(t, f, 0.021, 0.081)).toBeGreaterThan(-40);
  });

  it('harder is louder and brighter (pp 21 dB under mf, ff 6 dB over); a brass mallet brighter than plastic, rubber duller', () => {
    const pp = strike(84, 22, 1);
    const mf = strike(84, 75, 1);
    const ff = strike(84, 106, 1);
    const f = et(84);
    expect(at(mf, f, 0.1, 0.6) - at(pp, f, 0.1, 0.6)).toBeCloseTo(21.3, 0);
    expect(at(ff, f, 0.1, 0.6) - at(mf, f, 0.1, 0.6)).toBeCloseTo(6, 0);
    const up = (x: Float32Array) => at(x, f * GLOCK_VOICE.ratio[4], 0.021, 0.081) - at(x, f, 0.021, 0.081);
    expect(up(ff)).toBeGreaterThan(up(mf) + 2);
    const brass = strike(84, 106, 1, { mallet: 1 });
    const rubber = strike(84, 106, 1, { mallet: 0 });
    const hi = (x: Float32Array) => at(x, f * GLOCK_VOICE.ratio[3], 0.021, 0.081) - at(x, f, 0.021, 0.081);
    expect(hi(brass)).toBeGreaterThan(hi(ff) + 2);
    expect(hi(rubber)).toBeLessThan(hi(ff) - 2);
    // never over full scale: a fortissimo chord of four low bars, through the room and the limiter
    const c = renderInstrument({ sampleRate: FS, instrument: 'glockenspiel', events: [79, 83, 86, 91].map((m) => ({ time: 0.02, event: { type: 'noteOn', midi: m, velocity: 127 } })) as never, duration: 1 });
    let pk = 0;
    for (let i = 0; i < c.left.length; i++) pk = Math.max(pk, Math.abs(c.left[i]), Math.abs(c.right[i]));
    expect(pk).toBeLessThanOrEqual(1);
    expect(pk).toBeGreaterThan(0.05);
  });

  it('rings on by itself: seconds on a low bar, less at the top, its upper partials gone first; nothing damps it unless damp says so', () => {
    const fall = (m: number) => {
      const x = strike(m, 90, 2.4);
      return (at(x, et(m), 0.2, 0.6) - at(x, et(m), 1.6, 2.0)) / 1.4;
    };
    const low = fall(79);
    const mid = fall(96);
    const top = fall(108);
    expect(low).toBeGreaterThan(1.5);
    expect(low).toBeLessThan(12);
    expect(top).toBeGreaterThan(Math.max(low, mid) * 1.5);
    expect(top).toBeLessThan(60);
    // the edgewise partial against the pitch: gone within a quarter of a second
    const x = strike(84, 106, 1);
    const f = et(84);
    const r = GLOCK_VOICE.ratio[3];
    expect(at(x, f * r, 0.3, 0.5) - at(x, f, 0.3, 0.5)).toBeLessThan(at(x, f * r, 0.021, 0.081) - at(x, f, 0.021, 0.081) - 15);
    // a key let go changes nothing …
    const off = [{ time: 0.1, event: { type: 'noteOff', midi: 84 } }];
    const lv = strike(84, 90, 1.2, undefined, off);
    const held = strike(84, 90, 1.2);
    expect(Math.abs(rmsDb(lv, 0.6, 1.0) - rmsDb(held, 0.6, 1.0))).toBeLessThan(0.01);
    // … unless the hand stops the bar; a pedal held keeps it ringing
    const damped = strike(84, 90, 1.2, { damp: 1 }, off);
    expect(rmsDb(damped, 0.4, 0.6)).toBeLessThan(rmsDb(lv, 0.4, 0.6) - 60);
    const pedal = strike(84, 90, 1.2, { damp: 1 }, [{ time: 0.01, event: { type: 'sustain', value: 1 } }, ...off]);
    expect(rmsDb(pedal, 0.4, 0.6)).toBeGreaterThan(rmsDb(lv, 0.4, 0.6) - 1);
  });

  it('two mallets: the engine’s hands take the bars without crossing, alternate on a bar struck again, and say where they are', () => {
    const c = core();
    expect(vis(c).hands).toEqual([8, 20]);
    expect(c.sounding()).toEqual([]);
    c.schedule({ type: 'noteOn', midi: 79, velocity: 90 });
    run(c, 0.05);
    let v = vis(c);
    expect(v.hands[0]).toBe(0);
    expect(v.hits[0]).toMatchObject({ bar: 0, hand: 0, vel: 90 });
    expect(v.amp[0]).toBeGreaterThan(0.3);
    expect(c.sounding()).toEqual([79]);
    // a high bar: the right hand; the left stays
    c.schedule({ type: 'noteOn', midi: 105, velocity: 90 });
    run(c, 0.05);
    v = vis(c);
    expect(v.hands).toEqual([0, 26]);
    expect(v.hits[0]).toMatchObject({ bar: 26, hand: 1 });
    // the same bar again: the other hand (a roll)
    c.schedule({ type: 'noteOn', midi: 105, velocity: 90 });
    run(c, 0.05);
    v = vis(c);
    expect(v.hits[0]).toMatchObject({ bar: 26, hand: 0 });
    expect(v.hits.length).toBe(3);
    expect(v.hits[0].ago).toBeLessThan(v.hits[1].ago);
    expect(new Set(c.sounding())).toEqual(new Set([79, 105]));
    // everything dies away; the last strokes are still told
    c.allSoundOff();
    run(c, 0.05);
    expect(c.sounding()).toEqual([]);
    expect(c.activeVoiceCount).toBe(0);
  });

  it('the same sound at 44.1, 48 and 96 kHz and at 22.05 kHz within its band; registered with the factory', () => {
    const a = createCore({ sampleRate: FS, instrument: 'glockenspiel' });
    expect(a.id).toBe('glockenspiel');
    expect(a.keySummary().length).toBe(30);
    const lvl = (fs: number) => {
      const r = renderInstrument({ sampleRate: fs, instrument: 'glockenspiel', dry: true, events: [{ time: 0.02, event: { type: 'noteOn', midi: 91, velocity: 90 } }] as never, duration: 0.8 }).left;
      let s = 0;
      const i0 = Math.round(0.1 * fs);
      const i1 = Math.round(0.6 * fs);
      for (let i = i0; i < i1; i++) s += r[i] * r[i];
      return 10 * Math.log10(s / (i1 - i0));
    };
    const ref = lvl(48000);
    for (const fs of [22050, 44100, 96000]) expect(Math.abs(lvl(fs) - ref), `${fs}`).toBeLessThan(0.5);
    // the mallet's knock too (the first 3 ms of the voicing's own stroke, in the knock's band: a resonator
    // kicked by one sample rings louder the higher the rate, unless the kick is made for the rate)
    const knock = (fs: number) => {
      const r = renderInstrument({ sampleRate: fs, instrument: 'glockenspiel', dry: true, params: { human: 0 } as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: 79, velocity: 106 } }] as never, duration: 0.1 }).left;
      const W = Math.round(0.004 * fs);
      const i0 = Math.round(0.02 * fs);
      let re = 0;
      let im = 0;
      for (let i = 0; i < W; i++) {
        const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
        re += r[i0 + i] * h * Math.cos((2 * Math.PI * 3200 * i) / fs);
        im += r[i0 + i] * h * Math.sin((2 * Math.PI * 3200 * i) / fs);
      }
      return 20 * Math.log10(Math.hypot(re, im) / W);
    };
    for (const fs of [44100, 96000]) expect(Math.abs(knock(fs) - knock(48000)), `knock at ${fs}`).toBeLessThan(1.5);
  });

  it('a player’s strokes: no two alike (their level, their upper partials, their instant, the two mallets); `human` 0 is the voicing itself, every stroke the same', () => {
    // one bar six times, stopped between (damp) so that each stroke meets a bar at rest
    const six = (human: number) => {
      const ev: { time: number; event: unknown }[] = [];
      for (let k = 0; k < 6; k++) ev.push({ time: 0.02 + k * 0.6, event: { type: 'noteOn', midi: 84, velocity: 96 } }, { time: 0.02 + k * 0.6 + 0.3, event: { type: 'noteOff', midi: 84 } });
      return renderInstrument({ sampleRate: FS, instrument: 'glockenspiel', dry: true, params: { damp: 1, human } as never, events: ev as never, duration: 3.7 }).left;
    };
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const machine = six(0);
    const player = six(1);
    const f1 = et(84);
    const pitch = (x: Float32Array) => [0, 1, 2, 3, 4, 5].map((k) => at(x, f1, 0.03 + k * 0.6, 0.23 + k * 0.6));
    // (the partial near 6.2 times the pitch: the strongest of the upper families on this bar)
    const upper = (x: Float32Array) => [0, 1, 2, 3, 4, 5].map((k) => Math.max(...[6.1, 6.2, 6.3].map((r) => at(x, f1 * r, 0.022 + k * 0.6, 0.062 + k * 0.6))));
    expect(spread(pitch(machine))).toBeLessThan(0.05);
    expect(spread(upper(machine))).toBeLessThan(0.3);
    // a player's: the pitch's level a decibel or two apart, never wild; the upper partials many decibels
    expect(spread(pitch(player))).toBeGreaterThan(0.6);
    expect(spread(pitch(player))).toBeLessThan(7);
    expect(spread(upper(player))).toBeGreaterThan(4);
    // each a different sound: no two strokes' first 50 ms the same
    const head = (x: Float32Array, k: number) => rmsDb(x, 0.02 + k * 0.6, 0.07 + k * 0.6);
    const heads = [0, 1, 2, 3, 4, 5].map((k) => head(player, k));
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) expect(Math.abs(heads[a] - heads[b]), `${a} and ${b}`).toBeGreaterThan(0.01);
    // on average the player's stroke is the voicing's (within 2 dB over a hundred strokes)
    const c = core({ damp: 1 });
    const m = core({ damp: 1, human: 0 });
    let sum = 0;
    const one = (k: GlockenspielCore) => {
      const L = new Float32Array(4800);
      const R = new Float32Array(4800);
      k.schedule({ type: 'noteOn', midi: 84, velocity: 96 });
      k.process(L, R, 4800);
      k.schedule({ type: 'noteOff', midi: 84 });
      run(k, 0.3);
      return rmsDb(L, 0.004, 0.1);
    };
    const mach = one(m);
    for (let k = 0; k < 100; k++) sum += one(c);
    expect(Math.abs(sum / 100 - mach)).toBeLessThan(2);
    // a stroke lands a moment late, never more than 4 ms; the machine's on the instant
    const first = (x: Float32Array) => {
      for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 1e-5) return i / FS;
      return -1;
    };
    expect(first(machine)).toBeCloseTo(0.02, 3);
    expect(first(player)).toBeGreaterThanOrEqual(0.02 - 1e-4);
    expect(first(player)).toBeLessThan(0.0245);
    // the strokes land near the bar's middle, each somewhere else, and say where
    const v = vis(c).hits as unknown as { along: number; across: number }[];
    expect(v.every((h) => Math.abs(h.along) <= 0.14 && Math.abs(h.across) <= 1)).toBe(true);
    expect(new Set(v.map((h) => h.along.toFixed(4))).size).toBeGreaterThan(3);
    expect((vis(m).hits as unknown as { along: number; across: number }[]).every((h) => h.along === 0 && h.across === 0)).toBe(true);
  });

  it('a bar struck while it rings: the stroke is added to its motion, louder with the swing and softer against it', () => {
    // (the voicing's own strokes, on the instant; a second stroke a whole number of the pitch's cycles after
    // the first meets the bar as the first left it, half a cycle more meets it coming back)
    const f1 = et(79);
    const cycles = Math.round(0.2 * f1);
    const two = (after: number) =>
      at(renderInstrument({ sampleRate: FS, instrument: 'glockenspiel', dry: true, params: { human: 0 } as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: 79, velocity: 80 } }, { time: 0.02 + after, event: { type: 'noteOn', midi: 79, velocity: 80 } }] as never, duration: 1 }).left, f1, 0.5, 0.9);
    const alone = at(strike(79, 80, 1, { human: 0 }), f1, 0.5, 0.9);
    const withIt = two(cycles / f1);
    const against = two((cycles + 0.5) / f1);
    // (the second stroke is 0.2 s younger: with the swing the two are 6.5 dB over one, less the mallet's share)
    expect(withIt - alone).toBeGreaterThan(4.5);
    expect(withIt - alone).toBeLessThan(6.6);
    expect(against - alone).toBeLessThan(-8);
    // a player's repeats gather: twenty strokes four a second settle some decibels over one stroke alone
    const ev: { time: number; event: unknown }[] = [];
    for (let k = 0; k < 20; k++) ev.push({ time: 0.02 + k * 0.25, event: { type: 'noteOn', midi: 79, velocity: 80 } });
    const many = renderInstrument({ sampleRate: FS, instrument: 'glockenspiel', dry: true, events: ev as never, duration: 5.4 }).left;
    const one = strike(79, 80, 1);
    let sum = 0;
    for (let k = 8; k < 20; k++) sum += 10 ** (at(many, f1, 0.04 + k * 0.25, 0.24 + k * 0.25) / 10);
    const settled = 10 * Math.log10(sum / 12) - at(one, f1, 0.04, 0.24);
    expect(settled).toBeGreaterThan(2);
    expect(settled).toBeLessThan(9);
  });

  it('a roll: a held key with `roll` (or the wheel) up is struck on, ten to sixteen times a second, the two mallets in turn, and does not die away; let go, it rings out', () => {
    const c = core({ roll: 0.5 });
    c.schedule({ type: 'noteOn', midi: 88, velocity: 80 });
    const hands: number[] = [];
    let strokes = 0;
    let lastAgo = Infinity;
    const L = new Float32Array(240);
    const R = new Float32Array(240);
    const levels: number[] = [];
    for (let n = 0; n < 600; n++) {
      c.process(L, R, 240);
      const g = vis(c);
      if (g.hits[0] && g.hits[0].ago < lastAgo) {
        strokes++;
        hands.push(g.hits[0].hand);
      }
      lastAgo = g.hits[0]?.ago ?? Infinity;
      if (n % 100 === 99) levels.push(rmsDb(L, 0, 240 / FS));
    }
    // three seconds: 30–48 strokes of the roll and the note's own
    expect(strokes).toBeGreaterThanOrEqual(30);
    expect(strokes).toBeLessThanOrEqual(50);
    for (let k = 1; k < hands.length; k++) expect(hands[k]).not.toBe(hands[k - 1]);
    expect((c.getVisual() as { glock: { rolling: boolean } }).glock.rolling).toBe(true);
    // let go: no more strokes; the bar rings on and dies away
    c.schedule({ type: 'noteOff', midi: 88 });
    run(c, 0.2);
    const n0 = (vis(c).hits[0] as { ago: number }).ago;
    run(c, 0.5);
    expect((vis(c).hits[0] as { ago: number }).ago).toBeGreaterThan(n0 + 0.45);
    expect((c.getVisual() as { glock: { rolling: boolean } }).glock.rolling).toBe(false);
    // the roll holds the note where a single stroke has died away: its level from the second second on, against
    // the single stroke's first half second (the strokes meet the bar's swing as they fall: the level wavers)
    const single = rmsDb(strike(88, 80, 3.2), 0.1, 0.5);
    const lv = (params: object, extra: { time: number; event: unknown }[] = []) => rmsDb(strike(88, 80, 3.2, params, extra), 1, 3.1) - single;
    expect(lv({})).toBeLessThan(-6);
    expect(lv({ roll: 0.5 })).toBeGreaterThan(-6);
    expect(lv({ roll: 0.5 })).toBeLessThan(6);
    // the modulation wheel rolls a held key too, as the knob does
    expect(lv({}, [{ time: 0.01, event: { type: 'control', cc: 1, value: 0.5 } }])).toBeCloseTo(lv({ roll: 0.5 }), 6);
    // a roll is no louder than the limiter's room: as played, a fortissimo roll on the lowest bar
    const played = renderInstrument({ sampleRate: FS, instrument: 'glockenspiel', params: { roll: 1 } as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: 79, velocity: 110 } }] as never, duration: 3 });
    let pk = 0;
    for (let i = 0; i < played.left.length; i++) pk = Math.max(pk, Math.abs(played.left[i]));
    expect(pk).toBeLessThan(0.97);
    expect(rmsDb(played.left, 1, 2.9) - rmsDb(played.left, 0.1, 0.5)).toBeLessThan(6);
  });
});
