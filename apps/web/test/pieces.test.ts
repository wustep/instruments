// Orchestra mode's built-in pieces: the files are Mutopia's own (checksums; five with their scores'
// dynamics written into them: score-dynamics.test.ts), they parse, and each piece sets out its parts as
// listed (orchestra/pieces.ts), fitted to a smaller stage when needed.
// Four are this project's own (Fable 5.2, CC0): "Toward Morning", thirteen parts on thirteen seats,
// "Everything So Far", eleven on eleven, "Pass It On", every instrument, seventeen on seventeen, and
// "After You", a tango, twelve on twelve. Three more are GPT-6.2 Astra's (CC0, pending approval).
// The original scores carry their own tempo, dynamics and timing in the files.
import { ASTRA_SCORES } from './presets.ts';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { express } from '../src/expression.ts';
import { autoPlan, fitLineup, fitsStage, voiceFromName, voiceFromProgram, lineupOf, placeNote, VOICE_INFO } from '../src/orchestra/assign.ts';
import { DEMOS, demoSong, pieceForLineup, PIECES, piecePlan, pieceSong, type Demo } from '../src/orchestra/pieces.ts';
import type { MidiSong } from '../src/midi-file.ts';
import { INSTRUMENT_IDS, INSTRUMENT_INFO } from '../../../packages/engine/src/core/instrument.ts';

const load = (file: string) => {
  const b = readFileSync(new URL(`../public/pieces/${file}`, import.meta.url));
  return { b, song: parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) };
};

