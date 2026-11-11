// One player, one note at a time (core/mono.ts): how the seven winds and brass take a file's notes.
// Measured on the bundled pieces (scripts/winds-midi-*.ts; artifacts/realistic-3d/final-symphony/winds-midi):
// nearly every note of a typeset file begins at the instant the last one ends, and before this
//   · a pitch repeated that way was not struck again on six of the seven (the level fell 0–2 dB between the
//     notes: Beethoven's three eighths were one long note);
//   · a note-on written before the last note's off at one instant, or a pitch begun again before its own
//     end, was cut off by that end;
//   · a short note from silence never reached its level (a flute's eighth: 35 dB under the held note), its
//     attack being the long tone's whatever its length.
import { describe, expect, it } from 'vitest';
import { createCore, INSTRUMENT_INFO, type InstrumentId } from '../src/core/index.ts';
import { FASTEST, LICK_MOVE, LICK_REPEAT, MonoKeys, REST, Tongue } from '../src/core/mono.ts';

const FS = 48000;
const WINDS: InstrumentId[] = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone'];
type Ev = { t: number; e: Record<string, unknown> };
const on = (t: number, midi: number, velocity = 84): Ev => ({ t, e: { type: 'noteOn', midi, velocity } });
const off = (t: number, midi: number): Ev => ({ t, e: { type: 'noteOff', midi } });
/** what a file player tells of a note before it sounds */
const see = (t: number, midi: number, dur: number, velocity = 84): Ev => ({ t, e: { type: 'foresee', midi, velocity, dur } });

function play(id: InstrumentId, events: Ev[], seconds: number, block = 128): Float32Array {
  const core = createCore({ sampleRate: FS, instrument: id, dry: true });
  // (in the order given: two events at one instant reach the core in that order)
  for (const ev of events) core.schedule(ev.e, Math.round(ev.t * FS));
  const n = Math.round(seconds * FS);
  const L = new Float32Array(n);
  const bl = new Float32Array(block);
  const br = new Float32Array(block);
  for (let i = 0; i < n; i += block) {
    const len = Math.min(block, n - i);
    core.process(bl, br, len);
    L.set(bl.subarray(0, len), i);
  }
  return L;
}
const rms = (x: Float32Array, t0: number, t1: number): number => {
  let s = 0;
  const a = Math.round(t0 * FS);
  const b = Math.round(t1 * FS);
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));
/** the lowest level (dB, 8 ms windows every 2 ms) over [t0, t1] */
const lowest = (x: Float32Array, t0: number, t1: number): number => {
  let lo = Infinity;
  for (let t = t0; t <= t1; t += 0.002) lo = Math.min(lo, db(rms(x, t - 0.004, t + 0.004)));
  return lo;
};
/** the level at a pitch (its first six harmonics, Hann-windowed) over [t0, t1] */
function at(x: Float32Array, midi: number, t0: number, t1: number): number {
  const f = 440 * 2 ** ((midi - 69) / 12);
  const a = Math.round(t0 * FS);
  const W = Math.round((t1 - t0) * FS);
  let p = 0;
  for (let k = 1; k <= 6; k++) {
    let re = 0;
    let im = 0;
    let sw = 0;
    for (let i = 0; i < W; i++) {
      const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
      re += x[a + i] * h * Math.cos((2 * Math.PI * k * f * i) / FS);
      im += x[a + i] * h * Math.sin((2 * Math.PI * k * f * i) / FS);
      sw += h;
    }
    p += ((2 * Math.hypot(re, im)) / sw) ** 2 / 2;
  }
  return Math.sqrt(p);
}
const mid = (id: InstrumentId) => Math.round((INSTRUMENT_INFO[id].lo + INSTRUMENT_INFO[id].hi) / 2);

