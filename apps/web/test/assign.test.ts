// Orchestra mode: which instrument plays which line of a MIDI file (orchestra/assign.ts). The line
// profiles are those of real files (Mutopia's Haydn Op. 76 No. 3, Mozart K. 525, Pachelbel's canon,
// Brandenburg No. 2; LilyPond writes the viola as GM 42, the cello's program, so names come first).
import { describe, expect, it } from 'vitest';
import { autoPlan, fitShift, guessVoice, lineupOf, lineupPlan, placeNote, reassign, voiceFromName, voiceFromProgram, type LineInfo } from '../src/orchestra/assign.ts';

const L = (name: string, instrument: string, program: number, lo: number, hi: number, median: number, notes = 500, poly = 1): LineInfo => ({ name, instrument, program, lo, hi, median, notes, poly });
const haydn = [L('violinI:', 'violin', 40, 55, 91, 74, 755, 2), L('violinII:', 'violin', 40, 55, 86, 69, 442, 2), L('viola:', 'cello', 42, 48, 79, 67, 333, 2), L('cello:', 'cello', 42, 38, 71, 57, 299, 2)];
const mozart = [L('', 'violin', 40, 55, 88, 79, 1380, 3), L('', 'violin', 40, 55, 86, 67, 1757, 3), L('', 'viola', 41, 50, 74, 64, 1393, 2), L('', 'cello', 42, 43, 64, 55, 860)];
const brandenburg = [L('\\new', 'trumpet', 56, 53, 79, 69, 833), L('\\new', 'flute', 73, 65, 91, 78, 1359), L('\\new', 'oboe', 68, 60, 86, 72, 1232), L('\\new', 'violin', 40, 55, 88, 72, 1472, 2), L('\\new', 'violin', 40, 55, 86, 72, 839), L('\\new', 'violin', 40, 55, 81, 67, 652), L('\\new', 'viola', 41, 48, 76, 64, 712), L('\\new', 'violin', 40, 36, 62, 52, 870), L('\\new', 'violincello', 0, 36, 62, 52, 1125)];
const voices = (p: ReturnType<typeof autoPlan>) => p.lines.map((a) => (a.part < 0 ? null : p.parts[a.part].voice));

