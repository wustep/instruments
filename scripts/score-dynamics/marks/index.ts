// The pieces whose dynamics are written into their files from their scores' marks (build.ts).
import type { ScoreMarks } from '../dynamics.ts';
import { AIR } from './air.ts';
import { BEETHOVEN_5_I } from './beethoven5-i.ts';
import { BRANDENBURG_5_III } from './brandenburg5-iii.ts';
import { EVERYTHING_SO_FAR } from './everything-so-far.ts';
import { HAYDN } from './haydn.ts';
import { REJOUISSANCE } from './rejouissance.ts';

export const SCORES: ScoreMarks[] = [HAYDN, BRANDENBURG_5_III, REJOUISSANCE, AIR, BEETHOVEN_5_I, EVERYTHING_SO_FAR];
