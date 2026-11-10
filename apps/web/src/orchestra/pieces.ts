// The pieces that come with the stage: public-domain typesettings from the Mutopia Project
// (mutopiaproject.org), each placed in the public domain by its typesetter, compositions long out of
// copyright. The MIDI files in public/pieces/ are Mutopia's own, byte for byte (sha256 below); what
// plays what is set here, as a player would set out the parts. Two kinds, one catalogue: the
// ensemble's pieces (PIECES, the pieces menu), and each instrument's own short piece (DEMOS), which the
// player's play icon plays when nothing is loaded.
import type { InstrumentId } from '@piano-model/engine';
import type { FileEvent, MidiSong } from '../midi-file.ts';
import { capParts, planOf, shiftKey, type LineInfo, type Plan, type Shifts, type Voice } from './assign.ts';

export interface Piece {
  id: string;
  /** short, for the menu */
  composer: string;
  title: string;
  /** public/pieces/<file> */
  file: string;
  /** the Mutopia page (credit and licence) */
  source: string;
  credit: string;
  sha256: string;
  /** the instruments in seating order, the lines each plays (others are silent), and any line's own
   *  transposition (semitones) on that instrument */
  parts: { voice: Voice; lines: number[]; shift?: Record<number, number> }[];
}

export const PIECES: Piece[] = [
  {
    id: 'haydn',
    composer: 'Haydn',
    title: 'Emperor Quartet, II',
    file: 'haydn-op76-3-ii.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=385',
    credit: 'String Quartet in C, Op. 76 No. 3, II. Poco adagio, cantabile (the "Kaiserhymne" and four variations: the tune passes from the first violin to the second, the cello and the viola). Typeset by Maurizio Tomasi from the Kalmus edition; Mutopia-2015/10/16-385; public domain.',
    sha256: '289f67299f465aede2f0729e0f861bf4ef039801bc138b45947c9b92f5f75fdc',
    parts: [
      { voice: 'violin', lines: [0] },
      { voice: 'violin', lines: [1] },
      { voice: 'viola', lines: [2] },
      { voice: 'cello', lines: [3] },
    ],
  },
  {
    id: 'bach',
    composer: 'Bach',
    title: 'Brandenburg No. 5, III',
    file: 'bach-bwv1050-iii.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=548',
    credit: 'Brandenburg Concerto No. 5 in D, BWV 1050, III. Allegro: flute, solo violin and harpsichord (here a grand piano) with violin, viola and cello; the violone doubles the cello and is left out. Typeset by Joshua Koo from the Bach-Gesellschaft edition; Mutopia-2015/09/29-548; public domain.',
    sha256: '7dc1acc6d8502b99af6ea2269dd5d20d23e812a6c40d3d11a0a2abb23ae5baf1',
    parts: [
      { voice: 'flute', lines: [0] },
      { voice: 'violin', lines: [1] },
      { voice: 'violin', lines: [2] },
      { voice: 'viola', lines: [3] },
      { voice: 'cello', lines: [4] },
      { voice: 'grand', lines: [6, 7] },
    ],
  },
  {
    id: 'handel',
    composer: 'Handel',
    title: 'La Réjouissance',
    file: 'handel-hwv351-rejouissance.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1864',
    credit: 'La Réjouissance from the Music for the Royal Fireworks, HWV 351, for trumpet and organ (here a grand piano). The file gives the B♭ trumpet its written pitch, a tone above the organ; it plays a tone lower here, at concert pitch. Typeset by Cyprien Lecourt from IMSLP; Mutopia-2013/09/01-1864; public domain.',
    sha256: '17bd0a0d48f93c04f5dd5e13c842ca1482952fb779a600a431fc6542e7eca356',
    parts: [
      { voice: 'trumpet', lines: [0], shift: { 0: -2 } },
      { voice: 'grand', lines: [1, 2] },
    ],
  },
];

