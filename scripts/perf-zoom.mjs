// The piano key's close-up, timed: a click on a key's strings (2D: the action panel; 3D: the camera
// flying in to that key's action), from the click to the first frame drawn, and every frame for the
// next 1.6 s (the flight is 1.1 s), with the long tasks (> 50 ms) in that time.
//   BASE=http://localhost:4611 [BROWSER=chromium|webkit] [PHONE=1] [LOOK=2d|3d] [RUNS=3] [TRACE=dir] node scripts/perf-zoom.mjs
// Prints one JSON line per run and a summary: click→the first frame drawn zoomed (the second frame
// after the click: the first is the one that draws it; ms), mean and p95 frame (ms), frames
// over 33 ms, long-task total (ms).
import { chromium, webkit } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4611';
const PHONE = process.env.PHONE === '1';
const LOOK = process.env.LOOK ?? '3d';
const RUNS = Number(process.env.RUNS ?? 3);
const KIND = process.env.KIND ?? 'grand';
const BROWSER = process.env.BROWSER ?? 'chromium';
const TRACE = process.env.TRACE ?? null;
const THROTTLE = Number(process.env.THROTTLE ?? 1);
const bt = BROWSER === 'webkit' ? webkit : chromium;
const browser = await bt.launch(BROWSER === 'webkit' ? {} : { channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const dev = PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: BROWSER !== 'firefox', hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const out = [];
for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext(dev);
  await ctx.addInitScript((d3) => {
    localStorage.setItem('piano-model.instrument', 'piano');
    localStorage.setItem('piano-model.3d', d3 ? '1' : '0');
    localStorage.setItem('piano-model.style', 'classic');
    // frames and long tasks, from the page's start
    window.__perf = { frames: [], long: [], click: 0 };
    const f = (t) => {
      window.__perf.frames.push(t);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__perf.long.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
    } catch {}
    addEventListener('pointerup', (e) => (window.__perf.click = e.timeStamp || performance.now()), true);
  }, LOOK === '3d');
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  let cdp = null;
  if (BROWSER === 'chromium') {
    cdp = await ctx.newCDPSession(page);
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  }
  await page.goto(`${BASE}/${KIND === 'upright' ? 'piano/upright' : 'piano'}`);
  await page.evaluate(async () => {
    await window.__piano.start();
  });
  if (LOOK === '3d') await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const midi = 60;
  let at;
  if (LOOK === '3d') {
    at = await page.evaluate((m) => {
      const q = window.__stage3d.screenOf(m);
      const r = window.__stage3d.el.getBoundingClientRect();
      return q && [r.left + q[0], r.top + q[1]];
    }, midi);
  } else {
    at = await page.evaluate((m) => {
      const k = document.querySelector(`.key[data-midi="${m}"]`).getBoundingClientRect();
      const cv = document.querySelector('.stage-cv').getBoundingClientRect();
      return [k.left + k.width / 2, cv.top + cv.height * 0.8];
    }, midi);
  }
  if (TRACE && run === 0 && cdp) {
    mkdirSync(TRACE, { recursive: true });
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,v8.execute,blink.user_timing,gpu,disabled-by-default-v8.cpu_profiler', transferMode: 'ReturnAsStream' });
  }
  const t0 = await page.evaluate(() => performance.now());
  if (PHONE) await page.touchscreen.tap(at[0], at[1]);
  else await page.mouse.click(at[0], at[1]);
  await page.waitForTimeout(1600);
  if (TRACE && run === 0 && cdp) {
    const done = new Promise((res) => cdp.once('Tracing.tracingComplete', res));
    await cdp.send('Tracing.end');
    const { stream } = await done;
    let data = '';
    for (;;) {
      const r = await cdp.send('IO.read', { handle: stream });
      data += r.data;
      if (r.eof) break;
    }
    writeFileSync(`${TRACE}/zoom-${LOOK}-${PHONE ? 'phone' : 'desktop'}.json`, data);
  }
  const r = await page.evaluate(
    ([t0, look]) => {
      const p = window.__perf;
      const click = p.click || t0;
      const fr = p.frames.filter((t) => t >= click && t < click + 1600);
      const opened = look === '3d' ? window.__stage3d.zoomed !== null : !!document.querySelector('.av-panel');
      const d = fr.slice(1).map((t, i) => t - fr[i]);
      const sd = [...d].sort((a, b) => a - b);
      const long = p.long.filter(([s]) => s >= click - 5 && s < click + 1600);
      return {
        opened,
        first: fr.length ? +(fr[0] - click).toFixed(1) : null,
        second: fr.length > 1 ? +(fr[1] - click).toFixed(1) : null,
        frames: fr.length,
        mean: +(d.reduce((a, b) => a + b, 0) / Math.max(1, d.length)).toFixed(2),
        p95: +(sd[Math.floor(sd.length * 0.95)] ?? 0).toFixed(1),
        max: +(sd[sd.length - 1] ?? 0).toFixed(1),
        over33: d.filter((x) => x > 33.4).length,
        longN: long.length,
        longMs: Math.round(long.reduce((a, [, x]) => a + x, 0)),
        longMax: Math.round(Math.max(0, ...long.map(([, x]) => x))),
        stats: window.__stage3d ? { ms: +window.__stage3d.stats.ms.toFixed(2), lite: window.__stage3d.stats.lite, ao: window.__stage3d.stats.ao, shadows: window.__stage3d.stats.shadows, progs: window.__stage3d.r3.r.info.programs?.length, geo: window.__stage3d.r3.r.info.memory.geometries, tex: window.__stage3d.r3.r.info.memory.textures } : null,
      };
    },
    [t0, LOOK],
  );
  if (errs.length) r.errors = errs.slice(0, 2);
  console.log(JSON.stringify(r));
  out.push(r);
  await ctx.close();
}
const med = (k) => {
  const v = out.map((r) => r[k]).filter((x) => x !== null).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};
console.log(`SUMMARY ${BROWSER} ${PHONE ? 'phone' : 'desktop'} ${LOOK} ${KIND}${THROTTLE > 1 ? ` cpu÷${THROTTLE}` : ''}: click→zoomed frame ${med('second')} ms, mean ${med('mean')} ms, p95 ${med('p95')} ms, max ${med('max')} ms, >33ms ${med('over33')}, long ${med('longN')}×/${med('longMs')} ms (max ${med('longMax')})`);
await browser.close();