describe('orchestra: the pieces', () => {
  it('each file is its checksum’s: Mutopia’s (five with their scores’ dynamics written in), the original scores (CC0); each parses into the lines its plan names', () => {
    // (Seeds has no file: it is made as it plays, test/seeds.test.ts)
    for (const p of PIECES.filter((q) => !q.generate)) {
      const { b, song } = load(p.file);
      expect(createHash('sha256').update(b).digest('hex'), p.id).toBe(p.sha256);
      expect(song.duration, p.id).toBeGreaterThan(30);
      for (const part of p.parts) for (const l of part.lines) expect(l, p.id).toBeLessThan(song.lines.length);
      expect(p.credit).toMatch(/public domain/);
      if (p.id in ASTRA_SCORES) {
        // not Mutopia's: written for this page, and said so, with its licence
        expect(p.source).toBe('https://github.com/wustep/instruments#license');
        expect(p.composer).toBe('GPT-6.2 Astra');
        expect(p.credit).toContain('GPT-6.2 Astra (OpenAI), 2026');
        expect(p.credit).toMatch(/CC0 1\.0/);
      } else if (p.id === 'toward-morning' || p.id === 'everything-so-far' || p.id === 'pass-it-on' || p.id === 'after-you') {
        expect(p.source).toBe('https://github.com/wustep/instruments#license');
        expect(p.composer).toBe('Fable 5.2');
        expect(p.credit).toMatch(/CC0 1\.0/);
      } else expect(p.source).toMatch(/^https:\/\/www\.mutopiaproject\.org\/cgibin\/piece-info\.cgi\?id=\d+$/);
    }
    // the only pieces that are not Mutopia's are those named here
    expect(PIECES.filter((p) => !/mutopiaproject/.test(p.source)).map((p) => p.id)).toEqual(['toward-morning', 'everything-so-far', 'pass-it-on', 'after-you', ...Object.keys(ASTRA_SCORES), 'seeds']);
    // and the one with no file says so: no file, no checksum, a way to grow it and a stretch to measure it on
    const seeds = PIECES.filter((p) => p.generate);
    expect(seeds.map((p) => [p.id, p.file, p.sha256, p.path])).toEqual([['seeds', '', '', 'seeds']]);
    expect(seeds[0].credit).toMatch(/Fable 5\.2/);
    expect(seeds[0].credit).toMatch(/CC0 1\.0/);
    expect(seeds[0].credit).toMatch(/public domain/);
    expect(seeds[0].source).toBe('https://github.com/wustep/instruments#license');
    expect(seeds[0].measured).toBeTruthy();
    expect(PIECES.every((p) => !!p.generate === !p.file)).toBe(true);
  });

  it('Toward Morning: thirteen lines, one to a seat by its own names; every note in its instrument’s compass, one voice to a wind; its own dynamics; the thirteen’s play icon plays it', () => {
    const tm = PIECES.find((p) => p.id === 'toward-morning')!;
    const { song } = load(tm.file);
    expect(`${tm.composer}, ${tm.title}`).toBe('Fable 5.2, Toward Morning');
    expect(tm.path).toBe('symphony');
    expect(song.lines.map((l) => `${l.name}~${l.program}`)).toEqual(['Flute~73', 'Oboe~68', 'Clarinet~71', 'Bassoon~70', 'Horn~60', 'Trumpet~56', 'Trombone~57', 'Timpani~47', 'Violin I~40', 'Violin II~40', 'Viola~41', 'Cello~42', 'Double Bass~43']);
    // four minutes and twenty seconds
    expect(song.duration).toBeGreaterThan(255);
    expect(song.duration).toBeLessThan(265);
    const seats = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'timpani', 'violin', 'violin', 'viola', 'cello', 'bass'];
    const plan = piecePlan(tm, song.lines, 13);
    expect(lineupOf(plan)).toEqual(seats);
    // each line on its own seat, as written (no transposition, nothing folded by octaves)
    expect(plan.lines.map((rs) => rs.map((r) => [r.part, r.shift]))).toEqual(seats.map((_, i) => [[i, 0]]));
    song.lines.forEach((l, i) => {
      const v = VOICE_INFO[plan.parts[i].voice];
      expect(l.lo, `${l.name} low`).toBeGreaterThanOrEqual(v.lo);
      expect(l.hi, `${l.name} high`).toBeLessThanOrEqual(v.hi);
      expect(l.poly, `${l.name} voices`).toBeLessThanOrEqual(v.poly);
    });
    // dropped as a plain file on a stage with room, its names seat the same orchestra
    expect(lineupOf(autoPlan(song.lines, { cap: 13 }))).toEqual(seats);
    // it has its own dynamics: automatic expression leaves it as written
    expect(express(song).shaped).toBe(false);
    // the play icon: thirteen seats play it, the symphony's eighteen still Beethoven's Fifth
    expect(PIECES[pieceForLineup(seats as never)].id).toBe('toward-morning');
    const fifth = PIECES.find((p) => p.id === 'beethoven5-i')!;
    expect(PIECES[pieceForLineup(fifth.parts.map((q) => q.voice))].id).toBe('beethoven5-i');
    // (the page's own pieces come last, in the order they were written)
    expect(PIECES.slice(-8).map((p) => p.id)).toEqual(['toward-morning', 'everything-so-far', 'pass-it-on', 'after-you', 'salt-thread', 'latchwork', 'long-fold', 'seeds']);
  });

  it('Everything So Far: eleven lines (the conductor track is none), one to a seat by its own names; every note in its instrument’s compass; its own dynamics; the eleven’s play icon plays it', () => {
    const es = PIECES.find((p) => p.id === 'everything-so-far')!;
    const { song } = load(es.file);
    expect(`${es.composer}, ${es.title}`).toBe('Fable 5.2, Everything So Far');
    expect(es.path).toBe('everything');
    expect(song.lines.map((l) => `${l.name}~${l.program}`)).toEqual(['Flute~73', 'Clarinet~71', 'Horn~60', 'Glockenspiel~9', 'Harp~46', 'Grand Piano~0', 'Violin I~40', 'Violin II~40', 'Viola~41', 'Cello~42', 'Double Bass~43']);
    // three minutes (180.97 s, first note to the end of the last), 77 bars of 7/8
    expect(song.duration).toBeGreaterThan(180);
    expect(song.duration).toBeLessThan(182);
    expect(song.bars).toHaveLength(77);
    const seats = ['flute', 'clarinet', 'horn', 'glockenspiel', 'harp', 'grand', 'violin', 'violin', 'viola', 'cello', 'bass'];
    const plan = piecePlan(es, song.lines, 11);
    expect(lineupOf(plan)).toEqual(seats);
    // each line on its own seat, as written (no transposition, nothing folded by octaves)
    expect(plan.lines.map((rs) => rs.map((r) => [r.part, r.shift]))).toEqual(seats.map((_, i) => [[i, 0]]));
    song.lines.forEach((l, i) => {
      const v = VOICE_INFO[plan.parts[i].voice];
      expect(l.lo, `${l.name} low`).toBeGreaterThanOrEqual(v.lo);
      expect(l.hi, `${l.name} high`).toBeLessThanOrEqual(v.hi);
      expect(l.poly, `${l.name} voices`).toBeLessThanOrEqual(v.poly);
    });
    // the whole of it on a phone's stage and a computer's (36.3 of 45.6: assign.ts fitLineup)
    expect(fitsStage(seats as never, 6)).toBe(true);
    expect(fitsStage(seats as never, 8)).toBe(true);
    // dropped as a plain file on a stage with room, its names seat the same orchestra
    expect(lineupOf(autoPlan(song.lines, { cap: 11 }))).toEqual(seats);
    // its own dynamics on every line (the viola's and the cello's held notes, once all at one soft velocity,
    // swell and fade since: score-dynamics.test.ts): automatic expression phrases none of it
    expect(express(song).shapes.map((sh, i) => (sh.flat ? song.lines[i].name : null)).filter(Boolean)).toEqual([]);
    // the play icon: eleven seats play it; the thirteen still Toward Morning, the symphony's eighteen Beethoven's Fifth
    expect(PIECES[pieceForLineup(seats as never)].id).toBe('everything-so-far');
    const tm = PIECES.find((p) => p.id === 'toward-morning')!;
    expect(PIECES[pieceForLineup(tm.parts.map((q) => q.voice))].id).toBe('toward-morning');
    const fifth = PIECES.find((p) => p.id === 'beethoven5-i')!;
    expect(PIECES[pieceForLineup(fifth.parts.map((q) => q.voice))].id).toBe('beethoven5-i');
  });

  it('Pass It On: seventeen lines (the conductor track is none), one to a seat by its own names, every instrument of the page; every note in its instrument’s compass, one voice to a wind; its own dynamics on every line; it fits a phone’s stage; the seventeen’s play icon plays it', () => {
    const po = PIECES.find((p) => p.id === 'pass-it-on')!;
    const { song } = load(po.file);
    expect(`${po.composer}, ${po.title}`).toBe('Fable 5.2, Pass It On');
    expect(po.path).toBe('passiton');
    // (seventeen lines on fifteen channels: the second violin's shares the first's, the tuba's the trombone's;
    // each line is still read with its own program, the one in force at its first note)
    expect(song.lines.map((l) => `${l.name}~${l.program}`)).toEqual(['Flute~73', 'Oboe~68', 'Clarinet~71', 'Bassoon~70', 'Horn~60', 'Trumpet~56', 'Trombone~57', 'Tuba~58', 'Timpani~47', 'Glockenspiel~9', 'Harp~46', 'Grand Piano~0', 'Violin I~40', 'Violin II~40', 'Viola~41', 'Cello~42', 'Double Bass~43']);
    expect(new Set(song.lines.map((l) => l.channel)).size).toBe(15);
    expect(song.lines[7].channel).toBe(song.lines[6].channel);
    expect(song.lines[13].channel).toBe(song.lines[12].channel);
    // three minutes and eight seconds (first note to the end of the last), 98 bars of 4/4: under four minutes
    expect(song.duration).toBeGreaterThan(186);
    expect(song.duration).toBeLessThan(191);
    expect(song.bars).toHaveLength(98);
    const seats = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'tuba', 'timpani', 'glockenspiel', 'harp', 'grand', 'violin', 'violin', 'viola', 'cello', 'bass'];
    // every instrument of the page but the upright (the grand is the piano), the violin twice
    expect([...new Set(seats.map((v) => VOICE_INFO[v as never].instrument))].sort()).toEqual([...INSTRUMENT_IDS].sort());
    const plan = piecePlan(po, song.lines, 17);
    expect(lineupOf(plan)).toEqual(seats);
    // each line on its own seat, as written (no transposition, nothing folded by octaves)
    expect(plan.lines.map((rs) => rs.map((r) => [r.part, r.shift]))).toEqual(seats.map((_, i) => [[i, 0]]));
    song.lines.forEach((l, i) => {
      const v = VOICE_INFO[plan.parts[i].voice];
      expect(l.lo, `${l.name} low`).toBeGreaterThanOrEqual(v.lo);
      expect(l.hi, `${l.name} high`).toBeLessThanOrEqual(v.hi);
      expect(l.poly, `${l.name} voices`).toBeLessThanOrEqual(v.poly);
      // (every one of them has its note in the tune and its bars of the round: none is a bystander)
      expect(l.notes, l.name).toBeGreaterThanOrEqual(30);
    });
    // the whole of it on a phone's stage and a computer's (45.1 of 45.6: assign.ts fitLineup)
    expect(fitsStage(seats as never, 6)).toBe(true);
    expect(fitsStage(seats as never, 8)).toBe(true);
    // dropped as a plain file on a stage with room, its names seat the same orchestra
    expect(lineupOf(autoPlan(song.lines, { cap: 17 }))).toEqual(seats);
    // its own dynamics on every line (each note's velocity is its own): automatic expression phrases none
    expect(express(song).shapes.map((sh, i) => (sh.flat ? song.lines[i].name : null)).filter(Boolean)).toEqual([]);
    // the first statement: sixteen instants, one note each, in the order of the seats across the stage
    // (the two violins together), the glockenspiel first and the double bass last
    const firsts = song.lines.map((_, i) => song.events.find((e) => e.kind === 'on' && e.line === i)!.t);
    const order = ['Glockenspiel', 'Horn', 'Trumpet', 'Trombone', 'Tuba', 'Bassoon', 'Clarinet', 'Oboe', 'Flute', 'Harp', 'Timpani', 'Grand Piano', 'Violin I', 'Violin II', 'Viola', 'Cello', 'Double Bass'];
    const byTime = song.lines.map((l, i) => ({ name: l.name, t: firsts[i] })).sort((a, b) => a.t - b.t);
    expect(byTime.filter((x) => !/Violin/.test(x.name)).map((x) => x.name)).toEqual(order.filter((x) => !/Violin/.test(x)));
    expect(Math.abs(firsts[12] - firsts[13])).toBeLessThan(0.15);
    expect(firsts[9]).toBeLessThan(0.05);
    expect(firsts[16]).toBeGreaterThan(20);
    expect(firsts[16]).toBeLessThan(26);
    // the play icon: seventeen seats play it; the others' orchestras still play their own
    expect(PIECES[pieceForLineup(seats as never)].id).toBe('pass-it-on');
    for (const id of ['toward-morning', 'everything-so-far', 'beethoven5-i']) {
      const other = PIECES.find((p) => p.id === id)!;
      expect(PIECES[pieceForLineup(other.parts.map((q) => q.voice))].id, id).toBe(id);
    }
  });

  it('After You: twelve lines (the conductor track is none), one to a seat by its own names; every note in its instrument’s compass, one voice to a wind; its own dynamics on every line, a hairpin (CC11) inside the held notes; the clarinet follows the violin a bar behind; it fits a phone’s stage; the twelve’s play icon plays it', () => {
    const ay = PIECES.find((p) => p.id === 'after-you')!;
    const { song } = load(ay.file);
    expect(`${ay.composer}, ${ay.title}`).toBe('Fable 5.2, After You');
    expect(ay.path).toBe('tango');
    expect(song.lines.map((l) => `${l.name}~${l.program}`)).toEqual(['Oboe~68', 'Clarinet~71', 'Bassoon~70', 'Horn~60', 'Trumpet~56', 'Trombone~57', 'Grand Piano~0', 'Violin I~40', 'Violin II~40', 'Viola~41', 'Cello~42', 'Double Bass~43']);
    expect(new Set(song.lines.map((l) => l.channel)).size).toBe(12);
    // two minutes and fifty-six seconds (first note to the end of the last), 88 bars of 2/4 (the last is empty)
    expect(song.duration).toBeGreaterThan(173);
    expect(song.duration).toBeLessThan(179);
    expect(song.bars).toHaveLength(87);
    const seats = ['oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'grand', 'violin', 'violin', 'viola', 'cello', 'bass'];
    const plan = piecePlan(ay, song.lines, 12);
    expect(lineupOf(plan)).toEqual(seats);
    // each line on its own seat, as written (no transposition, nothing folded by octaves)
    expect(plan.lines.map((rs) => rs.map((r) => [r.part, r.shift]))).toEqual(seats.map((_, i) => [[i, 0]]));
    const ons = (i: number) => song.events.filter((e) => e.kind === 'on' && e.line === i) as { t: number; midi: number; vel: number }[];
    song.lines.forEach((l, i) => {
      const v = VOICE_INFO[plan.parts[i].voice];
      expect(l.lo, `${l.name} low`).toBeGreaterThanOrEqual(v.lo);
      expect(l.hi, `${l.name} high`).toBeLessThanOrEqual(v.hi);
      expect(l.poly, `${l.name} voices`).toBeLessThanOrEqual(v.poly);
      expect(l.notes, l.name).toBeGreaterThanOrEqual(40);
      // real dynamics: each line's velocities are many, and far apart
      const vels = ons(i).map((e) => e.vel);
      expect(new Set(vels).size, `${l.name} velocities`).toBeGreaterThanOrEqual(12);
      expect(Math.max(...vels) - Math.min(...vels), `${l.name} velocity range`).toBeGreaterThanOrEqual(36);
      // and hairpins: every wind and every bow moves its expression (CC11) inside its held notes; the piano's dynamics are its hammers' (and its pedal's)
      const cc = song.events.filter((e) => e.kind === 'cc' && e.cc === 11 && e.line === i) as { value: number }[];
      if (plan.parts[i].voice === 'grand') expect(cc.length, l.name).toBeLessThanOrEqual(1);
      else {
        expect(cc.length, `${l.name} hairpins`).toBeGreaterThan(100);
        expect(Math.min(...cc.map((e) => e.value)), l.name).toBeLessThan(0.75);
        expect(Math.max(...cc.map((e) => e.value)), l.name).toBeGreaterThan(0.8);
      }
    });
    expect(song.events.filter((e) => e.kind === 'pedal' && e.cc === 64 && e.line === 6).length).toBeGreaterThan(40);
    // the whole of it on a phone's stage and a computer's
    expect(fitsStage(seats as never, 6)).toBe(true);
    expect(fitsStage(seats as never, 8)).toBe(true);
    // dropped as a plain file on a stage with room, its names seat the same orchestra
    expect(lineupOf(autoPlan(song.lines, { cap: 12 }))).toEqual(seats);
    // its own dynamics on every line: automatic expression phrases none; its lines are written apart (each
    // note ahead of its beat by the time its instrument takes to speak): they are not moved again
    const ex = express(song);
    expect(ex.shapes.map((sh, i) => (sh.flat ? song.lines[i].name : null)).filter(Boolean)).toEqual([]);
    expect(ex.timed).toBe(false);
    // the tempo is part of the playing: the middle strain's bars are a fifth longer than the first strain's
    const bar = (n: number) => song.bars![n] - song.bars![n - 1];
    expect(bar(42) / bar(8)).toBeGreaterThan(1.12);
    // the idea: the violin leads (G5 F5 E♭5 D5 C5 after its upbeat), the clarinet follows with the same an
    // octave under, a bar behind (about two seconds)
    const lead = ons(7).slice(3, 8);
    const follow = ons(1).filter((e) => e.t > 7.5).slice(0, 5);
    expect(lead.map((e) => e.midi)).toEqual([79, 77, 75, 74, 72]);
    expect(follow.map((e) => e.midi)).toEqual([67, 65, 63, 62, 60]);
    lead.forEach((e, k) => {
      expect(follow[k].t - e.t, `note ${k}`).toBeGreaterThan(1.6);
      expect(follow[k].t - e.t, `note ${k}`).toBeLessThan(2.3);
    });
    // the play icon: twelve seats play it; the others' orchestras still play their own
    expect(PIECES[pieceForLineup(seats as never)].id).toBe('after-you');
    for (const id of ['toward-morning', 'everything-so-far', 'pass-it-on', 'beethoven5-i']) {
      const other = PIECES.find((p) => p.id === id)!;
      expect(PIECES[pieceForLineup(other.parts.map((q) => q.voice))].id, id).toBe(id);
    }
  });

  it('the quartet is a quartet, the concerto six players, the fanfare a trumpet at concert pitch with the piano', () => {
    const plans = PIECES.filter((p) => !p.generate).map((p) => piecePlan(p, load(p.file).song.lines, 6));
    expect(lineupOf(plans[0])).toEqual(['violin', 'violin', 'viola', 'cello']);
    expect(lineupOf(plans[1])).toEqual(['flute', 'violin', 'violin', 'viola', 'cello', 'grand']);
    // the violone doubles the cello: silent
    expect(plans[1].lines[5]).toEqual([]);
    expect(lineupOf(plans[2])).toEqual(['trumpet', 'grand']);
    // the B♭ trumpet's written C sounds B♭, the organ's key
    expect(plans[2].lines[0].map((r) => r.shift)).toEqual([-2]);
    expect(placeNote(72, plans[2].lines[0][0].shift, 'trumpet')).toBe(70);
    // a smaller stage: the concerto's violins become a section
    expect(piecePlan(PIECES[1], load(PIECES[1].file).song.lines, 5).parts.length).toBe(5);
  });

  it('their time: each typed at one tempo is played in a player’s time (expression.ts TEMPO); this project’s own keep their tempo maps, untouched', () => {
    for (const p of PIECES.filter((q) => !q.generate)) {
      const song = pieceSong(load(p.file).song, p);
      const x = express(song);
      if (p.source.includes('mutopiaproject')) {
        // one tempo, typed on its grid: a few % longer, its last bars broadening
        expect(x.tempo, p.id).toBe(true);
        expect(x.clock.duration / song.duration, p.id).toBeGreaterThan(1.005);
        expect(x.clock.duration / song.duration, p.id).toBeLessThan(1.06);
      } else {
        expect(song.quarter, p.id).toBeUndefined();
        expect(x.tempo, p.id).toBe(false);
        expect(x.clock.on(37.25), p.id).toBe(37.25);
        expect(x.clock.duration, p.id).toBe(song.duration);
      }
    }
  });

  it('dropped as plain files, auto-assignment finds the same quartet', () => {
    expect(lineupOf(autoPlan(load(PIECES[0].file).song.lines, { cap: 6 }))).toEqual(['violin', 'violin', 'viola', 'cello']);
    // the fanfare's organ (two staves, chords) is one piano; its trumpet a trumpet
    expect(lineupOf(autoPlan(load(PIECES[2].file).song.lines, { cap: 6 }))).toEqual(['trumpet', 'grand']);
  });
});

