// Orchestra mode: which instrument plays which line of a MIDI file (orchestra/assign.ts). The line
// profiles are those of real files (Mutopia's Haydn Op. 76 No. 3, Mozart K. 525, Pachelbel's canon,
// Brandenburg No. 2; LilyPond writes the viola as GM 42, the cello's program, so names come first).
import { describe, expect, it } from 'vitest';
import { addPart, autoPlan, fitShift, guessVoice, isKeyboard, lineupOf, lineupPlan, placeNote, playersOf, reassign, removePart, setPartLines, setPartVoice, setRoute, voiceFromName, voiceFromProgram, voicesOfLine, type LineInfo, type Plan } from '../src/orchestra/assign.ts';
import { PIECES, piecePlan } from '../src/orchestra/pieces.ts';

const L = (name: string, instrument: string, program: number, lo: number, hi: number, median: number, notes = 500, poly = 1): LineInfo => ({ name, instrument, program, lo, hi, median, notes, poly });
const haydn = [L('violinI:', 'violin', 40, 55, 91, 74, 755, 2), L('violinII:', 'violin', 40, 55, 86, 69, 442, 2), L('viola:', 'cello', 42, 48, 79, 67, 333, 2), L('cello:', 'cello', 42, 38, 71, 57, 299, 2)];
const mozart = [L('', 'violin', 40, 55, 88, 79, 1380, 3), L('', 'violin', 40, 55, 86, 67, 1757, 3), L('', 'viola', 41, 50, 74, 64, 1393, 2), L('', 'cello', 42, 43, 64, 55, 860)];
const brandenburg = [L('\\new', 'trumpet', 56, 53, 79, 69, 833), L('\\new', 'flute', 73, 65, 91, 78, 1359), L('\\new', 'oboe', 68, 60, 86, 72, 1232), L('\\new', 'violin', 40, 55, 88, 72, 1472, 2), L('\\new', 'violin', 40, 55, 86, 72, 839), L('\\new', 'violin', 40, 55, 81, 67, 652), L('\\new', 'viola', 41, 48, 76, 64, 712), L('\\new', 'violin', 40, 36, 62, 52, 870), L('\\new', 'violincello', 0, 36, 62, 52, 1125)];
/** each line's one instrument (auto-assignment gives a line one, or none: silent) */
const voices = (p: Plan) => p.lines.map((rs) => (rs.length ? p.parts[rs[0].part].voice : null));
const partOf = (p: Plan, li: number) => p.lines[li][0]?.part ?? -1;

