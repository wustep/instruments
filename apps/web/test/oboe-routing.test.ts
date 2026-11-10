// The oboe in Orchestra mode: a file's oboe lines reach it by name (Italian, French, German, English,
// abbreviations, the cor anglais) or General MIDI program (68 oboe, 69 English horn); Mutopia's own
// Brandenburg No. 1 Adagio (the oboe's piece) routes its three oboe parts to oboes, two of them second
// and third players; and the oboe's neighbours keep theirs (a flute, a clarinet, a bassoon, a horn).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { addPart, autoPlan, fitShift, lineupOf, placeNote, playersOf, setPartVoice, voiceFromName, voiceFromProgram, VOICE_INFO } from '../src/orchestra/assign.ts';
import { keysFor, keyTargets, setSplit } from '../src/orchestra/keys.ts';
import { soundSeats } from '../src/orchestra/seats.ts';

const load = (f: string) => {
  const b = readFileSync(join(import.meta.dirname, '../public/pieces', f));
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

describe('orchestra: the oboe', () => {
  it('its names and abbreviations, the cor anglais, and General MIDI 68 and 69', () => {
    for (const n of ['Oboe', 'Oboe I', 'oboe 2', 'Oboi', 'Hautbois', 'Hautbois 1', 'Hoboe', 'Oboe d’amore', 'Ob.', 'Ob. 1', 'Obs', 'Cor anglais', 'English Horn', 'Corno inglese', 'Englischhorn']) expect(voiceFromName(n), n).toBe('oboe');
    // its neighbours keep theirs (the clarinet its own since it came)
    for (const [n, v] of [['Flauto', 'flute'], ['Clarinetto in B', 'clarinet'], ['Fagotto', 'bassoon'], ['Corno in F', 'horn'], ['Oboe-less Violin', 'violin']] as const) expect(voiceFromName(n), n).toBe(v);
    expect(voiceFromProgram(68)).toBe('oboe');
    expect(voiceFromProgram(69)).toBe('oboe');
    expect(voiceFromProgram(71)).toBe('clarinet');
    expect(voiceFromProgram(73)).toBe('flute');
  });

  it('its compass is the engine’s (B♭3–A6, concert pitch); a cor anglais line below B♭3 moves up an octave', () => {
    expect([VOICE_INFO.oboe.lo, VOICE_INFO.oboe.hi]).toEqual([58, 93]);
    expect(placeNote(57, 0, 'oboe')).toBe(69);
    expect(placeNote(81, 0, 'oboe')).toBe(81);
    // a cor anglais part (E3–C6 sounding, mostly below the oboe's middle) moves up an octave
    expect(fitShift({ lo: 52, hi: 70, median: 60 }, 'oboe')).toBe(12);
    // an oboe part as written stays
    expect(fitShift({ lo: 62, hi: 86, median: 74 }, 'oboe')).toBe(0);
  });

  it('Brandenburg No. 1’s Adagio (Mutopia’s file): its three oboes on oboes, the second and third their own players', () => {
    const song = load('bach-bwv1046-adagio-oboe.mid');
    expect(song.lines.map((l) => [l.instrument, l.program])).toEqual([['oboe', 68]]);
    const p = autoPlan(song.lines, { cap: 6 });
    expect(lineupOf(p)).toEqual(['oboe']);
    // three oboe lines on three oboes by hand: each its own engine, the second and third other players
    let q = addPart(p, song.lines, 'oboe', [0], 8)!;
    q = addPart(q, song.lines, 'oboe', [0], 8)!;
    expect(lineupOf(q)).toEqual(['oboe', 'oboe', 'oboe']);
    expect(playersOf(q)).toEqual([0, 1, 2]);
    // and one becomes a flute (the routing kept)
    const r = setPartVoice(q, song.lines, 2, 'flute');
    expect(lineupOf(r)).toEqual(['oboe', 'oboe', 'flute']);
  });

  it('a wind quintet-like file: flute, oboe, strings; the keys play the oboe or split it a note', () => {
    const lines = [
      { name: 'Flute', instrument: 'flute', program: 73, lo: 72, hi: 93, median: 81, notes: 300, poly: 1 },
      { name: 'Oboe', instrument: 'oboe', program: 68, lo: 62, hi: 86, median: 74, notes: 300, poly: 1 },
      { name: 'Violin', instrument: 'violin', program: 40, lo: 55, hi: 88, median: 72, notes: 300, poly: 1 },
      { name: 'Cello', instrument: 'cello', program: 42, lo: 36, hi: 64, median: 50, notes: 300, poly: 1 },
    ];
    const p = autoPlan(lines, { cap: 6 });
    expect(lineupOf(p)).toEqual(['flute', 'oboe', 'violin', 'cello']);
    // split: a chord dealt out by register, one note each (the oboe takes the one nearest its middle)
    const lu = lineupOf(p);
    const c = setSplit(keysFor(lu), true);
    const busy = new Set<number>();
    const got: Record<string, number> = {};
    for (const m of [84, 74, 67, 48]) {
      const [t] = keyTargets(m, c, lu, busy);
      busy.add(t.part);
      got[lu[t.part]] = t.pitch;
    }
    expect(got.oboe).toBe(74);
    // chosen alone, the keys play the oboe in its range
    expect(keyTargets(96, { parts: [1], split: false, byUser: true }, lu, new Set())).toEqual([{ part: 1, pitch: 84 }]);
    // its seat is a melodic one on the arc, heard from there
    const seats = soundSeats(lu.map((v) => ({ instrument: VOICE_INFO[v].instrument })));
    expect(seats).toHaveLength(4);
    expect(new Set(seats.map((s) => s.join())).size).toBe(4);
  });
});