describe('the keys as one player takes them (MonoKeys)', () => {
  const keys = () => new MonoKeys(FS);
  it('a note over a held one is slurred; its end, when it is no longer the note playing, changes nothing', () => {
    const k = keys();
    k.on(60, 80);
    expect(k.settle(0, false, false)).toMatchObject({ kind: 'tongue', midi: 60, velocity: 80 });
    k.on(62, 70);
    expect(k.settle(4800, true, false)).toMatchObject({ kind: 'slur', midi: 62, velocity: 70 });
    // the superseded note's end
    k.off(60);
    expect(k.settle(6000, true, false)).toBeNull();
    k.off(62);
    expect(k.settle(9600, true, false)).toMatchObject({ kind: 'release' });
  });
  it('the note playing let go while another is held: back to it, the fingers only', () => {
    const k = keys();
    k.on(60, 80);
    k.settle(0, false, false);
    k.on(64, 80);
    k.settle(4800, true, false);
    k.off(64);
    expect(k.settle(9600, true, false)).toMatchObject({ kind: 'slur', midi: 60, velocity: 0 });
  });
  it('a note begun where the last ends is tongued over the breath, in either order of the two events', () => {
    for (const swapped of [false, true]) {
      const k = keys();
      k.on(60, 80);
      k.settle(0, false, false);
      if (swapped) {
        k.on(62, 80);
        k.off(60);
      } else {
        k.off(60);
        k.on(62, 80);
      }
      expect(k.settle(9600, true, false)).toMatchObject({ kind: 'retongue', midi: 62, tap: false });
      expect(k.any).toBe(true);
    }
  });
  it('a pitch repeated at one instant (its on before its own off, or after) is struck again and stays down', () => {
    for (const swapped of [false, true]) {
      const k = keys();
      k.on(67, 80);
      k.settle(0, false, false);
      if (swapped) {
        k.on(67, 90);
        k.off(67);
      } else {
        k.off(67);
        k.on(67, 90);
      }
      expect(k.settle(9600, true, false)).toMatchObject({ kind: 'retongue', midi: 67, velocity: 90, tap: false });
      expect(k.any).toBe(true);
      k.off(67);
      expect(k.settle(19200, true, false)).toMatchObject({ kind: 'release' });
    }
  });
  it('a pitch struck again while it is held is tongued again; nothing is counted: its end lets it go', () => {
    const k = keys();
    k.on(67, 80);
    k.settle(0, false, false);
    k.on(67, 80);
    expect(k.settle(9600, true, false)).toMatchObject({ kind: 'retongue', midi: 67 });
    k.off(67);
    expect(k.settle(14400, true, false)).toMatchObject({ kind: 'release' });
    expect(k.any).toBe(false);
  });
  it('notes begun together are a chord asked of one player: the highest, whatever their order', () => {
    for (const order of [[60, 64, 67], [67, 60, 64], [64, 67, 60]]) {
      const k = keys();
      for (const m of order) k.on(m, 80);
      expect(k.settle(0, false, false)).toMatchObject({ kind: 'tongue', midi: 67 });
      // let go together, in any order: one release, no way back through the others
      for (const m of order) k.off(m);
      expect(k.settle(9600, true, false)).toMatchObject({ kind: 'release' });
      expect(k.any).toBe(false);
    }
    // a chord after a chord at one instant: tongued, on its top note
    const k = keys();
    for (const m of [60, 64, 67]) k.on(m, 80);
    k.settle(0, false, false);
    for (const m of [60, 64, 67]) k.off(m);
    for (const m of [62, 65, 69]) k.on(m, 80);
    expect(k.settle(9600, true, false)).toMatchObject({ kind: 'retongue', midi: 69 });
  });
  it('a note begun and ended at one instant is a tap: played, then let go', () => {
    const k = keys();
    k.on(60, 80);
    k.off(60);
    expect(k.settle(0, false, false)).toMatchObject({ kind: 'tongue', midi: 60, tap: true });
    expect(k.any).toBe(false);
  });
  it('no tongue is faster than FASTEST: a different note sooner after the last stroke is slurred, a repeat still struck', () => {
    const k = keys();
    k.on(60, 80);
    k.settle(0, false, false);
    const soon = Math.round(0.5 * FASTEST * FS);
    k.off(60);
    k.on(62, 80);
    expect(k.settle(soon, true, false)).toMatchObject({ kind: 'slur', midi: 62 });
    k.off(62);
    k.on(62, 80);
    expect(k.settle(2 * soon - 10, true, false)).toMatchObject({ kind: 'retongue', midi: 62 });
  });
  it('the pedal holds the breath; lifted with no key down, it lets go', () => {
    const k = keys();
    k.on(60, 80);
    k.settle(0, false, false);
    k.off(60);
    expect(k.settle(4800, true, true)).toBeNull();
    k.poke();
    expect(k.settle(9600, true, false)).toMatchObject({ kind: 'release' });
  });
  it('a foreseen note knows its length; a note played by hand does not', () => {
    const k = keys();
    k.foresee(4800, 60, 80, 0.139);
    k.on(60, 80);
    expect(k.settle(4800, false, false)!.len).toBeCloseTo(0.139, 3);
    const h = keys();
    h.on(60, 80);
    expect(h.settle(4800, false, false)!.len).toBe(Infinity);
  });
  it('the stroke for a foreseen note joined to the one sounding begins its contact time ahead of it', () => {
    for (const [next, contact] of [[62, LICK_MOVE], [60, LICK_REPEAT]] as const) {
      const k = keys();
      const T = Math.round(0.5 * FS);
      k.foresee(4800, 60, 80, 0.4);
      k.foresee(4800 + Math.round(0.4 * FS), next, 80, 0.4);
      k.on(60, 80);
      k.settle(4800, false, false);
      const second = 4800 + Math.round(0.4 * FS);
      expect(second).toBe(T - 4800 + 4800);
      const start = second - Math.round(contact * FS);
      // far from it: nothing; near: the block is cut where the stroke begins; there: it begins
      expect(k.plan(start - 10000, 64, true)).toBe(64);
      expect(k.strokeNow).toBe(-1);
      expect(k.plan(start - 20, 64, true)).toBe(20);
      expect(k.plan(start, 64, true)).toBe(64);
      expect(k.strokeNow).toBe(second);
      // the note comes: tongued, its stroke already made
      k.off(60);
      k.on(next, 80);
      expect(k.settle(second, true, false)).toMatchObject({ kind: 'retongue', midi: next, struck: true });
    }
  });
  it('a foreseen note that overlaps the one sounding is a slur: no stroke is planned', () => {
    const k = keys();
    k.foresee(4800, 60, 80, 0.5);
    k.foresee(4800 + Math.round(0.4 * FS), 62, 80, 0.4);
    k.on(60, 80);
    k.settle(4800, false, false);
    for (let f = 4800; f < 4800 + Math.round(0.4 * FS); f += 64) {
      k.plan(f, 64, true);
      expect(k.strokeNow).toBe(-1);
    }
  });
  it('a rest shorter than REST before a foreseen note: the breath is kept, the tongue stops the note until then', () => {
    const k = keys();
    const gap = Math.round(0.5 * REST * FS);
    const end = 4800 + Math.round(0.2 * FS);
    k.foresee(4800, 60, 80, 0.2);
    k.foresee(end + gap, 62, 80, 0.2);
    k.on(60, 80);
    k.settle(4800, false, false);
    k.off(60);
    const a = k.settle(end, true, false)!;
    expect(a.kind).toBe('stop');
    expect(a.len).toBeCloseTo(gap / FS, 4);
    expect(k.silent).toBe(true);
    k.on(62, 80);
    expect(k.settle(end + gap, true, false)).toMatchObject({ kind: 'retongue', midi: 62, struck: true });
    expect(k.silent).toBe(false);
    // a longer rest: the breath is let go
    const l = keys();
    l.foresee(4800, 60, 80, 0.2);
    l.foresee(end + Math.round(2 * REST * FS), 62, 80, 0.2);
    l.on(60, 80);
    l.settle(4800, false, false);
    l.off(60);
    expect(l.settle(end, true, false)).toMatchObject({ kind: 'release' });
  });
  it('the note a rest was held for never comes: the breath is let go (overdue); forgotten: at once', () => {
    const k = keys();
    const end = 4800 + Math.round(0.2 * FS);
    k.foresee(4800, 60, 80, 0.2);
    k.foresee(end + 2400, 62, 80, 0.2);
    k.on(60, 80);
    k.settle(4800, false, false);
    k.off(60);
    expect(k.settle(end, true, false)!.kind).toBe('stop');
    k.plan(end + 2400 + 100, 64, true);
    expect(k.overdue).toBe(false);
    k.plan(end + 2400 + Math.round(0.02 * FS), 64, true);
    expect(k.overdue).toBe(true);
    expect(k.silent).toBe(false);
    const f = keys();
    f.foresee(4800, 60, 80, 0.2);
    f.foresee(end + 2400, 62, 80, 0.2);
    f.on(60, 80);
    f.settle(4800, false, false);
    f.off(60);
    f.settle(end, true, false);
    expect(f.forget()).toBe(true);
    expect(f.forget()).toBe(false);
  });
});

