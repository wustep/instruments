// Orchestra mode's built-in pieces: the files are Mutopia's own (checksums), they parse, and each
// piece sets out its parts as listed (orchestra/pieces.ts), fitted to a smaller stage when needed.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { autoPlan, lineupOf, placeNote } from '../src/orchestra/assign.ts';
import { DEMOS, demoSong, pieceForLineup, PIECES, piecePlan, type Demo } from '../src/orchestra/pieces.ts';
import type { MidiSong } from '../src/midi-file.ts';
import { INSTRUMENT_IDS, INSTRUMENT_INFO } from '../../../packages/engine/src/core/instrument.ts';

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
    expect(plans[1].lines[5]).toEqual([]);
    expect(lineupOf(plans[2])).toEqual(['trumpet', 'grand']);
    // the B♭ trumpet's written C sounds B♭, the organ's key
    expect(plans[2].lines[0].map((r) => r.shift)).toEqual([-2]);
    expect(placeNote(72, plans[2].lines[0][0].shift, 'trumpet')).toBe(70);
    // a smaller stage: the concerto's violins become a section
    expect(piecePlan(PIECES[1], load(PIECES[1].file).song.lines, 5).parts.length).toBe(5);
  });

  it('dropped as plain files, auto-assignment finds the same quartet', () => {
    expect(lineupOf(autoPlan(load(PIECES[0].file).song.lines, { cap: 6 }))).toEqual(['violin', 'violin', 'viola', 'cello']);
    // the fanfare's organ (two staves, chords) is one piano; its trumpet a trumpet
    expect(lineupOf(autoPlan(load(PIECES[2].file).song.lines, { cap: 6 }))).toEqual(['trumpet', 'grand']);
  });
});

describe('each instrument’s own piece (the play icon)', () => {
  it('every instrument has one: Mutopia’s file byte for byte, public domain, short, every note in its range', () => {
    for (const id of INSTRUMENT_IDS) {
      const d = DEMOS[id];
      expect(d?.instrument, id).toBe(id);
      const { b, song } = load(d.file);
      expect(createHash('sha256').update(b).digest('hex'), id).toBe(d.sha256);
      expect(d.source).toMatch(/^https:\/\/www\.mutopiaproject\.org\/cgibin\/piece-info\.cgi\?id=\d+$/);
      expect(d.credit).toMatch(/public domain/);
      const s = demoSong(song, d);
      const ons = s.events.filter((e) => e.kind === 'on') as { t: number; midi: number; vel: number }[];
      expect(ons.length, id).toBeGreaterThan(50);
      // short: half a minute to about two
      expect(s.duration, id).toBeGreaterThan(30);
      expect(s.duration, id).toBeLessThan(130);
      // it starts at once (no silence before the first note)
      expect(ons[0].t, id).toBe(0);
      const { lo, hi } = INSTRUMENT_INFO[id];
      for (const e of ons) {
        expect(e.midi, `${id} ${e.t}`).toBeGreaterThanOrEqual(lo);
        expect(e.midi, `${id} ${e.t}`).toBeLessThanOrEqual(hi);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(127);
      }
      // the winds play one note at a time
      if (id === 'flute' || id === 'trumpet') {
        let held = 0;
        let most = 0;
        for (const e of s.events) {
          if (e.kind === 'on') most = Math.max(most, ++held);
          else if (e.kind === 'off') held--;
        }
        expect(most, id).toBe(1);
      }
    }
    // the trumpet's is the ensemble's fanfare, its trumpet alone, a tone down to concert pitch
    expect(DEMOS.trumpet.file).toBe(PIECES[2].file);
    expect(DEMOS.trumpet.shift).toBe(-2);
  });

  it('plays the lines it names from their first note, at its tempo and force, transposed, and stops at its end', () => {
    const song: MidiSong = {
      duration: 9,
      lines: [{ track: 0, channel: 0, name: 'a', instrument: '', program: -1, notes: 3, lo: 60, hi: 64, median: 62, poly: 1 }, { track: 1, channel: 1, name: 'b', instrument: '', program: -1, notes: 1, lo: 40, hi: 40, median: 40, poly: 1 }],
      events: [
        { t: 0, kind: 'on', midi: 40, vel: 100, line: 1 },
        { t: 1, kind: 'pedal', cc: 64, value: 1, line: 0 },
        { t: 2, kind: 'on', midi: 60, vel: 100, line: 0 },
        { t: 3, kind: 'off', midi: 60, line: 0 },
        { t: 3, kind: 'on', midi: 62, vel: 120, line: 0 },
        // begun before the end: it plays out
        { t: 6, kind: 'off', midi: 62, line: 0 },
        { t: 6, kind: 'off', midi: 40, line: 1 },
        // on the end itself: what follows, left out
        { t: 5, kind: 'on', midi: 64, vel: 90, line: 0 },
        { t: 7, kind: 'off', midi: 64, line: 0 },
      ].sort((a, b) => a.t - b.t) as MidiSong['events'],
    };
    const d: Demo = { instrument: 'violin', composer: '', title: '', file: '', source: '', credit: '', sha256: '', lines: [0], shift: 2, rate: 2, end: 5, vel: 0.5 };
    const s = demoSong(song, d);
    expect(s.lines.map((l) => l.name)).toEqual(['a']);
    expect(s.events).toEqual([
      // the pedal before the first note: at once
      { t: 0, kind: 'pedal', cc: 64, value: 1, line: 0 },
      { t: 0, kind: 'on', midi: 62, vel: 50, line: 0 },
      { t: 0.5, kind: 'off', midi: 62, line: 0 },
      { t: 0.5, kind: 'on', midi: 64, vel: 60, line: 0 },
      { t: 2, kind: 'off', midi: 64, line: 0 },
      // the pedal lifted with the last note
      { t: 2, kind: 'pedal', cc: 64, value: 0, line: 0 },
    ]);
    expect(s.duration).toBe(2);
    // with no corrections, the file as it is
    const all = demoSong(song, { ...d, lines: undefined, shift: undefined, rate: undefined, end: undefined, vel: undefined });
    expect(all.events.filter((e) => e.kind !== 'pedal')).toEqual(song.events.filter((e) => e.kind !== 'pedal'));
    expect(all.lines).toBe(song.lines);
  });

  it('in an ensemble with nothing loaded, the built-in piece that fits its lineup best', () => {
    expect(pieceForLineup(['violin', 'violin', 'viola', 'cello'])).toBe(0);
    expect(pieceForLineup(['cello'])).toBe(0);
    expect(pieceForLineup(['flute', 'violin', 'violin', 'viola', 'cello', 'grand'])).toBe(1);
    expect(pieceForLineup(['flute'])).toBe(1);
    expect(pieceForLineup(['trumpet', 'grand'])).toBe(2);
    expect(pieceForLineup(['grand'])).toBe(2);
    expect(pieceForLineup(['trumpet', 'trumpet'])).toBe(2);
  });
});
