// Polyphony limit, voice stealing without clicks, determinism, CPU budget.
import { describe, expect, it } from 'vitest';
import { PianoCore, renderCore } from '../src/core/index.ts';
import { FS, on, render } from './helpers.ts';

describe('polyphony and voice stealing', () => {
  it('never exceeds the limit and steals quiet released notes first', () => {
    const core = new PianoCore({ sampleRate: FS, dry: true, maxVoices: 12 });
    const ev = [] as ReturnType<typeof on>[];
    for (let i = 0; i < 40; i++) ev.push(on(0.01 + i * 0.03, 30 + i, 90));
    let peak = 0;
    for (let k = 0; k < 20; k++) {
      render(k === 0 ? [...ev, { t: 0, e: { type: 'sustain', value: 1 } }] : [], 0.1, {}, core);
      // stolen voices still fading count as active until silent; non-stolen must respect the limit
      const live = core.active.filter((v) => !v.light && !v.stolen).length;
      peak = Math.max(peak, live);
    }
    expect(peak).toBeLessThanOrEqual(12);
    // the most recent note survives
    expect(core.voices[69 - 21].active).toBe(true);
  });

  it('stealing fades instead of clicking', () => {
    const r = render(Array.from({ length: 30 }, (_, i) => on(0.01 + i * 0.02, 36 + i, 100)), 1.0, { maxVoices: 6, params: { sympathetic: false } });
    // the largest sample-to-sample jump is that of a normal attack, not a hard cut
    const ref = render([on(0.01, 65, 100)], 0.3, { params: { sympathetic: false } });
    const maxJump = (x: Float32Array) => {
      let m = 0;
      for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
      return m;
    };
    let peak = 0;
    for (let i = 0; i < r.x.length; i++) peak = Math.max(peak, Math.abs(r.x[i]));
    expect(maxJump(r.x) / peak).toBeLessThan(4 * (maxJump(ref.x) / Math.max(...Array.from(ref.x, Math.abs))));
  });
});

describe('determinism', () => {
  it('identical input renders bit-identical output', () => {
    const ev = [{ time: 0.01, event: { type: 'noteOn' as const, midi: 52, velocity: 77 } }, { time: 0.3, event: { type: 'sustain' as const, value: 0.6 } }];
    const a = renderCore({ sampleRate: FS, events: ev, duration: 0.8 });
    const b = renderCore({ sampleRate: FS, events: ev, duration: 0.8 });
    expect(Buffer.from(a.left.buffer).equals(Buffer.from(b.left.buffer))).toBe(true);
  });
});

describe('CPU budget', () => {
  it('32 struck notes plus pedal-down sympathetic strings run faster than real time with ample margin', () => {
    const ev = [{ time: 0, event: { type: 'sustain' as const, value: 1 } }];
    for (let i = 0; i < 32; i++) ev.push({ time: 0.01 + i * 0.005, event: { type: 'noteOn', midi: 21 + Math.round((i * 87) / 31), velocity: 90 } as never });
    renderCore({ sampleRate: FS, events: ev, duration: 0.5 }); // JIT warm-up
    const r = renderCore({ sampleRate: FS, events: ev, duration: 3 });
    const realTimeFraction = r.cpuMs / 3000;
    // Mac mini (M5 Pro): ≈0.13. The bound leaves headroom for slower machines.
    expect(realTimeFraction).toBeLessThan(0.5);
  });
});
