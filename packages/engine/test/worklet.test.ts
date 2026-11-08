// The AudioWorklet processor itself, in Node, inside a fake AudioWorkletGlobalScope: what the main
// thread is promised (ready, sounding, stats and visual frames, watched keys) and what happens
// when things go wrong (a constructor that throws, a process() that throws), without a browser.
import { beforeAll, describe, expect, it } from 'vitest';

class FakePort {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  sent: any[] = [];
  postMessage(m: unknown): void {
    this.sent.push(m);
  }
  deliver(m: unknown): void {
    this.onmessage?.({ data: m });
  }
}
type Proc = { port: FakePort; process(i: unknown, o: Float32Array[][]): boolean };
let Ctor: new (o: unknown) => Proc;
const g = globalThis as any;

beforeAll(async () => {
  g.sampleRate = 48000;
  g.currentFrame = 0;
  g.AudioWorkletProcessor = class {
    port = new FakePort();
  };
  g.registerProcessor = (name: string, c: typeof Ctor) => {
    if (name === 'piano-model') Ctor = c;
  };
  await import('../src/worklet/processor.ts');
});

function run(p: Proc, quanta: number): { peak: number; out: Float32Array } {
  const L = new Float32Array(128);
  const R = new Float32Array(128);
  const out = new Float32Array(quanta * 128);
  let peak = 0;
  for (let q = 0; q < quanta; q++) {
    expect(p.process([], [[L, R]])).toBe(true);
    out.set(L, q * 128);
    for (const v of L) peak = Math.max(peak, Math.abs(v));
    g.currentFrame += 128;
  }
  return { peak, out };
}
const of = (p: Proc, type: string) => p.port.sent.filter((m) => m.type === type);

describe('AudioWorklet processor (fake global scope)', () => {
  it('registers, builds the flute, says ready, plays, reports what sounds and its stats', () => {
    expect(Ctor).toBeTypeOf('function');
    const p = new Ctor({ processorOptions: { instrument: 'flute' } });
    const ready = of(p, 'ready')[0];
    expect(ready).toMatchObject({ type: 'ready', sampleRate: 48000, instrument: 'flute' });
    p.port.deliver({ type: 'event', event: { type: 'noteOn', midi: 72, velocity: 90 } });
    const { peak } = run(p, 120);
    expect(peak).toBeGreaterThan(1e-3);
    expect(of(p, 'sounding').at(-1).notes).toEqual([72]);
    expect(of(p, 'stats').length).toBeGreaterThan(5); // ~30 a second
    p.port.deliver({ type: 'event', event: { type: 'noteOff', midi: 72 } });
    run(p, 4);
    expect(of(p, 'sounding').at(-1).notes).toEqual([]);
  });

  it('visual frames when asked; the piano streams a watched key', () => {
    const p = new Ctor({ processorOptions: { instrument: 'piano' } });
    expect(of(p, 'ready').length).toBe(1);
    p.port.deliver({ type: 'vis', enabled: true });
    p.port.deliver({ type: 'watch', midi: 60 });
    p.port.deliver({ type: 'event', event: { type: 'noteOn', midi: 60, velocity: 100 } });
    run(p, 60);
    const v = of(p, 'visual').at(-1);
    expect(v.watch.midi).toBe(60);
    expect(v.watch.held).toBe(true);
    expect(v.watch.strike.vHammer).toBeGreaterThan(0.5);
    expect(v.pianoShapes.midi).toContain(60);
  });

  it('a constructor that fails says why and outputs silence', () => {
    const p = new Ctor({ processorOptions: { instrument: 'piano', maxVoices: Number.NaN, params: { stringStiffness: Number.NaN }, designs: [{ key: 'bad', b: null }] } });
    const err = of(p, 'error');
    const ready = of(p, 'ready');
    // either it was built (then it must play) or it said why; never neither
    expect(err.length + ready.length).toBe(1);
    if (err.length) {
      expect(err[0].message).toMatch(/could not be built/);
      expect(run(p, 2).peak).toBe(0);
    }
  });

  it('a process() that throws latches: one error, then silence (no crash loop)', () => {
    const p = new Ctor({ processorOptions: { instrument: 'flute' } });
    p.port.deliver({ type: 'event', event: { type: 'noteOn', midi: 72, velocity: 90 } });
    run(p, 10);
    (p as any).core.process = () => {
      throw new Error('boom');
    };
    const { peak } = run(p, 5);
    expect(peak).toBe(0);
    const errs = of(p, 'error');
    expect(errs.length).toBe(1);
    expect(errs[0].message).toMatch(/boom/);
  });
});
