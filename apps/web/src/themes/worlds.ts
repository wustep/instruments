// The themes' 3D worlds: each theme's room and lights (its `world.ts`), by theme. This module and the
// worlds import three.js, so it is loaded only with the 3D stage (ui/gl): nothing the page starts with
// imports it, and a theme's `theme.ts` never does.
import type { World } from '../ui/gl/world.ts';
import { theme } from './index.ts';
import type { ThemeId } from './types.ts';
import { nightBenchWorld } from './night-bench/world.ts';
import { eveningHallWorld } from './evening-hall/world.ts';
import { dayStudioWorld } from './day-studio/world.ts';
import { nightGalleryWorld } from './night-gallery/world.ts';

export const WORLDS: Record<ThemeId, World> = {
  'night-bench': nightBenchWorld,
  'evening-hall': eveningHallWorld,
  'day-studio': dayStudioWorld,
  'night-gallery': nightGalleryWorld,
};

export const worldOf = (id: ThemeId): World => WORLDS[id];
/** the world of the theme in use */
export const world = (): World => WORLDS[theme().id];
