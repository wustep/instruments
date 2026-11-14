// The bow in the hand of a player who reads the part (bowed.ts BOW_PLAYER), the left hand under it, and the
// bow as it is seen in a rest (BOW_AIR). A file playing tells the notes to come; quick notes that run by
// step share a bow, a slur stays on its string, a joined note is a change of bow and not a note from rest,
// and in a rest the bow is off the string. `human` 0 and the keys are the engine as it was.
import { describe, expect, it } from 'vitest';
import { BOW_AIR, BOW_PLAYER, BowedCore } from '../src/core/index.ts';

const FS = 48000;
type Inst = 'violin' | 'viola' | 'cello' | 'bass';
type Note = { t: number; dur: number; midi: number; vel?: number };
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** a line of notes one after the other: lengths, the steps between them (semitones), a gap after each */
function line(midi0: number, steps: number[], len: number | number[], gap = 0, t0 = 0.05): Note[] {
  let t = t0;
  let m = midi0;
  return [0, ...steps].map((s, i) => {
    m += s;
    const dur = Array.isArray(len) ? len[i] : len;
    const n = { t, dur, midi: m };
    t += dur + gap;
    return n;
  });
}

/** the notes played as the file player sends them (told ahead unless `hand`), sampled every `block` frames */
function play(inst: Inst, notes: Note[], dur: number, o: { human?: number; hand?: boolean; block?: number; vibrato?: number } = {}) {
  const core = new BowedCore({ sampleRate: FS, instrument: inst, dry: true, params: { vibrato: o.vibrato ?? 0, ...(o.human === undefined ? {} : { human: o.human }) } as never });
  // (in a file's order: at one instant a note is let go before the next begins)
  const evs = notes.flatMap((n) => [
    { f: Math.round(n.t * FS), k: 1, n },
    { f: Math.round((n.t + n.dur) * FS), k: 0, n },
  ]);
  evs.sort((a, b) => a.f - b.f || a.k - b.k);
  for (const e of evs) {
    if (e.k && !o.hand) core.schedule({ type: 'foresee', midi: e.n.midi, velocity: e.n.vel ?? 80, dur: e.n.dur }, e.f);
    core.schedule(e.k ? { type: 'noteOn', midi: e.n.midi, velocity: e.n.vel ?? 80 } : { type: 'noteOff', midi: e.n.midi }, e.f);
  }
  const block = o.block ?? 480;
  const n = Math.round(dur * FS);
  const x = new Float32Array(n);
  const L = new Float32Array(block);
  const R = new Float32Array(block);
  const string: number[] = [];
  const dir: number[] = [];
  const lift: number[] = [];
  const pos: number[] = [];
  const period: number[] = [];
  for (let i = 0; i + block <= n; i += block) {
    core.process(L, R, block);
    x.set(L, i);
    string.push(core.strings.findIndex((s) => s.bowing));
    dir.push(core.bow.changing ? 0 : core.bow.dir);
    const v = core.getVisual(8) as { bow: { lift: number; pos: number } };
    lift.push(v.bow.lift);
    pos.push(v.bow.pos);
    // (the cello's and the bass's own reading of the period sounding, slip to slip: design.byEar)
    period.push((core.strings.find((s) => s.bowing) as unknown as { lastPm: number } | undefined)?.lastPm ?? 0);
  }
  return { core, x, string, dir, lift, pos, period };
}
const at = (t: number) => Math.round(t * 100);
const db = (x: Float32Array, t0: number, t1: number) => {
  let s = 0;
  for (let i = Math.round(t0 * FS); i < Math.round(t1 * FS); i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.round((t1 - t0) * FS) + 1e-20);
};
function cents(x: Float32Array, f: number, t0: number, len: number): number {
  const s0 = Math.round(t0 * FS);
  const W = Math.round(len * FS);
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag];
    return s;
  };
  let best = -Infinity;
  let bl = 0;
  for (let lag = Math.floor(FS / (f * 1.04)); lag <= Math.ceil(FS / (f * 0.96)); lag++) {
    const v = ac(lag);
    if (v > best) {
      best = v;
      bl = lag;
    }
  }
  const a = ac(bl - 1);
  const b = ac(bl);
  const c = ac(bl + 1);
  return 1200 * Math.log2(FS / (bl + (0.5 * (a - c)) / (a - 2 * b + c)) / f);
}

