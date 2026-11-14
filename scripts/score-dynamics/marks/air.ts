// Bach, Air (Orchestral Suite No. 3), for four trombones. Neither Bach's score nor the arrangement has a
// dynamic mark; the file played every note at full force. What is here is an editor's, as the Air is
// played: mezzo-piano, the long first note swelling and settling, each phrase rising to its high note and
// falling to its cadence, the second strain building through its sequence to the top of the line (bar 17)
// and dying away at the close; the three parts under the tune marked a third softer, and lifted a little
// (1.5–2.5 dB over the tune's own) for what a trombone's lower registers lose at one velocity (the bass stood 10 dB under
// the tune: levels.ts). The first strain's two endings follow one another in the file (bars 6 and 7): the
// second is played as an echo.
import type { ScoreMarks } from '../dynamics.ts';

const UNDER = `1 p+ <  2 mp >  3 mp  5 p+ >  6 p+  7 p  8 p+ <  9 mp+ >  11:3 p+  12 p+ <  12:3 mp+ >  13:3 p+  14 p+ <  16:3 mf  17:2 mf+  17:4 >  18:4 mp-  19 mp- >  20 p`;
export const AIR: ScoreMarks = {
  id: 'air',
  file: 'bach-bwv1068-air-trombones.mid',
  from: 'dc3f31aaed2970ea523fbc2038ec0093f53e5026c6292e160181e2d0c1b637f8',
  source: 'none in the score; an editor’s phrasing',
  players: { 0: 'trombone', 1: 'trombone', 2: 'trombone', 3: 'trombone' },
  start: 'mp',
  lift: { 0: 1, 1: 2.5, 2: 3.5, 3: 3.5 },
  lines: {
    0: `1 mp <  1:4 mf- >  2:2 mp  3 mf >  4 mp+  5 mp >  6 mp-  6:3 >  7 p+  7:3 >  8 mp <  8:3 mf  9 mf+  9:3 mf >  10 mp <  10:3 mf  11 mf- >  11:3 mp-
        12 mp <  12:3 mf+ >  13 mp+ >  13:3 mp-  14 mp- <  15 mp+ <  15:3 mf+  16 mf <  16:3 f-  17 mf+ <  17:2 f  17:4 >  18 mf >  18:4 mp  19 mp >  19:2 p+ >  20 p`,
    1: UNDER,
    2: UNDER,
    3: UNDER,
  },
};
