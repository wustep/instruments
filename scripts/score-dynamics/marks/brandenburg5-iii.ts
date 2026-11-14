// Bach, Brandenburg Concerto No. 5, III. The Bach-Gesellschaft edition's marks, as Joshua Koo typeset them
// for Mutopia (read from that source: ly-marks.ts), all in the middle section (bars 79–232), terraced:
// the flute's "cantabile" at 79 over the solo violin's and the harpsichord's piano; at 89 the flute piano,
// the solo violin forte, the ripieno violin pianissimo; forte at 97 (ripieno), piano and pianissimo again
// at 99 (the harpsichord "cantabile"), forte all round at 106–107 (the cello and the violone at 128);
// piano at 148 (the ripieno violin and viola "cantabile"), the harpsichord's forte at 155, piano at 157
// and 189. "Cantabile" is read as the singing part's level, a third over mezzo-piano.
// An editor's: the outer sections, which have no mark, are forte (the soloists a shade under it until the
// ripieno comes in at 29), as is the da capo (233); the cello and the violone, unmarked under the soloists'
// piano at 79, play piano; the last cadence broadens.
import type { ScoreMarks } from '../dynamics.ts';

const END = '233 f  306 <  310 f+';
export const BRANDENBURG_5_III: ScoreMarks = {
  id: 'bach',
  file: 'bach-bwv1050-iii.mid',
  from: '7dc1acc6d8502b99af6ea2269dd5d20d23e812a6c40d3d11a0a2abb23ae5baf1',
  source: 'the Bach-Gesellschaft edition, as typeset by Joshua Koo for Mutopia (Mutopia-2015/09/29-548); the outer sections’ forte is an editor’s',
  players: { 0: 'flute', 1: 'violin', 2: 'violin', 3: 'viola', 4: 'cello', 5: 'bass', 6: 'piano', 7: 'piano' },
  start: 'f',
  // (terraces: a harpsichord concerto's piano is a step down, not a hush)
  depth: 0.7,
  lines: {
    0: `1 f-  29 f  79 mp+  89 p  107:1.333 f  148 p  189 p  ${END}`,
    1: `1 f-  29 f  79 p  89:1.75 f  99:1.75 p  107:1.333 f  148 p  157:1.75 p  189 p  ${END}`,
    2: `1 f  89 pp  97:1.75 f  99 pp  107:2 f  148:1.75 mp+  157:1.75 p  ${END}`,
    3: `1 f  99:2 pp  107:2 f  148:1.75 mp+  157:1.75 p  ${END}`,
    4: `1 f  79 p  128:2 f  148 p  ${END}`,
    5: `1 f  79 p  99 pp  128:2 f  148 p  ${END}`,
    6: `1 f-  29 f  79 p  89 p  99:1.75 mp+  106:1.333 f  148 p  155:1.333 f  ${END}`,
    7: `1 f-  29 f  79 p  89 p  99:1.75 mp+  106:1.333 f  148 p  155:1.333 f  ${END}`,
  },
};
