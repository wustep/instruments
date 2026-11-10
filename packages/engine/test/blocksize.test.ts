// The host's block size must not change the sound: cores render their own blocks (Pump), and
// dragging a control (the room's edge) must glide, not click.
import { describe, expect, it } from 'vitest';
import { createCore, renderInstrument, type InstrumentId } from '../src/core/index.ts';

const FS = 48000;
describe('host block size', () => {
  for (const inst of ['piano', 'violin', 'bass', 'flute', 'trumpet'] as InstrumentId[]) {
    it(`${inst}: the same samples at 128, 37 and 500 frames per call`, () => {
      const m = inst === 'piano' ? 60 : inst === 'bass' ? 40 : 72;
      const events = [
        { time: 0.013, event: { type: 'noteOn', midi: m, velocity: 90 } },
        { time: 0.2371, event: { type: 'noteOff', midi: m } },
      ];
      const r = [128, 37, 500].map((quantum) => renderInstrument({ instrument: inst, sampleRate: FS, events: events as never, duration: 0.35, quantum, dry: true } as never).left);
      let pk = 0;
      for (const v of r[0]) pk = Math.max(pk, Math.abs(v));
      expect(pk).toBeGreaterThan(1e-4);
      for (const other of [r[1], r[2]]) {
        let d = 0;
        for (let i = 0; i < other.length; i++) d = Math.max(d, Math.abs(other[i] - r[0][i]));
        expect(d).toBe(0);
      }
    });
  }
});

describe('control changes do not click', () => {
  /** the loudest 2 ms of high frequencies (2nd difference) between 0.3 and 0.7 s */
  function hfMax(inst: InstrumentId, from: number, to: number): number {
    const core = createCore({ instrument: inst, sampleRate: FS } as never);
    core.setParams({ room: from });
    core.schedule({ type: 'noteOn', midi: 72, velocity: 80 }, core.frame + 100);
    const n = Math.round(0.75 * FS);
    const x = new Float32Array(n);
    const L = new Float32Array(128);
    const R = new Float32Array(128);
    for (let i = 0; i < n; i += 128) {
      const t = i / FS;
      // a drag: a new value every ~10 ms, as pointer events arrive
      if (t >= 0.3 && t < 0.7 && (i / 128) % 4 === 0) core.setParams({ room: from + ((to - from) * (t - 0.3)) / 0.4 });
      core.process(L, R, 128);
      x.set(L.subarray(0, Math.min(128, n - i)), i);
    }
    let m = -Infinity;
    for (let i = Math.round(0.3 * FS); i + 96 < Math.round(0.7 * FS); i += 96) {
      let s = 0;
      for (let j = 0; j < 96; j++) {
        const d = x[i + j] - 2 * x[i + j - 1] + x[i + j - 2];
        s += d * d;
      }
      m = Math.max(m, 10 * Math.log10(s / 96 + 1e-30));
    }
    return m;
  }
  it('dragging the room from small to hall (flute): no louder than either setting held still', () => {
    const drag = hfMax('flute', 0.2, 0.9);
    const still = Math.max(hfMax('flute', 0.2, 0.2), hfMax('flute', 0.9, 0.9));
    expect(drag - still).toBeLessThan(6); // was +16.6 dB (now ~3): every step jumped the reverb's delays
  });
});
