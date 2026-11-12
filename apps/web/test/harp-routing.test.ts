// The harp in the Orchestra's routing (orchestra/assign.ts): its names in several languages and its
// abbreviations, General MIDI program 47 (byte 46), both its hands (often two tracks) one harp's, its
// chords its own (not a piano's), its seat at the left by the violins, and that files without a harp part
// route as they did.
import { describe, expect, it } from 'vitest';
import { autoPlan, guessVoice, matchLineup, placeNote, reassign, voiceFromName, voiceFromProgram, VOICE_INFO, VOICES, type LineInfo } from '../src/orchestra/assign.ts';
import { orchestraPlan, rowsOf, seatKinds } from '../src/orchestra/seats.ts';
import { familyOf } from '../src/orchestra/sections.ts';

const L = (name: string, program: number, lo: number, hi: number, median = Math.round((lo + hi) / 2), poly = 1, notes = 200): LineInfo => ({ name, instrument: '', program, lo, hi, median, notes, poly, core: [lo, hi] });

describe('orchestra: the harp', () => {
  it('its names in five languages and its abbreviations, General MIDI 47 (program byte 46); a harpsichord is a keyboard still', () => {
    for (const n of ['Harp', 'harp', 'Harps', 'Harp 1', 'Harp (R.H.)', 'Harfe', 'Harfen', 'Arpa', 'Arpe', 'Harpe', 'Harpes', 'Pedal Harp', 'Concert Harp', 'Orchestral Harp', 'Hp.', 'Hp. 1', 'Hrp', 'Hrp.'])
      expect(voiceFromName(n), n).toBe('harp');
    expect(voiceFromProgram(46)).toBe('harp');
    for (const [n, v] of [['Harpsichord', 'grand'], ['Cembalo', 'grand'], ['Piano', 'grand'], ['Celesta', 'grand'], ['Guitar', 'grand'], ['Harmonica', null], ['Sharp', null], ['Timpani', 'timpani'], ['Horn', 'horn'], ['Chapel', null]] as const)
      expect(voiceFromName(n), n).toBe(v);
    expect(voiceFromProgram(6)).toBe('grand');
    expect(voiceFromProgram(47)).toBe('timpani');
    expect(VOICES).toContain('harp');
    expect(VOICE_INFO.harp).toMatchObject({ instrument: 'harp', lo: 24, hi: 103, poly: 47 });
    expect(familyOf('harp')).toBe('harp');
  });

  it('a harp part gets the harp: by its name, by its program alone, its chords and its left hand too', () => {
    expect(guessVoice(L('Harp', 46, 36, 96, 67, 4))).toBe('harp');
    expect(guessVoice(L('Harp', -1, 40, 91, 64, 6))).toBe('harp');
    // the program alone: a melody, four-note chords, a bass line under the cello's middle
    expect(guessVoice(L('', 46, 55, 93, 72, 1))).toBe('harp');
    expect(guessVoice(L('', 46, 40, 91, 62, 5))).toBe('harp');
    expect(guessVoice(L('', 46, 28, 60, 43, 2))).toBe('harp');
    expect(guessVoice(L('Arpa', 0, 31, 84, 55, 3))).toBe('harp');
    // its compass C1–G7: lines outside come in by octaves
    expect(placeNote(60, 0, 'harp')).toBe(60);
    expect(placeNote(23, 0, 'harp')).toBe(35);
    expect(placeNote(105, 0, 'harp')).toBe(93);
    // chords with no harp named anywhere are a piano's as before
    expect(guessVoice(L('', 0, 40, 91, 62, 5))).toBe('grand');
    expect(guessVoice(L('Piano', 0, 36, 96, 64, 6))).toBe('grand');
  });

  it('both hands are one harp’s: two harp tracks make one instrument; the others each their own', () => {
    const lines = [L('Flute', 73, 62, 93), L('Harp', 46, 55, 96, 72, 4), L('Harp', 46, 28, 62, 45, 3), L('Violin', 40, 55, 88), L('Cello', 42, 36, 67)];
    const plan = autoPlan(lines, { cap: 12 });
    expect(plan.parts.map((p) => p.voice)).toEqual(['flute', 'harp', 'violin', 'cello']);
    expect(plan.parts[1].lines).toEqual([1, 2]);
    expect(plan.lines.map((r) => r.map((x) => plan.parts[x.part].voice))).toEqual([['flute'], ['harp'], ['harp'], ['violin'], ['cello']]);
    // the same file without its harp lines: the others as they were
    const without = autoPlan([lines[0], lines[3], lines[4]], { cap: 12 });
    expect(without.parts.map((p) => p.voice)).toEqual(['flute', 'violin', 'cello']);
    // too many for the stage: the harp is no section a line joins, and it stays a harp
    const many = [L('Harp', 46, 36, 96, 66, 4), L('Violin 1', 40, 55, 93, 76), L('Violin 2', 40, 55, 86, 70), L('Viola', 41, 48, 79, 62), L('Cello', 42, 36, 67, 50)];
    const capped = autoPlan(many, { cap: 4 });
    expect(capped.parts.map((p) => p.voice)).toContain('harp');
    expect(capped.parts.find((p) => p.voice === 'harp')!.lines).toEqual([0]);
  });

  it('a lineup picked by hand with a harp in it: the harp’s lines are the harp’s, both of them; a line moved to the harp joins it', () => {
    const lines = [L('Violin', 40, 55, 93, 74), L('Harp', 46, 55, 96, 72, 4), L('Harp', 46, 28, 62, 45, 3), L('Cello', 42, 36, 67, 50)];
    const hand = matchLineup(lines, ['violin', 'harp', 'cello']);
    expect(hand.parts.map((p) => p.lines)).toEqual([[0], [1, 2], [3]]);
    const other = matchLineup(lines, ['harp', 'cello', 'violin']);
    expect(other.parts.map((p) => p.lines)).toEqual([[1, 2], [3], [0]]);
    // moved by hand: the cello's line to the harp joins the harp there (no second harp)
    const moved = reassign(hand, lines, 3, 'harp', 12)!;
    expect(moved.parts.map((p) => p.voice)).toEqual(['violin', 'harp']);
    expect(moved.parts[1].lines).toEqual([1, 2, 3]);
    // a lineup without a harp: the lines as they were matched before there was one
    const none = matchLineup([L('Violin', 40, 55, 93, 74), L('Cello', 42, 36, 67, 50)], ['violin', 'cello']);
    expect(none.parts.map((p) => p.lines)).toEqual([[0], [1]]);
  });

  it('stands at the left of the first row behind the strings, by the first violins; with a few players, in the lineup’s order', () => {
    const lineup = (['violin', 'violin', 'viola', 'cello', 'bass', 'harp', 'flute', 'oboe', 'horn', 'trumpet', 'timpani'] as const).map((v) => VOICE_INFO[v]);
    const plan = orchestraPlan(seatKinds(lineup));
    expect(plan.harps).toEqual([5]);
    const rows = rowsOf(plan);
    // (row 0: the strings' arc is its own; the first row behind them begins with the harp)
    expect(rows[0][0]).toBe(5);
    expect(rows[0].slice(1)).toEqual([6, 7]);
    // two harps sit side by side there
    const two = orchestraPlan(seatKinds((['violin', 'violin', 'viola', 'cello', 'harp', 'harp', 'flute', 'horn'] as const).map((v) => VOICE_INFO[v])));
    expect(rowsOf(two)[0].slice(0, 2)).toEqual([4, 5]);
  });
});
