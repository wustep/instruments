// The Orchestra brought on and off the stage with a setup (its lineup, routing and keys): the ensemble
// toggle and an address (nav.ts) do it the same way.

import type { MidiPlayer } from '../ui/player.ts';
import { lineupPlan } from './assign.ts';
import { ensemble, QUARTET, stageCap } from './ensemble.ts';
import { planByRules, type Setup } from './rules.ts';

/** the ensemble on, with a setup (null or no seats: the one it last had, else the quartet). A file
 *  already loaded is placed by its routing (an instrument's own piece is not: the overlay comes back
 *  to rest, its play icon now the ensemble's piece). Its engines are made once the sound has
 *  started. */
export function enterOrchestra(player: MidiPlayer, s: Setup | null): void {
  const setup = s?.seats.length ? s : ensemble.last?.seats.length ? ensemble.last : { seats: QUARTET, lines: null, keys: null };
  if (player.demo) player.unload();
  const song = player.loaded;
  player.stop();
  const lineup = setup.seats.slice(0, stageCap());
  const rules = setup.lines;
  const plan = song ? (rules ? planByRules(song.lines, lineup, rules) : ensemble.planForLineup(song, lineup)) : lineupPlan(lineup);
  ensemble.enter(plan, song, null, true, rules);
  if (setup.keys) ensemble.setKeysTo(setup.keys);
  void ensemble.ensureEngines();
}

/** the ensemble off: the single instrument again (a file loaded stays, for it) */
export function leaveOrchestra(player: MidiPlayer): void {
  ensemble.exit();
  player.ensembleLeft();
}