describe('orchestra: assigning lines to instruments', () => {
  it('reads instruments from names (several languages) and General MIDI programs', () => {
    expect(['Violin I', 'violoncello:', 'Viola', 'Flauto traverso', 'Tromba', 'Cembalo', 'Kontrabass', 'violinII:'].map(voiceFromName)).toEqual(['violin', 'cello', 'viola', 'flute', 'trumpet', 'grand', 'bass', 'violin']);
    expect([0, 32, 40, 41, 42, 43, 56, 60, 68, 69, 71, 73, 48, -1].map(voiceFromProgram)).toEqual(['grand', 'bass', 'violin', 'viola', 'cello', 'bass', 'trumpet', 'horn', 'oboe', 'oboe', 'clarinet', 'flute', null, null]);
  });

  it('a string quartet file becomes a string quartet (the name beats a wrong program)', () => {
    for (const f of [haydn, mozart]) {
      const p = autoPlan(f, { cap: 6 });
      expect(lineupOf(p)).toEqual(['violin', 'violin', 'viola', 'cello']);
      expect(p.lines.map((rs) => rs.map((r) => r.part))).toEqual([[0], [1], [2], [3]]);
      expect(p.lines.every((rs) => rs[0].shift === 0)).toBe(true);
    }
  });

  it('a register beats a notation program’s default instrument name (Mozart K. 478’s viola is written "violin")', () => {
    const k478 = [L('uniqueContext8', 'violin', 40, 55, 91, 73, 1148, 3), L('uniqueContext9', 'violin', 40, 48, 76, 62, 1099, 3), L('uniqueContext10', 'cello', 42, 36, 67, 50, 659), L('upper', 'acoustic grand', 0, 45, 89, 74, 1893, 4), L('lower', 'acoustic grand', 0, 30, 74, 59, 1223, 4)];
    const p = autoPlan(k478, { cap: 6 });
    expect(lineupOf(p)).toEqual(['violin', 'viola', 'cello', 'grand']);
    expect(p.lines[1][0].shift).toBe(0);
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
    // the soloists keep their instruments (the oboe its own since there is one); the ripieno violins
    // become a section; the violone and the continuo (a double bass named "violin", a continuo named
    // "violincello") are cellos
    expect(v.slice(0, 4)).toEqual(['trumpet', 'flute', 'oboe', 'violin']);
    expect(partOf(p, 4)).toBe(partOf(p, 3));
    expect(v[7]).toBe('cello');
    expect(v[8]).toBe('cello');
    // every line still plays
    expect(p.lines.every((rs) => rs.length === 1)).toBe(true);
    // a phone's smaller stage
    // a phone's smaller stage: the winds stay, the strings go to a piano
    const ph = autoPlan(brandenburg, { cap: 4 });
    expect(lineupOf(ph).sort()).toEqual(['flute', 'grand', 'oboe', 'trumpet']);
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
    expect(q.lines.every((rs) => rs.length === 1)).toBe(true);
    // more instruments than lines: the best fitting ones play, the others wait
    const r = autoPlan(two, { cap: 6, lineup: ['flute', 'violin', 'viola', 'cello'] });
    expect(voices(r)).toEqual(['cello', 'violin']);
    expect(lineupOf(lineupPlan(['violin', 'violin', 'viola', 'cello']))).toEqual(['violin', 'violin', 'viola', 'cello']);
    // a quartet onto a lineup with one more instrument: every line keeps one of its own
    const five = autoPlan(haydn, { cap: 6, lineup: ['flute', 'violin', 'violin', 'cello', 'cello'] });
    expect(new Set(five.lines.map((rs) => rs[0].part)).size).toBe(4);
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
    expect(c.lines[3]).toEqual([]);
    expect(lineupOf(c)).toEqual(['violin', 'violin', 'viola']);
    // a shared piano's line taken out to a flute gets a flute of its own (room on the stage)
    const d = reassign(b, haydn, 0, 'flute', 6)!;
    expect(lineupOf(d)).toEqual(['flute', 'grand', 'viola', 'cello']);
    // the stage's room is its audio thread's (fitsStage): a light trumpet fits past four seats, a
    // second piano does not (four seats at most cost two pianos and two double basses, 39.8 %)
    const full = autoPlan(brandenburg, { cap: 4 });
    const pianoLine = full.lines.findIndex((rs) => full.parts[rs[0].part].voice === 'grand');
    expect(lineupOf(reassign(full, brandenburg, pianoLine, 'trumpet', 4)!)).toHaveLength(5);
    const two = { ...full, parts: full.parts.map((p) => (isKeyboard(p.voice) ? p : { ...p, voice: 'bass' as const })) };
    expect(reassign(two, brandenburg, pianoLine, 'upright', 4)).toBeNull();
    // (a bowed voice joins a like instrument when there is no room: here a double bass)
    expect(lineupOf(reassign(two, brandenburg, pianoLine, 'bass', 1)!)).toEqual(lineupOf(two));
  });

  it('auto-assignment never doubles a line: one instrument each (or none), as before', () => {
    for (const f of [haydn, mozart, brandenburg]) for (const cap of [4, 6]) expect(autoPlan(f, { cap }).lines.every((rs) => rs.length <= 1)).toBe(true);
    // the built-in pieces: their own plans, unchanged
    const lines = (n: number) => Array.from({ length: n }, (_, i) => L(`l${i}`, '', -1, 55, 79, 67));
    for (const pc of PIECES) {
      const n = Math.max(...pc.parts.flatMap((q) => q.lines)) + 1;
      const p = piecePlan(pc, lines(n), Math.max(6, pc.parts.length));
      expect(lineupOf(p)).toEqual(pc.parts.map((q) => q.voice));
      // (one player each, but the symphony's second wind of each pair on its staff: Flauto II, its own player)
      expect(playersOf(p), pc.id).toEqual(pc.parts.map((q, k) => (pc.parts.slice(0, k).some((o) => o.voice === q.voice && o.lines.some((i) => q.lines.includes(i))) ? 1 : 0)));
      if (pc.parts.length <= 6) expect(playersOf(p).every((x) => x === 0), pc.id).toBe(true);
    }
  });
});

