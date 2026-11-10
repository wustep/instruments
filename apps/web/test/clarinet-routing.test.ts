// The clarinet in Orchestra mode: a file's clarinet lines reach it by name (Italian, French, German,
// English, abbreviations, its kin: the bass clarinet, the basset horn) or General MIDI program 71;
// Mutopia's own Mozart Clarinet Quintet Larghetto (the clarinet's piece) seats a clarinet with its
// string quartet; a second clarinet is a second player; and its neighbours keep theirs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { addPart, autoPlan, fitShift, lineupOf, placeNote, playersOf, setPartVoice, voiceFromName, voiceFromProgram, VOICE_INFO } from '../src/orchestra/assign.ts';
import { keysFor, keyTargets, setSplit } from '../src/orchestra/keys.ts';
import { soundSeats } from '../src/orchestra/seats.ts';
import { DEMOS, demoSong } from '../src/orchestra/pieces.ts';

const load = (f: string) => {
  const b = readFileSync(join(import.meta.dirname, '../public/pieces', f));
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

describe('orchestra: the clarinet', () => {
  it('its names and abbreviations, its kin, and General MIDI 71', () => {
    for (const n of ['Clarinet', 'Clarinet in B♭', 'Clarinet 2', 'Clarinets', 'Clarinetto', 'Clarinetti in A', 'Clarinette', 'Klarinette', 'Klarinette in B', 'Cl.', 'Cl. 1', 'Cls', 'Clar.', 'Kl. 2', 'Bass Clarinet', 'Bassetthorn', 'Basset horn', 'Chalumeau']) expect(voiceFromName(n), n).toBe('clarinet');
    // its neighbours keep theirs
    for (const [n, v] of [['Flauto', 'flute'], ['Oboe', 'oboe'], ['Fagotto', 'bassoon'], ['Corno in F', 'horn'], ['Klavier', 'grand'], ['Kontrabass', 'bass'], ['Tenor Sax', 'flute'], ['Clavichord', 'grand']] as const) expect(voiceFromName(n), n).toBe(v);
    expect(voiceFromProgram(71)).toBe('clarinet');
    for (const p of [64, 65, 66, 67, 72, 73]) expect(voiceFromProgram(p), String(p)).toBe('flute');
  });

  it('its compass is the engine’s (D3–B♭6, concert pitch); a bass clarinet line moves up an octave', () => {
    expect([VOICE_INFO.clarinet.lo, VOICE_INFO.clarinet.hi]).toEqual([50, 94]);
    expect(placeNote(49, 0, 'clarinet')).toBe(61);
    expect(placeNote(81, 0, 'clarinet')).toBe(81);
    // a bass clarinet part (D2–F5 sounding, mostly an octave under the clarinet's middle) moves up
    expect(fitShift({ lo: 38, hi: 65, median: 52 }, 'clarinet')).toBe(12);
    // a clarinet part as it sounds stays
    expect(fitShift({ lo: 50, hi: 86, median: 70 }, 'clarinet')).toBe(0);
  });

  it('the Clarinet Quintet’s Larghetto (Mutopia’s file): a clarinet and a string quartet; a second clarinet is a second player', () => {
    const song = load('mozart-k581-ii.mid');
    expect(song.lines.map((l) => [l.instrument, l.program])).toEqual([['clarinet', 71], ['violin', 40], ['violin', 40], ['viola', 41], ['cello', 42]]);
    const p = autoPlan(song.lines, { cap: 6 });
    expect(lineupOf(p)).toEqual(['clarinet', 'violin', 'violin', 'viola', 'cello']);
    // the demo is the clarinet's line alone, every note in its compass
    const d = demoSong(song, DEMOS.clarinet);
    const ms = d.events.flatMap((e) => (e.kind === 'on' ? [e.midi] : []));
    expect(Math.min(...ms)).toBeGreaterThanOrEqual(50);
    expect(Math.max(...ms)).toBeLessThanOrEqual(94);
    // a second clarinet on the same line: its own engine, another player; and one becomes an oboe
    const q = addPart(p, song.lines, 'clarinet', [0], 8)!;
    expect(lineupOf(q)).toEqual(['clarinet', 'clarinet', 'violin', 'violin', 'viola', 'cello']);
    expect(playersOf(q).slice(0, 2)).toEqual([0, 1]);
    const r = setPartVoice(q, song.lines, 1, 'oboe');
    expect(lineupOf(r).slice(0, 2)).toEqual(['clarinet', 'oboe']);
  });

  it('flute, oboe, clarinet and strings: each wind on its own; the keys play the clarinet or split it a note', () => {
    const lines = [
      { name: 'Flute', instrument: 'flute', program: 73, lo: 72, hi: 93, median: 81, notes: 300, poly: 1 },
      { name: 'Oboe', instrument: 'oboe', program: 68, lo: 62, hi: 86, median: 74, notes: 300, poly: 1 },
      { name: 'Clarinet in B', instrument: 'clarinet', program: 71, lo: 52, hi: 84, median: 67, notes: 300, poly: 1 },
      { name: 'Cello', instrument: 'cello', program: 42, lo: 36, hi: 64, median: 50, notes: 300, poly: 1 },
    ];
    const p = autoPlan(lines, { cap: 6 });
    const lu = lineupOf(p);
    expect(lu).toEqual(['flute', 'oboe', 'clarinet', 'cello']);
    const c = setSplit(keysFor(lu), true);
    const busy = new Set<number>();
    const got: Record<string, number> = {};
    for (const m of [84, 74, 67, 48]) {
      const [t] = keyTargets(m, c, lu, busy);
      busy.add(t.part);
      got[lu[t.part]] = t.pitch;
    }
    expect(got.clarinet).toBe(67);
    // chosen alone, the keys play the clarinet in its range (a note below it moves up an octave)
    expect(keyTargets(45, { parts: [2], split: false, byUser: true }, lu, new Set())).toEqual([{ part: 2, pitch: 57 }]);
    // its seat is a melodic one, heard from there
    const seats = soundSeats(lu.map((v) => ({ instrument: VOICE_INFO[v].instrument })));
    expect(new Set(seats.map((s) => s.join())).size).toBe(4);
  });
});
