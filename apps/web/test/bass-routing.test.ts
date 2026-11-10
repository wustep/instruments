// The double bass in Orchestra mode: a file's bass line reaches it by name or program, a quintet file
// (Max Richter's "On the Nature of Daylight" is scored Violin I, Violin II, Viola, Violoncello,
// Contrabass on GM 40/40/41/42/43) becomes a quintet with a real bass (not a second cello), and
// duplicates and hand routing work with it. The file here is constructed (no copyrighted music): five
// tracks whose names, programs and ranges mimic that quintet's.
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { addPart, autoPlan, guessVoice, lineupOf, matchLineup, placeNote, playersOf, reassign, setPartVoice, setRoute, voiceFromName, voiceFromProgram, VOICE_INFO, type LineInfo } from '../src/orchestra/assign.ts';
import { keysFor, keysRange, keyTargets, setSplit } from '../src/orchestra/keys.ts';
import { smf } from './smf.ts';

/** a format-1 file: a tempo track, then one track per part (its name, program, channel, a few notes) */
function quintet(parts: { name: string; program: number; notes: number[] }[]): ArrayBuffer {
  const name = (s: string): [number, ...number[]] => [0, 0xff, 0x03, s.length, ...[...s].map((c) => c.charCodeAt(0))];
  const tracks: [number, ...number[]][][] = [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]];
  parts.forEach((p, ch) => {
    const t: [number, ...number[]][] = [name(p.name), [0, 0xc0 | ch, p.program]];
    for (const m of p.notes) t.push([0, 0x90 | ch, m, 64], [480, 0x80 | ch, m, 0]);
    tracks.push(t);
  });
  const b = smf(480, tracks);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
// ranges as the quintet's parts lie (the bass E1–C#3 sounding: 34–49 in Daylight)
const DAYLIGHT_LIKE = [
  { name: 'Violin I', program: 40, notes: [70, 77, 82, 85, 89, 85] },
  { name: 'Violin II', program: 40, notes: [61, 65, 68, 70, 73, 77] },
  { name: 'Viola', program: 41, notes: [56, 58, 61, 63, 66, 61] },
  { name: 'Violoncello', program: 42, notes: [49, 51, 53, 54, 56, 53] },
  { name: 'Contrabass', program: 43, notes: [34, 37, 41, 44, 46, 49] },
];
const L = (name: string, instrument: string, program: number, lo: number, hi: number, median: number, notes = 200, poly = 1): LineInfo => ({ name, instrument, program, lo, hi, median, notes, poly });

