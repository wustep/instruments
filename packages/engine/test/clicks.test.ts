// The audio audit (Nov 2026, artifacts/realistic-3d/final-symphony/audio-audit): no one-sample jump
// where a note begins or a controller moves. A wind's attack reaches the output through its bore over
// milliseconds, so its steepest step at an event is the tone's own; a value the model switches in one
// step (a filter's coefficients, a drive read once a block into a differentiated flow) shows as a
// step many times the tone's, on the event's own sample (the core's blocks are cut there). Measured:
// the largest |x[i] − x[i−1]| from −0.2 to +0.3 ms of each event over the 99th percentile of the steps
// in the 50 ms either side (2 ms left out); the attack's own first pulses come later.
import { describe, expect, it } from 'vitest';
import { renderInstrument } from '../src/core/index.ts';

type Ev = { time: number; event: Record<string, unknown> };
const on = (time: number, midi: number, velocity: number): Ev => ({ time, event: { type: 'noteOn', midi, velocity } });
const off = (time: number, midi: number): Ev => ({ time, event: { type: 'noteOff', midi } });

function worstJump(L: Float32Array, fs: number, events: Ev[]): number {
  let worst = 0;
  for (const e of events) {
    const c = Math.round(e.time * fs);
    let j = 0;
    for (let i = c - Math.round(0.0002 * fs); i < c + Math.round(0.0003 * fs); i++) j = Math.max(j, Math.abs(L[i] - L[i - 1]));
    const around: number[] = [];
    for (let i = c - Math.round(0.05 * fs); i < c + Math.round(0.05 * fs); i++) if (Math.abs(i - c) > Math.round(0.002 * fs) && i > 0 && i < L.length) around.push(Math.abs(L[i] - L[i - 1]));
    around.sort((a, b) => a - b);
    const ref = around[Math.floor(0.99 * (around.length - 1))];
    if (j > 1e-5) worst = Math.max(worst, j / Math.max(ref, 1e-6));
  }
  return worst;
}

/** notes repeated at alternating dynamics, each over the last one's tail: [midi, count] */
function repeats(groups: [number, number][]): { events: Ev[]; end: number } {
  const events: Ev[] = [];
  let t = 0.1;
  for (const [m, k] of groups)
    for (let i = 0; i < k; i++) {
      events.push(on(t, m, i % 2 ? 84 : 104), off(t + 0.085, m));
      t += 0.12;
    }
  return { events, end: t };
}

describe('no click where a note begins or a controller moves', () => {
  for (const fs of [44100, 48000]) {
    it(`flute: new notes, a repeated note, a mod-wheel step (${fs} Hz)`, () => {
      // the jet's drive, gain and offset were read once a block into the flow q, whose derivative is
      // radiated: 9.8× (44.1 kHz) and 14.1× (48 kHz) the tone's own steepest step
      const events: Ev[] = [];
      let t = 0.1;
      for (const m of [62, 64, 66, 68]) {
        events.push(on(t, m, 72), off(t + 0.4, m));
        t += 0.6;
      }
      const r = repeats([[65, 6]]);
      events.push(...r.events.map((e) => ({ ...e, time: e.time + t })));
      t += r.end + 0.3;
      events.push(on(t, 72, 64), { time: t + 0.3, event: { type: 'control', cc: 1, value: 40 / 127 } }, off(t + 0.6, 72));
      const x = renderInstrument({ sampleRate: fs, instrument: 'flute', events: events as never, duration: t + 0.8, dry: true });
      expect(worstJump(x.left, fs, events)).toBeLessThan(1.8);
    });
    it(`trombone: re-tongued at another dynamic (${fs} Hz)`, () => {
      // the brightness corner (velocity and note) was switched in one step: 4.7× and 6.8×
      const { events, end } = repeats([[72, 6], [53, 6]]);
      const x = renderInstrument({ sampleRate: fs, instrument: 'trombone', events: events as never, duration: end + 0.4, dry: true });
      expect(worstJump(x.left, fs, events)).toBeLessThan(1.8);
    });
    it(`bassoon: a leap of two octaves over the last note's tail (${fs} Hz)`, () => {
      // the same corner, moved by the note: 2.7× (44.1 kHz) and 1.8× (48 kHz)
      const { events, end } = repeats([[39, 4], [71, 4]]);
      const x = renderInstrument({ sampleRate: fs, instrument: 'bassoon', events: events as never, duration: end + 0.4, dry: true });
      expect(worstJump(x.left, fs, events)).toBeLessThan(1.8);
    });
    it(`timpani: drums retuned while they ring (${fs} Hz)`, () => {
      // a ringing head was cleared in one sample when its drum took another note: 9.2× and 10.0×
      const events: Ev[] = [];
      let t = 0.1;
      for (const m of [45, 47, 49, 51, 52, 54, 52, 51, 49, 47]) {
        events.push(on(t, m, 110));
        t += 0.15;
      }
      t += 0.5;
      for (const m of [38, 40, 42, 44, 46]) {
        events.push(on(t, m, 28));
        t += 0.6;
      }
      const x = renderInstrument({ sampleRate: fs, instrument: 'timpani', events: events as never, duration: t + 0.5, dry: true });
      expect(worstJump(x.left, fs, events)).toBeLessThan(1.8);
    });
  }
});
