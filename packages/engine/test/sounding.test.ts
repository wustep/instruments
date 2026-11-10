// Which notes really sound, by each instrument's own allocation: the keyboard lights these.
import { describe, expect, it } from 'vitest';
import { createCore } from '../src/core/index.ts';

const FS = 48000;
function run(id: 'flute' | 'oboe' | 'clarinet' | 'bassoon' | 'horn' | 'trombone' | 'trumpet' | 'violin' | 'piano', steps: [string, number][]): number[][] {
  const core = createCore({ instrument: id, sampleRate: FS, dry: true } as never);
  const L = new Float32Array(256);
  const R = new Float32Array(256);
  const out: number[][] = [];
  for (const [what, m] of steps) {
    if (what === 'on') core.schedule({ type: 'noteOn', midi: m, velocity: 90 });
    else if (what === 'off') core.schedule({ type: 'noteOff', midi: m });
    // 'wait': m more blocks of 256 frames first
    if (what === 'wait') for (let i = 0; i < m; i++) core.process(L, R, 256);
    core.process(L, R, 256);
    out.push([...core.sounding()].sort((a, b) => a - b));
  }
  return out;
}

describe('sounding notes', () => {
  it('flute, oboe, clarinet, bassoon, horn, trombone and trumpet: the last held key sounds; releasing it returns to the previous one', () => {
    for (const id of ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trombone', 'trumpet'] as const) {
      // let go 16 ms after the tongue: the note still sounds through its minimum blow (0.1 s on the
      // trumpet, 0.12 s on the flute and the horn, 0.16 s on the oboe and the bassoon and 0.23 s on the
      // clarinet at this velocity), then stops
      const wait = id === 'clarinet' ? 48 : id === 'oboe' || id === 'bassoon' ? 32 : 24;
      expect(run(id, [['on', 72], ['on', 76], ['off', 76], ['off', 72], ['wait', wait]]), id).toEqual([[72], [76], [72], [72], []]);
      // held past the minimum blow, it stops with the key
      expect(run(id, [['on', 72], ['wait', wait], ['off', 72]]), id).toEqual([[72], [72], []]);
    }
  });
  it('violin: two keys on the G string share it; the newer wins and gives it back', () => {
    expect(run('violin', [['on', 55], ['on', 57], ['off', 57], ['off', 55]])).toEqual([[55], [57], [55], []]);
  });
  it('violin: a fifth note takes the string that has played longest; four sound at most', () => {
    const r = run('violin', [['on', 55], ['on', 62], ['on', 69], ['on', 76], ['on', 79], ['off', 79]]);
    expect(r[4]).toEqual([62, 69, 76, 79]);
    expect(r[5]).toEqual([55, 62, 69, 76]);
  });
  it('piano: held keys sound', () => {
    expect(run('piano', [['on', 60], ['on', 64], ['off', 60]])).toEqual([[60], [60, 64], [64]]);
  });
});
