// The page's main thread while it plays: a 3-second Chrome trace of one scene, summed by what the
// time went to (script, style, layout, paint, GC, GPU waits), with the frame cadence and the long
// tasks over the same window. For comparing a change's cost per frame before and after.
//   BASE=http://localhost:4611 SCENE=piano-2d|piano-3d|violin-2d|orch-2d|orch-3d|orch-beet-3d [PHONE=1] [THROTTLE=4] [RUNS=2] [TRACE=dir] node scripts/perf-frames.mjs
// The orchestra scenes play a bundled piece (0: the quartet; beet: Beethoven 5, the largest).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4611';
const SCENE = process.env.SCENE ?? 'piano-2d';
const PHONE = process.env.PHONE === '1';
const THROTTLE = Number(process.env.THROTTLE ?? 1);
const RUNS = Number(process.env.RUNS ?? 2);
const TRACE = process.env.TRACE ?? null;
const [inst, look, extra] = SCENE.split('-').length === 3 ? [SCENE.split('-')[0], SCENE.split('-')[2], SCENE.split('-')[1]] : [...SCENE.split('-'), null];
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const dev = PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const sums = [];
for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext(dev);
  await ctx.addInitScript(
    ([i, d3]) => {
      localStorage.setItem('piano-model.instrument', i === 'orch' ? 'violin' : i);
      localStorage.setItem('piano-model.3d', d3 ? '1' : '0');
      localStorage.setItem('piano-model.style', 'classic');
    },
    [inst, look === '3d'],
  );
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.goto(`${BASE}/${inst === 'orch' ? 'orchestra' : inst}`);
  await page.evaluate(async () => {
    await window.__piano.start();
  });
  if (inst === 'orch') {
    const piece = extra === 'beet' ? await page.evaluate(() => window.__orchestra.pieces.findIndex((p) => /beethoven/i.test(p.title ?? p.name ?? ''))) : 0;
    await page.evaluate(async (i) => {
      await window.__orchestra.loadPiece(i);
    }, Math.max(0, piece));
    await page.evaluate(() => document.querySelector('.pl-play')?.click());
  } else {
    // a phrase, held and repeated: notes sounding the whole time
    await page.evaluate((i) => {
      const notes = i === 'piano' ? [60, 64, 67, 72] : i === 'timpani' ? [48] : [67];
      let k = 0;
      window.__perfNotes = setInterval(() => {
        const m = notes[k++ % notes.length];
        window.__piano.noteOn(m, 90, 'keys');
        setTimeout(() => window.__piano.noteOff(m, 'keys'), 700);
      }, 400);
    }, inst);
  }
  if (look === '3d') await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    window.__pf = { fr: [], lt: [] };
    const f = (t) => {
      window.__pf.fr.push(t);
      if (window.__pf.fr.length < 100000) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__pf.lt.push(e.duration))).observe({ type: 'longtask' });
  });
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8,blink.user_timing' + (process.env.PROFILE ? ',disabled-by-default-v8.cpu_profiler' : ''), transferMode: 'ReturnAsStream' });
  await page.waitForTimeout(3000);
  const done = new Promise((res) => cdp.once('Tracing.tracingComplete', res));
  await cdp.send('Tracing.end');
  const { stream } = await done;
  let data = '';
  for (;;) {
    const r = await cdp.send('IO.read', { handle: stream });
    data += r.data;
    if (r.eof) break;
  }
  if (TRACE && run === 0) {
    mkdirSync(TRACE, { recursive: true });
    writeFileSync(`${TRACE}/frames-${SCENE}-${PHONE ? 'phone' : 'desktop'}${THROTTLE > 1 ? `-cpu${THROTTLE}` : ''}.json`, data);
  }
  const pf = await page.evaluate(() => {
    const fr = window.__pf.fr;
    const d = fr.slice(1).map((t, i) => t - fr[i]);
    return { n: d.length, mean: d.reduce((a, b) => a + b, 0) / d.length, over33: d.filter((x) => x > 33.4).length, lt: window.__pf.lt };
  });
  const ev = JSON.parse(data).traceEvents ?? [];
  // the page's main thread (CrRendererMain; of those, the busiest: the page's, not another tab's).
  // (Not merely the busiest thread: with many parts playing the audio worklet's thread is busier.)
  const mains = new Set(ev.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
  const byTid = {};
  for (const e of ev) if (e.name === 'RunTask' && e.dur && mains.has(`${e.pid}:${e.tid}`)) byTid[`${e.pid}:${e.tid}`] = (byTid[`${e.pid}:${e.tid}`] ?? 0) + e.dur;
  const main = Object.entries(byTid).sort((a, b) => b[1] - a[1])[0]?.[0];
  const sum = {};
  const add = (k, d) => (sum[k] = (sum[k] ?? 0) + d / 1000);
  for (const e of ev) {
    if (`${e.pid}:${e.tid}` !== main || e.ph !== 'X' || !e.dur) continue;
    if (e.name === 'RunTask') add('busy', e.dur);
    else if (e.name === 'FunctionCall' || e.name === 'FireAnimationFrame' || e.name === 'EventDispatch' || e.name === 'TimerFire' || e.name === 'v8.callFunction') add(`js:${e.name}`, e.dur);
    else if (e.name === 'UpdateLayoutTree' || e.name === 'RecalculateStyles') add('style', e.dur);
    else if (e.name === 'Layout') add('layout', e.dur);
    else if (e.name === 'Paint' || e.name === 'PaintImage' || e.name === 'PrePaint') add('paint', e.dur);
    else if (e.name === 'Layerize' || e.name === 'Commit' || e.name === 'UpdateLayer') add('composite', e.dur);
    else if (/^(MinorGC|MajorGC|V8\.GC_SCAVENGER|V8\.GCCompactor|V8\.GC_MARK_COMPACTOR)$/.test(e.name)) add('gc', e.dur);
    else if (e.name === 'CommandBufferProxyImpl::WaitForGetOffset' || e.name === 'CommandBufferHelper::Finish') add('gpuWait', e.dur);
  }
  const forced = ev.filter((e) => `${e.pid}:${e.tid}` === main && e.name === 'Layout' && e.args?.beginData?.stackTrace).length;
  const secs = 3;
  const row = { framesPerS: +(pf.n / secs).toFixed(1), meanFrame: +pf.mean.toFixed(2), over33: pf.over33, longN: pf.lt.length, longMs: Math.round(pf.lt.reduce((a, b) => a + b, 0)), forcedLayouts: forced };
  for (const [k, v] of Object.entries(sum)) row[`${k}/s`] = +(v / secs).toFixed(1);
  console.log(JSON.stringify(row));
  sums.push(row);
  await ctx.close();
}
const keys = Object.keys(sums[0]);
const med = (k) => {
  const v = sums.map((r) => r[k] ?? 0).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};
console.log(`SUMMARY ${SCENE} ${PHONE ? 'phone' : 'desktop'}${THROTTLE > 1 ? ` cpu÷${THROTTLE}` : ''}: ${keys.map((k) => `${k}=${med(k)}`).join(' ')}`);
await browser.close();
