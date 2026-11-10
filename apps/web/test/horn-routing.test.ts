// The horn in Orchestra mode: a file's horn lines reach it by name (English, Italian, French, German,
// Spanish, abbreviations, any key) or General MIDI program 60, its namesakes (the English horn, the basset
// horn, the flugelhorn) do not; Beethoven's Horn Sonata (the horn's piece) is its line at concert pitch;
// two to four horns, each a player of its own; and a transposing part typed at its written pitch is moved
// to its sounding one, while a part already at its sounding pitch (every shipped file's) stays.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { addPart, autoPlan, concertShift, fitShift, keyOfName, lineupOf, placeNote, playersOf, setPartVoice, transpositionOf, voiceFromName, voiceFromProgram, VOICE_INFO, type LineInfo } from '../src/orchestra/assign.ts';
import { keysFor, keyTargets, setSplit } from '../src/orchestra/keys.ts';
import { soundSeats } from '../src/orchestra/seats.ts';
import { DEMOS, PIECES, demoSong, piecePlan } from '../src/orchestra/pieces.ts';

const PIECE_DIR = join(import.meta.dirname, '../public/pieces');
const load = (f: string) => {
  const b = readFileSync(join(PIECE_DIR, f));
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};
/** a line with these pitch-class counts (C = 0) */
const L = (name: string, program: number, lo: number, hi: number, pcs: Record<number, number>, instrument = ''): LineInfo => {
  const h = new Array<number>(12).fill(0);
  for (const [k, v] of Object.entries(pcs)) h[Number(k)] = v;
  const notes = h.reduce((a, b) => a + b, 0);
  return { name, instrument, program, lo, hi, median: Math.round((lo + hi) / 2), notes, poly: 1, pcs: h };
};
// a piece in E♭ major (its strings): E♭, F, G, A♭, B♭, C, D, the tonic triad the most
const EB_MAJOR = { 3: 40, 5: 16, 7: 32, 8: 16, 10: 36, 0: 12, 2: 12 };
// a natural horn's part as written: the C-major triad of its harmonic series, a few D, F, A, B
const WRITTEN_IN_C = { 0: 40, 4: 30, 7: 36, 2: 10, 5: 6, 9: 4, 11: 6 };
const F_MAJOR = { 5: 40, 7: 16, 9: 32, 10: 16, 0: 36, 2: 12, 4: 12 };
const A_MAJOR = { 9: 40, 11: 16, 1: 32, 2: 16, 4: 36, 6: 12, 8: 12 };