describe('each instrument’s own piece (the play icon)', () => {
  it('every instrument has one: Mutopia’s file by its checksum (the Handel and the Air with the dynamics written into them), public domain, short, every note in its range', () => {
    for (const id of INSTRUMENT_IDS) {
      const d = DEMOS[id];
      expect(d?.instrument, id).toBe(id);
      const { b, song } = load(d.file);
      expect(createHash('sha256').update(b).digest('hex'), id).toBe(d.sha256);
      expect(d.source).toMatch(/^https:\/\/www\.mutopiaproject\.org\/cgibin\/piece-info\.cgi\?id=\d+$/);
      // public domain, or a Creative Commons licence that lets the file be passed on with its credit
      // (the oboe's Brandenburg: CC BY 3.0; the symphony brief allows a CC licence that permits redistribution)
      expect(d.credit).toMatch(/public domain|Creative Commons Attribution(-ShareAlike)? \d\.\d/);
      const s = demoSong(song, d);
      const ons = s.events.filter((e) => e.kind === 'on') as { t: number; midi: number; vel: number }[];
      expect(ons.length, id).toBeGreaterThan(50);
      // short: half a minute to about two
      expect(s.duration, id).toBeGreaterThan(30);
      expect(s.duration, id).toBeLessThan(130);
      // it starts at once (no silence before the first note)
      expect(ons[0].t, id).toBe(0);
      const { lo, hi } = INSTRUMENT_INFO[id];
      for (const e of ons) {
        expect(e.midi, `${id} ${e.t}`).toBeGreaterThanOrEqual(lo);
        expect(e.midi, `${id} ${e.t}`).toBeLessThanOrEqual(hi);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(127);
      }
      // the winds play one note at a time
      if (id === 'flute' || id === 'oboe' || id === 'trumpet') {
        let held = 0;
        let most = 0;
        for (const e of s.events) {
          if (e.kind === 'on') most = Math.max(most, ++held);
          else if (e.kind === 'off') held--;
        }
        expect(most, id).toBe(1);
      }
    }
    // the trumpet's is the ensemble's fanfare, its trumpet alone, a tone down to concert pitch
    expect(DEMOS.trumpet.file).toBe(PIECES[2].file);
    expect(DEMOS.trumpet.shift).toBe(-2);
  });

  it('plays the lines it names from their first note, at its tempo and force, transposed, and stops at its end', () => {
    const song: MidiSong = {
      duration: 9,
      lines: [{ track: 0, channel: 0, name: 'a', instrument: '', program: -1, notes: 3, lo: 60, hi: 64, median: 62, poly: 1 }, { track: 1, channel: 1, name: 'b', instrument: '', program: -1, notes: 1, lo: 40, hi: 40, median: 40, poly: 1 }],
      events: [
        { t: 0, kind: 'on', midi: 40, vel: 100, line: 1 },
        { t: 1, kind: 'pedal', cc: 64, value: 1, line: 0 },
        { t: 2, kind: 'on', midi: 60, vel: 100, line: 0 },
        { t: 3, kind: 'off', midi: 60, line: 0 },
        { t: 3, kind: 'on', midi: 62, vel: 120, line: 0 },
        // begun before the end: it plays out
        { t: 6, kind: 'off', midi: 62, line: 0 },
        { t: 6, kind: 'off', midi: 40, line: 1 },
        // on the end itself: what follows, left out
        { t: 5, kind: 'on', midi: 64, vel: 90, line: 0 },
        { t: 7, kind: 'off', midi: 64, line: 0 },
      ].sort((a, b) => a.t - b.t) as MidiSong['events'],
    };
    const d: Demo = { instrument: 'violin', composer: '', title: '', file: '', source: '', credit: '', sha256: '', lines: [0], shift: 2, rate: 2, end: 5, vel: 0.5 };
    const s = demoSong(song, d);
    expect(s.lines.map((l) => l.name)).toEqual(['a']);
    expect(s.events).toEqual([
      // the pedal before the first note: at once
      { t: 0, kind: 'pedal', cc: 64, value: 1, line: 0 },
      { t: 0, kind: 'on', midi: 62, vel: 50, line: 0 },
      { t: 0.5, kind: 'off', midi: 62, line: 0 },
      { t: 0.5, kind: 'on', midi: 64, vel: 60, line: 0 },
      { t: 2, kind: 'off', midi: 64, line: 0 },
      // the pedal lifted with the last note
      { t: 2, kind: 'pedal', cc: 64, value: 0, line: 0 },
    ]);
    expect(s.duration).toBe(2);
    // with no corrections, the file as it is
    const all = demoSong(song, { ...d, lines: undefined, shift: undefined, rate: undefined, end: undefined, vel: undefined });
    expect(all.events.filter((e) => e.kind !== 'pedal')).toEqual(song.events.filter((e) => e.kind !== 'pedal'));
    expect(all.lines).toBe(song.lines);
  });

  it('in an ensemble with nothing loaded, the built-in piece that fits its lineup best', () => {
    expect(pieceForLineup(['violin', 'violin', 'viola', 'cello'])).toBe(0);
    expect(pieceForLineup(['cello'])).toBe(0);
    expect(pieceForLineup(['flute', 'violin', 'violin', 'viola', 'cello', 'grand'])).toBe(1);
    expect(pieceForLineup(['flute'])).toBe(1);
    expect(pieceForLineup(['trumpet', 'grand'])).toBe(2);
    expect(pieceForLineup(['grand'])).toBe(2);
    expect(pieceForLineup(['trumpet', 'trumpet'])).toBe(2);
  });
});

