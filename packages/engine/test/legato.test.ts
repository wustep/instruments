// A woodwind going from one note to the next (scripts/winds-legato.ts measures every pair of the compass;
// this keeps the cases that were wrong).
//
// The flute across its register breaks (C♯5 | D5 and C♯6 | D6): a note joined to one of another register
// used to come 50–140 ms late, behind a hole of 10–20 dB, often after the octave below or the twelfth above
// had sounded first (the new tube's other modes, which the old note's wave had fed). Now the tube's wave goes
// with the note (flute.ts CARRY): the note is there within a key's travel, slurred, tongued or after a short
// rest, told ahead or by hand, and nothing is heard that is neither note.
//
// A fresh note that a file told of has its fingering's vent from its first sample (flute.ts VENT): a short
// note of the third register no longer sounds a second mode beside its own.
//
// The vibrato belongs to the breath, not to each note of it: a slurred note (the flute) or one tongued over
// the breath (the flute and the reeds) no longer begins it again.
import { describe, expect, it } from 'vitest';
import { createCore, renderInstrument, type InstrumentId } from '../src/core/index.ts';
import { cents, et, measureJoin, med, pairEvents, trackFrames, type Join } from '../../../scripts/winds-legato-lib.ts';

const FS = 48000;

function join(from: number, to: number, art: Join, vel: number, len: number, hand: boolean, fs = FS) {
  const { events, t0, t1, end } = pairEvents(from, to, art, vel, len, hand);
  const r = renderInstrument({ instrument: 'flute', sampleRate: fs, events, duration: end + 0.1, dry: true });
  return measureJoin(r.left, fs, from, to, t0, t1, end).m;
}

describe('the flute across its register breaks', () => {
  // up and down across both breaks: a step at the break, a leap over it, the same fingering's octave
  const PAIRS: [number, number][] = [[73, 74], [74, 73], [69, 76], [76, 69], [65, 77], [77, 65], [85, 86], [86, 85], [81, 88], [88, 84], [72, 86], [91, 79]];

  it('a slur arrives within a key’s travel, with no hole and on no other register', () => {
    for (const [from, to] of PAIRS)
      for (const vel of [44, 100]) {
        const m = join(from, to, 'slur', vel, 0.15, false);
        const what = `${from}→${to} v${vel}: ${JSON.stringify(m)}`;
        // (it took 46–103 ms, the median of each kind of crossing, and up to the whole note)
        expect(m.speakMs, what).toBeLessThanOrEqual(20);
        expect(m.crackMs, what).toBeLessThanOrEqual(3);
        expect(m.betweenMs, what).toBeLessThanOrEqual(12);
        // (the hole was 7–12 dB at the median; a slur within a register has none)
        expect(m.dipDb, what).toBeGreaterThan(-4);
        expect(m.jump, what).toBeLessThan(2);
        expect(Math.abs(m.offCents), what).toBeLessThan(8);
      }
  });

  it('tongued, after a short rest, and by hand: the same', () => {
    for (const [from, to] of PAIRS)
      for (const [art, hand] of [['join', false], ['gap', false], ['slur', true], ['join', true]] as [Join, boolean][]) {
        const m = join(from, to, art, 80, 0.2, hand);
        const what = `${from}→${to} ${art}${hand ? ' by hand' : ''}: ${JSON.stringify(m)}`;
        // (by hand the note before is still coming up when it is left, 250 ms in: a long tone's attack)
        expect(m.speakMs, what).toBeLessThanOrEqual(hand ? 60 : 25);
        expect(m.crackMs, what).toBeLessThanOrEqual(5);
        expect(m.jump, what).toBeLessThan(2);
      }
  });

  it('at 44.1 and 96 kHz too', () => {
    for (const fs of [44100, 96000])
      for (const [from, to] of [[73, 74], [69, 76], [86, 85], [77, 65]] as [number, number][]) {
        const m = join(from, to, 'slur', 80, 0.15, false, fs);
        const what = `${fs} ${from}→${to}: ${JSON.stringify(m)}`;
        expect(m.speakMs, what).toBeLessThanOrEqual(20);
        expect(m.crackMs, what).toBeLessThanOrEqual(3);
        expect(m.dipDb, what).toBeGreaterThan(-4);
      }
  });

  it('whatever the host’s block: the same samples at 128, 37 and 500 frames a call', () => {
    for (const [from, to, art] of [[73, 74, 'slur'], [69, 76, 'join'], [88, 84, 'gap'], [77, 65, 'slur']] as [number, number, Join][]) {
      const { events, end } = pairEvents(from, to, art, 80, 0.2, false);
      const [a, b, c] = [128, 37, 500].map((quantum) => renderInstrument({ instrument: 'flute', sampleRate: FS, events, duration: end + 0.2, quantum }));
      let d = 0;
      for (let i = 0; i < a.left.length; i++) d = Math.max(d, Math.abs(a.left[i] - b.left[i]), Math.abs(a.left[i] - c.left[i]), Math.abs(a.right[i] - b.right[i]), Math.abs(a.right[i] - c.right[i]));
      expect(d, `${from}→${to} ${art}`).toBe(0);
    }
  });

  it('within a register nothing has changed: a slur glides, in 20 ms, with no hole', () => {
    for (const [from, to] of [[67, 69], [72, 65], [76, 79], [84, 81], [88, 91]] as [number, number][]) {
      const m = join(from, to, 'slur', 80, 0.15, false);
      const what = `${from}→${to}: ${JSON.stringify(m)}`;
      expect(m.speakMs, what).toBeLessThanOrEqual(20);
      expect(m.dipDb, what).toBeGreaterThan(-2);
    }
  });
});

