// The tuba in the Orchestra's routing (orchestra/assign.ts): its names in several languages and its
// abbreviations, General MIDI program 59 (byte 58), a low brass line that names no instrument, its seat in
// the brass row, and that files without a tuba part route as they did.
import { describe, expect, it } from 'vitest';
import { autoPlan, guessVoice, matchLineup, placeNote, voiceFromName, voiceFromProgram, VOICE_INFO, VOICES, type LineInfo } from '../src/orchestra/assign.ts';
import { orchestraPlan, rowsOf, seatKinds } from '../src/orchestra/seats.ts';
import { familyOf } from '../src/orchestra/sections.ts';

const L = (name: string, program: number, lo: number, hi: number, median = Math.round((lo + hi) / 2), instrument = '', notes = 200): LineInfo => ({ name, instrument, program, lo, hi, median, notes, poly: 1, core: [lo, hi] });

describe('orchestra: the tuba', () => {
  it('its names in five languages, its kin and abbreviations, and General MIDI 59 (program byte 58)', () => {
    for (const n of ['Tuba', 'tuba', 'Tubas', 'Tuben', 'Bass Tuba', 'Basstuba', 'Contrabass Tuba', 'Kontrabasstuba', 'Tuba in F', 'Tuba (C)', 'Tba.', 'Tba', 'Tb.', 'Sousaphone', 'Helicon', 'Bombardon', 'Ophicleide', 'Oficleide', 'Cimbasso', 'Euphonium', 'Eufonio', 'Tenor Tuba'])
      expect(voiceFromName(n), n).toBe('tuba');
    expect(voiceFromProgram(58)).toBe('tuba');
    // the Wagner tuba is a horn player's; a tubular bell is no tuba; the trombone and the basses keep theirs
    for (const [n, v] of [['Wagner Tuba', 'horn'], ['Wagnertuben', 'horn'], ['Tubular Bells', null], ['Trombone', 'trombone'], ['Bass Trombone', 'trombone'], ['Tbn. 3', 'trombone'], ['Contrabass', 'bass'], ['Double Bass', 'bass'], ['Basso', 'bass'], ['Tromba', 'trumpet'], ['Horn in F', 'horn']] as const)
      expect(voiceFromName(n), n).toBe(v);
    expect(VOICES).toContain('tuba');
    expect(VOICE_INFO.tuba).toMatchObject({ instrument: 'tuba', lo: 24, hi: 65, poly: 1 });
    expect(familyOf('tuba')).toBe('brass');
  });

  it('a tuba part gets the tuba: by its name, by its program; lines above or below its compass come in by octaves', () => {
    expect(guessVoice(L('Tuba', 58, 28, 50))).toBe('tuba');
    expect(guessVoice(L('', 58, 29, 52))).toBe('tuba');
    expect(guessVoice(L('Tuba', -1, 26, 48))).toBe('tuba');
    expect(guessVoice(L('Basstuba', 57, 31, 55))).toBe('tuba');
    expect(placeNote(22, 0, 'tuba')).toBe(34);
    expect(placeNote(70, 0, 'tuba')).toBe(58);
    expect(placeNote(40, 0, 'tuba')).toBe(40);
  });

  it('a brass line that names no instrument and lies clearly under the trombone is the tuba’s; one named for the trombone stays its', () => {
    // "Brass" or "Low Brass" tracks, a brass program alone: under the tenor trombone's low E2, reaching under C2
    expect(guessVoice(L('Low Brass', 61, 28, 45, 36))).toBe('tuba');
    expect(guessVoice(L('Brass 4', 61, 29, 48, 38))).toBe('tuba');
    expect(guessVoice(L('', 57, 26, 46, 35))).toBe('tuba');
    expect(guessVoice(L('', 61, 30, 47, 37))).toBe('tuba');
    // named: however low, a trombone's part is the (bass) trombone's
    expect(guessVoice(L('Bass Trombone', 57, 26, 46, 35))).toBe('trombone');
    expect(guessVoice(L('Trombone 3', 57, 28, 50, 38))).toBe('trombone');
    expect(guessVoice(L('Posaune', -1, 28, 50, 38))).toBe('trombone');
    // not clearly under it: the trombone's, or the trumpet's, as before
    expect(guessVoice(L('', 57, 40, 67, 53))).toBe('trombone');
    expect(guessVoice(L('Brass', 61, 55, 79, 67))).toBe('trumpet');
    expect(guessVoice(L('', 57, 34, 58, 46))).toBe('trombone');
  });

  it('a file with trombones and a tuba: each its own, the tuba the lowest brass; without a tuba part nothing moves', () => {
    const lines = [L('Trumpet', 56, 58, 82), L('Trombone 1', 57, 48, 69), L('Trombone 2', 57, 43, 65), L('Bass Trombone', 57, 34, 58), L('Tuba', 58, 26, 50)];
    const plan = autoPlan(lines, { cap: 12 });
    expect(plan.parts.map((p) => p.voice)).toEqual(['trumpet', 'trombone', 'trombone', 'trombone', 'tuba']);
    expect(plan.lines.map((r) => r.map((x) => plan.parts[x.part].voice))).toEqual([['trumpet'], ['trombone'], ['trombone'], ['trombone'], ['tuba']]);
    // the same file without its tuba line: the others as they were
    const without = autoPlan(lines.slice(0, 4), { cap: 12 });
    expect(without.parts.map((p) => p.voice)).toEqual(['trumpet', 'trombone', 'trombone', 'trombone']);
    // a lineup picked by hand with a tuba in it: the tuba's own line leads it, the trombone keeps its
    const hand = matchLineup([L('Trombone', 57, 40, 65, 52), L('Tuba', 58, 28, 50, 38)], ['trombone', 'tuba']);
    expect(hand.parts.map((p) => p.lines)).toEqual([[0], [1]]);
    const swapped = matchLineup([L('Tuba', 58, 28, 50, 38), L('Trombone', 57, 40, 65, 52)], ['tuba', 'trombone']);
    expect(swapped.parts.map((p) => p.lines)).toEqual([[0], [1]]);
  });

  it('sits in the brass row, at its right end by the trombones', () => {
    const lineup = (['violin', 'violin', 'viola', 'cello', 'bass', 'flute', 'oboe', 'horn', 'trumpet', 'trombone', 'tuba', 'timpani'] as const).map((v) => VOICE_INFO[v]);
    const plan = orchestraPlan(seatKinds(lineup));
    expect(plan.brass).toEqual([[7, 8, 9, 10]]);
    const back = rowsOf(plan).at(-1)!;
    // (the timpani at the row's left end; the tuba last, at the right)
    expect(back[back.length - 1]).toBe(10);
    expect(back[0]).toBe(11);
  });
});
