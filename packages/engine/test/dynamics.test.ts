// CC_DYNAMICS (a file's swells and hairpins within a held note, apps/web/src/expression.ts): a bowed or
// wind note plays on as if begun that many velocity steps harder or softer; at 0 it is the note as begun
// (the same level: an event of any kind starts a new internal block there, so the bow's random wander
// is drawn at other moments), never sent it changes nothing (no file, no event: the golden renders), the
// piano ignores it, and its glide does not depend on the host's block size. CC_REST puts the mod wheel
// back where it was never moved.
import { describe, expect, it } from 'vitest';
import { CC_DYNAMICS, CC_REST, renderInstrument, type InstrumentId } from '../src/core/index.ts';

const FS = 44100;
type Ev = { time: number; event: Record<string, unknown> };
const render = (inst: InstrumentId, events: Ev[], dur = 1.4, quantum = 128) =>
  renderInstrument({ sampleRate: FS, instrument: inst, dry: true, events: events as never, duration: dur, quantum }).left;
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  for (let i = Math.round(a * FS); i < Math.round(b * FS); i++) s += x[i] * x[i];
  return 10 * Math.log10(s / ((b - a) * FS));
};
const same = (a: Float32Array, b: Float32Array) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
};
const note = (m: number, dyn: number | null, at = 0.5): Ev[] => [
  { time: 0.02, event: { type: 'noteOn', midi: m, velocity: 72 } },
  ...(dyn === null ? [] : [{ time: at, event: { type: 'control', cc: CC_DYNAMICS, value: dyn } }]),
];

describe('CC_DYNAMICS: a held note louder or softer', () => {
  it('the bowed strings and the winds: louder up, softer down, nothing at 0, the same before it moves', () => {
    for (const [inst, m] of [['violin', 69], ['cello', 50], ['flute', 74], ['oboe', 74], ['clarinet', 67], ['bassoon', 50], ['horn', 60], ['trombone', 55], ['trumpet', 67]] as const) {
      const none = render(inst, note(m, null));
      const zero = render(inst, note(m, 0));
      const up = render(inst, note(m, 20));
      const down = render(inst, note(m, -20));
      const at = (x: Float32Array) => rmsDb(x, 0.9, 1.35);
      expect(Math.abs(at(zero) - at(none)), inst).toBeLessThan(0.3);
      // (strings ≈ ±4 dB over ±20 steps, as a note begun that much harder would be; winds ≈ ±2 dB)
      expect(at(up) - at(none), inst).toBeGreaterThan(1.2);
      expect(at(none) - at(down), inst).toBeGreaterThan(1.2);
      // untouched before the controller
      expect(Math.abs(rmsDb(up, 0.2, 0.45) - rmsDb(none, 0.2, 0.45)), inst).toBeLessThan(0.05);
    }
  });

  it('back to 0 is the note as begun; the piano, struck, ignores it', () => {
    const v = render('violin', note(69, null), 2.4);
    const up = render('violin', note(69, 25, 0.4), 2.4);
    const back = render('violin', [...note(69, 25, 0.4), { time: 0.9, event: { type: 'control', cc: CC_DYNAMICS, value: 0 } }], 2.4);
    // (the faster bow used more hair: its changes come at other times, a decibel either way)
    const at = (x: Float32Array) => rmsDb(x, 1.5, 2.35);
    expect(Math.abs(at(back) - at(v))).toBeLessThan(1.5);
    expect(at(up) - at(back)).toBeGreaterThan(3);
    expect(same(render('piano', note(60, null)), render('piano', note(60, 30)))).toBe(0);
  });

  it('glides the same at any host block size', () => {
    const ev: Ev[] = [...note(69, 18, 0.3), { time: 0.55, event: { type: 'control', cc: CC_DYNAMICS, value: -12 } }];
    for (const inst of ['violin', 'flute'] as const) {
      const r = [128, 37, 500].map((q) => render(inst, ev, 0.8, q));
      expect(same(r[0], r[1]), inst).toBe(0);
      expect(same(r[0], r[2]), inst).toBe(0);
    }
  });

  it('CC_REST: the mod wheel as if never moved', () => {
    for (const inst of ['cello', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trombone', 'trumpet'] as const) {
      const m = inst === 'cello' || inst === 'bassoon' ? 50 : inst === 'trombone' ? 55 : 67;
      const none = render(inst, note(m, null), 0.8);
      const rest = render(inst, [{ time: 0, event: { type: 'control', cc: 1, value: 0 } }, { time: 0, event: { type: 'control', cc: 1, value: CC_REST } }, ...note(m, null)], 0.8);
      expect(same(none, rest), inst).toBe(0);
    }
  });
});