describe.each(Object.entries(ASTRA_SCORES))('original score /%s', (id, expected) => {
  const piece = PIECES.find(p => p.id === id)!;
  const { b, song } = load(piece.file);
  const seats = [...expected.seats];
  const on = song.events.filter(e => e.kind === 'on');
  const bars = song.bars!;
  const beatTime = (bar: number, beat: number) => bars[bar] + beat / expected.beats * (bars[bar + 1] - bars[bar]);

  it('has one named concert-pitch track per player, seated whole on a phone and chosen by its play icon', () => {
    expect(piece.title).toBe(expected.title);
    expect(piece.file).toBe(`astra-${id}.mid`);
    expect(song.lines.map(l => voiceFromName(l.name))).toEqual(seats);
    expect(song.lines.map(l => voiceFromProgram(l.program))).toEqual(seats);
    expect(new Set(song.lines.map(l => l.channel)).size).toBe(seats.length);
    expect(song.lines.every(l => l.channel !== 9)).toBe(true);
    expect(fitLineup(seats, 6)).toEqual(seats);
    const plan = piecePlan(piece, song.lines, fitLineup(seats, 6).length);
    expect(lineupOf(plan)).toEqual(seats);
    expect(PIECES[pieceForLineup(seats)].id).toBe(id);
    expect(plan.lines).toEqual(seats.map((_, part) => [{ part, shift: 0 }]));
    expect(lineupOf(autoPlan(song.lines, { cap: seats.length }))).toEqual(seats);
    for (const [i, v] of seats.entries()) {
      const info = INSTRUMENT_INFO[VOICE_INFO[v].instrument];
      const ns = on.filter(e => e.line === i);
      expect(Math.min(...ns.map(e => e.midi))).toBeGreaterThanOrEqual(info.lo);
      expect(Math.max(...ns.map(e => e.midi))).toBeLessThanOrEqual(info.hi);
      if (VOICE_INFO[v].poly === 1) {
        let held = 0;
        for (const e of song.events.filter(e => e.line === i)) {
          if (e.kind === 'on') expect(++held, `${v} at ${e.t}`).toBe(1);
          if (e.kind === 'off') expect(--held).toBe(0);
        }
        expect(held).toBe(0);
      }
      expect(new Set(ns.map(e => e.vel)).size).toBeGreaterThan(8);
      const cc = song.events.filter(e => e.kind === 'cc' && e.line === i && e.cc === 11);
      expect(new Set(cc.map(e => e.kind === 'cc' && e.value)).size).toBeGreaterThan(12);
      expect(cc.length).toBeGreaterThan(ns.length);
    }
  });

  it('keeps its metre, phrase tempi, dynamics and ensemble timing through the player', () => {
    expect(b.includes(Buffer.from([0xff, 0x58, 4, ...expected.meter]))).toBe(true);
    expect(bars.length).toBe(expected.bars);
    expect(song.duration).toBeGreaterThanOrEqual(150);
    expect(song.duration).toBeLessThanOrEqual(300);
    const lengths = bars.slice(1).map((t, i) => t - bars[i]);
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeGreaterThan(1.12);
    expect(song.quarter).toBeUndefined();
    const played = express(song);
    expect([played.tempo, played.timed, played.shaped]).toEqual([false, false, false]);
    expect(played.events).toBe(song.events);
  });

  // Score landmarks use the conductor's bar times. Allow the physical attack advance.
  const nearBeat = (line: number, bar: number, beat: number, tolerance = .18) =>
    on.filter(e => e.line === line && Math.abs(e.t - beatTime(bar, beat)) < tolerance).map(e => e.midi);
  if (id === 'salt-thread') it('hands the second and third notes of the same harp ground to the viola and clarinet', () => {
    const middle = [69, 67, 62, 65, 71, 64];
    const upper = [71, 64, 69, 64, 67, 62];
    for (let bar = 0; bar < 6; bar++) {
      expect(nearBeat(0, bar, 2)).toContain(middle[bar]);
      expect(nearBeat(1, bar + 12, 2)).toContain(middle[bar]);
      expect(nearBeat(0, bar + 12, 2)).toEqual([]);
      expect(nearBeat(2, bar + 18, 4)).toContain(upper[bar]);
    }
    expect(on.filter(e => e.t > bars[35]).map(e => [e.line, e.midi])).toEqual([[0, 50]]);
  });

  if (id === 'latchwork') it('rotates 2+2+3, 3+2+2 and 2+3+2 among different players on the three returns', () => {
    for (const [bar, line, beat] of [[0, 2, .25], [0, 1, 1], [0, 0, 2],
      [32, 1, 0], [32, 0, 1.5], [32, 2, 2.5],
      [64, 4, 0], [64, 2, 1], [64, 1, 2.5]]) {
      expect(nearBeat(line, bar, beat), `bar ${bar + 1}, line ${line + 1}`).not.toEqual([]);
    }
    const last = on.filter(e => e.t >= bars[95]);
    expect(last.map(e => e.line).sort()).toEqual([0, 1, 2, 3]);
    expect(Math.max(...last.map(e => e.t)) - Math.min(...last.map(e => e.t))).toBeLessThan(.18);
    expect(song.duration - bars[95]).toBeLessThan(.8);
  });

  if (id === 'long-fold') it('returns the opening four-bar flute melody in the double bass, two octaves down and twice as long', () => {
    const opening = on.filter(e => e.line === 4 && e.t < bars[4] - .15);
    const returning = on.filter(e => e.line === 3 && e.t > bars[56] - .25 && e.t < bars[64] - .25);
    expect(opening).toHaveLength(10);
    expect(returning.map(e => e.midi)).toEqual(opening.map(e => e.midi - 24));
    const quarter = (t: number) => {
      const bar = bars.findLastIndex(b => b <= t);
      return 4 * (bar + (t - bars[bar]) / (bars[bar + 1] - bars[bar]));
    };
    for (const [i, n] of returning.entries()) {
      expect(Math.abs(quarter(n.t) - 224 - 2 * quarter(opening[i].t))).toBeLessThan(.7);
    }
    expect(new Set(on.filter(e => e.t >= bars[71] - .4).map(e => e.line)).size).toBe(8);
  });
});
