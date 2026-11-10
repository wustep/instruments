// Orchestra mode's built-in pieces: the files are Mutopia's own (checksums), they parse, and each
// piece sets out its parts as listed (orchestra/pieces.ts), fitted to a smaller stage when needed.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { autoPlan, lineupOf, placeNote } from '../src/orchestra/assign.ts';
import { PIECES, piecePlan } from '../src/orchestra/pieces.ts';

const load = (file: string) => {
  const b = readFileSync(new URL(`../public/pieces/${file}`, import.meta.url));
  return { b, song: parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) };
};

describe('orchestra: the pieces', () => {
  it('each file is Mutopia’s, byte for byte, and parses into the lines its plan names', () => {
    for (const p of PIECES) {
      const { b, song } = load(p.file);
      expect(createHash('sha256').update(b).digest('hex'), p.id).toBe(p.sha256);
      expect(song.duration, p.id).toBeGreaterThan(30);
      for (const part of p.parts) for (const l of part.lines) expect(l, p.id).toBeLessThan(song.lines.length);
      expect(p.source).toMatch(/^https:\/\/www\.mutopiaproject\.org\/cgibin\/piece-info\.cgi\?id=\d+$/);
      expect(p.credit).toMatch(/public domain/);
    }
  });

  it('the quartet is a quartet, the concerto six players, the fanfare a trumpet at concert pitch with the piano', () => {
    const plans = PIECES.map((p) => piecePlan(p, load(p.file).song.lines, 6));
    expect(lineupOf(plans[0])).toEqual(['violin', 'violin', 'viola', 'cello']);
    expect(lineupOf(plans[1])).toEqual(['flute', 'violin', 'violin', 'viola', 'cello', 'grand']);
    // the violone doubles the cello: silent
    expect(plans[1].lines[5].part).toBe(-1);
    expect(lineupOf(plans[2])).toEqual(['trumpet', 'grand']);
    // the B♭ trumpet's written C sounds B♭, the organ's key
    expect(plans[2].lines[0].shift).toBe(-2);
    expect(placeNote(72, plans[2].lines[0].shift, 'trumpet')).toBe(70);
    // a smaller stage: the concerto's violins become a section
    expect(piecePlan(PIECES[1], load(PIECES[1].file).song.lines, 5).parts.length).toBe(5);
  });

  it('dropped as plain files, auto-assignment finds the same quartet', () => {
    expect(lineupOf(autoPlan(load(PIECES[0].file).song.lines, { cap: 6 }))).toEqual(['violin', 'violin', 'viola', 'cello']);
    // the fanfare's organ (two staves, chords) is one piano; its trumpet a trumpet
    expect(lineupOf(autoPlan(load(PIECES[2].file).song.lines, { cap: 6 }))).toEqual(['trumpet', 'grand']);
  });
});
