// The first load, as a visitor meets it: FCP, LCP, CLS and total blocking time (the long tasks'
// time past 50 ms, from the navigation to 5 s), the bytes sent (encoded) and the script parsed,
// on a production build. A phone: Pixel 7 size, the CPU slowed 4× and a fast-3G-like network
// (Lighthouse's mobile defaults, roughly: 150 ms RTT, 1.6 Mb/s down); a desktop: unthrottled.
//   BASE=http://localhost:4611 [PHONE=1] [PATH=/piano] [LOOK=2d|3d] [RUNS=3] node scripts/perf-load.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:4611';
const PHONE = process.env.PHONE === '1';
const PAGE = process.env.PAGE ?? '/piano';
const LOOK = process.env.LOOK ?? '2d';
const RUNS = Number(process.env.RUNS ?? 3);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu'] });
const dev = PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const rows = [];
for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext(dev);
  await ctx.addInitScript((d3) => {
    try {
      localStorage.setItem('piano-model.3d', d3 ? '1' : '0');
    } catch {}
    window.__v = { lcp: 0, cls: 0, lt: [] };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__v.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__v.cls += e.value))).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__v.lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
  }, LOOK === '3d');
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (PHONE) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }
  let bytes = 0;
  const byType = {};
  cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength));
  const types = new Map();
  cdp.on('Network.responseReceived', (e) => types.set(e.requestId, e.type));
  cdp.on('Network.loadingFinished', (e) => {
    const t = types.get(e.requestId) ?? 'Other';
    byType[t] = (byType[t] ?? 0) + e.encodedDataLength;
  });
  await page.goto(BASE + PAGE, { waitUntil: 'load' });
  // (to 5 s after the start: the page settles, the stage draws, fonts and designs arrive)
  await page.waitForTimeout(PHONE ? 8000 : 5000);
  const v = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
    const tbt = window.__v.lt.filter(([s]) => s >= fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
    return { fcp, lcp: window.__v.lcp, cls: window.__v.cls, tbt, longN: window.__v.lt.length, longMax: Math.max(0, ...window.__v.lt.map(([, d]) => d)), load: nav.loadEventEnd, dcl: nav.domContentLoadedEventEnd };
  });
  const row = { fcp: Math.round(v.fcp), lcp: Math.round(v.lcp), cls: +v.cls.toFixed(3), tbt: Math.round(v.tbt), longN: v.longN, longMax: Math.round(v.longMax), dcl: Math.round(v.dcl), load: Math.round(v.load), kB: Math.round(bytes / 1024), scriptKB: Math.round((byType.Script ?? 0) / 1024), fontKB: Math.round((byType.Font ?? 0) / 1024) };
  console.log(JSON.stringify(row));
  rows.push(row);
  await ctx.close();
}
const med = (k) => rows.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
console.log(`SUMMARY ${PHONE ? 'phone (cpu÷4, 1.6 Mb/s, 150 ms)' : 'desktop'} ${PAGE} ${LOOK}: ${Object.keys(rows[0]).map((k) => `${k}=${med(k)}`).join(' ')}`);
await browser.close();
