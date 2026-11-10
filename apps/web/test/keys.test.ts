// Orchestra mode: which instruments the keys play (orchestra/keys.ts) — the default, the choice by
// hand (several at once), split, and the choice carried over a change of the lineup.
import { describe, expect, it } from 'vitest';
import type { Voice } from '../src/orchestra/assign.ts';
import { carryKeys, defaultKeys, keyParts, keysFor, keysRange, keyTargets, setSplit, toggleKey, type KeysChoice } from '../src/orchestra/keys.ts';

const QUARTET: Voice[] = ['violin', 'violin', 'viola', 'cello'];
const chosen = (parts: number[], split = false): KeysChoice => ({ parts, split, byUser: true });
const none = new Set<number>();

describe('orchestra: what the keys play', () => {
  it('by default the piano, else the highest melodic instrument (its first seat)', () => {
    expect(defaultKeys(QUARTET)).toEqual([0]);
    expect(defaultKeys(['flute', 'violin', 'violin', 'viola', 'cello'])).toEqual([0]);
    expect(defaultKeys(['trumpet', 'cello'])).toEqual([0]);
    expect(defaultKeys(['cello', 'viola'])).toEqual([1]);
    // a piano anywhere on the stage: the keys are its
    expect(defaultKeys(['flute', 'violin', 'cello', 'grand'])).toEqual([3]);
    expect(defaultKeys(['violin', 'upright', 'grand'])).toEqual([1]);
    expect(defaultKeys([])).toEqual([]);
    expect(keysFor(QUARTET)).toEqual({ parts: [0], split: false, byUser: false });
  });

  it('one key sounds on every chosen instrument, each moving it by octaves into its own range', () => {
    const c = chosen([0, 3]);
    expect(keyTargets(67, c, QUARTET, none)).toEqual([
      { part: 0, pitch: 67 },
      { part: 3, pitch: 67 },
    ]);
    // G2 on a violin is its G3; C7 on a cello its C5 (A5 is its top)
    expect(keyTargets(43, c, QUARTET, none)).toEqual([
      { part: 0, pitch: 55 },
      { part: 3, pitch: 43 },
    ]);
    expect(keyTargets(96, c, QUARTET, none)).toEqual([
      { part: 0, pitch: 96 },
      { part: 3, pitch: 72 },
    ]);
    // busy instruments do not matter: a chord stays on them all
    expect(keyTargets(74, c, QUARTET, new Set([0, 3])).map((t) => t.part)).toEqual([0, 3]);
    // two grands and a cello: all three
    expect(keyTargets(60, chosen([0, 1, 2]), ['cello', 'grand', 'grand'], none)).toEqual([
      { part: 0, pitch: 60 },
      { part: 1, pitch: 60 },
      { part: 2, pitch: 60 },
    ]);
  });

  it('split deals a chord out by register, one note to each melodic instrument (as before)', () => {
    const c = setSplit(keysFor(QUARTET), true);
    const lineup: Voice[] = ['flute', 'violin', 'violin', 'cello'];
    const busy = new Set<number>();
    const got = [43, 67, 74, 84].map((m) => {
      const [t] = keyTargets(m, c, lineup, busy);
      busy.add(t.part);
      return t;
    });
    expect(got).toEqual([
      { part: 3, pitch: 43 },
      { part: 1, pitch: 67 },
      { part: 2, pitch: 74 },
      { part: 0, pitch: 84 },
    ]);
    // a fifth key, every one busy: the nearest in register takes it over
    expect(keyTargets(86, c, lineup, busy)).toEqual([{ part: 0, pitch: 86 }]);
    // with a piano, the piano takes what the melodic instruments cannot
    expect(keyTargets(50, c, ['violin', 'grand'], new Set([0]))).toEqual([{ part: 1, pitch: 50 }]);
    expect(keyParts(c, 4)).toEqual([0, 1, 2, 3]);
  });

  it('a tap adds or takes an instrument; the last one stays; from split a tap plays that one alone', () => {
    let c = keysFor(QUARTET);
    c = toggleKey(c, 3, 4);
    expect(c).toEqual({ parts: [0, 3], split: false, byUser: true });
    c = toggleKey(c, 2, 4);
    expect(c.parts).toEqual([0, 2, 3]);
    c = toggleKey(c, 0, 4);
    expect(c.parts).toEqual([2, 3]);
    c = toggleKey(toggleKey(c, 2, 4), 3, 4);
    expect(c.parts).toEqual([3]);
    // out of range: nothing
    expect(toggleKey(c, 7, 4)).toBe(c);
    // split keeps the choice for when it goes off
    const s = setSplit(chosen([1, 2]), true);
    expect(s).toEqual({ parts: [1, 2], split: true, byUser: true });
    expect(keyParts(s, 4)).toEqual([0, 1, 2, 3]);
    expect(setSplit(s, false).parts).toEqual([1, 2]);
    expect(setSplit(s, true)).toBe(s);
    expect(toggleKey(s, 3, 4)).toEqual({ parts: [3], split: false, byUser: true });
  });

  it('the keys span the ranges of the instruments they play', () => {
    expect(keysRange(keysFor(QUARTET), QUARTET)).toEqual([55, 100]);
    expect(keysRange(chosen([0, 3]), QUARTET)).toEqual([36, 100]);
    expect(keysRange(chosen([3]), QUARTET)).toEqual([36, 81]);
    expect(keysRange(setSplit(chosen([0]), true), QUARTET)).toEqual([36, 100]);
    expect(keysRange(keysFor(['flute', 'grand']), ['flute', 'grand'])).toEqual([21, 108]);
  });

  it('a change of lineup keeps what the keys play, wherever it now sits', () => {
    // a flute joins the quartet (it sits first): the viola chosen is still the viola, now seat 3
    const v: Voice[] = ['flute', 'violin', 'violin', 'viola', 'cello'];
    expect(carryKeys(chosen([2]), [-1, 0, 1, 2, 3], v)).toEqual({ parts: [3], split: false, byUser: true });
    // two chosen, one leaves: the other stays chosen
    expect(carryKeys(chosen([2, 3]), [0, 1, 3], ['violin', 'violin', 'cello'])).toEqual({ parts: [2], split: false, byUser: true });
    // the only one chosen leaves: the default (the first violin)
    expect(carryKeys(chosen([2]), [0, 1, 3], ['violin', 'violin', 'cello'])).toEqual({ parts: [0], split: false, byUser: false });
    // an instrument changed for another in its seat (the grid, the piano's preset): still chosen
    expect(carryKeys(chosen([4]), [0, 1, 2, 3, -1], ['violin', 'violin', 'viola', 'cello', 'upright'])).toEqual({ parts: [4], split: false, byUser: true });
    // ... but a new instrument in a seat whose old one moved on is not
    expect(carryKeys(chosen([0]), [-1, 0, 1, 2, 3], v)).toEqual({ parts: [1], split: false, byUser: true });
    // split stays split
    expect(carryKeys(setSplit(chosen([1]), true), [-1, 0, 1, 2, 3], v)).toEqual({ parts: [2], split: true, byUser: true });
    // nothing chosen by hand: the new lineup's default (a piano joining takes the keys)
    expect(carryKeys(keysFor(QUARTET), [0, 1, 2, 3, -1], [...QUARTET, 'grand'])).toEqual({ parts: [4], split: false, byUser: false });
    expect(carryKeys(keysFor([]), [-1, -1, -1, -1], QUARTET)).toEqual(keysFor(QUARTET));
  });
});