describe('orchestra: routing by hand, many to many', () => {
  const quartet = () => autoPlan(haydn, { cap: 6 });

  it('one line on several instruments: the tune on its violin and on a flute too', () => {
    // a flute on the stage (high: it sits before the strings), then the first violin's line on it
    const a = addPart(quartet(), haydn, 'flute', [], 8)!;
    expect(lineupOf(a)).toEqual(['flute', 'violin', 'violin', 'viola', 'cello']);
    const b = setRoute(a, haydn, 0, 0, true);
    expect(voicesOfLine(b, 0)).toEqual(['flute', 'violin']);
    expect(b.lines[0].map((r) => r.part)).toEqual([0, 1]);
    // each route its own octave: the violin plays it as written, the flute where it fits
    expect(b.lines[0][1].shift).toBe(0);
    expect(b.lines[0][0].shift).toBe(fitShift(haydn[0], 'flute'));
    // the other lines are where they were
    expect(b.lines.slice(1).map((rs) => voicesOfLine(b, b.lines.indexOf(rs)))).toEqual([['violin'], ['viola'], ['cello']]);
    // off again: the flute waits, silent, in its seat
    const c = setRoute(b, haydn, 0, 0, false);
    expect(lineupOf(c)).toEqual(lineupOf(b));
    expect(c.parts[0].lines).toEqual([]);
    expect(voicesOfLine(c, 0)).toEqual(['violin']);
  });

  it('the whole file on several instruments at once', () => {
    const all = haydn.map((_, i) => i);
    const a = addPart(addPart(lineupPlan([]), haydn, 'grand', all, 8)!, haydn, 'flute', all, 8)!;
    expect(lineupOf(a)).toEqual(['flute', 'grand']);
    expect(a.lines.map((rs) => rs.length)).toEqual([2, 2, 2, 2]);
    // and onto an instrument already there: the cello plays every line as well as its own
    const q = setPartLines(quartet(), haydn, 3, all);
    expect(q.parts[3].lines).toEqual([0, 1, 2, 3]);
    expect(q.lines.map((rs) => voicesOfLine(q, q.lines.indexOf(rs)))).toEqual([['violin', 'cello'], ['violin', 'cello'], ['viola', 'cello'], ['cello']]);
    // the cello's octave moves are its own: a violin line too high for it comes down
    expect(q.lines[0][1].shift).toBe(fitShift(haydn[0], 'cello'));
  });

  it('the same instrument twice: two cellos, two grands, each its own seat (and engine)', () => {
    // a second cello on the cello's line: next to the first, a second player
    const a = setRoute(addPart(quartet(), haydn, 'cello', [], 8)!, haydn, 3, 4, true);
    expect(lineupOf(a)).toEqual(['violin', 'violin', 'viola', 'cello', 'cello']);
    expect(voicesOfLine(a, 3)).toEqual(['cello', 'cello']);
    expect(playersOf(a)).toEqual([0, 0, 0, 0, 1]);
    // the two violins of the quartet play two lines: they stay one player each, as before
    expect(playersOf(quartet())).toEqual([0, 0, 0, 0]);
    // two grands: the file's two hands, one on each (a piano duet), then both on both
    const hands = [L('right hand', '', 0, 60, 96, 76, 900, 4), L('left hand', '', 0, 24, 60, 43, 700, 3)];
    const solo = autoPlan(hands, { cap: 6 });
    expect(lineupOf(solo)).toEqual(['grand']);
    const duo = setRoute(addPart(solo, hands, 'grand', [1], 8)!, hands, 1, 0, false);
    expect(lineupOf(duo)).toEqual(['grand', 'grand']);
    expect(duo.parts.map((p) => p.lines)).toEqual([[0], [1]]);
    expect(playersOf(duo)).toEqual([0, 0]);
    const both = setPartLines(setPartLines(duo, hands, 0, [0, 1]), hands, 1, [0, 1]);
    expect(playersOf(both)).toEqual([0, 1]);
    // a third grand and an upright are their own seats as well
    const four = addPart(addPart(both, hands, 'upright', [0], 8)!, hands, 'grand', [1], 8)!;
    expect(lineupOf(four)).toEqual(['grand', 'grand', 'grand', 'upright']);
    expect(playersOf(four)).toEqual([0, 1, 2, 0]);
  });

  it('the stage has room for what its audio thread carries: eight of anything, more as far as they cost no more', () => {
    // eight violins and violas, then more: light instruments are seated past eight (the symphony's eighteen)
    let p: Plan | null = quartet();
    for (let k = 0; k < 4; k++) p = addPart(p!, haydn, 'violin', [0], 8);
    expect(p!.parts.length).toBe(8);
    expect(addPart(p!, haydn, 'cello', [3], 8)).not.toBeNull();
    // two pianos and six others (51.4 %) is the most: a third piano is refused, a flute is not
    let q: Plan | null = addPart(addPart(quartet(), haydn, 'grand', [], 8)!, haydn, 'grand', [], 8);
    for (let k = 0; k < 2; k++) q = addPart(q!, haydn, 'bass', [], 8);
    expect(q!.parts.length).toBe(8);
    expect(addPart(q!, haydn, 'grand', [], 8)).toBeNull();
    expect(addPart(q!, haydn, 'flute', [], 8)).not.toBeNull();
    // (a phone's smaller stage: two pianos and four others, 45.6 %)
    const phone = addPart(addPart(addPart(quartet(), haydn, 'grand', [], 6)!, haydn, 'grand', [], 6)!, haydn, 'cello', [], 6)!;
    expect(addPart(phone, haydn, 'bass', [], 6)).toBeNull();
    expect(addPart(phone, haydn, 'flute', [], 6)).not.toBeNull();
  });

  it('an instrument changed in its seat, or taken off: its lines follow, or fall silent', () => {
    const a = setRoute(addPart(quartet(), haydn, 'flute', [], 8)!, haydn, 0, 0, true);
    // the flute becomes a trumpet: it keeps the line, at the trumpet's octave
    const b = setPartVoice(a, haydn, 0, 'trumpet');
    expect(voicesOfLine(b, 0)).toEqual(['trumpet', 'violin']);
    expect(b.lines[0][0].shift).toBe(fitShift(haydn[0], 'trumpet'));
    // the first violin taken off: its line still plays on the trumpet
    const c = removePart(b, haydn, 1);
    expect(lineupOf(c)).toEqual(['trumpet', 'violin', 'viola', 'cello']);
    expect(voicesOfLine(c, 0)).toEqual(['trumpet']);
    // then the trumpet: the line falls silent
    expect(removePart(c, haydn, 0).lines[0]).toEqual([]);
  });

  it('a line moved from the chip: on that one instrument only, wherever it was doubled', () => {
    const a = setRoute(addPart(quartet(), haydn, 'flute', [], 8)!, haydn, 0, 0, true);
    // the doubled tune moved to a viola: off the flute and the violin; the first instrument that
    // played only it (the flute) becomes the viola, the violin left with nothing leaves
    const b = reassign(a, haydn, 0, 'viola', 8)!;
    expect(voicesOfLine(b, 0)).toEqual(['viola']);
    expect(lineupOf(b)).toEqual(['viola', 'violin', 'viola', 'cello']);
    expect(b.lines.map((rs) => rs.length)).toEqual([1, 1, 1, 1]);
  });

  it('a piece’s own correction stays with its line on that instrument (La Réjouissance’s trumpet, a tone down)', () => {
    const handel = PIECES.find((pc) => pc.id === 'handel')!;
    const lines = [L('trumpet', 'trumpet', 56, 62, 86, 74, 300), L('organ upper', '', 19, 50, 86, 69, 800, 3), L('organ lower', '', 19, 26, 62, 43, 600, 2)];
    const p = piecePlan(handel, lines, 6);
    expect(p.lines[0][0].shift).toBe(-2);
    // a second trumpet on the tune: also a tone down; a second grand on the organ's two staves
    const q = setPartLines(addPart(setRoute(addPart(p, lines, 'trumpet', [], 8)!, lines, 0, 1, true), lines, 'grand', [], 8)!, lines, 3, [1, 2]);
    expect(lineupOf(q)).toEqual(['trumpet', 'trumpet', 'grand', 'grand']);
    expect(q.lines[0].map((r) => r.shift)).toEqual([-2, -2]);
    expect(playersOf(q)).toEqual([0, 1, 0, 1]);
  });
});
