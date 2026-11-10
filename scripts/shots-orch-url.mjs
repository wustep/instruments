// The Orchestra's address: a preset opened, a MIDI file dropped on it, a setup brought back by a
// reload, shot on two builds (before: production as it was, where the address meant nothing; after:
// this one), with what landed where. The file is read from FILE and never copied anywhere (a
// copyrighted score may be checked with it, not shipped).
//   BASE=http://localhost:4337 TAG=after OUT=artifacts/realistic-3d/final-next5/orch-url \
//     FILE=".autopilot/fixtures/Max Richter - On the Nature of Daylight (String Quintet).mid" node scripts/shots-orch-url.mjs
// PNG at device pixels (sips makes the JPEGs kept in the repo); the measurements go to stdout as JSON.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4337';
const TAG = process.env.TAG ?? 'after';
const OUT = process.env.OUT ?? 'test-results/orch-url';
const FILE = process.env.FILE ?? '';
const PRESET = process.env.PRESET ?? '/orchestra?v=1&seats=violin,violin,viola,cello,bass&lines=Violin+I~40:1,Violin+II~40:2,Viola~41:3,Cello~42:4,Contrabass~43:5';
const ONLY = process.env.ONLY ?? '';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const report = {};

async function open(view, path) {
  const ctx = await browser.newContext(DEVS[view]);
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('shots')) return;
    sessionStorage.setItem('shots', '1');
    localStorage.setItem('piano-model.instrument', 'piano');
    localStorage.setItem('piano-model.3d', '0');
    localStorage.setItem('piano-model.style', 'classic');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const res = await page.goto(BASE + path);
  await page.waitForTimeout(800);
  return { ctx, page, errs, status: res?.status() ?? 0 };
}
const shot = async (page, name) => {
  await page.evaluate(() => {
    document.querySelectorAll('.tip').forEach((t) => (t.hidden = true));
    document.activeElement?.blur?.();
  });
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.png` });
};
const where = (page) => page.evaluate(() => decodeURI(location.pathname + location.search));
const ensemble = (page) =>
  page.evaluate(() => {
    const e = window.__orchestra?.ensemble;
    if (!e) return null;
    return { active: e.active, lineup: e.lineup, engines: e.parts.map((p) => p.engine?.instrument ?? null), lines: e.lines.map((l, i) => ({ name: l.name, program: l.program, on: (e.plan.lines[i] ?? []).map((r) => `${r.part + 1}:${e.plan.parts[r.part].voice}`) })) };
  });
async function dropFile(page, path) {
  const b = [...readFileSync(path)];
  const name = path.split('/').pop();
  await page.evaluate(
    ([bytes, n]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], n, { type: 'audio/midi' }));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
    },
    [b, name],
  );
}
/** each part's first note as scheduled (context time, and whether its engine was there), from now */
const watchFirsts = (page) =>
  page.evaluate(() => {
    const e = window.__orchestra.ensemble;
    const first = {};
    window.__first = first;
    const sched = e.schedule.bind(e);
    e.schedule = (ev, at) => {
      if (ev.kind === 'on') for (const r of e.plan.lines[ev.line] ?? []) first[r.part] ??= { at, t: ev.t, line: ev.line, engine: !!e.parts[r.part]?.engine };
      return sched(ev, at);
    };
  });

// 1. the preset opened: the address alone sets the Orchestra up (before: production had no such page)
if (!ONLY || ONLY === 'preset') {
  const { ctx, page, errs, status } = await open('desktop', PRESET);
  report.preset = { status, url: await where(page), ensemble: await ensemble(page).catch(() => null), audio: await page.evaluate(() => window.__piano?.ctx?.state ?? null).catch(() => null) };
  await shot(page, 'desktop-preset');
  if (FILE && TAG === 'after') {
    await watchFirsts(page);
    await dropFile(page, FILE);
    await page.waitForFunction(() => window.__orchestra.ensemble.parts.every((p) => p.engine) && window.__player.playing, null, { timeout: 20000 });
    await page.waitForTimeout(7000);
    const firsts = await page.evaluate(() => window.__first);
    const t0 = Math.min(...Object.values(firsts).map((f) => f.at - f.t));
    report.dropped = {
      url: await where(page),
      ensemble: await ensemble(page),
      chips: await page.locator('.pl-line').evaluateAll((els) => els.map((b) => `${b.getAttribute('data-tip')}`)),
      // per part: the file's time of its first note and when it was scheduled, both from the start
      firsts: Object.fromEntries(Object.entries(firsts).map(([k, f]) => [Number(k) + 1, { line: f.line + 1, file: +f.t.toFixed(4), scheduled: +(f.at - t0).toFixed(4), engine: f.engine }])),
      sounding: await page.evaluate(() => window.__orchestra.ensemble.parts.map((p) => p.down.size)),
    };
    await shot(page, 'desktop-preset-daylight');
    // the violins come in later (Violin II at 1:29, Violin I at 2:59): from just before the second
    // entry, all five sound
    await page.evaluate(() => window.__player.seek(177.5));
    await page.waitForTimeout(4500);
    const late = await page.evaluate(() => window.__first);
    report.dropped.later = Object.fromEntries(Object.entries(late).map(([k, f]) => [Number(k) + 1, { line: f.line + 1, file: +f.t.toFixed(4), engine: f.engine }]));
    report.dropped.soundingAt180 = await page.evaluate(() => window.__orchestra.ensemble.parts.map((p) => p.down.size));
    await shot(page, 'desktop-preset-daylight-all');
    await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  }
  report.preset.errors = errs;
  await ctx.close();
}

// 2. a setup made by hand, then the page reloaded (before: the single instrument again)
if (!ONLY || ONLY === 'reload') {
  const { ctx, page, errs } = await open('desktop', '/');
  await page.locator('.ens-toggle').click();
  await page.locator('.instruments').getByRole('button', { name: 'Double bass', exact: true }).click();
  await page.locator('.instruments').getByRole('button', { name: 'Flute', exact: true }).click();
  await page.waitForTimeout(600);
  if (TAG === 'after') {
    // the keys on the flute and the cello
    await page.locator('.kf-part[data-voice="cello"]').click();
    await page.locator('.kf-part[data-voice="flute"]').click();
    await page.locator('.kf-part[data-voice="violin"]').first().click();
  }
  await page.waitForTimeout(600);
  report.reload = { set: await ensemble(page), urlSet: await where(page) };
  await shot(page, 'desktop-setup');
  await page.reload();
  await page.waitForTimeout(900);
  report.reload.back = await ensemble(page);
  report.reload.urlBack = await where(page);
  report.reload.errors = errs;
  await shot(page, 'desktop-reloaded');
  await ctx.close();
}

// 3. the preset in 3D, and on a phone
if (TAG === 'after' && (!ONLY || ONLY === 'more')) {
  {
    const { ctx, page } = await open('desktop', `${PRESET}&view=3d`);
    await page.waitForFunction(() => window.__stage3d?.stats?.frames > 5, null, { timeout: 20000 });
    await page.waitForTimeout(800);
    await shot(page, 'desktop-preset-3d');
    await ctx.close();
  }
  {
    const { ctx, page } = await open('phone', PRESET);
    await shot(page, 'phone-preset');
    report.phone = { url: await where(page), ensemble: await ensemble(page) };
    await ctx.close();
  }
}

await browser.close();
console.log(JSON.stringify(report, null, 1));
