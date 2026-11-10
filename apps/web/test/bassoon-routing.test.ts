// The bassoon in Orchestra mode: a file's bassoon lines reach it by name (Italian, German, French,
// Spanish, English, the score's abbreviations) or General MIDI program 70; the contrabassoon is not it
// (the double bass keeps that line until it has its own); Mutopia's own Mozart Bassoon Concerto
// Andante (the bassoon's piece) plays the solo line in its compass; two bassoons (Beethoven's Fifth has
// two) are two players; and its neighbours keep theirs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { addPart, autoPlan, fitShift, lineupOf, placeNote, playersOf, voiceFromName, voiceFromProgram, VOICE_INFO } from '../src/orchestra/assign.ts';
import { keysFor, keyTargets, setSplit } from '../src/orchestra/keys.ts';
import { soundSeats } from '../src/orchestra/seats.ts';
import { DEMOS, demoSong } from '../src/orchestra/pieces.ts';

const load = (f: string) => {
  const b = readFileSync(join(import.meta.dirname, '../public/pieces', f));
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

describe('orchestra: the bassoon', () => {
  it('its names and abbreviations, and General MIDI 70; the contrabassoon is not it', () => {
    for (const n of ['Bassoon', 'Bassoons', 'Bassoon 2', 'Fagotto', 'Fagotti', 'Fagotto I', 'Fagott', 'Fagotte', 'Basson', 'Bassons', 'Fagot', 'Bajón', 'Bn.', 'Bn. 1', 'Bsn.', 'Bsn', 'Bsns', 'Fg.', 'Fg. 2', 'Fag.', 'four: bassoon']) expect(voiceFromName(n), n).toBe('bassoon');
    // the contrabassoon is the double bass's until it has an instrument of its own
    for (const n of ['Contrabassoon', 'Contra-bassoon', 'Kontrafagott', 'Contrafagotto', 'Contrebasson']) expect(voiceFromName(n), n).toBe('bass');
    // its neighbours keep theirs ("basso", "basse" and "bass" are the double bass's, not the basson's)
    for (const [n, v] of [['Violoncello', 'cello'], ['Basso continuo', 'cello'], ['Basso', 'bass'], ['Basse', 'bass'], ['Bassi', 'bass'], ['Bass Clarinet', 'clarinet'], ['Oboe', 'oboe'], ['Clarinetto in B', 'clarinet'], ['Corno in F', 'horn'], ['Flauto', 'flute']] as const) expect(voiceFromName(n), n).toBe(v);
    expect(voiceFromProgram(70)).toBe('bassoon');
    // the other reeds keep theirs: the oboe and English horn, the clarinet, the saxophones and pipes the flute's
    for (const [p, v] of [[68, 'oboe'], [69, 'oboe'], [71, 'clarinet'], [64, 'flute'], [67, 'flute'], [72, 'flute']] as const) expect(voiceFromProgram(p), String(p)).toBe(v);
  });

  it('its compass is the engine’s (B♭1–E5, in C); a line above it moves down an octave', () => {
    expect([VOICE_INFO.bassoon.lo, VOICE_INFO.bassoon.hi]).toEqual([34, 76]);
    expect(placeNote(33, 0, 'bassoon')).toBe(45);
    expect(placeNote(79, 0, 'bassoon')).toBe(67);
    // a bassoon part as it sounds stays (Beethoven's Fifth, I: C2–A4)
    expect(fitShift({ lo: 36, hi: 69, median: 57 }, 'bassoon')).toBe(0);
    // a cello's tenor-clef tune in the bassoon's compass stays too
    expect(fitShift({ lo: 48, hi: 72, median: 60 }, 'bassoon')).toBe(0);
  });

  it('the Bassoon Concerto’s Andante (Mutopia’s file): the demo is the solo line, in the compass, from its entry', () => {
    const song = load('mozart-k191-ii.mid');
    expect(song.lines.map((l) => [l.instrument, l.program])).toEqual([['oboe', 68], ['french horn', 60], ['bassoon', 70], ['viola', 41], ['cello', 42], ['violin', 40], ['violin', 40]]);
    const d = demoSong(song, DEMOS.bassoon);
    const ms = d.events.flatMap((e) => (e.kind === 'on' ? [e.midi] : []));
    expect(Math.min(...ms)).toBeGreaterThanOrEqual(34);
    expect(Math.max(...ms)).toBeLessThanOrEqual(76);
    // its entry on C4 after the strings' six bars, its first two phrases (about half a minute)
    expect(ms[0]).toBe(60);
    expect(d.duration).toBeGreaterThan(25);
    expect(d.duration).toBeLessThan(40);
    // every note at about mezzo-forte (the file's are all at full force)
    expect(Math.max(...d.events.flatMap((e) => (e.kind === 'on' ? [e.vel] : [])))).toBeLessThanOrEqual(72);
  });

  it('two bassoons (Beethoven’s Fifth has two): each its own line, a third doubling one a second player, seated with the woodwinds; the keys play one or split it a note', () => {
    const lines = [
      { name: 'Flauto I', instrument: 'flute', program: 73, lo: 72, hi: 93, median: 81, notes: 300, poly: 1 },
      { name: 'Oboe I', instrument: 'oboe', program: 68, lo: 62, hi: 86, median: 74, notes: 300, poly: 1 },
      { name: 'Clarinetto I in B', instrument: 'clarinet', program: 71, lo: 55, hi: 84, median: 70, notes: 300, poly: 1 },
      { name: 'Fagotto I', instrument: 'bassoon', program: 70, lo: 41, hi: 69, median: 57, notes: 300, poly: 1 },
      { name: 'Fagotto II', instrument: 'bassoon', program: 70, lo: 36, hi: 62, median: 50, notes: 300, poly: 1 },
      { name: 'Violoncello', instrument: 'cello', program: 42, lo: 36, hi: 64, median: 50, notes: 300, poly: 1 },
    ];
    const p = autoPlan(lines, { cap: 8 });
    const lu = lineupOf(p);
    expect(lu).toEqual(['flute', 'oboe', 'clarinet', 'bassoon', 'bassoon', 'cello']);
    // each bassoon plays its own line
    expect(p.parts.filter((x) => x.voice === 'bassoon').map((x) => x.lines)).toEqual([[3], [4]]);
    // a third by hand doubling the first's line: its own engine, a second player on that line (its own
    // breath, tuning and vibrato)
    const q = addPart(p, lines, 'bassoon', [3], 10)!;
    expect(lineupOf(q).filter((v) => v === 'bassoon').length).toBe(3);
    const pl = playersOf(q).filter((_, k) => q.parts[k].voice === 'bassoon');
    expect(pl.sort()).toEqual([0, 0, 1]);
    // GM 70 alone (no name) is a bassoon too
    const r = autoPlan([{ name: '', instrument: '', program: 70, lo: 38, hi: 65, median: 50, notes: 200, poly: 1 }], { cap: 4 });
    expect(lineupOf(r)).toEqual(['bassoon']);
    // split, each instrument takes a key: the bassoons the low ones
    const c = setSplit(keysFor(lu), true);
    const busy = new Set<number>();
    const got: number[] = [];
    for (const m of [84, 74, 67, 55, 43, 40]) {
      const [t] = keyTargets(m, c, lu, busy);
      busy.add(t.part);
      got[t.part] = t.pitch;
    }
    expect(got[3] !== undefined || got[4] !== undefined).toBe(true);
    // chosen alone, the keys play a bassoon in its range (a note above it moves down an octave)
    expect(keyTargets(81, { parts: [3], split: false, byUser: true }, lu, new Set())).toEqual([{ part: 3, pitch: 69 }]);
    // each has its own seat, heard from there
    const seats = soundSeats(lu.map((v) => ({ instrument: VOICE_INFO[v].instrument })));
    expect(new Set(seats.map((s) => s.join())).size).toBe(6);
  });
});