describe('slurs: quick notes that run by step share a bow (a file playing)', () => {
  it('a scale in semiquavers is bowed four to a bow, not one bow a note; a run of six, three and three', () => {
    // eight notes up a scale from B♭4, 0.15 s each, end to end
    const scale = line(70, [2, 2, 1, 2, 2, 2, 1], 0.15);
    const r = play('violin', scale, 1.4);
    expect(r.core.plan.strokes).toBe(2);
    // one way through each four, the other way through the next
    const d = scale.map((n) => r.dir[at(n.t + 0.08)]);
    expect(d.slice(0, 4)).toEqual([d[0], d[0], d[0], d[0]]);
    expect(d.slice(4)).toEqual([-d[0], -d[0], -d[0], -d[0]]);
    expect(r.core.bow.changes).toBe(0);
    expect(play('violin', line(70, [2, 2, 1, 2, 2], 0.15), 1.1).core.plan.strokes).toBe(2);
    const six = play('violin', line(70, [2, 2, 1, 2, 2], 0.15), 1.1);
    const d6 = line(70, [2, 2, 1, 2, 2], 0.15).map((n) => six.dir[at(n.t + 0.08)]);
    expect(d6).toEqual([d6[0], d6[0], d6[0], -d6[0], -d6[0], -d6[0]]);
    // quavers (0.25 s): two to a bow, about three quarters of a second of notes at most
    expect(play('cello', line(50, [2, 2, 1, 2, 2, 2, 1], 0.25), 2.2).core.plan.strokes).toBe(4);
    expect(BOW_PLAYER.span).toBeLessThan(1);
  });

  it('leaps, repeated notes, long notes and notes apart keep a bow each', () => {
    // an arpeggio (thirds and fourths), the same pitch again, crotchets by step, steps with rests between
    expect(play('violin', line(67, [4, 3, 5, -5, -3, -4], 0.15), 1.3).core.plan.strokes).toBe(7);
    expect(play('violin', line(74, [0, 0, 0, 0, 0], 0.15), 1.1).core.plan.strokes).toBe(6);
    expect(play('violin', line(70, [2, 2, 1, -1, -2], 0.4), 2.6).core.plan.strokes).toBe(6);
    expect(play('violin', line(70, [2, 2, 1, -1, -2], 0.12, 0.08), 1.4).core.plan.strokes).toBe(6);
    // a step, then a leap, then steps: the leap is where the bow turns
    const mixed = play('violin', line(70, [2, 7, -2, -1], 0.15), 1);
    expect(mixed.core.plan.strokes).toBe(2);
    expect(mixed.dir[at(0.05 + 0.15 * 1.5)]).toBe(mixed.dir[at(0.1)]);
    expect(mixed.dir[at(0.05 + 0.15 * 2.5)]).toBe(-mixed.dir[at(0.1)]);
  });

  it('every slurred note is on its pitch and there: the finger changes under a bow that goes on', () => {
    for (const inst of ['violin', 'viola', 'cello', 'bass'] as const) {
      // (from A♭ or E♭: no note of the run the octave of an open string, which pins a short note's pitch
      // whoever bows it: on the violin a short A5 is a quarter tone flat, slurred or not, as it was)
      const m0 = { violin: 68, viola: 63, cello: 51, bass: 39 }[inst];
      const notes = line(m0, [2, 2, 1, 2, 2, 2, 1], 0.2, 0, 0.3);
      const r = play(inst, notes, 2.2);
      expect(r.core.plan.strokes, inst).toBeLessThanOrEqual(4);
      // (the bass by its string's own period, slip to slip: in what is heard the string bowed before still
      // rings under so short a note, an octave and more below the others')
      if (inst === 'bass') for (const [k, n] of notes.entries()) expect(Math.abs(1200 * Math.log2(FS / et(n.midi) / r.period[at(n.t + 0.19)])), `bass ${n.midi} (${k})`).toBeLessThan(18);
      else for (const n of notes) expect(Math.abs(cents(r.x, et(n.midi), n.t + 0.09, 0.1 - 1 / et(n.midi) - 0.004)), `${inst} ${n.midi}`).toBeLessThan(18);
      // and as loud as the same note held alone (the instrument's own notes differ by 10 dB and more): none
      // lost under it, and nearer to it over the run than a bow to every note was
      const held = notes.map((n) => db(play(inst, [{ t: 0.05, dur: 0.9, midi: n.midi }], 0.9, { hand: true, human: 0 }).x, 0.5, 0.85));
      const off = (x: Float32Array) => notes.map((n, i) => db(x, n.t + 0.06, n.t + n.dur) - held[i]);
      const rms = (v: number[]) => Math.sqrt(v.reduce((q, e) => q + e * e, 0) / v.length);
      const now = off(r.x);
      for (const d of now) expect(d, `${inst} ${now.map((v) => v.toFixed(1)).join(' ')}`).toBeGreaterThan(-10);
      expect(rms(now), inst).toBeLessThan(5);
      if (inst !== 'violin') expect(rms(now), inst).toBeLessThan(rms(off(play(inst, notes, 2.2, { human: 0 }).x)) - 1.5);
    }
  });

  it('`human` 0 and the keys: one bow a note, as the engine was', () => {
    const scale = line(70, [2, 2, 1, 2, 2, 2, 1], 0.15);
    const off = play('violin', scale, 1.4, { human: 0 });
    expect(off.core.plan.strokes).toBe(8);
    expect(scale.map((n) => off.dir[at(n.t + 0.08)])).toEqual([1, -1, 1, -1, 1, -1, 1, -1]);
    const keys = play('violin', scale, 1.4, { hand: true });
    expect(keys.core.plan.strokes).toBe(0);
    expect(new Set(scale.slice(3).map((n, i) => keys.dir[at(n.t + 0.08)] * (i % 2 ? -1 : 1))).size).toBe(1);
    // and nothing of the player's is left on a string
    for (const r of [off, keys]) for (const s of r.core.strings) expect([s.tauP, s.slide]).toEqual([0, 0]);
  });
});

