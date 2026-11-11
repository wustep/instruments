// A file's notes as one instrument's keys (src/file-keys.ts): a pitch the file holds twice at once (two
// lines in unison on one instrument, a note begun again before its own end) is struck at each beginning
// and let go when the last of them ends. Sent bare to the single instrument, the first end let the key go
// under the note still sounding: on a wind the second note was cut short (measured: the second of two
// overlapping notes of one pitch ended 30 ms after it began, 60 dB under itself by its middle).
import { describe, expect, it } from 'vitest';
import { FileKeys } from '../src/file-keys.ts';

describe('FileKeys', () => {
  it('a note alone: its end lets the key go', () => {
    const k = new FileKeys();
    k.on(60);
    expect(k.down).toEqual([60]);
    expect(k.off(60)).toBe(true);
    expect(k.down).toEqual([]);
  });
  it('a pitch begun again before its own end: the first end is not the key’s, the last is', () => {
    const k = new FileKeys();
    k.on(67);
    k.on(67);
    expect(k.off(67)).toBe(false);
    expect(k.down).toEqual([67]);
    expect(k.off(67)).toBe(true);
    expect(k.down).toEqual([]);
  });
  it('an end with no note before it lets nothing go; other pitches are their own', () => {
    const k = new FileKeys();
    expect(k.off(60)).toBe(false);
    k.on(60);
    k.on(64);
    expect(k.off(64)).toBe(true);
    expect(k.down).toEqual([60]);
    k.clear();
    expect(k.down).toEqual([]);
    expect(k.off(60)).toBe(false);
  });
});
