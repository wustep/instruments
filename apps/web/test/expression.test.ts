// A file's dynamics (expression.ts, midi-file.ts): the volume, expression and mod wheel a file carries
// reach the line's instrument as General MIDI's gain and the engines' wheel; a flat line (one velocity,
// no controller that moves) is phrased, a line with dynamics of its own is left as written. Tiny files
// made here (test/smf.ts), never a real piece.
import { describe, expect, it } from 'vitest';
import { ccGain, express, lineLag, lineShapes, modLines, modValue, PartLevels, phrases, PHRASING, TIMING, timingPlayers, typedTogether, volumeRef } from '../src/expression.ts';
import { parseMidi, type FileEvent, type MidiSong } from '../src/midi-file.ts';
import { smf } from './smf.ts';

type Ev = [number, ...number[]];
const name = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
/** ♩ = 60 (1 s a beat), 4/4: a conductor track and the parts given */
const song = (...parts: Ev[][]): MidiSong => parseMidi(smf(480, [[[0, 0xff, 0x51, 3, 0x0f, 0x42, 0x40], [0, 0xff, 0x58, 4, 4, 2, 24, 8]], ...parts]).buffer as ArrayBuffer);
/** a part on channel `ch`: notes of `beats` each at velocity `vel(i)`, and any extra events at ticks */
function part(ch: number, label: string, pitches: number[], beats: number, vel: (i: number) => number, extra: [number, number, number, number][] = []): Ev[] {
  const abs: [number, number[]][] = [[0, name(label)]];
  pitches.forEach((m, i) => {
    abs.push([i * beats * 480, [0x90 | ch, m, vel(i)]]);
    abs.push([(i + 1) * beats * 480 - 10, [0x80 | ch, m, 0]]);
  });
  for (const [t, st, d1, d2] of extra) abs.push([t, [st | ch, d1, d2]]);
  abs.sort((a, b) => a[0] - b[0]);
  let last = 0;
  return abs.map(([t, b]) => {
    const d = t - last;
    last = t;
    return [d, ...b];
  });
}
const tune = Array.from({ length: 48 }, (_, i) => 60 + ((i * 5) % 12));
const ons = (events: FileEvent[], line?: number) => events.filter((e): e is Extract<FileEvent, { kind: 'on' }> => e.kind === 'on' && (line === undefined || e.line === line));
const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

