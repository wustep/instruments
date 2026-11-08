// Time-to-first-sound as a visitor experiences it: real Chrome, no autoplay flag,
// a real click on a key, then wall-clock until the output carries sound.
//   node scripts/startup.mjs [url] [--runs 3] [--cpu 4] [--instrument violin]
import { chromium, webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4199/';
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const runs = Number(opt('--runs', '3'));
const cpu = Number(opt('--cpu', '1'));
const instrument = opt('--instrument', 'piano');
const engine = opt('--browser', 'chrome');
const touch = args.includes('--touch');

// --jitless: V8 without its JIT, every thread several times slower: a stand-in for a slow laptop or phone
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome', args: args.includes('--jitless') ? ['--js-flags=--jitless'] : [] });
const results = [];
for (let r = 0; r < runs; r++) {
  const ctx = await browser.newContext(touch ? { ...devices[engine === 'webkit' ? 'iPhone 15' : 'Pixel 7'] } : { viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((inst) => {
    try { localStorage.setItem('piano-model.instrument', inst); } catch {}
  }, instrument);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (cpu > 1 && engine !== 'webkit') {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  const loadMs = Date.now() - t0;
  // the first key the visitor sees in the middle of the keyboard
  const key = page.locator('.key.white:not(.out)').nth(Math.floor((await page.locator('.key.white:not(.out)').count()) / 2));
  await key.scrollIntoViewIfNeeded();
  const box = await key.boundingBox();
  // poll the output inside the page from the moment of the click
  await page.evaluate(() => {
    const w = window;
    w.__t = { clickAt: 0, running: 0, ready: 0, sound: 0 };
    const buf = new Float32Array(2048);
    const tick = () => {
      const a = w.__piano;
      const now = performance.now();
      if (w.__t.clickAt) {
        if (!w.__t.running && a?.ctx?.state === 'running') w.__t.running = now;
        if (!w.__t.ready && a?.piano) w.__t.ready = now;
        if (!w.__t.sound && a?.analyser) {
          a.analyser.getFloatTimeDomainData(buf);
          let m = 0;
          for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
          if (m > 1e-3) w.__t.sound = now;
        }
      }
      if (!w.__t.sound) setTimeout(tick, 4);
    };
    tick();
    window.addEventListener('pointerdown', () => (w.__t.clickAt ||= performance.now()), { capture: true });
  });
  if (touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.8);
  else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
    await page.mouse.down();
  }
  const deadline = Date.now() + Number(opt('--timeout', '30000'));
  let t;
  while (Date.now() < deadline) {
    t = await page.evaluate(() => window.__t);
    if (t.sound) break;
    await new Promise((res) => setTimeout(res, 50));
  }
  if (!touch) await page.mouse.up();
  const initMs = await page.evaluate(() => window.__piano?.piano?.initMs ?? null);
  const rel = (x) => (x ? Math.round(x - t.clickAt) : null);
  const row = { loadMs, running: rel(t.running), ready: rel(t.ready), firstSound: rel(t.sound), workletInitMs: initMs, errors: errors.slice(0, 3) };
  results.push(row);
  console.log(JSON.stringify(row));
  await ctx.close();
}
await browser.close();
const med = (k) => {
  const s = results.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
console.log(`median over ${runs} (${engine}${touch ? ' touch' : ''}${args.includes('--jitless') ? ' jitless' : ''}, cpu x${cpu}, ${instrument}): load ${med('loadMs')} ms, click->first sound ${med('firstSound')} ms (running ${med('running')}, ready ${med('ready')})`);
