// What the Notes page says of each look: the parts of its sentences that a look changes (types.ts
// `Words`), each theme's in its own folder. Loaded with that page, not with the stage.
import type { ThemeId, Words } from './types.ts';
import { words as nightBench } from './night-bench/words.ts';
import { words as eveningHall } from './evening-hall/words.ts';
import { words as dayStudio } from './day-studio/words.ts';
import { words as nightGallery } from './night-gallery/words.ts';

const WORDS: Record<ThemeId, Words> = { 'night-bench': nightBench, 'evening-hall': eveningHall, 'day-studio': dayStudio, 'night-gallery': nightGallery };
/** a theme's words */
export const wordsOf = (id: ThemeId): Words => WORDS[id];
