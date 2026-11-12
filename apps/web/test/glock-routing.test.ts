// The glockenspiel in the Orchestra's routing (orchestra/assign.ts): its names and abbreviations, General
// MIDI program 10 (byte 9), a part written two octaves under where it sounds brought up whole, its seat with
// the timpani, and that files without a glockenspiel part route as they did.
import { describe, expect, it } from 'vitest';
import { autoPlan, guessVoice, matchLineup, placeNote, voiceFromName, voiceFromProgram, VOICE_INFO, VOICES, type LineInfo } from '../src/orchestra/assign.ts';
import { orchestraPlan, rowsOf, seatKinds } from '../src/orchestra/seats.ts';
import { familyOf } from '../src/orchestra/sections.ts';

const L = (name: string, program: number, lo: number, hi: number, median = Math.round((lo + hi) / 2), poly = 1, notes = 200): LineInfo => ({ name, instrument: '', program, lo, hi, median, notes, poly, core: [lo, hi] });

describe('orchestra: the glockenspiel', () => {
  it('its names and abbreviations, General MIDI 10 (program byte 9); tubular bells, a celesta and the other mallets are not it', () => {
    for (const n of ['Glockenspiel', 'glockenspiel', 'Glock', 'Glock.', 'Glsp.', 'Glsp', 'Orchestra Bells', 'Orchestral Bells', 'Orch. Bells', 'Campanelli', 'Jeu de timbres', 'Glockenspiel 1'])
      expect(voiceFromName(n), n).toBe('glockenspiel');
    expect(voiceFromProgram(9)).toBe('glockenspiel');
    for (const [n, v] of [['Tubular Bells', null], ['Celesta', 'grand'], ['Timpani', 'timpani'], ['Piano', 'grand'], ['Harp', 'harp'], ['Flute', 'flute']] as const) expect(voiceFromName(n), n).toBe(v);
    // the neighbouring programs are as they were (a celesta 8, a music box 10, a vibraphone 11)
    for (const p of [8, 10, 11, 12, 13, 14]) expect(voiceFromProgram(p), String(p)).not.toBe('glockenspiel');
    expect(voiceFromProgram(47)).toBe('timpani');
    expect(VOICES).toContain('glockenspiel');
    expect(VOICE_INFO.glockenspiel).toMatchObject({ instrument: 'glockenspiel', lo: 79, hi: 108 });
    expect(familyOf('glockenspiel')).toBe('percussion');
  });

  it('a glockenspiel part gets the glockenspiel wherever it is written: where it sounds, an octave under, two octaves under', () => {
    expect(guessVoice(L('Glockenspiel', 9, 79, 103))).toBe('glockenspiel');
    expect(guessVoice(L('Glockenspiel', 9, 67, 91))).toBe('glockenspiel');
    expect(guessVoice(L('Glockenspiel', 9, 55, 84))).toBe('glockenspiel');
    expect(guessVoice(L('', 9, 55, 79))).toBe('glockenspiel');
    expect(guessVoice(L('Glock.', -1, 60, 84, 72, 2))).toBe('glockenspiel');
    // by octaves into G5–C8
    expect(placeNote(84, 0, 'glockenspiel')).toBe(84);
    expect(placeNote(60, 0, 'glockenspiel')).toBe(84);
    expect(placeNote(55, 0, 'glockenspiel')).toBe(79);
    expect(placeNote(110, 0, 'glockenspiel')).toBe(98);
    // a line that names no glockenspiel is as it was
    expect(guessVoice(L('Violin', 40, 55, 91))).toBe('violin');
    expect(guessVoice(L('', 0, 55, 84, 70, 5))).toBe('grand');
  });

  it('a file with a glockenspiel line: it gets its own, the others theirs; without it nothing moves; a lineup by hand leads it its line', () => {
    const lines = [L('Flute', 73, 62, 93), L('Glockenspiel', 9, 55, 79, 67), L('Violin', 40, 55, 88), L('Timpani', 47, 41, 53), L('Cello', 42, 36, 67)];
    const plan = autoPlan(lines, { cap: 12 });
    expect(plan.parts.map((p) => p.voice)).toEqual(['flute', 'glockenspiel', 'violin', 'timpani', 'cello']);
    // written two octaves under: the whole line comes up two octaves
    expect(plan.lines[1][0].shift).toBe(24);
    const without = autoPlan([lines[0], lines[2], lines[3], lines[4]], { cap: 12 });
    expect(without.parts.map((p) => p.voice)).toEqual(['flute', 'violin', 'timpani', 'cello']);
    const hand = matchLineup([L('Violin', 40, 55, 93, 74), L('Glockenspiel', 9, 55, 79, 67), L('Cello', 42, 36, 67, 50)], ['glockenspiel', 'violin', 'cello']);
    expect(hand.parts.map((p) => p.lines)).toEqual([[1], [0], [2]]);
    const none = matchLineup([L('Violin', 40, 55, 93, 74), L('Cello', 42, 36, 67, 50)], ['violin', 'cello']);
    expect(none.parts.map((p) => p.lines)).toEqual([[0], [1]]);
  });

  it('stands with the timpani at the back row’s left end, the timpani first', () => {
    const lineup = (['violin', 'violin', 'viola', 'cello', 'bass', 'flute', 'oboe', 'horn', 'trumpet', 'timpani', 'glockenspiel'] as const).map((v) => VOICE_INFO[v]);
    const plan = orchestraPlan(seatKinds(lineup));
    expect(plan.drums).toEqual([9, 10]);
    const back = rowsOf(plan).at(-1)!;
    expect(back.slice(0, 2)).toEqual([9, 10]);
    expect(back.slice(2)).toEqual([7, 8]);
  });
});
