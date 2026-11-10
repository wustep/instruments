// Orchestra mode's seats (orchestra/seats.ts): where each instrument sits is where the 3D stage draws
// it and where its sound comes from (the room's seat in the engine).
import { describe, expect, it } from 'vitest';
import { VOICE_INFO, type Voice } from '../src/orchestra/assign.ts';
import { seatPlaces, soundSeats } from '../src/orchestra/seats.ts';

const seats = (vs: Voice[]) => soundSeats(vs.map((v) => VOICE_INFO[v]));

describe('orchestra: the seats', () => {
  it('a quartet: first violin on the audience’s left, the cello on the right, in a symmetric arc', () => {
    const s = seats(['violin', 'violin', 'viola', 'cello']);
    const xs = s.map((p) => p[0]);
    expect(xs[0]).toBeLessThan(-0.9);
    expect(xs[3]).toBeGreaterThan(0.9);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[0]).toBeCloseTo(-xs[3], 9);
    // the arc's ends come towards the audience
    expect(s[0][1]).toBeLessThan(s[1][1]);
  });

  it('a piano behind the players, a soloist beside it on the right', () => {
    const six = seats(['flute', 'violin', 'violin', 'viola', 'cello', 'grand']);
    expect(six[5][1]).toBeGreaterThan(1);
    for (let i = 0; i < 5; i++) expect(six[i][1]).toBeLessThan(0);
    const duo = seats(['trumpet', 'grand']);
    expect(duo[0][0]).toBeGreaterThan(1.5);
    expect(duo[1][0]).toBe(0);
  });

  it('the sound takes the wide stage whatever the view (a phone held upright seats two rows only in 3D)', () => {
    const kinds = (['violin', 'violin', 'viola', 'cello', 'flute'] as Voice[]).map((v) => ({ family: v === 'flute' ? ('wind' as const) : ('bowed' as const), kind: 'grand' as const, cello: v === 'cello' }));
    const wide = seatPlaces(kinds);
    const tall = seatPlaces(kinds, 0.5);
    expect(tall.some((p, i) => p.z !== wide[i].z)).toBe(true);
    expect(seats(['violin', 'violin', 'viola', 'cello', 'flute'])).toEqual(wide.map((p) => [p.x, p.z]));
  });

  it('two of a kind sit apart (two cellos, two grands)', () => {
    const s = seats(['cello', 'cello', 'grand', 'grand']);
    expect(Math.abs(s[0][0] - s[1][0])).toBeGreaterThan(0.5);
    expect(Math.abs(s[2][0] - s[3][0])).toBeCloseTo(2.5, 9);
  });
});