describe('a file’s controllers', () => {
  it('reads volume, expression and the mod wheel per line; a conductor track’s go to its channel’s lines; a reset; the bar lines', () => {
    const s = parseMidi(
      smf(480, [
        // conductor: ♩ = 120, 3/4; and a volume for channel 1 (no notes of its own here)
        [[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], [0, 0xff, 0x58, 4, 3, 2, 24, 8], [0, 0xb1, 7, 90]],
        part(0, 'a', [60, 62, 64, 65], 1, () => 80, [[0, 0xb0, 7, 100], [240, 0xb0, 11, 64], [480, 0xb0, 1, 30], [960, 0xb0, 121, 0], [5000, 0xb0, 11, 10]]),
        part(1, 'b', [48, 50], 2, () => 70),
      ]).buffer as ArrayBuffer,
    );
    const cc = s.events.filter((e) => e.kind === 'cc').map((e) => e.kind === 'cc' && [e.cc, Math.round(e.value * 127), e.line, +e.t.toFixed(3)]);
    expect(cc).toEqual([
      [7, 90, 1, 0],
      [7, 100, 0, 0],
      [11, 64, 0, 0.25],
      [1, 30, 0, 0.5],
      // reset all controllers: expression full, wheel at rest (the volume stays)
      [11, 127, 0, 1],
      [1, 0, 0, 1],
      [11, 10, 0, +(5000 / 960).toFixed(3)],
    ]);
    // a controller after the last note does not make the piece longer
    expect(s.duration).toBeCloseTo(1910 / 960, 6);
    // 3/4 at ♩ = 120: a bar every 1.5 s
    expect(s.bars).toEqual([0, 1.5]);
  });

  it('General MIDI’s curve: each of volume and expression 40·log10(v/127) dB; volume against the loudest the file sets', () => {
    expect(ccGain(1)).toBe(1);
    expect(20 * Math.log10(ccGain(64 / 127))).toBeCloseTo(40 * Math.log10(64 / 127), 6);
    expect(ccGain(0)).toBe(0);
    // a file at the default 100 everywhere plays as one that sets nothing
    const plain = song(part(0, 'a', [60], 1, () => 80, [[0, 0xb0, 7, 100]]));
    expect(ccGain(100 / 127, volumeRef(plain))).toBe(1);
    // the loudest line at 1, a quieter one by the curve
    const two = song(part(0, 'a', [60], 1, () => 80, [[0, 0xb0, 7, 118]]), part(1, 'b', [48], 1, () => 80, [[0, 0xb0, 7, 100]]));
    const ref = volumeRef(two);
    expect(ccGain(118 / 127, ref)).toBe(1);
    expect(20 * Math.log10(ccGain(100 / 127, ref))).toBeCloseTo(40 * Math.log10(100 / 118), 6);
  });

  it('each part plays its lines’ dynamics: gain, the wheel where it moves (never below half), swells; one at rest sends nothing', () => {
    const s = song(part(0, 'a', [60, 62], 1, () => 80, [[0, 0xb0, 1, 0], [100, 0xb0, 1, 90], [200, 0xb0, 1, 20]]), part(1, 'b', [48, 50], 1, () => 80, [[0, 0xb0, 1, 0]]));
    // line 0 moves its wheel; line 1 only sets it (a reset at the top is no gesture)
    expect([...modLines(s)]).toEqual([0]);
    const lv = new PartLevels(volumeRef(s), modLines(s));
    expect(lv.next([0])).toBeNull();
    const cc = (line: number, c: 1 | 7 | 11, v: number): FileEvent => ({ t: 0, kind: 'cc', cc: c, value: v / 127, line });
    expect(lv.take(cc(1, 1, 64))).toBe(false);
    expect(lv.take(cc(0, 11, 64))).toBe(true);
    expect(lv.next([0])).toEqual({ gain: ccGain(64 / 127), mod: null, dyn: 0 });
    // no change, nothing to send
    expect(lv.take(cc(0, 11, 64))).toBe(true);
    expect(lv.next([0])).toBeNull();
    lv.take(cc(0, 7, 50));
    lv.take(cc(0, 1, 127));
    lv.take({ t: 0, kind: 'dyn', value: 9, line: 0 });
    const v = lv.next([0])!;
    expect(v.gain).toBeCloseTo(ccGain(64 / 127) * ccGain(50 / 127, 100 / 127), 9);
    expect(v.mod).toBe(1);
    expect(v.dyn).toBe(9);
    // the engines' wheel: the upper half of its travel
    expect(modValue(0)).toBe(0.5);
    expect(modValue(1)).toBe(1);
    // a part on two lines: the louder line's gain (a line not heard from is at full)
    expect(lv.level([0, 1]).gain).toBe(1);
  });

  it('a resume chases the controllers: the last of each, per line, up to where it plays', () => {
    const ev: FileEvent[] = [
      { t: 0, kind: 'cc', cc: 7, value: 0.5, line: 0 },
      { t: 1, kind: 'cc', cc: 11, value: 0.3, line: 0 },
      { t: 2, kind: 'cc', cc: 11, value: 0.9, line: 0 },
      { t: 2, kind: 'dyn', value: 4, line: 1 },
      { t: 3, kind: 'cc', cc: 11, value: 0.1, line: 0 },
    ];
    expect(PartLevels.chase(ev, 2.5)).toEqual([ev[0], ev[2], ev[3]]);
  });
});

