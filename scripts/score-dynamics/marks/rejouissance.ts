// Handel, La Réjouissance (Music for the Royal Fireworks). The score has no dynamic mark: Handel's own
// direction is which instruments play each time through. What is here is an editor's, and a festive
// allegro's: forte, the fanfare growing to the top of its first line (bar 4), the answer begun under it
// and grown to the cadence (9), the second strain begun lighter (mezzo-forte) and built through its
// sequences to the close, the only fortissimo.
import type { ScoreMarks } from '../dynamics.ts';

export const REJOUISSANCE: ScoreMarks = {
  id: 'handel',
  file: 'handel-hwv351-rejouissance.mid',
  from: '17bd0a0d48f93c04f5dd5e13c842ca1482952fb779a600a431fc6542e7eca356',
  source: 'none in the score (Chrysander’s edition has no dynamics); an editor’s phrasing',
  players: { 0: 'trumpet', 1: 'piano', 2: 'piano' },
  start: 'f',
  all: `1 f-  2 <  4 f+  5 mf+ <  7 f  8 <  9 f+  10:4.5 mf  11 <  13 f-  14 >  15 mf+ <  17 f- <  19 ff-`,
  // (the organ's right hand doubles the trumpet: the piano that plays it stays under)
  lift: { 0: -1, 1: -3.5, 2: -3.5 },
  lines: {},
};
