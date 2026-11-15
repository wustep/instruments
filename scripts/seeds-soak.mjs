// Seeds left to play in a real browser for a long time: does anything grow, drift or fall behind?
//   BASE=http://localhost:4310 node scripts/seeds-soak.mjs [--minutes 12] [--seed kelumo] [--view 3d] [--shot out.png]
// Headless Chrome on /seeds?seed=…, play pressed once, then every 30 s:
//   pos      the player's position in the piece, s            wall   real time since play, s
//   drift    pos − wall, ms (the piece's clock against the room's: the audio thread keeping up)
//   list     events the player holds (asked for half a minute at a time, the past let go: it must not grow)
//   heap     the page's JS heap, MB (after a forced collection)
//   load     the heaviest engine's share of the audio thread's time, % (its own report), and all ten's
//   held     keys still down in the ensemble (a note never let go would show here for good)
//   played   players that have sounded so far
// and at the end: the heap's and the list's slope over the last two thirds of the run, the worst drift, page errors.
import { chromium } from '@playwright/test';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};
const BASE = process.env.BASE ?? 'http://localhost:4199';
const MIN = Number(arg('minutes', '12'));
const SEED = arg('seed', 'kelumo');
const VIEW = arg('view', '3d');
const SHOT = arg('shot', '');

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc', '--enable-precise-memory-info', '--use-angle=metal', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${BASE}/seeds?seed=${SEED}&view=${VIEW}`);
await page.waitForFunction(() => window.__orchestra?.ensemble.piece?.id === 'seeds');
await page.locator('.player .pl-play').click();
await page.waitForFunction(() => window.__player.playing && window.__orchestra.ensemble.parts.every((p) => p.engine), null, { timeout: 120000 });
await page.evaluate(() => window.__orchestra.ensemble.parts.forEach((p) => p.engine.onStats((s) => (p.__load = s.load))));
const t0 = Date.now();
const read = () =>
  page.evaluate(() => {
    globalThis.gc?.();
    const pl = window.__player;
    const e = window.__orchestra.ensemble;
    const loads = e.parts.map((p) => p.__load ?? 0);
    return {
      pos: pl.heardPos ? pl.heardPos() : pl.pos,
      list: pl.scheduled.length,
      heap: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : 0,
      held: e.parts.reduce((s, p) => s + p.down.size, 0),
      played: e.parts.filter((p) => p.lastOn > 0).length,
      loads,
      ctx: window.__piano.ctx.currentTime,
      seed: pl.seed,
      url: location.pathname + location.search,
    };
  });
const rows = [];
const first = await read();
const c0 = first.ctx;
console.log(`seed ${first.seed}  ${first.url}`);
console.log('  wall s    pos s  drift ms  ctx−wall ms   list   heap MB  held  played  load % (most, sum)');
for (let k = 1; k <= MIN * 2; k++) {
  await page.waitForTimeout(30000 - ((Date.now() - t0) % 30000));
  const r = await read();
  const wall = (Date.now() - t0) / 1000;
  const row = { wall, ...r, drift: (r.pos - first.pos - wall) * 1000, ctxDrift: (r.ctx - c0 - wall) * 1000 };
  rows.push(row);
  console.log(`  ${wall.toFixed(0).padStart(6)} ${r.pos.toFixed(1).padStart(8)} ${row.drift.toFixed(0).padStart(9)} ${row.ctxDrift.toFixed(0).padStart(12)} ${String(r.list).padStart(6)} ${r.heap.toFixed(1).padStart(9)} ${String(r.held).padStart(5)} ${String(r.played).padStart(7)}  ${(100 * Math.max(...r.loads)).toFixed(1)}, ${(100 * r.loads.reduce((a, b) => a + b, 0)).toFixed(1)}`);
}
if (SHOT) await page.screenshot({ path: SHOT });
const tail = rows.slice(Math.floor(rows.length / 3));
const slope = (f) => {
  const n = tail.length;
  const mx = tail.reduce((s, r) => s + r.wall, 0) / n;
  const my = tail.reduce((s, r) => s + f(r), 0) / n;
  return tail.reduce((s, r) => s + (r.wall - mx) * (f(r) - my), 0) / Math.max(1e-9, tail.reduce((s, r) => s + (r.wall - mx) ** 2, 0));
};
console.log(`\nover the last two thirds: heap ${(slope((r) => r.heap) * 60).toFixed(3)} MB a minute, list ${(slope((r) => r.list) * 60).toFixed(2)} events a minute; the clock's worst drift ${Math.max(...rows.map((r) => Math.abs(r.drift))).toFixed(0)} ms (the sound's against the room's ${Math.max(...rows.map((r) => Math.abs(r.ctxDrift))).toFixed(0)} ms); most events held ${Math.max(...rows.map((r) => r.list))}; page errors ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await page.evaluate(() => window.__player.stop());
await browser.close();
