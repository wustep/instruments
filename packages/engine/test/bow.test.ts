// Bow direction changes: the shared bow alternates down/up-bow per détaché note and
// changes automatically when the hair runs out; Helmholtz motion re-forms in the new
// direction (it is not imposed) and the pitch is unaffected.
import { describe, expect, it } from 'vitest';
import { BowedCore } from '../src/core/index.ts';

const FS = 48000;
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Render a violin, recording the mean friction force of the focused string per 10 ms. */
function run(events: { t: number; ev: object }[], dur: number, params: Record<string, unknown> = {}) {
  const core = new BowedCore({ sampleRate: FS, instrument: 'violin', dry: true, params: { vibrato: 0, ...params } });
  for (const e of events) core.schedule(e.ev, Math.round(e.t * FS));
  const n = Math.round(dur * FS);
  const x = new Float32Array(n);
  const L = new Float32Array(480);
  const R = new Float32Array(480);
  const force: number[] = [];
  const dirs: number[] = [];
  for (let i = 0; i + 480 <= n; i += 480) {
    core.process(L, R, 480);
    x.set(L, i);
    const s = core.strings.find((q) => q.bowing) ?? core.strings[0];
    let f = 0;
    for (let k = 0; k < 480; k++) f += s.trF[(s.trI - 1 - k + 2048) & 2047];
    force.push(f / 480);
    dirs.push(core.bow.changing ? 0 : core.bow.dir);
  }
  return { core, x, force, dirs };
}

function pitchCents(x: Float32Array, f: number, t0: number, len = 0.3): number {
  const s0 = Math.round(t0 * FS);
  const W = Math.round(len * FS);
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag];
    return s;
  };
  const lo = Math.floor(FS / (f * 1.06));
  const hi = Math.ceil(FS / (f * 0.94));
  let best = -Infinity;
  let bl = lo;
  for (let lag = lo; lag <= hi; lag++) {
    const v = ac(lag);
    if (v > best) {
      best = v;
      bl = lag;
    }
  }
  const a = ac(bl - 1);
  const b = ac(bl);
  const c = ac(bl + 1);
  return 1200 * Math.log2(FS / (bl + (0.5 * (a - c)) / (a - 2 * b + c)) / f);
}

describe('bow changes', () => {
  it('a long forte note changes bow when the hair runs out; friction reverses with the bow', () => {
    const r = run([{ t: 0.01, ev: { type: 'noteOn', midi: 62, velocity: 120 } }], 4.5);
    expect(r.core.bow.auto).toBeGreaterThanOrEqual(1);
    // friction pulls the string along the bow: its mean has the bow's sign once settled
    const first = r.dirs.indexOf(0);
    expect(first).toBeGreaterThan(20);
    const before = r.force.slice(first - 15, first - 2);
    const after = r.force.slice(first + 25, first + 40);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(Math.sign(mean(before))).toBe(1);
    expect(Math.sign(mean(after))).toBe(-1);
    for (const v of after) expect(Math.sign(v)).toBe(-1);
  });

  it('the pitch is the same before and after the change', () => {
    const r = run([{ t: 0.01, ev: { type: 'noteOn', midi: 62, velocity: 120 } }], 4.5);
    const first = r.dirs.indexOf(0) * (480 / FS);
    const pb = pitchCents(r.x, et(62), first - 0.45);
    const pa = pitchCents(r.x, et(62), first + 0.25);
    expect(Math.abs(pb)).toBeLessThan(6);
    expect(Math.abs(pa - pb)).toBeLessThan(3);
  });

  it('successive détaché notes alternate down-bow and up-bow; slurred notes keep the stroke', () => {
    const notes = [62, 64, 66, 67];
    const ev = notes.flatMap((m, i) => [
      { t: 0.01 + i * 0.4, ev: { type: 'noteOn', midi: m, velocity: 80 } },
      { t: 0.35 + i * 0.4, ev: { type: 'noteOff', midi: m } },
    ]);
    const core = new BowedCore({ sampleRate: FS, instrument: 'violin', dry: true, params: { vibrato: 0 } });
    for (const e of ev) core.schedule(e.ev, Math.round(e.t * FS));
    const seen: number[] = [];
    const L = new Float32Array(480);
    const R = new Float32Array(480);
    // sample the direction in the middle of each note
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < Math.round(((i === 0 ? 0.2 : 0.4) * FS) / 480); k++) core.process(L, R, 480);
      seen.push(core.bow.dir);
    }
    expect(seen).toEqual([1, -1, 1, -1]);
    // legato (overlapping) notes on one string do not take a new stroke
    const lg = new BowedCore({ sampleRate: FS, instrument: 'violin', dry: true, params: { vibrato: 0 } });
    lg.schedule({ type: 'noteOn', midi: 62, velocity: 80 }, 0);
    lg.schedule({ type: 'noteOn', midi: 64, velocity: 80 }, Math.round(0.3 * FS));
    lg.schedule({ type: 'noteOff', midi: 62 }, Math.round(0.32 * FS));
    for (let k = 0; k < Math.round((0.6 * FS) / 480); k++) lg.process(L, R, 480);
    expect(lg.bow.dir).toBe(1);
    expect(lg.bow.changes).toBe(0);
  });

  it('with bow changes off, the bow never reverses', () => {
    const r = run([{ t: 0.01, ev: { type: 'noteOn', midi: 62, velocity: 120 } }], 4.5, { bowChanges: false });
    expect(r.core.bow.changes).toBe(0);
    expect(r.force.slice(-20).every((v) => v > 0)).toBe(true);
  });
});
