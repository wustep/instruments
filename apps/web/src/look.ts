// The stage's look: 2D as drawn, 2D in vector lines (ui/vector), or 3D. The device remembers the last
// choice made with the toggles; an address's ?view= sets it for the page without changing that
// (nav.ts). The stage (views/stage.ts) reads it when it is made and says here what it shows.

import type { Look } from './address.ts';

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