describe('automatic expression', () => {
  const flat = () => song(part(0, 'Violin', tune, 1, () => 80), part(1, 'Cello', tune.slice(0, 12).map((m) => m - 24), 4, () => 80));

  it('a flat file: phrased around its own level, deterministic, within range, its long notes swelling and settling back', () => {
    const s = flat();
    const shapes = lineShapes(s);
    expect(shapes.map((x) => x.flat)).toEqual([true, true]);
    const x = express(s);
    expect(x.shaped).toBe(true);
    for (const li of [0, 1]) {
      const v = ons(x.events, li).map((e) => e.vel);
      expect(v.length).toBe(ons(s.events, li).length);
      // shaped (a few steps either way), about the file's own level (a swelled note begins softer by
      // its swell's mean: its level over the note is the file's)
      const swell = x.events.filter((e) => e.kind === 'dyn' && e.line === li).map((e) => (e.kind === 'dyn' ? e.value : 0));
      const held = swell.length ? swell.reduce((a, b) => a + b, 0) / swell.length : 0;
      expect(sd(v), `line ${li}`).toBeGreaterThan(3);
      expect(Math.abs(v.reduce((a, b) => a + b, 0) / v.length + held - 80), `line ${li}`).toBeLessThan(4);
      expect(Math.max(...v)).toBeLessThanOrEqual(PHRASING.ceiling);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(1);
    }
    // the same file plays the same
    expect(express(flat()).events).toEqual(x.events);
    // the cello's 4-s notes swell (CC_DYNAMICS), the violin's 1-s notes barely; each swell ends at 0
    const dyn = (li: number) => x.events.filter((e): e is Extract<FileEvent, { kind: 'dyn' }> => e.kind === 'dyn' && e.line === li);
    const cello = dyn(1);
    expect(Math.max(...cello.map((e) => e.value))).toBeGreaterThan(8);
    expect(cello[cello.length - 1].value).toBe(0);
    for (const e of ons(s.events, 1)) {
      // a note's swell is over (back at 0) by the time the next note of its line begins
      const before = cello.filter((d) => d.t <= e.t + 1e-9 && d.t > e.t - 0.2);
      if (e.t > 0) expect(before[before.length - 1]?.value ?? 0, `at ${e.t}`).toBe(0);
    }
    // everything else as written: the same events, each line's in order, but for velocities and the swells,
    // and each line's place in time (two lines typed together: TIMING)
    expect(x.timed).toBe(true);
    const strip = (es: FileEvent[], line: number) => es.filter((e) => e.kind !== 'dyn' && e.line === line).map((e) => ({ ...e, t: 0, ...(e.kind === 'on' ? { vel: 0 } : {}) }));
    for (const li of [0, 1]) expect(strip(x.events, li)).toEqual(strip(s.events, li));
    // in time order
    for (let i = 1; i < x.events.length; i++) expect(x.events[i].t).toBeGreaterThanOrEqual(x.events[i - 1].t);
  });

  it('phrases of two to eight bars, about ten seconds', () => {
    const g = phrases(flat());
    // 4-s bars: two bars a phrase (8 s)
    expect(g[1] - g[0]).toBeCloseTo(8, 6);
  });

  it('a file with dynamics of its own is left as written: hairpins in expression, or velocities that move', () => {
    const hairpins: [number, number, number, number][] = [];
    for (let t = 0; t < 48 * 480; t += 120) hairpins.push([t, 0xb0, 11, Math.round(70 + 50 * Math.sin((Math.PI * t) / (8 * 480)) ** 2)]);
    const cc = song(part(0, 'Violin', tune, 1, () => 80, hairpins));
    expect(lineShapes(cc)[0].flat).toBe(false);
    const xc = express(cc);
    expect(xc.shaped).toBe(false);
    expect(xc.events).toBe(cc.events);
    // a performance: velocities that move from note to note
    const played = song(part(0, 'Piano', tune, 1, (i) => 50 + ((i * 37) % 45)));
    expect(lineShapes(played)[0].flat).toBe(false);
    expect(express(played).events).toBe(played.events);
  });

  it('a flat line with a moment of its own (a fade at the end) is phrased, but not there', () => {
    // velocity 80 throughout; the last bars fade in expression (CC11 127 → 60)
    const fade: [number, number, number, number][] = [[0, 0xb0, 11, 127]];
    for (let k = 0; k <= 20; k++) fade.push([(44 + (4 * k) / 20) * 480, 0xb0, 11, Math.round(127 - (67 * k) / 20)]);
    const s = song(part(0, 'Violin', tune, 1, () => 80, fade));
    const sh = lineShapes(s)[0];
    expect(sh.flat).toBe(true);
    const x = express(s);
    const v = ons(x.events, 0).map((e) => e.vel);
    // the notes in the fade (and next to it) as written; the rest phrased
    expect(v.slice(-4)).toEqual([80, 80, 80, 80]);
    expect(sd(v.slice(0, 30))).toBeGreaterThan(3);
  });

  it('a file at full force is phrased below its ceiling, its shape kept; terraces are kept', () => {
    const loud = song(part(0, 'Violin', tune, 1, () => 127));
    const v = ons(express(loud).events, 0).map((e) => e.vel);
    expect(Math.max(...v)).toBeLessThanOrEqual(PHRASING.ceiling);
    expect(sd(v)).toBeGreaterThan(3);
    // forte for 24 notes, then piano: still flat (a terrace is no gesture), the terraces stay apart
    const terr = song(part(0, 'Violin', tune, 1, (i) => (i < 24 ? 100 : 50)));
    expect(lineShapes(terr)[0].flat).toBe(true);
    const t = ons(express(terr).events, 0).map((e) => e.vel);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(t.slice(0, 20)) - mean(t.slice(28))).toBeGreaterThan(35);
  });
});

