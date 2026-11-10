// The pieces that come with the stage: public-domain typesettings from the Mutopia Project
// (mutopiaproject.org), each placed in the public domain by its typesetter, compositions long out of
// copyright. The MIDI files in public/pieces/ are Mutopia's own, byte for byte (sha256 below); what
// plays what is set here, as a player would set out the parts.
import { capParts, planOf, type LineInfo, type Plan, type Voice } from './assign.ts';

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
  const shifts = new Map<number, { voice: Voice; shift: number }>();
  for (const p of piece.parts) for (const [k, v] of Object.entries(p.shift ?? {})) shifts.set(Number(k), { voice: p.voice, shift: v });
  const parts = capParts(
    piece.parts.map((p) => ({ voice: p.voice, lines: p.lines.filter((i) => i < lines.length) })).filter((p) => p.lines.length),
    lines,
    cap,
  );
  return planOf(parts, lines, shifts);
}
