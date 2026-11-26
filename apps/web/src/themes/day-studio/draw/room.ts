// Day Studio: the listening room on the 2D stage. The room itself is a patch of light on the floor, laid
// by the page under the canvas (its sheet's `.stage[data-room]::before`, placed by views/stage.ts from
// `roomRect`): no wall is drawn here, and the sound leaving the instrument is wavefronts in the blue that
// stop and turn back at the patch's edge. The fronts' own motion is the shared drawer's (ui/room-draw.ts).
import { type RoomGeom, roomRect, type RoomState, type Wave } from '../../../ui/room-draw.ts';
import { INK, rgba } from '../../../ui/stage-draw.ts';

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
  // (the walls are not drawn: the room is the floor's brighter patch under the instrument, laid by the page
  // under this canvas, the theme's styles.css `.stage[data-room]::before`; the fronts stop and turn back at its edge)
  ctx.save();
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
    ctx.strokeStyle = rgba(INK.sound, 0.3 * a);
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
    ctx.strokeStyle = rgba(INK.sound, (c > 0 ? 0.42 : 0.3) * a * k);
    ctx.lineWidth = 1 + 1.2 * lid.open * Math.max(0, c);
    ctx.beginPath();
    ctx.arc(x, y, r, th0, th1);
    ctx.stroke();
  }
}
