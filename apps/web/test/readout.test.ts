// The top band's readout (ui/readout.ts): what is sounding, said whole. One note is not the chord.
import { describe, expect, it } from 'vitest';
import { chordName, intervalName, noteName, partNotes, summarize } from '../src/ui/readout.ts';

describe('the readout', () => {
  it('names a note by its usual spelling', () => {
    expect([60, 61, 63, 66, 68, 70, 21, 108].map(noteName)).toEqual(['C4', 'C♯4', 'E♭4', 'F♯4', 'A♭4', 'B♭4', 'A0', 'C8']);
  });

  it('nothing sounding: nothing to say', () => {
    expect(summarize([])).toBeNull();
  });

  it('one note: its name and its frequency (the instrument’s own where it gives one)', () => {
    expect(summarize([69])).toMatchObject({ head: 'A4', sub: '440.0 Hz', size: 1, count: 1 });
    expect(summarize([64])!.sub).toBe('329.6 Hz');
    expect(summarize([64], { hz: () => 330.25 })!.sub).toBe('330.3 Hz');
    expect(summarize([96])!.sub).toBe('2093 Hz');
    // (a key held twice, by hand and by a file, is one note)
    expect(summarize([64, 64])!.head).toBe('E4');
  });

  it('a chord is every note of it, lowest first, never one of them', () => {
    const r = summarize([71, 60, 67, 64])!;
    expect(r.head).toBe('C4 E4 G4 B4');
    expect(r.sub).toBe('Cmaj7');
    expect(r.count).toBe(4);
    expect(r.size).toBe(3);
  });

  it('two notes: both, and their interval', () => {
    expect(summarize([60, 64])).toMatchObject({ head: 'C4 E4', sub: 'major third', size: 2 });
    expect(summarize([48, 55])!.sub).toBe('fifth');
    expect(summarize([48, 60])!.sub).toBe('octave');
    expect(summarize([48, 64])!.sub).toBe('major third + octave');
    expect(intervalName(60, 66)).toBe('tritone');
  });

  it('a chord’s notes are spelled as the chord spells them', () => {
    expect(summarize([58, 61, 65, 68])).toMatchObject({ head: 'B♭3 D♭4 F4 A♭4', sub: 'B♭m7' });
    expect(summarize([54, 58, 61])).toMatchObject({ head: 'F♯3 A♯3 C♯4', sub: 'F♯' });
    expect(summarize([60, 64, 68])).toMatchObject({ head: 'C4 E4 G♯4', sub: 'Caug' });
    // (no chord: the plain spelling)
    expect(summarize([60, 61, 62])).toMatchObject({ head: 'C4 C♯4 D4', sub: '3 notes' });
  });

  it('names chords: triads, sevenths, inversions over their bass, the root in the bass first', () => {
    expect(chordName([60, 64, 67])).toBe('C');
    expect(chordName([57, 60, 64])).toBe('Am');
    expect(chordName([64, 67, 72])).toBe('C/E');
    expect(chordName([55, 59, 62, 65])).toBe('G7');
    expect(chordName([59, 62, 65, 67])).toBe('G7/B');
    expect(chordName([60, 63, 66])).toBe('Cdim');
    expect(chordName([62, 65, 68, 72])).toBe('Dm7♭5');
    expect(chordName([60, 65, 67])).toBe('Csus4');
    // the same four notes: the one in the bass is the root
    expect(chordName([60, 64, 67, 69])).toBe('C6');
    expect(chordName([57, 60, 64, 67])).toBe('Am7');
    // octaves and doublings do not matter
    expect(chordName([36, 48, 52, 55, 60, 64, 67, 72])).toBe('C');
    // fewer than three pitch classes, or a cluster: no chord
    expect(chordName([60, 67])).toBeNull();
    expect(chordName([60, 61, 62, 63])).toBeNull();
    expect(chordName([])).toBeNull();
  });

  it('many notes: the chord where there is one, how many, and from where to where', () => {
    expect(summarize([36, 48, 52, 55, 60, 64, 67, 72])).toMatchObject({ head: 'C', sub: '8 notes · C2–C5', count: 8 });
    expect(summarize([60, 61, 62, 63, 64, 65])).toMatchObject({ head: '6 notes', sub: 'C4–F4' });
    // one pitch class over many octaves
    expect(summarize([31, 43, 55, 67, 79])).toMatchObject({ head: 'G', sub: '5 notes · G1–G5' });
    expect(summarize([43, 55, 67])).toMatchObject({ head: 'G2 G3 G4', sub: 'octaves' });
  });

  it('an ensemble counts its sounding parts', () => {
    expect(summarize([55, 62, 67, 71], { parts: 4 })).toMatchObject({ head: 'G3 D4 G4 B4', sub: 'G · 4 parts' });
    expect(summarize([48, 55, 60, 63, 67, 72, 75], { parts: 12 })).toMatchObject({ head: 'Cm', sub: '12 parts · C3–E♭5' });
    expect(summarize([60, 62], { parts: 2 })!.sub).toBe('major second · 2 parts');
    // one part alone is one instrument
    expect(summarize([60, 64, 67], { parts: 1 })!.sub).toBe('C');
    expect(summarize([67], { parts: 3 })).toMatchObject({ head: 'G4', sub: '392.0 Hz' });
  });

  it('the head is set smaller the more it says, and never longer than the readout is wide', () => {
    const sizes = [[60], [60, 64], [61, 63], [60, 64, 67], [61, 63, 66, 68]].map((n) => summarize(n)!.size);
    expect(sizes).toEqual([1, 2, 2, 3, 4]);
    // every chord of up to eight notes drawn from two octaves: at most four names, or a short word
    let longest = '';
    for (let mask = 1; mask < 1 << 12; mask++) {
      const ns = Array.from({ length: 12 }, (_, i) => i).filter((i) => mask & (1 << i)).flatMap((i) => [58 + i, 70 + i]);
      const head = summarize(ns)!.head;
      if (head.length > longest.length) longest = head;
    }
    expect(longest.length).toBeLessThanOrEqual(16);
  });

  it('a part’s cell: its notes, then a count', () => {
    expect(partNotes([])).toBe('');
    expect(partNotes([67, 55])).toBe('G3 G4');
    expect(partNotes([60, 63, 67])).toBe('C4 E♭4 G4');
    expect(partNotes([60, 62, 64, 65])).toBe('4');
  });
});
