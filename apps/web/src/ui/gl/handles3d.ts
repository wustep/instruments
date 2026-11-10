// The 3D stage's lid grip, as geometry: the grand's lid opening that puts the point its grip holds
// (on the lid's free edge: piano3d `lidGripPoints`) under the pointer on the picture. The stage
// (stage3d.ts) asks it while the grip is dragged; the view (views/stage.ts) sets the engine's lid.
// Everything here is in the scene's own frame (metres, the bass at −x: the renderer's mirror is
// inside the view-projection).
import type { Mat4, Vec3 } from './gl3d.ts';
import { project } from './gl3d.ts';

/** The opening (0 … 1) that puts a point of the lid (`at(v)`: where the lid at opening v puts it,
 *  the piano's frame) nearest the pointer (x, y) on the picture. Every opening is tried a
 *  hundredth apart, then the best one's neighbourhood a thousandth apart; among near-equal ones, the
 *  one nearest the last (`prev`), so the lid never jumps where its arc folds back on screen. */
export function lidFor(at: (v: number) => Vec3, vp: Mat4, w: number, h: number, x: number, y: number, prev: number): number {
  const cost = (v: number) => {
    const q = project(vp, at(v), w, h);
    if (!q) return Infinity;
    return Math.hypot(q[0] - x, q[1] - y) + 4 * Math.abs(v - prev);
  };
  let best = prev;
  let bc = cost(prev);
  for (let i = 0; i <= 100; i++) {
    const v = i / 100;
    const c = cost(v);
    if (c < bc) {
      bc = c;
      best = v;
    }
  }
  const b0 = best;
  for (let i = -10; i <= 10; i++) {
    const v = Math.min(1, Math.max(0, b0 + i / 1000));
    const c = cost(v);
    if (c < bc) {
      bc = c;
      best = v;
    }
  }
  return best;
}