describe('a fresh note a file told of, fingered with a vent', () => {
  it('a short note of the third register is on its own pitch, and periodic, over its second half', () => {
    // (they sounded a second mode of their tube beside their own for 100 ms and more: 40–180 ¢ sharp, half
    // periodic; E♭6 pp at 44.1 kHz stayed a fourth high. flute.ts VENT)
    for (const [fs, m, vel, len] of [[48000, 89, 80, 0.14], [48000, 89, 30, 0.14], [48000, 91, 60, 0.14], [48000, 74, 30, 0.14], [48000, 87, 100, 0.28], [44100, 87, 30, 0.28], [44100, 87, 44, 0.28], [44100, 96, 118, 0.14]] as [number, number, number, number][]) {
      const events = [{ time: 0.1, event: { type: 'foresee', midi: m, velocity: vel, dur: len } }, { time: 0.1, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 0.1 + len, event: { type: 'noteOff', midi: m } }];
      const r = renderInstrument({ instrument: 'flute', sampleRate: fs, events: events as never, duration: len + 0.2, dry: true });
      const fr = trackFrames(r.left, fs, 0.1 + 0.5 * len, 0.1 + 0.95 * len, et(m), et(m), 0.003);
      const off = med(fr.map((q) => cents(q.f, et(m))));
      const clear = med(fr.map((q) => q.clear));
      expect(Math.abs(off), `${fs} ${m} v${vel} ${len}: ${off} ¢`).toBeLessThan(25);
      expect(clear, `${fs} ${m} v${vel} ${len}: periodic ${clear}`).toBeGreaterThan(0.9);
    }
  });
});

describe('the vibrato belongs to the breath', () => {
  /** the vibrato's swing (the largest |deviation| of the breath) over a stretch of seconds, read from the
   *  stage's telemetry every 5 ms */
  function swings(inst: InstrumentId, events: { t: number; e: unknown }[], spans: [number, number][]): number[] {
    const core = createCore({ instrument: inst, sampleRate: FS, dry: true, params: { vibrato: 0.06 } } as never);
    for (const ev of events) core.schedule(ev.e, Math.round(ev.t * FS));
    const out = spans.map(() => 0);
    const L = new Float32Array(240);
    const R = new Float32Array(240);
    const end = Math.max(...spans.map((s) => s[1]));
    for (let t = 0; t < end; t += 0.005) {
      core.process(L, R, 240);
      const v = Math.abs((core.getVisual(8) as { breath: { vib: number } }).breath.vib);
      spans.forEach(([a, b], i) => {
        if (t >= a && t < b && v > out[i]) out[i] = v;
      });
    }
    return out;
  }
  const on = (t: number, midi: number) => ({ t, e: { type: 'noteOn', midi, velocity: 80 } });
  const off = (t: number, midi: number) => ({ t, e: { type: 'noteOff', midi } });

  it('the flute: a slurred note and one tongued over the breath keep it; a new breath begins it again', () => {
    // 1 s of a note (the vibrato is at its depth from 0.7 s), then a slur, then a note tongued over the breath
    // (it begins where the last ends), then a rest and a new note
    const [held, slurred, tongued, fresh] = swings(
      'flute',
      [on(0.05, 67), on(1.05, 69), off(1.08, 67), off(1.6, 69), on(1.6, 71), off(2.1, 71), on(2.6, 72), off(3.4, 72)],
      [[0.8, 1.05], [1.1, 1.35], [1.65, 1.9], [2.62, 2.85]],
    );
    expect(held).toBeGreaterThan(0.05);
    // (each used to begin again at nothing: under 0.001 for its first 0.3 s)
    expect(slurred).toBeGreaterThan(0.05);
    expect(tongued).toBeGreaterThan(0.05);
    expect(fresh).toBeLessThan(0.001);
  });

  it('the oboe and the bassoon: a note tongued over the breath keeps it', () => {
    for (const [inst, m] of [['oboe', 67], ['bassoon', 48]] as [InstrumentId, number][]) {
      const [held, tongued, fresh] = swings(inst, [on(0.05, m), off(1.05, m), on(1.05, m + 2), off(1.6, m + 2), on(2.1, m + 4), off(2.9, m + 4)], [[0.8, 1.05], [1.1, 1.35], [2.12, 2.35]]);
      expect(held, inst).toBeGreaterThan(0.05);
      expect(tongued, inst).toBeGreaterThan(0.05);
      expect(fresh, inst).toBeLessThan(0.001);
    }
  });
});