describe('a slur stays on its string where the hand can', () => {
  it('up a scale across the open E the violin stays on the A string (the fourth finger), and crosses where the hand cannot reach', () => {
    // A4 B4 C♯5 D5 E5 in semiquavers: before, E5 was the open E string
    const r = play('violin', line(69, [2, 2, 1, 2], 0.15), 0.9);
    const A = 2;
    for (const n of line(69, [2, 2, 1, 2], 0.15)) expect(r.string[at(n.t + 0.08)], String(n.midi)).toBe(A);
    // … C♯5 D5 E5 F♯5: F♯ is past the fourth finger: a crossing to the E string, inside the bow
    const up = line(73, [1, 2, 2], 0.15);
    const u = play('violin', up, 0.75);
    expect(up.map((n) => u.string[at(n.t + 0.08)])).toEqual([2, 2, 2, 3]);
    expect(u.core.plan.strokes).toBe(1);
    expect(u.core.bow.changes).toBe(0);
    // down below the open string: the bow rolls to the next string and goes on
    const down = line(71, [-2, -2, -1], 0.15);
    const d = play('violin', down, 0.75);
    expect(down.map((n) => d.string[at(n.t + 0.08)])).toEqual([2, 2, 1, 1]);
    expect(d.core.plan.strokes).toBe(1);
    expect(d.core.bow.changes).toBe(0);
  });

  it('a note written over the end of the last (a file’s slur) is on the same string, not a hop to the next; a shift is heard, short', () => {
    // A5 then D6 on the E string, the two overlapping by 40 ms, then C♯6 and B5 the same way
    const notes: Note[] = [
      { t: 0.05, dur: 0.64, midi: 81 },
      { t: 0.65, dur: 0.64, midi: 86 },
      { t: 1.25, dur: 0.64, midi: 85 },
      { t: 1.85, dur: 0.6, midi: 83 },
    ];
    const r = play('violin', notes, 2.6);
    expect(notes.map((n) => r.string[at(n.t + 0.3)])).toEqual([3, 3, 3, 3]);
    expect(r.core.plan.strokes).toBe(1);
    // the shift of a fourth: on its way at first, there within a tenth of a second
    const core = new BowedCore({ sampleRate: FS, instrument: 'violin', dry: true, params: { vibrato: 0, human: 1 } as never });
    for (const n of notes.slice(0, 2)) {
      core.schedule({ type: 'foresee', midi: n.midi, velocity: 80, dur: n.dur }, Math.round(n.t * FS));
      core.schedule({ type: 'noteOn', midi: n.midi, velocity: 80 }, Math.round(n.t * FS));
      core.schedule({ type: 'noteOff', midi: n.midi }, Math.round((n.t + n.dur) * FS));
    }
    const L = new Float32Array(48);
    const R = new Float32Array(48);
    const E = core.strings[3];
    let early = 0;
    let late = 1;
    for (let i = 0; i < Math.round(0.9 * FS); i += 48) {
      core.process(L, R, 48);
      const t = (i + 48) / FS;
      if (Math.abs(t - 0.655) < 0.0006) early = E.slide;
      if (Math.abs(t - 0.77) < 0.0006) late = E.slide;
    }
    expect(early).toBeLessThan(-100);
    expect(early).toBeGreaterThan(-500);
    expect(late).toBe(0);
    expect(BOW_PLAYER.shift.max).toBeLessThanOrEqual(0.02);
    // `human` 0: the other string, as before
    const off = play('violin', notes, 2.6, { human: 0 });
    expect(off.string[at(0.95)]).not.toBe(3);
    // a real double stop (the first note held on under the second) is still two strings
    const two: Note[] = [
      { t: 0.05, dur: 1.2, midi: 69 },
      { t: 0.45, dur: 0.8, midi: 76 },
    ];
    const ds = play('violin', two, 1.4);
    expect(ds.core.strings.filter((s) => s.midi === 69 || s.midi === 76).length).toBe(2);
    expect(ds.core.strings[2].midi).toBe(69);
    expect(ds.core.strings[3].midi).toBe(76);
  });
});

