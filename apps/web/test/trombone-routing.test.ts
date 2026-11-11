// The trombone in Orchestra mode: a file's trombone lines reach it by name (English, Italian, German, French,
// Spanish, the sackbut, abbreviations, its three sizes) or General MIDI program 57, before the double bass's
// "bass" and the viola's "alto" (a bass trombone is not a double bass, an alto trombone not a viola); the
// trumpet keeps its names and programs, the tuba stays the double bass's; its compass spans the three sizes
// (the bass trombone's C1 to the alto's G5), each seat the size its lines need; Bach's Air for four trombones
// (the trombone's own piece, and an Orchestra piece) is planned onto four trombones, alto, tenor, tenor, bass;
// up to three by the picker, each a player of its own, each heard from its own seat.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { addPart, autoPlan, fitShift, guessVoice, lineupOf, placeNote, playersOf, tromboneSizeOf, voiceFromName, voiceFromProgram, VOICE_INFO, type LineInfo } from '../src/orchestra/assign.ts';
import { soundSeats } from '../src/orchestra/seats.ts';
import { DEMOS, PIECES, demoSong, piecePlan } from '../src/orchestra/pieces.ts';
import { INSTRUMENT_INFO, TROMBONE_SIZES, TROMBONE_LO, TROMBONE_HI } from '@piano-model/engine';

