// Audio audit, round 2 (artifacts/round3/audio-audit-2/NOTES.md): what it fixed stays fixed.
import { describe, expect, it } from 'vitest';
import { Limiter } from '../src/core/post.ts';
import { createCore, PLAYBACK_DB, renderInstrument } from '../src/core/index.ts';

const FS = 48000;
type Ev = { time: number; event: Record<string, unknown> };
const on = (time: number, midi: number, velocity: number): Ev => ({ time, event: { type: 'noteOn', midi, velocity } });
const off = (time: number, midi: number): Ev => ({ time, event: { type: 'noteOff', midi } });
const db = (x: number) => 20 * Math.log10(Math.max(1e-12, x));
const rms = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  for (let i = Math.round(a * FS); i < Math.round(b * FS); i++) s += x[i] * x[i];
  return Math.sqrt(s / (Math.round(b * FS) - Math.round(a * FS)));
};

describe('the limiter works on the level the mix hears (an Orchestra part: Limiter.bus)', () => {
  const run = (bus: number, amp: number) => {
    const lim = new Limiter(FS);
    lim.bus = bus;
    const L = new Float64Array(4800);
    const R = new Float64Array(4800);
    for (let i = 0; i < L.length; i++) L[i] = R[i] = amp * Math.sin((2 * Math.PI * 220 * i) / FS);
    lim.process(L, R, L.length);
    return { L, cut: lim.reduction };
  };
  it('a part at 2.0 with a bus share of a quarter is not limited (0.5 is heard); alone it is', () => {
    expect(run(0.25, 2).cut).toBe(1);
    expect(run(1, 2).cut).toBeLessThan(0.5);
  });
  it('limited, its peak as heard is the threshold', () => {
    const { L } = run(0.25, 8);
    let pk = 0;
    for (let i = 2400; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]));
    expect(0.25 * pk).toBeLessThan(0.9);
    expect(0.25 * pk).toBeGreaterThan(0.8);
  });
  it('a decay’s last 400 dB is written as silence (no float32 subnormals after it)', () => {
    const lim = new Limiter(FS);
    const L = Float64Array.from([1e-21, -3e-25, 2e-19, 1e-30]);
    const R = Float64Array.from([0, 1e-39, -5e-21, 3e-18]);
    lim.process(L, R, 4);
    expect([...L]).toEqual([0, 0, 2e-19, 0]);
    expect([...R]).toEqual([0, 0, 0, 3e-18]);
  });
});

describe('played levels (PLAYBACK_DB): the trombone and the timpani given back their sessions’ gain', () => {
  for (const id of ['trombone', 'timpani'] as const) {
    it(`${id}: played ${PLAYBACK_DB[id]} dB over the dry calibration render, before its limiter`, () => {
      const ev = [on(0.05, id === 'timpani' ? 45 : 53, 70), off(0.8, id === 'timpani' ? 45 : 53)];
      const dry = renderInstrument({ sampleRate: FS, instrument: id, events: ev as never, duration: 0.9, dry: true });
      // (played, with the room off, the limiter far away: the gain alone)
      const c = createCore({ sampleRate: FS, instrument: id, params: { room: 0 } as never });
      (c as unknown as { limiter: Limiter }).limiter.thr = 1e9;
      for (const e of ev) c.schedule(e.event, Math.round(e.time * FS));
      const L = new Float32Array(Math.round(0.9 * FS));
      const bl = new Float32Array(128);
      const br = new Float32Array(128);
      for (let i = 0; i + 128 <= L.length; i += 128) (c.process(bl, br, 128), L.set(bl, i));
      expect(db(rms(L, 0.2, 0.7)) - db(rms(dry.left, 0.2, 0.7))).toBeCloseTo(PLAYBACK_DB[id]!, 0);
    });
  }
});

describe('the violin’s A0 (its body refitted, audio audit 2)', () => {
  it('C♯4, A0’s own note, stands no more than 10 dB over B3 and D4 (dry, ff; it was 23 dB)', () => {
    const lv = (m: number) => {
      const r = renderInstrument({ sampleRate: FS, instrument: 'violin', events: [on(0.05, m, 118), off(1.25, m)] as never, duration: 1.3, dry: true });
      return db(rms(r.left, 0.5, 1.2));
    };
    expect(lv(61) - (lv(59) + lv(62)) / 2).toBeLessThan(10);
  });
});

describe('a bowed note’s release (the finger stays down while the string rings)', () => {
  for (const [id, m] of [['violin', 74], ['viola', 60]] as const)
    it(`${id} ${m}: its tail never rises more than 3 dB in 50 ms (it came back 8–15 dB when the finger lifted)`, () => {
      const r = renderInstrument({ sampleRate: FS, instrument: id, events: [on(0.05, m, 100), off(1.05, m)] as never, duration: 2.6, dry: true });
      let worst = -99;
      let prev = NaN;
      for (let t = 1.15; t < 2.5; t += 0.05) {
        const v = db(rms(r.left, t, t + 0.05));
        if (Number.isFinite(prev)) worst = Math.max(worst, v - prev);
        prev = v;
      }
      expect(worst).toBeLessThan(3);
    });
});

describe('the trumpet’s soft notes after another (its bore laid out again, not jumped)', () => {
  it('a pp note over the last one’s tail starts without a one-sample step (it was 0.88 of the steady note’s largest step)', () => {
    const r = renderInstrument({ sampleRate: FS, instrument: 'trumpet', events: [on(0.05, 60, 28), off(0.45, 60), on(0.65, 62, 28), off(1.05, 62)] as never, duration: 1.1, dry: true });
    const x = r.left;
    let steady = 0;
    for (let i = Math.round(0.9 * FS); i < Math.round(1.0 * FS); i++) steady = Math.max(steady, Math.abs(x[i] - x[i - 1]));
    const c = Math.round(0.65 * FS);
    let at = 0;
    for (let i = c - 5; i < c + 15; i++) at = Math.max(at, Math.abs(x[i] - x[i - 1]));
    expect(at / steady).toBeLessThan(0.2);
  });
});
