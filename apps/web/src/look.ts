// The stage's look: 2D as drawn, 2D in vector lines (ui/vector), or 3D. The device remembers the last
// choice made with the toggles; an address's ?view= sets it for the page without changing that
// (nav.ts). The stage (views/stage.ts) reads it when it is made and says here what it shows.
// And what is on the screen beside the stage: all of it, unless the address opened with keys=0 (no
// fallboard and no keys: the stage has their room) or ui=0 (the stage and nothing else: no bar, no
// band, no file player; the keys only where they are the picture's: `keysOnScreen`). No control for
// either: a page for looking, listening and filming.

import type { InstrumentId } from '@piano-model/engine';
import type { Look } from './address.ts';

/** Are the keys (the fallboard and the keyboard) on the screen? Never with keys=0. With the page round
 *  the stage, always. With ui=0, the stage alone: where the stage is one piano drawn flat (2D or vector
 *  lines: its strings stand over its keys, the keys are the picture's own), or where the address asked
 *  for them on one instrument (keys=1); not on the Orchestra (its keys=1 is a seat), not under a 3D
 *  piano or another instrument unless asked. */
export function keysOnScreen(o: { keys: boolean; ui: boolean; keysOn: boolean; solo: InstrumentId | null; look: Look }): boolean {
  if (!o.keys) return false;
  if (o.ui) return true;
  if (o.solo === null) return false;
  return o.keysOn || (o.solo === 'piano' && o.look !== '3d');
}

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

class StageLook {
  /** 3D wanted (where WebGL2 runs) */
  want3d = read('piano-model.3d') === '1';
  /** the vector lines wanted on the 2D stage (kept while 3D shows) */
  wantVector = read('piano-model.style') === 'vector';
  /** the fallboard and the keyboard are wanted on the screen (false: the address said keys=0, for this page) */
  keys = true;
  /** the bar, the band and the file player are on the screen (false: the address said ui=0) */
  ui = true;
  /** the keys asked for on the screen with ui=0 too (the address said keys=1 on one instrument) */
  keysOn = false;
  /** the stage's one instrument (null: the Orchestra): main.ts keeps it */
  solo: InstrumentId | null = null;
  /** are the keys on the screen? */
  get keysShown(): boolean {
    return keysOnScreen({ keys: this.keys, ui: this.ui, keysOn: this.keysOn, solo: this.solo, look: this.value });
  }
  private subs = new Set<() => void>();

  get value(): Look {
    return this.want3d ? '3d' : this.wantVector ? 'vector' : '2d';
  }
  /** from an address: for this page only */
  ask(l: Look): void {
    this.want3d = l === '3d';
    if (l !== '3d') this.wantVector = l === 'vector';
  }
  /** what the stage shows now */
  shows(want3d: boolean, wantVector: boolean): void {
    if (want3d === this.want3d && wantVector === this.wantVector) return;
    this.want3d = want3d;
    this.wantVector = wantVector;
    this.subs.forEach((cb) => cb());
  }
  on(cb: () => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
}

export const look = new StageLook();