describe('a joined note is a change of bow, not a note from rest', () => {
  it('a soft line of quavers speaks on the viola, the cello and the bass: before, each began with the long tone’s slow bow', () => {
    for (const inst of ['viola', 'cello', 'bass'] as const) {
      const m0 = { viola: 62, cello: 50, bass: 38 }[inst];
      // leaps, so no slur: every note a bow
      const notes = line(m0, [4, -7, 5, 3, -5, 7, -4], 0.25, 0, 0.3).map((n) => ({ ...n, vel: 50 }));
      const now = play(inst, notes, 2.6);
      const was = play(inst, notes, 2.6, { human: 0 });
      expect(now.core.plan.strokes).toBe(8);
      const gain = db(now.x, 0.55, 2.3) - db(was.x, 0.55, 2.3);
      expect(gain, inst).toBeGreaterThan(2);
      expect(gain, inst).toBeLessThan(12);
      // every note on its pitch still
      for (const n of notes.slice(1)) expect(Math.abs(cents(now.x, et(n.midi), n.t + 0.12, 0.1)), `${inst} ${n.midi}`).toBeLessThan(25);
    }
  });

  it('the first note, a note after a rest and a long note keep their own attack; a short one after a rest speaks in a share of its length', () => {
    const tau = (inst: Inst, notes: Note[], k: number) => {
      const r = play(inst, notes, notes[k].t + 0.02);
      return r.core.strings.find((s) => s.bowing)!.tauP;
    };
    const long = line(50, [4, -7], 1.2, 0.4, 0.05).map((n) => ({ ...n, vel: 50 }));
    // from rest, long: the note's own (tauP 0)
    expect(tau('cello', long, 0)).toBe(0);
    expect(tau('cello', long, 1)).toBe(0);
    // joined: the change of bow
    const joined = line(50, [4, -7], 1.2, 0, 0.05).map((n) => ({ ...n, vel: 50 }));
    expect(tau('cello', joined, 1)).toBeCloseTo(BOW_PLAYER.turn, 6);
    // short, after a rest: a share of its length
    const short = line(50, [4, -7], 0.1, 0.4, 0.05).map((n) => ({ ...n, vel: 50 }));
    expect(tau('cello', short, 1)).toBeCloseTo(Math.max(BOW_PLAYER.speakMin, BOW_PLAYER.speak * 0.1), 3);
  });
});

