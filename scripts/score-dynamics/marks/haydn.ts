// Haydn, String Quartet Op. 76 No. 3, II (the "Kaiserhymne" and four variations). The score's marks are
// few, and all of them are here as Maurizio Tomasi typeset them from the Kalmus edition for Mutopia (read
// from that source: ly-marks.ts): piano at the start, fz on the two high phrases of the tune's last line
// and piano after each (the theme in all four parts; Variation I in the second violin, whose tune it is,
// the first violin "sempre piano"; Variation II at 54 and 58 in the viola and the cello), the piano said
// again in Variation I (34, 38) and II (40, 44), pianissimo at the close with its hairpins (103).
// An editor's, and no more than a quartet does unasked: the tune, in whichever part has it, swells a
// little to the top of each line and falls to its cadence, rises to the fermata, and is a shade fuller in
// Variation IV; the parts under it stay a third of a mark below.
import type { ScoreMarks } from '../dynamics.ts';

const up = (v: number) => (v ? `${v}:3` : '0');
/** the tune's own shape from the upbeat before bar v + 1: two lines, the rise to the fermata, the last line twice */
const tune = (v: number) =>
  `${up(v)} p  ${v + 1} <  ${v + 3}:3 mp >  ${v + 4} p  ${v + 5} <  ${v + 7}:3 mp >  ${v + 8} p  ${v + 8}:3 <  ${v + 12} mp+  ${v + 14}:3 p  ${v + 15}:3 >  ${v + 16} p-  ${v + 16}:3 mp  ${v + 18}:3 p  ${v + 19}:3 >  ${v + 20} p-`;
/** the parts under it */
const under = (v: number) => `${up(v)} p-  ${v + 8}:3 <  ${v + 12} p+  ${v + 14}:3 p-  ${v + 16}:3 p  ${v + 18}:3 p-`;
/** the close: the score's pianissimo and hairpins */
const close = '101 pp  103 <  103:3 ! >  103:4 !  104 pp';

export const HAYDN: ScoreMarks = {
  id: 'haydn',
  file: 'haydn-op76-3-ii.mid',
  from: '289f67299f465aede2f0729e0f861bf4ef039801bc138b45947c9b92f5f75fdc',
  source: 'the Kalmus edition, as typeset by Maurizio Tomasi for Mutopia (Mutopia-2015/10/16-385); the tune’s swells are an editor’s',
  pickup: 2,
  players: { 0: 'violin', 1: 'violin', 2: 'viola', 3: 'cello' },
  start: 'p',
  // (a poco adagio: only a note of two seconds or more swells of itself, and an fz is a lean, not a blow)
  shape: { swellAt: 2, accent: 4 },
  // (cantabile: a singing piano)
  lift: { 0: 2, 1: 2, 2: 2, 3: 2 },
  lines: {
    // the theme; Variation I under the second violin ("sempre piano"); II and III under the cello and the viola; IV its own
    0: `${tune(0)}  12:3 fz  13:3 fz  16:3 fz  17:3 fz
        ${under(20)}  34:3 p-  38:3 p-  ${under(40)}  ${under(60)}
        80:3 p+  81 <  83:3 mf- >  84 p+  85 <  87:3 mf- >  88 p+  88:3 <  92 mf  94:3 mp  95:3 >  96 p  96:3 mp+  98:3 p  99:3 >  100:4.5 pp  103 <  103:3 ! >  103:4 !  104 pp`,
    1: `${under(0)}  12:3 fz  13:3 fz  16:3 fz  17:3 fz
        ${tune(20)}  32:3 fz  33:3 fz  36:3 fz  37:3 fz  ${under(40)}  ${under(60)}  ${under(80)}  ${close}`,
    2: `${under(0)}  12:3 fz  13:3 fz  16:3 fz  17:3 fz
        ${under(20)}  ${under(40)}  54:3 fz  58:3 fz  ${tune(60)}  ${under(80)}  ${close}`,
    3: `${under(0)}  12:3 fz  13:3 fz  16:3 fz  17:3 fz
        ${under(20)}  ${tune(40)}  54:3 fz  58:3 fz  ${under(60)}  ${under(80)}  ${close}`,
  },
};
