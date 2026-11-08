// The listening room on the stage: sound leaving the instrument as faint wavefronts,
// their reach and fading set by the engine's own room (T60 = 0.7 + 1.7·room s, size
// 0.55 + 0.45·room, as in post.ts), first reflections returning from the walls, and
// for the grand the lid: open, it throws brighter, longer fronts to the open side;
// closed, they stay dim and short. Driven by the real output level.

import { INK, rgba } from './stage-draw.ts';

export interface Wave {
  t0: number;
  amp: number;
}
export interface RoomState {
  waves: Wave[];
  lastRms: number;
  lastSpawn: number;
}
export const newRoomState = (): RoomState => ({ waves: [], lastRms: 0, lastSpawn: 0 });

export interface RoomGeom {
  /** the room's walls (stage coordinates) */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** the room rectangle for a room setting: a small studio hugs the instrument, a hall fills the stage */
export function roomRect(W: number, H: number, room: number): RoomGeom {
  const size = 0.55 + 0.45 * room;
  const mx = (W * (1 - size)) / 2 + 6;
  const my = (H * (1 - size)) / 2 + 4;
  return { x0: mx, y0: my, x1: W - mx, y1: H - my };
}

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  st: RoomState,
  src: { x: number; y: number },
  room: number,
  rms: number,
  now: number,
  lid: { open: number; dir: number } | null,
): RoomGeom {
  const g = roomRect(W, H, room);
  const t60 = 0.7 + 1.7 * room;
  // spawn: on onsets (a jump in level), and steadily while sound continues
  const t = now / 1000;
  const jump = rms > st.lastRms * 1.35 + 1e-4;
  if ((jump && t - st.lastSpawn > 0.06) || (rms > 1e-3 && t - st.lastSpawn > 0.35)) {
    st.waves.push({ t0: t, amp: Math.min(1, Math.sqrt(rms) * 2.2) });
    st.lastSpawn = t;
  }
  st.lastRms = rms * 0.9 + st.lastRms * 0.1;
  // the walls, faint
  ctx.save();
  ctx.strokeStyle = rgba(INK.ivory, 0.1);
  ctx.setLineDash([2, 6]);
  ctx.lineWidth = 1;
  ctx.strokeRect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
  ctx.setLineDash([]);
  const diag = Math.hypot(W, H);
  const speed = diag / 1.4; // px per second: drawn far slower than sound
  const lidGain = lid ? 0.35 + 0.65 * lid.open : 1;
  const life = t60 * (lid ? 0.55 + 0.45 * lid.open : 1);
  const keep: Wave[] = [];
  ctx.beginPath();
  ctx.rect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
  ctx.clip();
  for (const w of st.waves) {
    const age = t - w.t0;
    // fade over the room's decay (drawn over ~60 % of T60)
    const a = w.amp * lidGain * Math.pow(10, (-1.6 * age) / Math.max(0.3, life));
    if (a < 0.01) continue;
    keep.push(w);
    const r = speed * age;
    // the direct front, brighter towards the lid's open side
    arc(ctx, src.x, src.y, r, a, lid);
    // first reflections: the same front from the mirror-image sources behind each wall
    const imgs: [number, number][] = [
      [2 * g.x0 - src.x, src.y],
      [2 * g.x1 - src.x, src.y],
      [src.x, 2 * g.y0 - src.y],
      [src.x, 2 * g.y1 - src.y],
    ];
    for (const [ix, iy] of imgs) {
      const d = Math.hypot(ix - src.x, iy - src.y) / 2;
      if (r < d) continue;
      arc(ctx, ix, iy, r, a * 0.88 * 0.55, null);
    }
  }
  st.waves = keep.slice(-40);
  ctx.restore();
  return g;
}

function arc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, lid: { open: number; dir: number } | null): void {
  if (r < 2) return;
  if (!lid) {
    ctx.strokeStyle = rgba(INK.ivory, 0.26 * a);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  // directional: the lid reflects the board's sound towards its open side
  const n = 24;
  for (let i = 0; i < n; i++) {
    const th0 = (i / n) * Math.PI * 2;
    const th1 = ((i + 1) / n) * Math.PI * 2;
    const c = Math.cos((th0 + th1) / 2 - lid.dir);
    const k = 0.35 + 0.65 * lid.open * Math.max(0, c) + 0.2 * (1 - lid.open);
    ctx.strokeStyle = rgba(c > 0 ? INK.amber : INK.ivory, 0.3 * a * k);
    ctx.lineWidth = 1 + 1.2 * lid.open * Math.max(0, c);
    ctx.beginPath();
    ctx.arc(x, y, r, th0, th1);
    ctx.stroke();
  }
}
