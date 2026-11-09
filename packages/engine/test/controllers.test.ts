// MIDI-style controllers: pitch bend moves the strings and the flute (not the struck
// piano), and the mod wheel / expression presses the bow into the string.
import { describe, expect, it } from 'vitest';
import { renderInstrument } from '../src/core/index.ts';
import { analyzeSustained, segmentNotes } from '../src/analysis/index.ts';

const FS = 44100;
type Ev = { time: number; event: Record<string, unknown> };
const renderCore = (instrument: string, events: Ev[], dur = 1.6) => renderInstrument({ sampleRate: FS, instrument: instrument as never, dry: true, params: { vibrato: 0 } as never, events: events as never, duration: dur });
const render = (instrument: string, events: Ev[], dur = 1.6) => {
  const r = renderCore(instrument, events, dur);
  const x = new Float32Array(r.left.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (r.left[i] + r.right[i]);
  return x;
};
const centsOf = (x: Float32Array, midi: number) => {
  const seg = segmentNotes(x, FS).reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  return analyzeSustained(x, FS, seg, midi).cents;
};
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  for (let i = Math.round(a * FS); i < Math.round(b * FS); i++) s += x[i] * x[i];
  return 10 * Math.log10(s / ((b - a) * FS));
};

describe('controllers', () => {
  it('pitch bend: +1 semitone on violin and flute, nothing on the piano', () => {
    const note = (m: number, bend: number): Ev[] => [
      { time: 0.0, event: { type: 'bend', value: bend } },
      { time: 0.1, event: { type: 'noteOn', midi: m, velocity: 80 } },
      { time: 1.7, event: { type: 'noteOff', midi: m } },
    ];
    for (const [inst, m] of [['violin', 69], ['flute', 72]] as const) {
      const flat = centsOf(render(inst, note(m, 0), 2.2), m);
      // analysed against the semitone above (the analysis only looks ±80 ¢ around a note)
      const bent = 100 + centsOf(render(inst, note(m, 1), 2.2), m + 1);
      expect(bent - flat, inst).toBeGreaterThan(90);
      expect(bent - flat, inst).toBeLessThan(110);
    }
    const p0 = centsOf(render('piano', note(69, 0), 2.2), 69);
    const p1 = centsOf(render('piano', note(69, 1), 2.2), 69);
    expect(Math.abs(p1 - p0)).toBeLessThan(0.5);
  });

  it('mod wheel / expression presses the bow: more force and a brighter tone, while the note is held', () => {
    const ev = (v: number): Ev[] => [
      { time: 0.02, event: { type: 'noteOn', midi: 62, velocity: 80 } },
      { time: 0.8, event: { type: 'control', cc: 1, value: v } },
    ];
    const lo = renderCore('cello', ev(0.05), 1.6);
    const hi = renderCore('cello', ev(1), 1.6);
    const fBow = (r: typeof lo) => Math.max(...(r.core as unknown as { strings: { fBow: number }[] }).strings.map((s) => s.fBow));
    // the force on the string follows the controller (×0.36 vs ×1.5 of what the note asked for)
    expect(fBow(hi) / fBow(lo)).toBeGreaterThan(3);
    // same before the controller moves; brighter (more upper harmonics) after
    const a = (r: typeof lo) => analyzeSustained(r.left, FS, { start: Math.round(1.1 * FS), end: Math.round(1.55 * FS) }, 62).centroid;
    expect(Math.abs(rmsDb(lo.left, 0.4, 0.75) - rmsDb(hi.left, 0.4, 0.75))).toBeLessThan(0.5);
    // (Schelleng: brighter with force. The cello's bow of finite width keeps D4 in Helmholtz motion
    // at both ends, where the centroid rises ~9 % over the controller's ×0.36 … ×1.5)
    expect(a(hi) / a(lo)).toBeGreaterThan(1.05);
  });
});
