// The listening room on the vector display: the same room as room-draw.ts (its size and decay are the
// engine's), drawn as beams: the walls a dim blue frame with corner ticks, the sound leaving the
// instrument as amber wavefronts and their first reflections.
import { roomRect, type RoomGeom, type RoomState, type Wave } from '../room-draw.ts';
import { V, beam, seg } from './kit.ts';

export function drawRoomV(ctx: CanvasRenderingContext2D, W: number, H: number, st: RoomState, src: { x: number; y: number }, room: number, rms: number, now: number, lid: { open: number; dir: number } | null): RoomGeom {
  const g = roomRect(W, H, room);
  const t60 = 0.7 + 1.7 * room;
  const t = now / 1000;
  const jump = rms > st.lastRms * 1.35 + 1e-4;
  if ((jump && t - st.lastSpawn > 0.06) || (rms > 1e-3 && t - st.lastSpawn > 0.35)) {
    st.waves.push({ t0: t, amp: Math.min(1, Math.sqrt(rms) * 2.2) });
    st.lastSpawn = t;
  }
  st.lastRms = rms * 0.9 + st.lastRms * 0.1;
  // the walls: a dashed frame, its corners marked
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
  beam(ctx, null, V.blueDim, 1, { alpha: 0.55, dash: [2, 6] });
  const k = 9;
  for (const [x, sx] of [[g.x0, 1], [g.x1, -1]] as const)
    for (const [y, sy] of [[g.y0, 1], [g.y1, -1]] as const) {
      seg(ctx, x, y, x + sx * k, y, V.blueMid, 1.1, { alpha: 0.8 });
      seg(ctx, x, y, x, y + sy * k, V.blueMid, 1.1, { alpha: 0.8 });
    }
  const speed = Math.hypot(W, H) / 1.4; // px per second: drawn far slower than sound
  const lidGain = lid ? 0.35 + 0.65 * lid.open : 1;
  const life = t60 * (lid ? 0.55 + 0.45 * lid.open : 1);
  const keep: Wave[] = [];
  ctx.beginPath();
  ctx.rect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
  ctx.clip();
  for (const w of st.waves) {
    const age = t - w.t0;
    const a = w.amp * lidGain * Math.pow(10, (-1.6 * age) / Math.max(0.3, life));
    if (a < 0.01) continue;
    keep.push(w);
    const r = speed * age;
    front(ctx, src.x, src.y, r, a, lid);
    // first reflections: the same front from the mirror-image sources behind each wall
    for (const [ix, iy] of [[2 * g.x0 - src.x, src.y], [2 * g.x1 - src.x, src.y], [src.x, 2 * g.y0 - src.y], [src.x, 2 * g.y1 - src.y]]) {
      if (r < Math.hypot(ix - src.x, iy - src.y) / 2) continue;
      front(ctx, ix, iy, r, a * 0.5, null);
    }
  }
  st.waves = keep.slice(-40);
  ctx.restore();
  return g;
}

function front(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, lid: { open: number; dir: number } | null): void {
  if (r < 2) return;
  if (!lid) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    beam(ctx, null, V.amber, 1.1, { alpha: 0.3 * a });
    return;
  }
  // the lid throws the board's sound towards its open side: that half of the front is brighter
  ctx.beginPath();
  ctx.arc(x, y, r, lid.dir + Math.PI / 2, lid.dir + (3 * Math.PI) / 2);
  beam(ctx, null, V.amber, 1, { alpha: 0.3 * a * (0.55 - 0.2 * lid.open) });
  ctx.beginPath();
  ctx.arc(x, y, r, lid.dir - Math.PI / 2, lid.dir + Math.PI / 2);
  beam(ctx, null, V.amber, 1 + 0.9 * lid.open, { alpha: 0.3 * a * (0.55 + 0.75 * lid.open) });
}