describe('orchestra: assigning lines to instruments', () => {
  it('reads instruments from names (several languages) and General MIDI programs', () => {
    expect(['Violin I', 'violoncello:', 'Viola', 'Flauto traverso', 'Tromba', 'Cembalo', 'Kontrabass', 'violinII:'].map(voiceFromName)).toEqual(['violin', 'cello', 'viola', 'flute', 'trumpet', 'grand', 'cello', 'violin']);
    expect([0, 40, 41, 42, 43, 56, 60, 68, 73, 48, -1].map(voiceFromProgram)).toEqual(['grand', 'violin', 'viola', 'cello', 'cello', 'trumpet', 'trumpet', 'flute', 'flute', null, null]);
  });

  it('a string quartet file becomes a string quartet (the name beats a wrong program)', () => {
    for (const f of [haydn, mozart]) {
      const p = autoPlan(f, { cap: 6 });
      expect(lineupOf(p)).toEqual(['violin', 'violin', 'viola', 'cello']);
      expect(p.lines.map((a) => a.part)).toEqual([0, 1, 2, 3]);
      expect(p.lines.every((a) => a.shift === 0)).toBe(true);
    }
  });

  it('a register beats a notation program’s default instrument name (Mozart K. 478’s viola is written "violin")', () => {
    const k478 = [L('uniqueContext8', 'violin', 40, 55, 91, 73, 1148, 3), L('uniqueContext9', 'violin', 40, 48, 76, 62, 1099, 3), L('uniqueContext10', 'cello', 42, 36, 67, 50, 659), L('upper', 'acoustic grand', 0, 45, 89, 74, 1893, 4), L('lower', 'acoustic grand', 0, 30, 74, 59, 1223, 4)];
    const p = autoPlan(k478, { cap: 6 });
    expect(lineupOf(p)).toEqual(['violin', 'viola', 'cello', 'grand']);
    expect(p.lines[1].shift).toBe(0);
  });

  it('a piano piece stays one piano; chords never go to a wind', () => {
    const p = autoPlan([L('right hand', '', 0, 60, 96, 76, 900, 4), L('left hand', '', 0, 24, 60, 43, 700, 3)], { cap: 6 });
    expect(lineupOf(p)).toEqual(['grand']);
    expect(p.parts[0].lines).toEqual([0, 1]);
    expect(guessVoice(L('Flute', 'flute', 73, 60, 84, 72, 300, 4))).toBe('grand');
    // nothing named anywhere, chords in one hand and a single-note bass in the other: still a piano
    expect(lineupOf(autoPlan([L('', '', -1, 60, 88, 72, 600, 4), L('', '', -1, 36, 55, 45, 300, 1)], { cap: 6 }))).toEqual(['grand']);
    // the same bass with a name is a cello
    expect(lineupOf(autoPlan([L('', '', -1, 60, 88, 72, 600, 4), L('Cello', '', -1, 36, 55, 45, 300, 1)], { cap: 6 }))).toEqual(['grand', 'cello']);
  });

  it('unnamed lines go by register; a part below its instrument moves up by octaves', () => {
    expect([L('', '', -1, 67, 91, 79), L('', '', -1, 55, 74, 64), L('', '', -1, 36, 60, 48)].map(guessVoice)).toEqual(['violin', 'viola', 'cello']);
    // a double-bass line (sounding E1…) on the cello: up an octave
    expect(fitShift({ lo: 28, hi: 55, median: 38 }, 'cello')).toBe(12);
    expect(placeNote(31, 0, 'cello')).toBe(43);
    expect(placeNote(103, 0, 'violin')).toBe(91);
  });

  it('a big ensemble fits the stage: the smallest lines join a like instrument or the piano', () => {
    const p = autoPlan(brandenburg, { cap: 6 });
    expect(p.parts.length).toBe(6);
    const v = voices(p);
    // the soloists keep their instruments; the ripieno violins become a section; the violone and the
    // continuo (a double bass named "violin", a continuo named "violincello") are cellos
    expect(v.slice(0, 4)).toEqual(['trumpet', 'flute', 'flute', 'violin']);
    expect(p.lines[4].part).toBe(p.lines[3].part);
    expect(v[7]).toBe('cello');
    expect(v[8]).toBe('cello');
    // every line still plays
    expect(p.lines.every((a) => a.part >= 0)).toBe(true);
    // a phone's smaller stage
    // a phone's smaller stage: the winds stay, the strings go to a piano
    const ph = autoPlan(brandenburg, { cap: 4 });
    expect(lineupOf(ph).sort()).toEqual(['flute', 'flute', 'grand', 'trumpet']);
  });

  it('a lineup picked by hand takes the lines by register', () => {
    // two lines onto violin + cello: the high one to the violin
    const two = [L('a', '', 0, 36, 60, 48, 400), L('b', '', 0, 60, 84, 72, 400)];
    const p = autoPlan(two, { cap: 6, lineup: ['violin', 'cello'] });
    expect(voices(p)).toEqual(['cello', 'violin']);
    // four lines onto two instruments: every line plays, on an instrument that holds two notes
    const q = autoPlan(haydn, { cap: 6, lineup: ['violin', 'cello'] });
    expect(q.parts.length).toBe(2);
    expect(voices(q)[0]).toBe('violin');
    expect(voices(q)[3]).toBe('cello');
    expect(q.lines.every((a) => a.part >= 0)).toBe(true);
    // more instruments than lines: the best fitting ones play, the others wait
    const r = autoPlan(two, { cap: 6, lineup: ['flute', 'violin', 'viola', 'cello'] });
    expect(voices(r)).toEqual(['cello', 'violin']);
    expect(lineupOf(lineupPlan(['violin', 'violin', 'viola', 'cello']))).toEqual(['violin', 'violin', 'viola', 'cello']);
    // a quartet onto a lineup with one more instrument: every line keeps one of its own
    const five = autoPlan(haydn, { cap: 6, lineup: ['flute', 'violin', 'violin', 'cello', 'cello'] });
    expect(new Set(five.lines.map((x) => x.part)).size).toBe(4);
    expect(voices(five)).toEqual(['violin', 'violin', 'cello', 'cello']);
  });

  it('reassigning a line: its own instrument changes, or it gets one, or joins the piano', () => {
    const p = autoPlan(haydn, { cap: 6 });
    // the viola line to the cello: the viola becomes a cello (its own instrument)
    const a = reassign(p, haydn, 2, 'cello', 6)!;
    expect(lineupOf(a)).toEqual(['violin', 'violin', 'cello', 'cello']);
    // violin II to the grand, then violin I too: one piano plays both
    const b = reassign(reassign(p, haydn, 1, 'grand', 6)!, haydn, 0, 'grand', 6)!;
    expect(lineupOf(b)).toEqual(['grand', 'viola', 'cello']);
    expect(b.parts[0].lines).toEqual([0, 1]);
    // muted: the line has no instrument and its instrument leaves
    const c = reassign(p, haydn, 3, null, 6)!;
    expect(c.lines[3].part).toBe(-1);
    expect(lineupOf(c)).toEqual(['violin', 'violin', 'viola']);
    // a shared piano's line taken out to a flute gets a flute of its own (room on the stage)
    const d = reassign(b, haydn, 0, 'flute', 6)!;
    expect(lineupOf(d)).toEqual(['flute', 'grand', 'viola', 'cello']);
    // no room: refused for a single-note instrument
    const full = autoPlan(brandenburg, { cap: 4 });
    const pianoLine = full.lines.findIndex((x) => full.parts[x.part].voice === 'grand');
    expect(reassign(full, brandenburg, pianoLine, 'trumpet', 4)).toBeNull();
    // (a bowed voice joins a like instrument when the stage is full: there is none here either)
    expect(reassign(full, brandenburg, pianoLine, 'viola', 4)).toBeNull();
  });
});