const PIECE_DIR = join(import.meta.dirname, '../public/pieces');
const load = (f: string) => {
  const b = readFileSync(join(PIECE_DIR, f));
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
const line = (name: string, program: number, lo: number, hi: number, notes = 100, poly = 1, instrument = ''): LineInfo => ({ name, instrument, program, lo, hi, median: Math.round((lo + hi) / 2), notes, poly });

describe('orchestra: the trombone', () => {
  it('its names in five languages, its sizes and abbreviations, and General MIDI 57; its neighbours keep theirs', () => {
    for (const n of ['Trombone', 'Trombones', 'trombone 1', 'Tromboni', 'Trombone I', 'Trombón', 'Posaune', 'Posaunen', 'Altposaune', 'Tenorposaune', 'Bassposaune', 'Alto Trombone', 'Tenor Trombone', 'Bass Trombone', 'Trombone basso', 'Trombone alto', 'Sackbut', 'Saqueboute', 'Tbn.', 'Tbn', 'Tbns', 'Trb.', 'Tromb.', 'Pos. 1', 'B. Tbn.', 'Trombone in B♭'])
      expect(voiceFromName(n), n).toBe('trombone');
    for (const [n, v] of [['Tromba', 'trumpet'], ['Trumpet', 'trumpet'], ['Trompete', 'trumpet'], ['Cornet', 'trumpet'], ['Tuba', 'tuba'], ['Contrabass', 'bass'], ['Basso', 'bass'], ['Alto', 'viola'], ['Viola', 'viola'], ['Horn in F', 'horn'], ['Corno', 'horn'], ['Bass Clarinet', 'clarinet'], ['Fagotto', 'bassoon'], ['Position', null]] as const)
      expect(voiceFromName(n), n).toBe(v);
    expect(voiceFromProgram(57)).toBe('trombone');
    for (const p of [56, 59, 61, 62, 63]) expect(voiceFromProgram(p), String(p)).toBe('trumpet');
    expect(voiceFromProgram(60)).toBe('horn');
  });

  it('its compass spans the three sizes (C1–G5, the engine’s); the stage’s own trombone is the tenor', () => {
    expect([VOICE_INFO.trombone.lo, VOICE_INFO.trombone.hi]).toEqual([TROMBONE_LO, TROMBONE_HI]);
    expect([TROMBONE_LO, TROMBONE_HI]).toEqual([TROMBONE_SIZES.bass.lo, TROMBONE_SIZES.alto.hi]);
    expect([INSTRUMENT_INFO.trombone.lo, INSTRUMENT_INFO.trombone.hi]).toEqual([TROMBONE_SIZES.tenor.lo, TROMBONE_SIZES.tenor.hi]);
    expect(VOICE_INFO.trombone.poly).toBe(1);
    expect(placeNote(20, 0, 'trombone')).toBe(32);
    expect(placeNote(84, 0, 'trombone')).toBe(72);
    // a tenor part (E2–B♭4) and a bass trombone's (B♭1–F4) stay where they are
    expect(fitShift({ lo: 40, hi: 70, median: 55 }, 'trombone')).toBe(0);
    expect(fitShift({ lo: 34, hi: 65, median: 46 }, 'trombone')).toBe(0);
  });

  it('a seat’s size: named alto, tenor or bass; else a low part a bass trombone, a high one an alto', () => {
    expect(tromboneSizeOf([line('Alto Trombone', 57, 50, 75)])).toBe('alto');
    expect(tromboneSizeOf([line('Trombone basso', 57, 34, 62)])).toBe('bass');
    expect(tromboneSizeOf([line('Bassposaune', -1, 34, 62)])).toBe('bass');
    expect(tromboneSizeOf([line('Tenor Trombone', 57, 40, 70)])).toBe('tenor');
    expect(tromboneSizeOf([line('Trombone', 57, 40, 70)])).toBe('tenor');
    expect(tromboneSizeOf([line('Trombone 3', 57, 31, 58)])).toBe('bass');
    expect(tromboneSizeOf([line('Trombone 1', 57, 55, 77)])).toBe('alto');
    expect(tromboneSizeOf([])).toBe('tenor');
    // many lines: a bass line makes it a bass; all high, an alto
    expect(tromboneSizeOf([line('Trombone 1', 57, 55, 77), line('Trombone 3', 57, 31, 58)])).toBe('bass');
  });

  it('a file names them: trombone lines go to the trombone, a bass trombone’s too (not the double bass)', () => {
    const lines = [line('Violino I', 40, 55, 91), line('Viola', 41, 48, 79), line('Violoncello', 42, 36, 67), line('Trombone I', 57, 48, 72, 80), line('Bass Trombone', 57, 34, 60, 80), line('Contrabasso', 43, 28, 55)];
    const p = autoPlan(lines, { cap: 8 });
    const voices = lineupOf(p);
    for (const li of [3, 4]) expect(p.lines[li].map((r) => voices[r.part]), String(li)).toEqual(['trombone']);
    expect(p.lines[5].map((r) => voices[r.part])).toEqual(['bass']);
    // unnamed, GM 57 is the trombone's
    expect(guessVoice(line('', 57, 45, 65))).toBe('trombone');
    // a track named only for its register, on a trombone (instrument name or program): the trombone
    expect(guessVoice({ ...line('alto', 57, 52, 72), instrument: 'trombone' })).toBe('trombone');
    expect(guessVoice({ ...line('bass', 57, 37, 62), instrument: 'trombone' })).toBe('trombone');
    // …but a plain "Alto" with nothing else is still a viola, a plain "Bass" a double bass
    expect(guessVoice(line('Alto', -1, 48, 72))).toBe('viola');
    expect(guessVoice(line('Bass', -1, 28, 50))).toBe('bass');
  });

  it('Bach’s Air: the trombone’s own piece (its top line, on the tenor) and four trombones in the Orchestra', () => {
    const d = DEMOS.trombone;
    expect(d.instrument).toBe('trombone');
    const song = load(d.file);
    expect(song.lines.map((l) => l.program)).toEqual([57, 57, 57, 57]);
    const s = demoSong(song, d);
    const ons = s.events.filter((e) => e.kind === 'on') as { midi: number }[];
    for (const e of ons) expect(e.midi).toBeGreaterThanOrEqual(TROMBONE_SIZES.tenor.lo);
    // the file alone plans every line onto a trombone, each seat its size
    const p = autoPlan(song.lines, { cap: 8 });
    expect(lineupOf(p)).toEqual(['trombone', 'trombone', 'trombone', 'trombone']);
    const piece = PIECES.find((x) => x.id === 'air')!;
    const pp = piecePlan(piece, song.lines, 8);
    expect(lineupOf(pp)).toEqual(['trombone', 'trombone', 'trombone', 'trombone']);
    expect(pp.parts.map((part) => tromboneSizeOf(part.lines.map((i) => song.lines[i])))).toEqual(['alto', 'tenor', 'tenor', 'bass']);
  });

  it('three by the picker, each a player of its own, each heard from a seat of its own', () => {
    const lines = [line('Trombone', 57, 45, 70), line('Violin', 40, 55, 88)];
    let p = autoPlan(lines, { cap: 6 });
    for (let k = 0; k < 2; k++) p = addPart(p, lines, 'trombone', [0], 6)!;
    const tb = lineupOf(p).map((v, i) => (v === 'trombone' ? i : -1)).filter((i) => i >= 0);
    expect(tb).toHaveLength(3);
    const players = playersOf(p);
    expect(new Set(tb.map((i) => players[i])).size).toBe(3);
    // (where the brass sit is the seating's: one place each, apart)
    const ss = soundSeats([{ instrument: 'violin' }, { instrument: 'trombone' }, { instrument: 'trombone' }]);
    expect(new Set(ss.map((x) => x.join())).size).toBe(3);
  });
});