// A file typed into a notation program begins every line's note on one tick; an ensemble does not (TIMING).
describe('a typed file’s lines each in their own time', () => {
  const dyn = (i: number) => 50 + ((i * 37) % 60);
  const two = () => song(part(0, 'Violin', tune, 1, dyn), part(1, 'Cello', tune.map((m) => m - 24), 1, dyn));

  it('lines typed together are told apart from lines written or played apart, and from one line alone', () => {
    expect(typedTogether(two())).toBe(true);
    // one line: nothing to be together with
    expect(typedTogether(song(part(0, 'Violin', tune, 1, dyn)))).toBe(false);
    // the second line 8 ms late throughout (480 ticks a second: 4 ticks): written apart, left alone
    const late = part(1, 'Cello', tune.map((m) => m - 24), 1, dyn);
    late[1] = [late[1][0] + 4, ...late[1].slice(1)] as never;
    const apart = song(part(0, 'Violin', tune, 1, dyn), late);
    expect(typedTogether(apart)).toBe(false);
    const x = express(apart);
    expect(x.timed).toBe(false);
    expect(x.events).toBe(apart.events);
  });

  it('each line wanders either side of the beat, a few milliseconds, slowly; two lines stand apart as players do, less', () => {
    const s = two();
    const x = express(s);
    // (these lines have dynamics of their own: only the time is given)
    expect(x.shaped).toBe(false);
    expect(x.timed).toBe(true);
    const at = (es: FileEvent[], li: number) => ons(es, li).map((e) => e.t);
    const d0 = at(x.events, 0).map((t, i) => t - at(s.events, 0)[i]);
    const d1 = at(x.events, 1).map((t, i) => t - at(s.events, 1)[i]);
    for (const d of [...d0, ...d1]) expect(Math.abs(d)).toBeLessThan(2.5 * TIMING.sd);
    // each line about its standard deviation; the two apart by about √2 of it, a third of Rasch's 30–50 ms
    expect(sd(d0.slice(1))).toBeGreaterThan(0.5 * TIMING.sd);
    expect(sd(d0.slice(1))).toBeLessThan(1.5 * TIMING.sd);
    const apart = sd(d0.map((d, i) => d - d1[i]).slice(1));
    expect(apart).toBeGreaterThan(0.006);
    expect(apart).toBeLessThan(0.02);
    // a note is as long as written, to within 6 %, and nothing in a line changes order
    for (const li of [0, 1]) {
      const es = x.events.filter((e) => e.line === li && (e.kind === 'on' || e.kind === 'off'));
      const ws = s.events.filter((e) => e.line === li && (e.kind === 'on' || e.kind === 'off'));
      expect(es.map((e) => e.kind + (e as { midi: number }).midi)).toEqual(ws.map((e) => e.kind + (e as { midi: number }).midi));
      for (let i = 1; i < es.length; i++) {
        const len = es[i].t - es[i - 1].t;
        const was = ws[i].t - ws[i - 1].t;
        if (was > 0.1) expect(Math.abs(len / was - 1)).toBeLessThan(0.06);
      }
    }
    // in time order, within the file, and the same every time
    for (let i = 1; i < x.events.length; i++) expect(x.events[i].t).toBeGreaterThanOrEqual(x.events[i - 1].t);
    expect(x.events[0].t).toBeGreaterThanOrEqual(0);
    expect(x.events[x.events.length - 1].t).toBeLessThanOrEqual(s.duration);
    expect(express(two()).events).toEqual(x.events);
  });

  it('a keyboard’s two staves are one player’s hands: they keep one time, and the pedal on one staff changes with the other’s notes', () => {
    // a violin, then a piano's right and left hand (program 0 on both), the pedal on the left hand's staff
    const prog = (ch: number, p: number): Ev => [0, 0xc0 | ch, p];
    const withProg = (ch: number, p: number, evs: Ev[]): Ev[] => [evs[0], prog(ch, p), ...evs.slice(1)];
    const pedal: [number, number, number, number][] = Array.from({ length: 24 }, (_, k) => [k * 960 + (k % 2 ? 0 : 30), 0xb0, 64, k % 2 ? 0 : 127]);
    const s = song(withProg(0, 40, part(0, 'Violin', tune, 1, dyn)), withProg(1, 0, part(1, 'rh', tune.map((m) => m + 12), 1, dyn)), withProg(2, 0, part(2, 'lh', tune.map((m) => m - 12), 1, dyn, pedal)));
    expect(s.lines.map((l) => l.program)).toEqual([40, 0, 0]);
    expect(timingPlayers(s)).toEqual([0, 1, 1]);
    const x = express(s);
    expect(x.timed).toBe(true);
    const at = (es: FileEvent[], li: number) => ons(es, li).map((e) => e.t);
    // the hands together to the sample, as written; the violin its own way
    at(x.events, 1).forEach((t, i) => expect(t).toBeCloseTo(at(x.events, 2)[i], 9));
    expect(sd(at(x.events, 0).map((t, i) => t - at(x.events, 1)[i]))).toBeGreaterThan(0.005);
    // each pedal change as far from the right hand's nearest note as it was written (to 6 % of 62 ms)
    const near = (es: FileEvent[]) => es.filter((e) => e.kind === 'pedal').map((p) => Math.min(...at(es, 1).map((t) => Math.abs(t - p.t))));
    const was = near(s.events);
    near(x.events).forEach((d, i) => expect(Math.abs(d - was[i])).toBeLessThan(0.004));
    // two violins next to each other (one program, not a keyboard's) are two players
    const vv = song(withProg(0, 40, part(0, 'Violin I', tune, 1, dyn)), withProg(1, 40, part(1, 'Violin II', tune.map((m) => m - 5), 1, dyn)));
    expect(timingPlayers(vv)).toEqual([0, 1]);
  });

  it('a line’s place moves slowly: under 6 % of the time that passes', () => {
    for (const li of [0, 3, 11]) for (let t = 0; t < 60; t += 0.01) expect(Math.abs(lineLag(li, t + 0.01) - lineLag(li, t))).toBeLessThan(0.06 * 0.01);
  });
});