describe('orchestra: the horn', () => {
  it('its names in five languages, abbreviations and keys, and General MIDI 60; its namesakes are not it', () => {
    for (const n of ['Horn', 'Horns', 'French Horn', 'Horn in F', 'Horn 1 in F', 'Horn in E♭', 'Horn in Eb', 'Horn in E-flat', 'Corno', 'Corni', 'Corno I', 'Corno in F', 'Corni in Es', 'Corni in B basso', 'Horn in B♭ alto', 'Cor', 'Cors', 'Cor en Fa', "Cor d'harmonie", 'Waldhorn', 'Hörner', 'Horn in F 2', 'Hn.', 'Hn. 1', 'Hns', 'Hr. 2', 'Trompa', 'Trompas', 'Mellophone'])
      expect(voiceFromName(n), n).toBe('horn');
    for (const [n, v] of [['English Horn', 'oboe'], ['Cor anglais', 'oboe'], ['Corno inglese', 'oboe'], ['Englischhorn', 'oboe'], ['Basset horn', 'clarinet'], ['Corno di bassetto', 'clarinet'], ['Flugelhorn', 'trumpet'], ['Flügelhorn', 'trumpet'], ['Posthorn', 'trumpet'], ['Cornet', 'trumpet'], ['Trumpet in B♭', 'trumpet'], ['Tromba', 'trumpet'], ['Basso', 'bass'], ['Viola', 'viola'], ['Alto', 'viola'], ['Fagotto', 'bassoon']] as const)
      expect(voiceFromName(n), n).toBe(v);
    expect(voiceFromProgram(60)).toBe('horn');
    // the rest of the brass stay the trumpet's but the trombone's 57 (no tuba)
    for (const p of [56, 58, 59, 61, 62, 63]) expect(voiceFromProgram(p), String(p)).toBe('trumpet');
    expect(voiceFromProgram(57)).toBe('trombone');
  });

  it('its compass is the engine’s (B♭1–F5 sounding: the horn in F’s written F2–C6); a line above it moves down an octave', () => {
    expect([VOICE_INFO.horn.lo, VOICE_INFO.horn.hi]).toEqual([34, 77]);
    expect(placeNote(33, 0, 'horn')).toBe(45);
    expect(placeNote(79, 0, 'horn')).toBe(67);
    // a horn part as it sounds stays: Beethoven's Fifth, I (horns in E♭: B♭2–B♭4), Op. 17 (F2–C5)
    expect(fitShift({ lo: 46, hi: 70, median: 65 }, 'horn')).toBe(0);
    expect(fitShift({ lo: 41, hi: 72, median: 65 }, 'horn')).toBe(0);
  });

  it('a part’s key from its name: English, German, Italian, French; B is B♭ (as scores name transposing parts), H is B', () => {
    const cases: [string, number | null][] = [['Horn in F', 5], ['Horn in E♭', 3], ['Horn in Eb', 3], ['Horn in E flat', 3], ['Corni in Es', 3], ['Corni in B basso', 10], ['Horn in B♭', 10], ['Horn in Bb', 10], ['Horn in H', 11], ['Corno in D', 2], ['Corni in As', 8], ['Cor en Fa', 5], ['Corno in Mi♭', 3], ['Clarinetto in La', 9], ['Clarinet in A', 9], ['Tromba in C', 0], ['Horn', null], ['Violin I', null], ['Violoncello', null]];
    for (const [n, k] of cases) expect(keyOfName(n), n).toBe(k);
    // written → sounding: a horn in X sounds X below the written C; others the nearer way
    const tr = (name: string) => transpositionOf({ name, instrument: '' });
    expect([tr('Horn in F'), tr('Corni in Es'), tr('Corno in D'), tr('Horn in C'), tr('Horn'), tr('Corni in B basso')]).toEqual([-7, -9, -10, 0, -7, -2]);
    expect([tr('Clarinet in B♭'), tr('Clarinetto in A'), tr('Clarinet in E♭'), tr('Trumpet in D'), tr('Violin')]).toEqual([-2, -3, 3, 2, 0]);
  });

  it('transposing parts sound at concert pitch: one typed as written is moved, one already as it sounds stays', () => {
    const strings = [L('Violino I', 40, 55, 91, EB_MAJOR), L('Violino II', 40, 55, 86, EB_MAJOR), L('Viola', 41, 48, 79, EB_MAJOR), L('Basso', 43, 36, 67, EB_MAJOR)];
    // a natural horn's part in E♭ as written (in C): a major sixth down
    const written = [L('Corno I in Es', 60, 60, 79, WRITTEN_IN_C), ...strings];
    expect(concertShift(written, 0)).toBe(-9);
    // the same part as a notation program's MIDI has it (sounding: in E♭ already)
    const sounding = [L('Corno I in Es', 60, 51, 70, EB_MAJOR), ...strings];
    expect(concertShift(sounding, 0)).toBe(0);
    // on the stage: the written part plays a sixth lower, on the horn
    const p = autoPlan(written, { cap: 6 });
    expect(lineupOf(p)[0]).toBe('horn');
    const r = p.lines[0][0];
    expect(r.shift).toBe(-9);
    expect(placeNote(64, r.shift, 'horn')).toBe(55); // the written E4 sounds G3
    expect(autoPlan(sounding, { cap: 6 }).lines[0][0].shift).toBe(0);
    // a horn in F (the usual horn: named without a key) in an F-major piece, as written: a fifth down
    const inF = [L('Horn', 60, 55, 79, WRITTEN_IN_C), L('Violin', 40, 55, 88, F_MAJOR), L('Cello', 42, 36, 64, F_MAJOR)];
    expect(concertShift(inF, 0)).toBe(-7);
    // and a clarinet in A as written (in C) in an A-major piece: a minor third down; as it sounds: stays
    const inA = [L('Clarinet in A', 71, 55, 84, WRITTEN_IN_C), L('Violin', 40, 55, 88, A_MAJOR), L('Viola', 41, 48, 76, A_MAJOR)];
    expect(concertShift(inA, 0)).toBe(-3);
    expect(concertShift([L('Clarinet in A', 71, 52, 81, A_MAJOR), ...inA.slice(1)], 0)).toBe(0);
    // too few notes, or nothing to compare with: as the file has it
    expect(concertShift([L('Horn in F', 60, 60, 72, { 0: 5, 4: 4, 7: 5 }), ...inF.slice(1)], 0)).toBe(0);
    expect(concertShift([L('Horn in F', 60, 55, 79, WRITTEN_IN_C)], 0)).toBe(0);
    // a moved line keeps its move on another instrument: a cello reading the horn's written part plays it
    // at concert pitch too (and by octaves into its range)
    const q = setPartVoice(p, written, 0, 'cello');
    expect(((q.lines[0][0].shift % 12) + 12) % 12).toBe(3);
  });

  it('a line is judged by its core (all but its rarest 2 % of notes): every other shipped piece plans as it did without it, and the Horn Sonata’s pedal notes no longer make its horn a double bass', () => {
    const op17 = load('beethoven-op17.mid');
    const bareOp17 = op17.lines.map(({ core: _c, pcs: _p, ...l }) => l);
    expect(lineupOf(autoPlan(bareOp17, { cap: 4 }))[0]).toBe('bass');
    expect(lineupOf(autoPlan(op17.lines, { cap: 4 }))[0]).toBe('horn');
    // (and the Bassoon Concerto's solo line, dropped in as a file: its double stops no wind holds, and its few
    // low B♭1s had sent it to the double bass, the cello taking it only an octave up; now the cello, at pitch)
    const k191 = load('mozart-k191-ii.mid');
    const bareK191 = k191.lines.map(({ core: _c, pcs: _p, ...l }) => l);
    for (const cap of [4, 8]) {
      expect(autoPlan(bareK191, { cap }).lines[2].map((r) => autoPlan(bareK191, { cap }).parts[r.part].voice)).toEqual(['bass']);
      const p = autoPlan(k191.lines, { cap });
      expect(p.lines[2].map((r) => [p.parts[r.part].voice, r.shift])).toEqual([['cello', 0]]);
    }
    for (const f of readdirSync(PIECE_DIR).filter((x) => x.endsWith('.mid') && x !== 'beethoven-op17.mid' && x !== 'mozart-k191-ii.mid')) {
      const song = load(f);
      const bare = song.lines.map(({ core: _c, pcs: _p, ...l }) => l);
      for (const cap of [4, 8]) expect(autoPlan(song.lines, { cap }), `${f} cap ${cap}`).toEqual(autoPlan(bare, { cap }));
    }
    for (const pc of PIECES) {
      const song = load(pc.file);
      expect(piecePlan(pc, song.lines, 8), pc.id).toEqual(piecePlan(pc, song.lines.map(({ core: _c, pcs: _p, ...l }) => l), 8));
    }
  });

  it('every shipped piece is already at concert pitch: no line is moved (the Réjouissance’s trumpet keeps its piece’s own tone down)', () => {
    for (const f of readdirSync(PIECE_DIR).filter((x) => x.endsWith('.mid'))) {
      const song = load(f);
      song.lines.forEach((_, i) => expect(concertShift(song.lines, i), `${f} line ${i}`).toBe(0));
    }
    const han = PIECES.find((p) => p.id === 'handel')!;
    expect(piecePlan(han, load(han.file).lines, 6).lines[0][0].shift).toBe(-2);
  });

  it('the Horn Sonata (Mutopia’s file): the demo is the horn’s line, at concert pitch, in the compass, from its second call', () => {
    const song = load('beethoven-op17.mid');
    expect(song.lines.map((l) => [l.instrument, l.program])).toEqual([['french horn', 60], ['', -1], ['', -1]]);
    // the horn line alone goes to the horn (by its instrument name and GM 60), as it sounds
    const p = autoPlan(song.lines, { cap: 4 });
    expect(lineupOf(p)).toContain('horn');
    expect(p.lines[0].map((r) => [p.parts[r.part].voice, r.shift])).toEqual([['horn', 0]]);
    const d = demoSong(song, DEMOS.horn);
    const ms = d.events.flatMap((e) => (e.kind === 'on' ? [e.midi] : []));
    // the call again: C4 C4 F4 C4 A3 F3 (sounding: the horn in F's written G4 G4 C5 G4 E4 C4), down to the low C
    expect(ms.slice(0, 6)).toEqual([60, 60, 65, 60, 57, 53]);
    expect(Math.min(...ms)).toBeGreaterThanOrEqual(34);
    expect(Math.max(...ms)).toBeLessThanOrEqual(77);
    expect(ms[ms.length - 1]).toBe(48);
    expect(d.duration).toBeGreaterThan(30);
    expect(d.duration).toBeLessThan(40);
    expect(Math.max(...d.events.flatMap((e) => (e.kind === 'on' ? [e.vel] : [])))).toBeLessThanOrEqual(80);
  });

  it('two horns (Beethoven’s Fifth has two, sometimes four): each its own line, more doubling them by hand, each its own player, seated with the brass; the keys play one', () => {
    const lines = [
      { name: 'Oboe I', instrument: 'oboe', program: 68, lo: 62, hi: 86, median: 74, notes: 300, poly: 1 },
      { name: 'Corno I in Es', instrument: 'french horn', program: 60, lo: 51, hi: 70, median: 63, notes: 300, poly: 1 },
      { name: 'Corno II in Es', instrument: 'french horn', program: 60, lo: 46, hi: 63, median: 55, notes: 300, poly: 1 },
      { name: 'Tromba I in C', instrument: 'trumpet', program: 56, lo: 60, hi: 79, median: 67, notes: 200, poly: 1 },
      { name: 'Violoncello', instrument: 'cello', program: 42, lo: 36, hi: 64, median: 50, notes: 300, poly: 1 },
    ];
    const p = autoPlan(lines, { cap: 8 });
    const lu = lineupOf(p);
    expect(lu).toEqual(['oboe', 'horn', 'horn', 'trumpet', 'cello']);
    expect(p.parts.filter((x) => x.voice === 'horn').map((x) => x.lines)).toEqual([[1], [2]]);
    // horns III and IV by hand, doubling I and II: four engines, a second player on each line
    const q = addPart(addPart(p, lines, 'horn', [1], 10)!, lines, 'horn', [2], 10)!;
    expect(lineupOf(q).filter((v) => v === 'horn').length).toBe(4);
    expect(playersOf(q).filter((_, k) => q.parts[k].voice === 'horn').sort()).toEqual([0, 0, 1, 1]);
    // GM 60 alone (no name) is a horn too
    expect(lineupOf(autoPlan([{ name: '', instrument: '', program: 60, lo: 48, hi: 72, median: 60, notes: 200, poly: 1 }], { cap: 4 }))).toEqual(['horn']);
    // chosen alone, the keys play a horn in its range (a note above it moves down an octave)
    expect(keyTargets(82, { parts: [1], split: false, byUser: true }, lu, new Set())).toEqual([{ part: 1, pitch: 70 }]);
    const c = setSplit(keysFor(lu), true);
    expect(keyTargets(55, c, lu, new Set()).length).toBeGreaterThan(0);
    // each its own seat, heard from there (with the brass)
    const seats = soundSeats(lu.map((v) => ({ instrument: VOICE_INFO[v].instrument })));
    expect(new Set(seats.map((s) => s.join())).size).toBe(5);
  });

  it('Beethoven’s Fifth as Mutopia typeset it labels its horns "english horn" (GM 69): no key in the name, so a horn chosen for the line plays it as the file has it', () => {
    // (lines "five:" (horns in E♭) and "six:" (trumpets in C) of Symphony5_1.mid, as parsed; their notes are
    // at concert pitch: the horns' opening G G G E♭. Routing that file's parts is the symphony's own PR)
    const strings = [L('eight:', 40, 55, 89, EB_MAJOR, 'violin'), L('ten:', 41, 48, 77, EB_MAJOR, 'viola'), L('eleven:', 42, 36, 69, EB_MAJOR, 'cello')];
    const horns = L('five:', 69, 46, 70, EB_MAJOR, 'english horn');
    const lines = [horns, ...strings];
    expect(concertShift(lines, 0)).toBe(0);
    const p = setPartVoice(autoPlan(lines, { cap: 6 }), lines, 0, 'horn');
    expect(p.parts[0].voice).toBe('horn');
    expect(p.lines[0][0].shift).toBe(0);
  });
});
