// Orchestra mode's built-in pieces: the files are Mutopia's own (checksums), they parse, and each
// piece sets out its parts as listed (orchestra/pieces.ts), fitted to a smaller stage when needed.
// One is this project's own: "Toward Morning" (Fable 5.2, CC0), thirteen parts on thirteen seats.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { express } from '../src/expression.ts';
import { autoPlan, lineupOf, placeNote, VOICE_INFO } from '../src/orchestra/assign.ts';
import { DEMOS, demoSong, pieceForLineup, PIECES, piecePlan, type Demo } from '../src/orchestra/pieces.ts';
import type { MidiSong } from '../src/midi-file.ts';
import { INSTRUMENT_IDS, INSTRUMENT_INFO } from '../../../packages/engine/src/core/instrument.ts';

const load = (file: string) => {
  const b = readFileSync(new URL(`../public/pieces/${file}`, import.meta.url));
  return { b, song: parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) };
};

describe('orchestra: the pieces', () => {
  it('each file is Mutopia’s, byte for byte (one this project’s own, CC0), and parses into the lines its plan names', () => {
    for (const p of PIECES) {
      const { b, song } = load(p.file);
      expect(createHash('sha256').update(b).digest('hex'), p.id).toBe(p.sha256);
      expect(song.duration, p.id).toBeGreaterThan(30);
      for (const part of p.parts) for (const l of part.lines) expect(l, p.id).toBeLessThan(song.lines.length);
      expect(p.credit).toMatch(/public domain/);
      if (p.id === 'toward-morning') {
        // not Mutopia's: written for this page, and said so, with its licence
        expect(p.source).toBe('https://github.com/wustep/instruments#license');
        expect(p.credit).toMatch(/Fable 5\.2/);
        expect(p.credit).toMatch(/CC0 1\.0/);
      } else expect(p.source).toMatch(/^https:\/\/www\.mutopiaproject\.org\/cgibin\/piece-info\.cgi\?id=\d+$/);
    }
    // the only pieces that are not Mutopia's are those named here
    expect(PIECES.filter((p) => !/mutopiaproject/.test(p.source)).map((p) => p.id)).toEqual(['toward-morning']);
  });

  it('Toward Morning: thirteen lines, one to a seat by its own names; every note in its instrument’s compass, one voice to a wind; its own dynamics; the thirteen’s play icon plays it', () => {
    const tm = PIECES.find((p) => p.id === 'toward-morning')!;
    const { song } = load(tm.file);
    expect(`${tm.composer}, ${tm.title}`).toBe('Fable 5.2, Toward Morning');
    expect(tm.path).toBe('symphony');
    expect(song.lines.map((l) => `${l.name}~${l.program}`)).toEqual(['Flute~73', 'Oboe~68', 'Clarinet~71', 'Bassoon~70', 'Horn~60', 'Trumpet~56', 'Trombone~57', 'Timpani~47', 'Violin I~40', 'Violin II~40', 'Viola~41', 'Cello~42', 'Double Bass~43']);
    // four minutes and twenty seconds
    expect(song.duration).toBeGreaterThan(255);
    expect(song.duration).toBeLessThan(265);
    const seats = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'timpani', 'violin', 'violin', 'viola', 'cello', 'bass'];
    const plan = piecePlan(tm, song.lines, 13);
    expect(lineupOf(plan)).toEqual(seats);
    // each line on its own seat, as written (no transposition, nothing folded by octaves)
    expect(plan.lines.map((rs) => rs.map((r) => [r.part, r.shift]))).toEqual(seats.map((_, i) => [[i, 0]]));
    song.lines.forEach((l, i) => {
      const v = VOICE_INFO[plan.parts[i].voice];
      expect(l.lo, `${l.name} low`).toBeGreaterThanOrEqual(v.lo);
      expect(l.hi, `${l.name} high`).toBeLessThanOrEqual(v.hi);
      expect(l.poly, `${l.name} voices`).toBeLessThanOrEqual(v.poly);
    });
    // dropped as a plain file on a stage with room, its names seat the same orchestra
    expect(lineupOf(autoPlan(song.lines, { cap: 13 }))).toEqual(seats);
    // it has its own dynamics: automatic expression leaves it as written
    expect(express(song).shaped).toBe(false);
    // the play icon: thirteen seats play it, the symphony's eighteen still Beethoven's Fifth
    expect(PIECES[pieceForLineup(seats as never)].id).toBe('toward-morning');
    const fifth = PIECES.find((p) => p.id === 'beethoven5-i')!;
    expect(PIECES[pieceForLineup(fifth.parts.map((q) => q.voice))].id).toBe('beethoven5-i');
    expect(PIECES[PIECES.length - 1].id).toBe('toward-morning');
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
      // public domain, or a Creative Commons licence that lets the file be passed on with its credit
      // (the oboe's Brandenburg: CC BY 3.0; the symphony brief allows a CC licence that permits redistribution)
      expect(d.credit).toMatch(/public domain|Creative Commons Attribution(-ShareAlike)? \d\.\d/);
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
      if (id === 'flute' || id === 'oboe' || id === 'trumpet') {
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
