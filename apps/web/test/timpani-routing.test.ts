// The timpani in Orchestra mode: a file's timpani line reaches them by name (English, Italian, German, French,
// Spanish, abbreviations) or General MIDI program 47, and nothing else does (a bass drum, a plain
// "Percussion", a bass line by range); their compass is the engine's (C2–A3, four pedal drums), a line
// outside it moves by octaves; two mallets (poly 2) but no section (a line never joins the timpani to make
// room); Mozart's Dies irae (the timpani's piece) is its line; a hand-picked lineup gives its timpani the
// timpani part; up to two sets, each a player of its own, seated behind the others.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { addPart, autoPlan, fitShift, guessVoice, lineupOf, matchLineup, placeNote, playersOf, voiceFromName, voiceFromProgram, VOICE_INFO, type LineInfo } from '../src/orchestra/assign.ts';
import { seatPlaces, soundSeats } from '../src/orchestra/seats.ts';
import { DEMOS, demoSong } from '../src/orchestra/pieces.ts';
import { INSTRUMENT_INFO } from '@piano-model/engine';

const PIECE_DIR = join(import.meta.dirname, '../public/pieces');
const load = (f: string) => {
  const b = readFileSync(join(PIECE_DIR, f));
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
const line = (name: string, program: number, lo: number, hi: number, notes = 100, poly = 1, instrument = ''): LineInfo => ({ name, instrument, program, lo, hi, median: Math.round((lo + hi) / 2), notes, poly });

describe('orchestra: the timpani', () => {
  it('their names in five languages and abbreviations, and General MIDI 47; nothing else is them', () => {
    for (const n of ['Timpani', 'timpani', 'Timpano', 'Timp.', 'Timp', 'Timb.', 'Tmp.', 'Kettledrums', 'Kettle drum', 'Pauken', 'Pauke', 'Pk.', 'Timbales', 'Timballes', 'Percussion (Timpani)', 'Timpani in C–G', 'nine: timpani'])
      expect(voiceFromName(n), n).toBe('timpani');
    // their neighbours keep theirs, and a drum that is not a kettledrum is no one's
    for (const [n, v] of [['Bass Drum', null], ['Percussion', null], ['Snare Drum', null], ['Drums', null], ['Contrabass', 'bass'], ['Tuba', 'bass'], ['Trombone', 'trumpet'], ['Trumpet in D', 'trumpet'], ['Corno in F', 'horn'], ['Fagotto', 'bassoon'], ['Violoncello', 'cello']] as const)
      expect(voiceFromName(n), n).toBe(v);
    expect(voiceFromProgram(47)).toBe('timpani');
    // the string and voice ensembles around it still go by range
    for (const p of [48, 49, 50, 51, 52, 53, 54, 55]) expect(voiceFromProgram(p), String(p)).toBe(null);
  });

  it('their compass is the engine’s (C2–A3); a line outside it moves by octaves; two mallets', () => {
    expect([VOICE_INFO.timpani.lo, VOICE_INFO.timpani.hi]).toEqual([INSTRUMENT_INFO.timpani.lo, INSTRUMENT_INFO.timpani.hi]);
    expect([VOICE_INFO.timpani.lo, VOICE_INFO.timpani.hi]).toEqual([36, 57]);
    expect(VOICE_INFO.timpani.poly).toBe(2);
    expect(placeNote(31, 0, 'timpani')).toBe(43);
    expect(placeNote(62, 0, 'timpani')).toBe(50);
    // a classical part in C (G2 and C3) and Beethoven's in F (F2 and C3) stay where they are
    expect(fitShift({ lo: 43, hi: 48, median: 48 }, 'timpani')).toBe(0);
    expect(fitShift({ lo: 41, hi: 48, median: 45 }, 'timpani')).toBe(0);
  });

  it('a file names them: a timpani line goes to the timpani, never a bass line by its range alone', () => {
    const lines = [line('Violino I', 40, 55, 91), line('Viola', 41, 48, 79), line('Violoncello', 42, 36, 67), line('Timpani', 47, 43, 48, 60), line('Basso', 43, 28, 55)];
    const p = autoPlan(lines, { cap: 8 });
    expect(lineupOf(p)).toContain('timpani');
    const ti = lineupOf(p).indexOf('timpani');
    expect(p.lines[3].map((r) => r.part)).toEqual([ti]);
    // only it
    expect(p.parts[ti].lines).toEqual([3]);
    // an unnamed low line (no program) is a bass line, not a timpani part
    expect(guessVoice(line('', -1, 36, 55))).not.toBe('timpani');
    // a GM 47 line with no name is the timpani's
    expect(guessVoice(line('', 47, 41, 48))).toBe('timpani');
  });

  it('a full stage: a line never joins the timpani to make room (no section of two mallets)', () => {
    const lines = [line('Flauto', 73, 72, 93), line('Oboe', 68, 65, 86), line('Timpani', 47, 41, 48), line('Violino I', 40, 55, 91), line('Violino II', 40, 55, 86), line('Viola', 41, 48, 76), line('Violoncello', 42, 36, 67)];
    const p = autoPlan(lines, { cap: 4 });
    const ti = lineupOf(p).indexOf('timpani');
    if (ti >= 0) expect(p.parts[ti].lines).toEqual([2]);
    for (let k = 0; k < p.parts.length; k++) if (k !== ti) expect(p.parts[k].lines).not.toContain(2);
  });

  it('a hand-picked lineup gives its timpani the timpani part (not the line nearest their register)', () => {
    const lines = [line('Violin', 40, 55, 88, 300), line('Cello', 42, 36, 60, 300), line('Timpani', 47, 41, 48, 40)];
    const p = matchLineup(lines, ['violin', 'cello', 'timpani']);
    expect(p.parts[2].lines).toEqual([2]);
    expect(p.parts[1].lines).toEqual([1]);
  });

  it('the shipped piece: Mozart’s Dies irae, its timpani line (D3 and A2) on the timpani, from the first bar to bar 27', () => {
    const d = DEMOS.timpani;
    expect(d.instrument).toBe('timpani');
    const song = load(d.file);
    const l = song.lines[d.lines![0]];
    expect(l.name.toLowerCase()).toContain('timpani');
    expect(l.program).toBe(47);
    expect(voiceFromName(l.name)).toBe('timpani');
    const s = demoSong(song, d);
    const ons = s.events.filter((e) => e.kind === 'on');
    expect(new Set(ons.map((e) => (e as { midi: number }).midi))).toEqual(new Set([45, 50]));
    expect(ons.length).toBeGreaterThan(60);
    expect(s.duration).toBeLessThan(40);
    // the whole file plans its timpani line onto the timpani
    const p = autoPlan(song.lines, { cap: 12 });
    const ti = lineupOf(p).indexOf('timpani');
    expect(ti).toBeGreaterThanOrEqual(0);
    expect(p.lines[d.lines![0]].map((r) => r.part)).toEqual([ti]);
  });

  it('two sets, each a player of its own, seated behind the other players (and the pianos)', () => {
    const lines = [line('Timpani I', 47, 43, 48), line('Violin', 40, 55, 88)];
    let p = autoPlan(lines, { cap: 6 });
    const p2 = addPart(p, lines, 'timpani', [0], 6);
    expect(p2).not.toBeNull();
    p = p2!;
    expect(lineupOf(p).filter((v) => v === 'timpani')).toHaveLength(2);
    const players = playersOf(p);
    const tis = lineupOf(p).map((v, i) => (v === 'timpani' ? i : -1)).filter((i) => i >= 0);
    expect(players[tis[0]]).not.toBe(players[tis[1]]);
    // seats: the sets behind the violin, apart from each other
    const places = seatPlaces([{ family: 'bowed', kind: 'grand', cello: false }, { family: 'percussion', kind: 'grand', cello: false }, { family: 'percussion', kind: 'grand', cello: false }]);
    expect(places[1].z).toBeGreaterThan(places[0].z + 1);
    expect(Math.abs(places[2].x - places[1].x)).toBeGreaterThan(2.5);
    // with a piano, behind it too
    const withPiano = seatPlaces([{ family: 'piano', kind: 'grand', cello: false }, { family: 'bowed', kind: 'grand', cello: false }, { family: 'percussion', kind: 'grand', cello: false }]);
    expect(withPiano[2].z).toBeGreaterThan(withPiano[0].z + 1);
    // the sound's seats follow
    const ss = soundSeats([{ instrument: 'violin' }, { instrument: 'timpani' }]);
    expect(ss[1][1]).toBeGreaterThan(ss[0][1]);
  });
});