describe('in a rest the bow is off the string (what is seen)', () => {
  it('up in a rest, higher the longer it is, and down on the next note where its stroke begins; never up in a gap too short to lift it', () => {
    // two notes with 0.8 s of rest between, then two 0.08 s apart
    const notes: Note[] = [
      { t: 0.05, dur: 0.6, midi: 74 },
      { t: 1.45, dur: 0.5, midi: 76 },
      { t: 2.03, dur: 0.5, midi: 78 },
    ];
    const r = play('violin', notes, 2.8);
    // on the string while it sounds
    for (const t of [0.2, 0.5, 1.6, 2.2]) expect(r.lift[at(t)], `at ${t}`).toBe(0);
    // off it in the rest, and well up by its middle
    expect(r.lift[at(0.85)]).toBeGreaterThan(0.25);
    expect(r.lift[at(1.05)]).toBeGreaterThan(0.5);
    // coming down as the note nears, and all but on the string as it begins
    expect(r.lift[at(1.38)]).toBeLessThan(r.lift[at(1.2)]);
    expect(r.lift[at(1.45)]).toBeLessThan(0.08);
    // over the hair it has gone to where the next stroke begins: no jump as it lands
    expect(Math.abs(r.pos[at(1.47)] - r.pos[at(1.44)])).toBeLessThan(0.02);
    // a gap of 0.08 s: the bow stops on the string
    for (let i = at(1.95); i < at(2.04); i++) expect(r.lift[i]).toBeLessThan(0.02);
    // a short rest is a hop, a long one the whole height
    const hop = play('violin', [notes[0], { t: 0.85, dur: 0.4, midi: 76 }], 1.2);
    const top = Math.max(...hop.lift);
    expect(top).toBeGreaterThan(0.08);
    expect(top).toBeLessThan(0.6);
    expect(Math.max(...r.lift.slice(0, at(1.45)))).toBeGreaterThan(top);
  });

  it('from the keys the bow waits on the string, is then taken off, and after a long silence is laid back down; before any note it lies there', () => {
    const idle = play('violin', [], 0.5, { hand: true });
    expect(Math.max(...idle.lift)).toBe(0);
    const r = play('violin', [{ t: 0.05, dur: 0.4, midi: 74 }, { t: 0.65, dur: 0.4, midi: 76 }], 9, { hand: true });
    // 0.2 s between the two notes: still on the string
    for (let i = 0; i < at(1.05); i++) expect(r.lift[i]).toBeLessThan(0.05);
    expect(r.lift[at(1.05 + BOW_AIR.hold + 0.6)]).toBeGreaterThan(0.8);
    expect(r.lift[at(1.05 + BOW_AIR.idle + 3 * BOW_AIR.settle)]).toBeLessThan(0.05);
  });

  it('what is seen is never heard: the same samples whether or not the bow is looked at, at any block length', () => {
    const notes = [...line(70, [2, 2, 1, 2, 2, 2, 1], 0.15), { t: 1.7, dur: 0.5, midi: 77 }, { t: 2.17, dur: 0.6, midi: 81 }, { t: 2.75, dur: 0.5, midi: 86 }];
    const a = play('violin', notes, 3.4, { block: 480, vibrato: 12 });
    const b = play('violin', notes, 3.4, { block: 37, vibrato: 12 });
    const n = Math.min(a.x.length, 37 * Math.floor(b.x.length / 37));
    let d = 0;
    for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(a.x[i] - b.x[i]));
    expect(d).toBe(0);
    // the lift itself is the same at any block (read at the same instants)
    const core = (block: number) => {
      const c = new BowedCore({ sampleRate: FS, instrument: 'violin', dry: true });
      c.schedule({ type: 'foresee', midi: 74, velocity: 80, dur: 0.3 }, 2400);
      c.schedule({ type: 'noteOn', midi: 74, velocity: 80 }, 2400);
      c.schedule({ type: 'noteOff', midi: 74 }, 2400 + 14400);
      c.schedule({ type: 'foresee', midi: 76, velocity: 80, dur: 0.3 }, 2400 + 48000);
      const L = new Float32Array(block);
      const R = new Float32Array(block);
      for (let i = 0; i < 37 * 480 * 2; i += block) c.process(L, R, block);
      return (c.getVisual(8) as { bow: { lift: number } }).bow.lift;
    };
    expect(core(37)).toBe(core(480));
    expect(core(480)).toBeGreaterThan(0.3);
  });
});
