// The AudioWorklet processor itself, in Node, inside a fake AudioWorkletGlobalScope: what the main
// thread is promised (ready, sounding, stats and visual frames, watched keys) and what happens
// when things go wrong (a constructor that throws, a process() that throws), without a browser.
import { beforeAll, describe, expect, it } from 'vitest';
import { computeDesigns } from '../src/core/precompute.ts';
import type { DesignEntry } from '../src/core/voice.ts';

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

  it('a page that starts on a one-voice instrument still gives the piano its polyphony', () => {
    for (const first of ['trumpet', 'flute', 'cello']) {
      const p = new Ctor({ processorOptions: { instrument: first } });
      run(p, 130); // past one load window: the adaptive polyphony must not lift a wind above its one voice
      expect(of(p, 'stats').at(-1).maxVoices, first).toBe(first === 'cello' ? 4 : 1);
      p.port.deliver({ type: 'instrument', instrument: 'piano' });
      for (const midi of [60, 64, 67, 72]) p.port.deliver({ type: 'event', event: { type: 'noteOn', midi, velocity: 90 } });
      run(p, 30);
      const st = of(p, 'stats').at(-1);
      expect(st.instrument).toBe('piano');
      expect(st.maxVoices, `after ${first}`).toBe(64);
      expect(of(p, 'sounding').at(-1).notes, `after ${first}`).toEqual([60, 64, 67, 72]);
    }
    // a requested polyphony survives the round trip, and a session that starts on the piano is as before
    const q = new Ctor({ processorOptions: { instrument: 'trumpet', maxVoices: 24 } });
    q.port.deliver({ type: 'instrument', instrument: 'piano' });
    run(q, 30);
    expect(of(q, 'stats').at(-1).maxVoices).toBe(24);
    const r = new Ctor({ processorOptions: { instrument: 'piano' } });
    run(r, 30);
    expect(of(r, 'stats').at(-1).maxVoices).toBe(64);
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

// An engine the main thread has done with (an instrument taken off an Orchestra's stage, a retry's old
// engine) used to be disconnected and no more: its processor went on rendering for ever, since process()
// returning true keeps a node alive. Told so, it stops: silence, and process() returns false, which lets
// the browser stop calling it.
describe('an engine disposed of stops rendering', () => {
  it('process() returns false and gives silence; nothing sent to it afterwards is acted on', () => {
    for (const instrument of ['cello', 'piano', 'flute']) {
      const p = new Ctor({ processorOptions: { instrument } });
      p.port.deliver({ type: 'event', event: { type: 'noteOn', midi: 60, velocity: 100 } });
      expect(run(p, 40).peak, instrument).toBeGreaterThan(1e-3);
      const sent = p.port.sent.length;
      p.port.deliver({ type: 'dispose' });
      const L = new Float32Array(128).fill(0.5);
      const R = new Float32Array(128).fill(0.5);
      for (let q = 0; q < 3; q++) {
        expect(p.process([], [[L, R]]), instrument).toBe(false);
        expect(Math.max(...L, ...R), instrument).toBe(0);
        g.currentFrame += 128;
      }
      // (no report, no error: it is gone)
      p.port.deliver({ type: 'event', event: { type: 'noteOn', midi: 64, velocity: 100 } });
      p.port.deliver({ type: 'instrument', instrument: 'piano' });
      p.port.deliver({ type: 'panic' });
      expect(p.process([], [[L, R]]), instrument).toBe(false);
      expect(p.port.sent.length, instrument).toBe(sent);
    }
  });
});

// A change of piano (grand ↔ upright) used to rebuild the one piano in place: everything sounding
// stopped at once, the room's tail with it, and a piece playing had a hole until its next note. Now
// another piano takes over and the first rings out (processor.ts `changePiano`).
describe('a change of piano hands over without a silence', () => {
  let designs: DesignEntry[] = [];
  beforeAll(async () => {
    designs = [...(await computeDesigns('grand', {}, 48000)), ...(await computeDesigns('upright', {}, 48000))];
  });
  const piano = (preset = 'grand') => new Ctor({ processorOptions: { instrument: 'piano', preset, designs, adaptive: false } });
  const on = (p: Proc, midi: number, velocity = 90, time?: number) => p.port.deliver({ type: 'event', event: { type: 'noteOn', midi, velocity }, time });
  const off = (p: Proc, midi: number, time?: number) => p.port.deliver({ type: 'event', event: { type: 'noteOff', midi }, time });
  const rms = (x: Float32Array, a: number, b: number) => {
    let s2 = 0;
    for (let i = a; i < b; i++) s2 += x[i] * x[i];
    return Math.sqrt(s2 / (b - a));
  };
  const tails = (p: Proc): { core: { sounding(): number[] }; fade: number }[] => (p as any).tails;
  /** 0.1 s */
  const Q = 38;

  it('the notes sounding ring on, each let go by its own key; the notes after are the other piano’s', () => {
    const p = piano();
    on(p, 48, 100);
    on(p, 60, 100);
    const before = run(p, 3 * Q).out;
    p.port.deliver({ type: 'preset', preset: 'upright' });
    const said = of(p, 'preset').at(-1);
    expect(said).toMatchObject({ instrument: 'piano', preset: 'upright' });
    expect(said.keys.length).toBe(88);
    const after = run(p, 2 * Q).out;
    // no hole: the 0.1 s after is the same decaying chord as the 0.1 s before (it was silence)
    const r0 = rms(before, before.length - Q * 128, before.length);
    const r1 = rms(after, 0, Q * 128);
    expect(r0).toBeGreaterThan(1e-3);
    expect(r1 / r0).toBeGreaterThan(0.6);
    expect(r1 / r0).toBeLessThan(1.1);
    // not one silent quantum, and no step where the two meet
    for (let q = 0; q < 2 * Q; q++) expect(rms(after, q * 128, (q + 1) * 128), `quantum ${q}`).toBeGreaterThan(1e-5);
    const step = Math.abs(after[0] - before[before.length - 1]);
    let most = 0;
    for (let i = before.length - 4800; i < before.length; i++) most = Math.max(most, Math.abs(before[i] - before[i - 1]));
    expect(step).toBeLessThan(2 * most + 1e-4);
    // the keys still held are still sounding (the keyboard lights them), on the piano that struck them
    expect(of(p, 'sounding').at(-1).notes.sort()).toEqual([48, 60]);
    expect(tails(p).length).toBe(1);
    expect(tails(p)[0].core.sounding().sort()).toEqual([48, 60]);
    expect((p as any).core.sounding()).toEqual([]);
    // a note struck now is the new piano's; the old one strikes nothing more
    on(p, 64, 90);
    run(p, 4);
    expect((p as any).core.sounding()).toEqual([64]);
    expect(of(p, 'sounding').at(-1).notes.sort()).toEqual([48, 60, 64]);
    // let go, the old piano's notes are damped (its own dampers) and it is dropped once it has died away
    off(p, 48);
    off(p, 60);
    run(p, 4);
    expect(of(p, 'sounding').at(-1).notes).toEqual([64]);
    const ring = run(p, 30 * Q).out;
    expect(tails(p).length).toBe(0);
    expect(rms(ring, ring.length - Q * 128, ring.length)).toBeGreaterThan(1e-5); // (the upright's E still rings)
    expect(of(p, 'error')).toEqual([]);
  });

  it('what a file had scheduled is played on: ends on the old piano, notes to come on the new', () => {
    const p = piano();
    run(p, 2);
    const t = () => g.currentFrame / 48000;
    on(p, 60, 90);
    run(p, 2 * Q);
    // (as the player schedules: the held note's end, then the next note, a little ahead)
    off(p, 60, t() + 0.1);
    on(p, 67, 90, t() + 0.15);
    off(p, 67, t() + 0.6);
    p.port.deliver({ type: 'preset', preset: 'upright' });
    run(p, 8); // 21 ms on: nothing has changed hands yet
    expect(of(p, 'sounding').at(-1).notes).toEqual([60]);
    run(p, Q + 12); // 0.15 s on
    expect(tails(p)[0]?.core.sounding() ?? []).toEqual([]);
    expect((p as any).core.sounding()).toEqual([67]);
    run(p, 5 * Q);
    expect(of(p, 'sounding').at(-1).notes).toEqual([]);
    // stopped (the player's stop forgets what is scheduled, then lets go of what it held): both pianos follow
    on(p, 72, 90);
    run(p, Q);
    p.port.deliver({ type: 'preset', preset: 'grand' });
    off(p, 72, t() + 5);
    p.port.deliver({ type: 'clearScheduled' });
    off(p, 72);
    run(p, 4);
    expect(of(p, 'sounding').at(-1).notes).toEqual([]);
  });

  it('a piano alone after the change is that piano: the same samples as one that began as it', () => {
    const p = piano('grand');
    p.port.deliver({ type: 'preset', preset: 'upright' });
    const u = piano('upright');
    run(p, 4 * Q);
    g.currentFrame -= 4 * Q * 128;
    run(u, 4 * Q);
    expect(tails(p).length).toBe(0); // (nothing was sounding: the grand is gone within a moment)
    for (const x of [p, u]) on(x, 55, 96);
    const a = run(p, 3 * Q).out;
    g.currentFrame -= 3 * Q * 128;
    const b = run(u, 3 * Q).out;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
    expect(diff).toBe(0);
    expect(rms(a, 0, a.length)).toBeGreaterThan(1e-3);
  });

  it('two pianos ringing at once are held to the level of one; pianos changed back and forth do not pile up', () => {
    const p = piano();
    const chord = [36, 43, 48, 52, 55, 60, 64, 67, 72, 76];
    for (const m of chord) on(p, m, 127);
    const alone = run(p, 6).peak;
    p.port.deliver({ type: 'preset', preset: 'upright' });
    for (const m of chord) on(p, m, 127);
    const both = run(p, 2 * Q);
    expect(alone).toBeLessThanOrEqual(1);
    expect(both.peak).toBeLessThanOrEqual(Math.max(alone, 0.95) + 1e-6);
    for (const v of both.out) expect(Number.isFinite(v)).toBe(true);
    // back and forth while everything rings: never more than two old pianos kept (the oldest fades in 30 ms)
    for (const preset of ['grand', 'upright', 'grand', 'upright']) {
      p.port.deliver({ type: 'preset', preset });
      for (const m of chord) on(p, m, 110);
      run(p, 3);
    }
    run(p, 12);
    expect(tails(p).length).toBeLessThanOrEqual(2);
    const out = run(p, Q);
    expect(out.peak).toBeLessThanOrEqual(1);
    expect(out.peak).toBeGreaterThan(0.05);
    // a panic (and another instrument) stops everything as before: nothing of an old piano rings on under it
    p.port.deliver({ type: 'panic' });
    expect(tails(p).length).toBe(0);
    // (what a panic leaves of the one piano dies away in a moment, as it did)
    run(p, 2 * Q);
    expect(run(p, Q).peak).toBeLessThan(out.peak / 100);
    expect(of(p, 'error')).toEqual([]);
  });
});