/** a piece's own plan for its lines, fitted to the stage's room (`cap` instruments) */
export function piecePlan(piece: Piece, lines: LineInfo[], cap: number): Plan {
  const shifts: Shifts = new Map();
  for (const p of piece.parts) for (const [k, v] of Object.entries(p.shift ?? {})) shifts.set(shiftKey(Number(k), p.voice), v);
  const parts = capParts(
    piece.parts.map((p) => ({ voice: p.voice, lines: p.lines.filter((i) => i < lines.length) })).filter((p) => p.lines.length),
    lines,
    cap,
  );
  return planOf(parts, lines, shifts);
}

/** the built-in piece whose instruments best match a lineup (the play icon, in an ensemble with
 *  nothing loaded): the most instruments in common, over the instruments of both (ties: the first) */
export function pieceForLineup(lineup: Voice[]): number {
  let best = 0;
  let bestScore = -1;
  PIECES.forEach((pc, i) => {
    const left = pc.parts.map((p) => p.voice);
    let common = 0;
    for (const v of lineup) {
      const k = left.indexOf(v);
      if (k >= 0) {
        common++;
        left.splice(k, 1);
      }
    }
    const score = common / (lineup.length + pc.parts.length - common);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

// ------------------------------------------------------------- each instrument's own piece
/** a short piece for one instrument alone, played as written but for the corrections a player would
 *  make, set here (the file stays Mutopia's): which of its lines, a transposition, a tempo where the
 *  file has none, where it stops, how hard it is played */
export interface Demo {
  instrument: InstrumentId;
  composer: string;
  title: string;
  /** public/pieces/<file> */
  file: string;
  /** the Mutopia page (credit and licence) */
  source: string;
  credit: string;
  sha256: string;
  /** the lines it plays (default: all of them) */
  lines?: number[];
  /** semitones */
  shift?: number;
  /** tempo, × the file's */
  rate?: number;
  /** where it stops (seconds of the file, at its own tempo): notes begun before it play out */
  end?: number;
  /** velocity, × the file's */
  vel?: number;
}

export const DEMOS: Record<InstrumentId, Demo> = {
  piano: {
    instrument: 'piano',
    composer: 'Chopin',
    title: 'Prelude in C minor, Op. 28 No. 20',
    file: 'chopin-op28-20.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=472',
    credit: 'Prelude in C minor, Op. 28 No. 20 (Largo): thirteen bars of chords, fortissimo to pianissimo, with the pedal as marked. Typeset by Magnus Lewis-Smith from the Peters edition; Mutopia-2011/06/19-472; public domain.',
    sha256: '9cc6c417d4bb261644f6bd3d00033025e675a25694fd172be2f98e93efc1fcfe',
  },
  violin: {
    instrument: 'violin',
    composer: 'Anon.',
    title: 'Greensleeves to a Ground',
    file: 'greensleeves-division-violin.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1730',
    credit: 'Greensleeves to a Ground, from Playford’s The Division Violin (4th edition, 1705), for violin alone: the tune and its first division, of fourteen. The file plays every note at full force; here at about mezzo-forte. Typeset by Allen Garvin from the facsimile at the Royal College of Music; Mutopia-2009/12/15-1730; public domain.',
    sha256: '000a8e3b934c5df618c2da830340e93889704326c3cb3b1f5b2f91b13f7526c4',
    // the end of the second variation, on G (each variation is eight bars of 3/2, 18 s here)
    end: 36,
    vel: 0.65,
  },
  viola: {
    instrument: 'viola',
    composer: 'Bach',
    title: 'Cello Suite No. 1, Menuet I',
    file: 'bach-bwv1007-menuet-viola.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=517',
    credit: 'Cello Suite No. 1 in G, BWV 1007, Menuet I, in the edition’s own transposition for viola (an octave up, as violists play the suites). Typeset by Andreas Scherer from the Schirmer edition (1916); Mutopia-2018/01/19-517; public domain.',
    sha256: 'cca8de104e409f9a5fc5566e01328ce99620b8d63738c831da000824ee74209c',
  },
  cello: {
    instrument: 'cello',
    composer: 'Bach',
    title: 'Cello Suite No. 1, Prélude',
    file: 'bach-bwv1007-prelude.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=517',
    credit: 'Cello Suite No. 1 in G, BWV 1007, Prélude. Typeset by Andreas Scherer from the Schirmer edition (1916); Mutopia-2018/01/19-517; public domain.',
    sha256: 'c55a2eae5e8d2e7a9570fe7ec8325c8825656893249878b946e6a2ead288a272',
  },
  bass: {
    instrument: 'bass',
    composer: 'Bach',
    title: 'Cello Suite No. 1, Menuet II',
    file: 'bach-bwv1007-menuet2.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=517',
    credit: 'Cello Suite No. 1 in G, BWV 1007, Menuet II, as bassists play the suites: read an octave down in solo tuning, which sounds a tone higher (here, a seventh below the cello, in A minor, from the open E). A little slower than the file. Typeset by Andreas Scherer from the Schirmer edition (1916); Mutopia-2018/01/19-517; public domain.',
    sha256: '9c752a6b0df99982f2e9002ba9c72b3558e95f8fb9f10f7a1255a159f802e152',
    shift: -10,
    rate: 0.9,
  },
  flute: {
    instrument: 'flute',
    composer: 'Bach',
    title: 'Partita in A minor, Bourrée anglaise',
    file: 'bach-bwv1013-bourree.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1528',
    credit: 'Partita in A minor for flute alone, BWV 1013, Bourrée anglaise. The file has no tempo (LilyPond’s default, ♩ = 60); it is played at ♩ = 96. Typeset by Jacob Shapiro from the manuscript (c. 1722–23, via IMSLP); Mutopia-2017/10/31-1528; public domain.',
    sha256: 'dd000c559a8b62a92306187d20353213362201651338a689626571bd62ec4725',
    rate: 1.6,
  },
  oboe: {
    instrument: 'oboe',
    composer: 'Bach',
    title: 'Brandenburg Concerto No. 1, Adagio (the oboe’s line)',
    file: 'bach-bwv1046-adagio-oboe.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1577',
    credit: 'Brandenburg Concerto No. 1 in F, BWV 1046, II. Adagio: the first oboe’s line alone, its solo that opens the movement and the long notes it holds under the violino piccolo’s answer. The file plays every note at full force (here at about mezzo-forte) at ♩ = 60 (here ♩ = 51). Typeset by Ben Stewart from the Bach-Gesellschaft edition (Rust, 1871, vol. 19); Mutopia-2008/10/29-1577; Creative Commons Attribution 3.0.',
    sha256: '4cf21a61e66770577cac40ad388a58f59d32dbe9be52e617ca60a8ba343b2a82',
    // to the end of the tenth bar, the oboe's three answering figures after its held A (each bar of 3/4
    // is 3 s in the file)
    end: 33,
    vel: 0.6,
    rate: 0.85,
  },
  clarinet: {
    instrument: 'clarinet',
    composer: 'Mozart',
    title: 'Clarinet Quintet, Larghetto (the clarinet’s line)',
    file: 'mozart-k581-ii.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=337',
    credit: 'Clarinet Quintet in A, K. 581, II. Larghetto: the clarinet’s line alone, the melody that opens the movement over the muted strings, to the close of its thirteenth bar. The file plays every note at full force (here at about mezzo-forte); the clarinet in A sounds a minor third below its part, as the file has it. Typeset by Maurizio Tomasi from the Breitkopf & Härtel edition (1883); Mutopia-2008/06/09-337; public domain.',
    sha256: 'a696d72d9a1baa84a68a236ae996964de3f23ca83be223dfbc5164f91a008c1a',
    lines: [0],
    // to the end of bar 13, the phrase's close on B (each bar of 3/4 is 3.27 s in the file, ♩ = 55)
    end: 42.4,
    vel: 0.55,
  },
  bassoon: {
    instrument: 'bassoon',
    composer: 'Mozart',
    title: 'Bassoon Concerto, Andante ma adagio (the bassoon’s line)',
    file: 'mozart-k191-ii.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=686',
    credit: 'Concerto for Bassoon in B♭, K. 191, II. Andante ma adagio: the solo bassoon’s line alone, from its entry after the strings’ introduction through its first two phrases, down to the low F and up to the held G. The file plays every note at full force (here at about mezzo-forte). Typeset by Liang Seng from the Breitkopf & Härtel edition (1880s); Mutopia-2006/02/25-686; public domain.',
    sha256: 'e542a8c274b8744970f093553ffe7b1da86caf80693c436c6a2f2745940da755',
    lines: [2],
    // to the end of bar 14, the second phrase's held G (each bar is 4 s in the file)
    end: 56,
    vel: 0.55,
  },
  trumpet: {
    instrument: 'trumpet',
    composer: 'Handel',
    title: 'La Réjouissance (the trumpet’s line)',
    // the ensemble's piece, its trumpet alone
    file: 'handel-hwv351-rejouissance.mid',
    source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1864',
    credit: 'La Réjouissance from the Music for the Royal Fireworks, HWV 351: the trumpet’s line alone, at concert pitch (the file gives the B♭ trumpet its written pitch), from its first note (the organ’s two bars of introduction left out). The ensemble’s piece of the same name plays it with the organ. Typeset by Cyprien Lecourt from IMSLP; Mutopia-2013/09/01-1864; public domain.',
    sha256: '17bd0a0d48f93c04f5dd5e13c842ca1482952fb779a600a431fc6542e7eca356',
    lines: [0],
    shift: -2,
  },
};

/**
 * An instrument's piece as it plays: the demo's lines (renumbered from 0), from its first note, at its
 * tempo, transposed, played as hard as it says, stopping at its end (notes begun before it play out; a
 * pedal still down is lifted with the last of them).
 */
export function demoSong(song: MidiSong, d: Demo): MidiSong {
  const lineOf = (l: number | undefined) => (d.lines ? d.lines.indexOf(l ?? 0) : (l ?? 0));
  const rate = d.rate ?? 1;
  const shift = d.shift ?? 0;
  const vel = d.vel ?? 1;
  // (a hair early: a note on the stop itself belongs to what follows)
  const end = (d.end ?? Infinity) - 1e-6;
  const mine = song.events.filter((e) => lineOf(e.line) >= 0);
  const t0 = mine.find((e) => e.kind === 'on')?.t ?? 0;
  const at = (t: number) => Math.max(0, t - t0) / rate;
  const events: FileEvent[] = [];
  /** notes begun (per pitch, how many) and pedals down (per controller) */
  const begun = new Map<number, number>();
  const down = new Map<number, number>();
  for (const e of mine) {
    const line = lineOf(e.line);
    if (e.kind === 'on') {
      if (e.t >= end) continue;
      const m = e.midi + shift;
      begun.set(m, (begun.get(m) ?? 0) + 1);
      events.push({ t: at(e.t), kind: 'on', midi: m, vel: Math.max(1, Math.min(127, Math.round(e.vel * vel))), line });
    } else if (e.kind === 'off') {
      const m = e.midi + shift;
      const n = begun.get(m) ?? 0;
      if (!n) continue;
      begun.set(m, n - 1);
      events.push({ t: at(e.t), kind: 'off', midi: m, line });
    } else if (e.kind === 'pedal') {
      if (e.t >= end) continue;
      down.set(e.cc, e.value);
      events.push({ t: at(e.t), kind: 'pedal', cc: e.cc, value: e.value, line });
    } else if (e.kind === 'cc') {
      // the file's volume, expression and mod wheel, as written
      if (e.t >= end) continue;
      events.push({ t: at(e.t), kind: 'cc', cc: e.cc, value: e.value, line });
    }
  }
  const last = events.length ? events[events.length - 1].t : 0;
  for (const [cc, v] of down) if (v > 0) events.push({ t: last, kind: 'pedal', cc: cc as 64 | 66 | 67, value: 0, line: 0 });
  const lines = d.lines ? d.lines.map((i) => song.lines[i]).filter(Boolean) : song.lines;
  // (the bar lines from the first note on, for phrasing: expression.ts)
  const bars = song.bars?.map(at).filter((b, i, all) => b <= last + 1e-9 && (b > 0 || all[i + 1] === undefined || all[i + 1] > 0));
  return { events, duration: last, lines, bars };
}