describe('orchestra: the double bass', () => {
  it('its names, in several languages and abbreviations, and its General MIDI programs (32–39 basses, 43 contrabass)', () => {
    for (const n of ['Contrabass', 'Double Bass', 'double bass', 'Contrabbasso', 'Contrebasse', 'Kontrabass', 'Contrabajo', 'Basso', 'Basse', 'Bass', 'Bassi', 'Cb.', 'CB', 'Kb.', 'D.B.', 'Violone', 'Acoustic Bass', 'String Bass', 'Upright Bass', 'Tuba', 'Contrabassoon'])
      expect(voiceFromName(n), n).toBe('bass');
    // the cello keeps its own and a continuo, the bassoon is its own; a bass clarinet, trombone or drum is no bass
    for (const [n, v] of [['Violoncello', 'cello'], ['Vc.', 'cello'], ['Basso continuo', 'cello'], ['Bassoon', 'bassoon'], ['Bass Clarinet', 'clarinet'], ['Bass Trombone', 'trumpet'], ['Upright Piano', 'upright']] as const) expect(voiceFromName(n), n).toBe(v);
    expect(voiceFromName('Bass Drum')).not.toBe('bass');
    for (let p = 32; p <= 39; p++) expect(voiceFromProgram(p), `program ${p}`).toBe('bass');
    expect(voiceFromProgram(42)).toBe('cello');
    expect(voiceFromProgram(43)).toBe('bass');
  });

  it('a quintet file (Violin I/II, Viola, Violoncello, Contrabass; GM 40/40/41/42/43) is a quintet with a real double bass', () => {
    const song = parseMidi(quintet(DAYLIGHT_LIKE));
    expect(song.lines.map((l) => [l.name, l.program])).toEqual(DAYLIGHT_LIKE.map((p) => [p.name, p.program]));
    const plan = autoPlan(song.lines, { cap: 6 });
    expect(lineupOf(plan)).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
    // each line on its own instrument, as written (no octave moves: the bass plays its E1–C#3 itself)
    expect(plan.lines.map((rs) => rs.map((r) => [r.part, r.shift]))).toEqual([[[0, 0]], [[1, 0]], [[2, 0]], [[3, 0]], [[4, 0]]]);
    expect(playersOf(plan)).toEqual([0, 0, 0, 0, 0]);
  });

  it('by name alone, or by program alone, the bass line still reaches the bass', () => {
    const byName = parseMidi(quintet(DAYLIGHT_LIKE.map((p) => ({ ...p, program: 0 }))));
    expect(lineupOf(autoPlan(byName.lines, { cap: 6 }))).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
    const byProgram = parseMidi(quintet(DAYLIGHT_LIKE.map((p) => ({ ...p, name: '' }))));
    expect(autoPlan(byProgram.lines, { cap: 6 }).parts.at(-1)!.voice).toBe('bass');
    // an acoustic bass (GM 32) under a piano, unnamed
    expect(guessVoice(L('', '', 32, 28, 52, 40))).toBe('bass');
  });

  it('a line below the cello goes to the bass, as written, rather than up an octave on the cello', () => {
    expect(guessVoice(L('', '', -1, 30, 50, 40))).toBe('bass');
    // above the cello's C, unnamed: the cello as before
    expect(guessVoice(L('', '', -1, 38, 62, 50))).toBe('cello');
  });

  it('notes outside its compass (E1–G4) move by octaves into it', () => {
    expect(VOICE_INFO.bass.lo).toBe(28);
    expect(VOICE_INFO.bass.hi).toBe(67);
    expect(placeNote(24, 0, 'bass')).toBe(36);
    expect(placeNote(72, 0, 'bass')).toBe(60);
    expect(placeNote(40, 0, 'bass')).toBe(40);
  });

  it('routing by hand and duplicates: two basses, a bass doubling the cello, a cello made a bass', () => {
    const song = parseMidi(quintet(DAYLIGHT_LIKE));
    const lines = song.lines;
    let plan = autoPlan(lines, { cap: 8 });
    // a second bass on the bass line: two players, side by side
    plan = addPart(plan, lines, 'bass', [4], 8)!;
    expect(lineupOf(plan)).toEqual(['violin', 'violin', 'viola', 'cello', 'bass', 'bass']);
    expect(playersOf(plan)).toEqual([0, 0, 0, 0, 0, 1]);
    // the cello's line doubled on the first bass (a section doubling an octave down: the hand moves it)
    plan = setRoute(plan, lines, 3, 4, true);
    expect(plan.lines[3].map((r) => plan.parts[r.part].voice)).toEqual(['cello', 'bass']);
    // the cello becomes a third bass: its line moved into the bass's compass if it must be
    const p2 = setPartVoice(plan, lines, 3, 'bass');
    expect(lineupOf(p2)).toEqual(['violin', 'violin', 'viola', 'bass', 'bass', 'bass']);
    // a line moved to the bass by the chip (reassign)
    const p3 = reassign(autoPlan(lines, { cap: 6 }), lines, 3, 'bass', 6)!;
    expect(p3.lines[3].map((r) => p3.parts[r.part].voice)).toEqual(['bass']);
  });

  it('the keys by hand: a quintet’s keys default to its first violin; split, the lowest key goes to the bass; chosen, the keys span its compass', () => {
    const q = ['violin', 'violin', 'viola', 'cello', 'bass'] as const;
    expect(keysFor([...q]).parts).toEqual([0]);
    const c = setSplit(keysFor([...q]), true);
    const busy = new Set<number>();
    const got = [33, 48, 62, 70, 81].map((m) => {
      const [t] = keyTargets(m, c, [...q], busy);
      busy.add(t.part);
      return t.part;
    });
    expect(got[0]).toBe(4);
    expect(got[1]).toBe(3);
    expect(keysRange({ parts: [4], split: false, byUser: true }, [...q])).toEqual([28, 67]);
    // a key above its compass, chosen on the bass: moved down by octaves into it
    expect(keyTargets(79, { parts: [4], split: false, byUser: true }, [...q], new Set())).toEqual([{ part: 4, pitch: 67 }]);
  });

  it('a hand-picked lineup with a bass: the lowest line goes to it', () => {
    const song = parseMidi(quintet(DAYLIGHT_LIKE));
    const plan = matchLineup(song.lines, ['violin', 'violin', 'viola', 'cello', 'bass']);
    expect(plan.lines[4].map((r) => plan.parts[r.part].voice)).toEqual(['bass']);
    expect(plan.lines[3].map((r) => plan.parts[r.part].voice)).toEqual(['cello']);
  });
});
