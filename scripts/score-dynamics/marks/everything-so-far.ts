// "Everything So Far" (Fable 5.2): the viola and the cello. Every other part of the piece was written with
// its dynamics (velocities chosen note by note) and is untouched; these two held their long notes at one
// velocity (the viola 34 for 36 of its 43 notes, the cello 30–31 for 31 of 42). They are the piece's
// breathing now: each long note or pair swells and fades, a little in the quiet pages, more into the
// tune's entry (9), the chord at 24, the build to the return (54) and the return itself, and away to
// nothing at the end; always under the harp's and the piano's tune, as the strings were written to be
// (about the level they had, a little over pianissimo: down to ppp, up to piano; mezzo-forte once, at 54,
// where the viola was already given it). The composer's
// own, added after the piece was first bundled.
import type { ScoreMarks } from '../dynamics.ts';

/** `top`: the one loud note, where the line has it (the viola's A at 54:4.2, the cello's at 54:3.2), and the piano after it */
const breath = (top: string) => `1 ppp <  3 pp >  4:3 ppp <  6 pp+ >  8 ppp+ <  9:3 p-
  10:2 pp <  12 p- >  14 pp <  16 p >  18 pp <  20 p >  22 pp <  24 p+ >  25 pp
  25:2 pp >  26:3 ppp <  28:3 pp >  30:3 ppp+ <  33 pp+ >  35 ppp+ <  37 pp <  38 pp+
  38:2 pp+ >  39:2 pp <  42 p >  43:3 pp <  45 p+ >  46 pp >  47:3 ppp+ <  49 pp+ >  50:3 ppp+ <  52 pp+ <  54 p+  ${top}
  56:3 <  58 p+ >  59:3 pp+ <  61 p >  63 pp+ >  65 ppp+ <  66 pp >  67 ppp+ <  68:2 pp+ >  70 ppp+ <  71 pp >  72 ppp+ <  73 pp- >  74:3 ppp`;
export const EVERYTHING_SO_FAR: ScoreMarks = {
  id: 'everything-so-far',
  file: 'fable-everything-so-far.mid',
  from: 'c85d170c686b54f27b993b0eb3ceb67302dd079bb697508e48ba3da8af567777',
  source: 'the composer’s (Fable 5.2)',
  players: { 8: 'viola', 9: 'cello' },
  start: 'pp',
  lines: { 8: breath('54:4.2 mf  55:2 >  56:2.25 p'), 9: breath('54:3.2 mf  55 >  56:1.25 p') },
};