describe('the tongue on a sounding note (Tongue)', () => {
  it('closes, holds and lets go; made ahead, it lets go when its note comes', () => {
    const t = new Tongue();
    expect(t.busy).toBe(false);
    t.stroke(10, 20, 10);
    const o: number[] = [];
    for (let i = 0; i < 45; i++) o.push(t.next());
    expect(o[9]).toBeCloseTo(0, 6);
    expect(Math.max(...o.slice(10, 30))).toBeCloseTo(0, 6);
    expect(o[39]).toBe(1);
    expect(t.busy).toBe(false);
    for (let i = 1; i < 10; i++) expect(o[i]).toBeLessThanOrEqual(o[i - 1]);
    const a = new Tongue();
    a.ahead(FS, 480, 48);
    for (let i = 0; i < 480; i++) a.next();
    expect(a.down).toBe(true);
    expect(a.retongue(true, FS, false, 48)).toBe(0);
    expect(a.down).toBe(false);
    for (let i = 0; i < 48; i++) a.next();
    expect(a.busy).toBe(false);
    expect(a.now).toBe(1);
  });
});

describe('a file’s notes on each wind and brass instrument', () => {
  for (const id of WINDS) {
    const m = mid(id);
    it(`${id}: a pitch repeated with no rest is struck again each time; either order at the instant, the same sound`, () => {
      // four eighths at Beethoven's tempo (139 ms), each ending where the next begins
      const notes = [0, 1, 2, 3].map((i) => ({ t: 0.1 + 0.139 * i, end: 0.1 + 0.139 * (i + 1) }));
      const seen = notes.map((n) => see(n.t, m, n.end - n.t));
      const offFirst = [...seen, ...notes.flatMap((n) => [off(n.t, m), on(n.t, m)]).slice(1), off(notes[3].end, m)];
      const onFirst = [...seen, ...notes.flatMap((n) => [on(n.t, m), off(n.t, m)]).filter((_, i) => i !== 1), off(notes[3].end, m)];
      const a = play(id, offFirst, 1.4);
      const b = play(id, onFirst, 1.4);
      // (a note-on written before the last note's off at one instant used to end the new note at once)
      let same = true;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) same = false;
      expect(same).toBe(true);
      // each repeat: the level falls between the notes and comes back (before: 0–2 dB on all but the clarinet)
      for (let i = 1; i < 4; i++) {
        const body = Math.min(db(rms(a, notes[i - 1].t + 0.06, notes[i - 1].t + 0.11)), db(rms(a, notes[i].t + 0.06, notes[i].t + 0.11)));
        expect(body - lowest(a, notes[i].t - 0.03, notes[i].t + 0.03), `repeat ${i}`).toBeGreaterThan(3);
      }
      // every note is there (the last as loud as the second: nothing cut), and nothing sounds on after
      expect(db(rms(a, notes[3].t + 0.06, notes[3].t + 0.13)) - db(rms(a, notes[1].t + 0.06, notes[1].t + 0.13))).toBeGreaterThan(-4);
      expect(db(rms(a, 1.25, 1.4))).toBeLessThan(db(rms(a, notes[1].t + 0.06, notes[1].t + 0.13)) - 40);
    });

    it(`${id}: a note begun over the last is slurred, and the last note's end does not cut it`, () => {
      // a second above, begun 30 ms before the first is let go; then held
      const x = play(id, [on(0.1, m), on(0.5, m + 2), off(0.53, m), off(1.0, m + 2)], 1.6);
      // no stroke at the join: the level never falls 6 dB under the notes around it (a slur). On the brass
      // the lips find the new partial, and the trombone's slide is covered by its soft tongue: no such claim
      const around = Math.min(db(rms(x, 0.4, 0.48)), db(rms(x, 0.62, 0.7)));
      if (id !== 'trumpet' && id !== 'trombone') expect(around - lowest(x, 0.48, 0.6)).toBeLessThan(6);
      // the second note sounds, at its pitch, to its own end
      expect(db(at(x, m + 2, 0.85, 0.98)) - db(at(x, m + 2, 0.62, 0.75))).toBeGreaterThan(-3);
      expect(at(x, m + 2, 0.7, 0.95)).toBeGreaterThan(2 * at(x, m, 0.7, 0.95));
      expect(db(rms(x, 1.45, 1.6))).toBeLessThan(db(rms(x, 0.7, 0.95)) - 40);
    });

    it(`${id}: a chord asked of it is its top note, and its notes let go in any order leave no other pitch behind`, () => {
      const chord = [m - 3, m, m + 4];
      // sample for sample what the top note alone is, in whatever order the chord is written and let go
      // (the last note written used to be the one played, after a glide through the others; and the top
      // note let go first handed the tail to the note under it)
      const alone = play(id, [on(0.1, chord[2]), off(0.7, chord[2])], 1.2);
      for (const order of [[0, 1, 2], [2, 0, 1], [1, 2, 0]]) {
        const x = play(id, [...order.map((i) => on(0.1, chord[i])), ...[...order].reverse().map((i) => off(0.7, chord[i]))], 1.2);
        let same = true;
        for (let i = 0; i < x.length; i++) if (x[i] !== alone[i]) same = false;
        expect(same, `written ${order.join(' ')}`).toBe(true);
      }
      expect(at(alone, chord[2], 0.4, 0.65)).toBeGreaterThan(0);
    });

    it(`${id}: a short note of a file speaks (its length foreseen); the same key in the hand keeps the long tone's attack`, () => {
      // one eighth from silence, against the same note held
      const heldNote = play(id, [on(0.1, m), off(1.1, m)], 1.3);
      const level = db(at(heldNote, m, 0.6, 1.0));
      const file = play(id, [see(0.1, m, 0.139), on(0.1, m), off(0.239, m)], 0.8);
      // (the flute's reached −35 dB of it, the others −4…−20)
      expect(db(at(file, m, 0.155, 0.235)) - level).toBeGreaterThan(-6);
      // by hand: bit for bit what it is without anything foreseen having been said and forgotten
      const hand = play(id, [on(0.1, m), off(0.239, m)], 0.8);
      const core = createCore({ sampleRate: FS, instrument: id, dry: true });
      core.schedule({ type: 'foresee', midi: m, velocity: 84, dur: 0.139 }, Math.round(0.1 * FS));
      (core as unknown as { forget(): void }).forget();
      core.schedule({ type: 'noteOn', midi: m, velocity: 84 }, Math.round(0.1 * FS));
      core.schedule({ type: 'noteOff', midi: m }, Math.round(0.239 * FS));
      const L = new Float32Array(hand.length);
      const bl = new Float32Array(128);
      const br = new Float32Array(128);
      for (let i = 0; i < L.length; i += 128) {
        const len = Math.min(128, L.length - i);
        core.process(bl, br, len);
        L.set(bl.subarray(0, len), i);
      }
      let same = true;
      for (let i = 0; i < L.length; i++) if (L[i] !== hand[i]) same = false;
      expect(same).toBe(true);
    });

    it(`${id}: detached notes of a file (rests shorter than the breath is let go for) are stopped by the tongue and all sound; left waiting, the breath is let go`, () => {
      // 100 ms notes, 60 ms rests
      const notes = [0, 1, 2, 3].map((i) => ({ t: 0.1 + 0.16 * i, end: 0.2 + 0.16 * i, midi: m + [0, 2, 4, 2][i] }));
      const ev = [...notes.map((n) => see(n.t, n.midi, n.end - n.t)), ...notes.flatMap((n) => [on(n.t, n.midi), off(n.end, n.midi)])];
      const x = play(id, ev, 1.6);
      const levels = notes.map((n) => db(at(x, n.midi, n.t + 0.04, n.end)));
      // every note is there (none more than 9 dB under the loudest), and the rests are rests (a horn's long
      // tube rings on longest: 5 dB down 30–50 ms after the tongue; the woodwinds are 20 and more)
      for (const l of levels) expect(l).toBeGreaterThan(Math.max(...levels) - 9);
      for (let i = 0; i < 3; i++) expect(db(rms(x, notes[i].end + 0.03, notes[i].end + 0.05))).toBeLessThan(db(rms(x, notes[i + 1].t + 0.05, notes[i + 1].end)) - 3);
      // the host's block size changes nothing (strokes made ahead cut the core's own blocks)
      for (const block of [37, 500]) {
        const y = play(id, ev, 1.6, block);
        let same = true;
        for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) same = false;
        expect(same, `${block} frames a call`).toBe(true);
      }
      // the last note told of never arrives (the file stopped without saying so): no note hangs
      const cut = play(id, [...ev.filter((e) => e.t < notes[3].t - 1e-9 || e.e.type === 'foresee')], 1.6);
      expect(db(rms(cut, 1.3, 1.6))).toBeLessThan(db(rms(cut, notes[2].t + 0.05, notes[2].end)) - 40);
    });
  }
});
