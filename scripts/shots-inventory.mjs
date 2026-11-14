// The whole app photographed, for a sweep of its looks: every instrument alone (idle and with a note held)
// in 2D, vector lines and 3D; the Orchestra and each piece's own address (loaded, and a moment into it);
// the pickers, the menus and the controls; the pages. On a computer (1440×900) and a phone (390×844), and a
// few more windows (a laptop under the picker's fold, a tablet, a window as narrow, a phone on its side, the
// smallest phone). Each shot's page
// errors, console errors and overflow go to <OUT>/report.json.
//   BASE=http://localhost:4199 OUT=test-results/inventory node scripts/shots-inventory.mjs
//   SETS=solo,orchestra,ui,pages,windows   DEVS=desktop,phone   ONLY=<substring of a shot's name>
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:4199';
const OUT = process.env.OUT ?? 'test-results/inventory';
const GROUPS = (process.env.SETS ?? 'solo,orchestra,ui,pages,windows').split(',');
const DEVS_ON = (process.env.DEVS ?? 'desktop,phone').split(',');
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--mute-audio'] });

const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  laptop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  // (a window of a tablet's width on a computer: nothing zooms the page out to hide what runs past its edge)
  narrow: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1 },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const LOOKS = ['2d', 'vector', '3d'];
/** each instrument's address and the notes held for its picture (more are read from the page: an
 *  instrument this list does not know holds the middle of its compass) */
const SOLO = {
  piano: ['/piano', [48, 60, 64, 67]],
  upright: ['/piano/upright', [48, 60, 64, 67]],
  violin: ['/violin', [69]],
  viola: ['/viola', [60]],
  cello: ['/cello', [50]],
  bass: ['/bass', [40]],
  harp: ['/harp', [55, 62, 67]],
  flute: ['/flute', [79]],
  oboe: ['/oboe', [67]],
  clarinet: ['/clarinet', [60]],
  bassoon: ['/bassoon', [48]],
  horn: ['/horn', [53]],
  trumpet: ['/trumpet', [65]],
  trombone: ['/trombone', [50]],
  tuba: ['/tuba', [36]],
  timpani: ['/timpani', [45]],
  glockenspiel: ['/glockenspiel', [84, 91]],
};
for (const id of (process.env.MORE ?? '').split(',').filter(Boolean)) SOLO[id] = [`/${id}`, null];

const report = [];
const want = (name) => !ONLY.length || ONLY.some((s) => name.includes(s));

/** a page on an address, sound started, the 3D stage drawing */
async function open(dev, path, { start = true } = {}) {
  const ctx = await browser.newContext(DEVS[dev]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && /WebGL|GL_/.test(m.text()))) && errs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  await page.goto(`${BASE}${path}`);
  await page.evaluate(() => document.fonts.ready);
  if (start && (await page.evaluate(() => !!window.__piano))) {
    await page.evaluate(() => window.__piano.start());
    await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 });
  }
  if (/view=3d/.test(path)) await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
  return { ctx, page, errs };
}
/** the picture, and what the page measured */
async function snap(page, errs, name, { full = false } = {}) {
  const file = `${OUT}/${name}.png`;
  mkdirSync(dirname(file), { recursive: true });
  const m = await page.evaluate(() => {
    const d = document.documentElement;
    // what stands past the window's edges, of what is on the screen
    const out = [];
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || s.display === 'none' || s.position === 'fixed' && r.bottom < 0) continue;
      if (r.right > innerWidth + 1 || r.left < -1) {
        // (inside something that scrolls or clips sideways, it is not past the window)
        let p = e.parentElement;
        let clipped = false;
        while (p && p !== document.body) {
          const ps = getComputedStyle(p);
          if (ps.overflowX !== 'visible' || ps.overflow !== 'visible') {
            clipped = true;
            break;
          }
          p = p.parentElement;
        }
        if (!clipped) out.push(`${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).split(' ')[0]} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
    }
    return { url: location.pathname + location.search, win: [innerWidth, innerHeight], scroll: [d.scrollWidth, d.scrollHeight], past: out.slice(0, 6) };
  });
  await page.screenshot({ path: file, fullPage: full });
  const row = { name, ...m, errs: [...errs] };
  report.push(row);
  const flags = [m.scroll[0] > m.win[0] ? `SCROLL-X ${m.scroll[0]}` : '', m.past.length ? `PAST ${m.past.join(' | ')}` : '', errs.length ? `ERR ${errs.join(' | ')}` : ''].filter(Boolean).join('; ');
  console.log(`${name}${flags ? `  !! ${flags}` : ''}`);
}
async function shot(name, dev, path, steps, opts = {}) {
  if (!want(name)) return;
  let c;
  try {
    c = await open(dev, path, opts);
    await steps?.(c.page);
    await snap(c.page, c.errs, name, opts);
  } catch (e) {
    console.log(`${name}  !! FAILED ${String(e.message).split('\n')[0]}`);
    report.push({ name, failed: String(e.message).split('\n')[0] });
  } finally {
    await c?.ctx.close();
  }
}
const hold = (notes) => async (page) => {
  const ns = notes ?? (await page.evaluate(() => {
    const p = window.__piano.piano;
    const info = p?.info ?? null;
    return info ? [Math.round((info.lo + info.hi) / 2)] : [60];
  }));
  await page.evaluate((x) => x.forEach((m) => window.__piano.noteOn(m, 0.7, 'midi')), ns);
  await page.waitForTimeout(1100);
};
const settle = (ms) => async (page) => page.waitForTimeout(ms);
const openPicker = async (page) => {
  const b = page.locator('.pick-open');
  if ((await b.isVisible()) && (await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await page.waitForTimeout(350);
};
const playAt = (s, ms = 2600) => async (page) => {
  await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 30_000 });
  await page.evaluate((t) => {
    window.__player.seek(t);
    window.__player.play();
  }, s);
  await page.waitForTimeout(ms);
};

for (const dev of DEVS_ON) {
  // ------------------------------------------------------------ one instrument: idle, and a note held
  if (GROUPS.includes('solo')) {
    for (const [id, [path, notes]] of Object.entries(SOLO)) {
      for (const look of LOOKS) {
        const p = `${path}?view=${look}`;
        await shot(`${dev}/solo-idle/${id}-${look}`, dev, p, settle(look === '3d' ? 1600 : 700));
        await shot(`${dev}/solo-play/${id}-${look}`, dev, p, async (page) => {
          if (look === '3d') await page.waitForTimeout(900);
          await hold(notes)(page);
        });
      }
    }
  }
  // ------------------------------------------------------------ the Orchestra and the pieces' own addresses
  if (GROUPS.includes('orchestra')) {
    for (const look of LOOKS) {
      await shot(`${dev}/orchestra/quartet-${look}`, dev, `/orchestra?view=${look}`, async (page) => {
        await page.waitForTimeout(look === '3d' ? 2500 : 900);
        await page.evaluate(() => [60, 67].forEach((m) => window.__piano.noteOn(m, 0.7, 'keys')));
        await page.waitForTimeout(900);
      });
      for (const [name, at] of [['symphony', 60], ['everything', 40], ['passiton', 50], ['tango', 40]]) {
        await shot(`${dev}/orchestra/${name}-${look}-loaded`, dev, `/${name}?view=${look}`, async (page) => {
          await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 30_000 });
          await page.waitForTimeout(look === '3d' ? 3000 : 1200);
        }, { start: false });
        await shot(`${dev}/orchestra/${name}-${look}-playing`, dev, `/${name}?view=${look}`, playAt(at, look === '3d' ? 4000 : 2600));
      }
      // (Beethoven's eighteen, a quartet and the Brandenburg's six with their harpsichord, from the pieces' list)
      for (const id of ['beethoven5-i', 'haydn', 'bach']) {
        await shot(`${dev}/orchestra/${id}-${look}-playing`, dev, `/orchestra?view=${look}`, async (page) => {
          await page.evaluate((x) => window.__orchestra.loadPiece(window.__orchestra.pieces.findIndex((p) => p.id === x)), id);
          await page.waitForFunction(() => window.__player?.loaded && window.__player?.playing, null, { timeout: 60_000 });
          await page.evaluate(() => window.__player.seek(20));
          await page.waitForTimeout(look === '3d' ? 4500 : 2600);
        });
      }
    }
  }
  // ------------------------------------------------------------ pickers, menus, controls
  if (GROUPS.includes('ui')) {
    for (const look of ['2d', '3d']) {
      await shot(`${dev}/ui/picker-solo-${look}`, dev, `/violin?view=${look}`, openPicker);
      await shot(`${dev}/ui/picker-orchestra-${look}`, dev, `/orchestra?view=${look}`, async (page) => {
        await page.waitForTimeout(1200);
        await openPicker(page);
      });
    }
    await shot(`${dev}/ui/tooltip-pick`, dev, '/piano?view=2d', async (page) => {
      if (dev !== 'desktop') return;
      await page.locator('.pick[aria-label="Bassoon"]').hover();
      await page.waitForTimeout(900);
    });
    await shot(`${dev}/ui/tooltip-view`, dev, '/piano?view=2d', async (page) => {
      if (dev !== 'desktop') return;
      await page.locator('.dim-toggle').hover();
      await page.waitForTimeout(900);
    });
    for (const look of LOOKS) {
      await shot(`${dev}/ui/pieces-menu-solo-${look}`, dev, `/piano?view=${look}`, async (page) => {
        await page.locator('.pl-pieces').first().click();
        await page.waitForTimeout(500);
      });
    }
    await shot(`${dev}/ui/pieces-menu-orchestra`, dev, '/orchestra?view=2d', async (page) => {
      await page.waitForTimeout(800);
      await page.locator('.pl-pieces').first().click();
      await page.waitForTimeout(500);
    });
    await shot(`${dev}/ui/routing-grid`, dev, '/symphony?view=2d', async (page) => {
      await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 30_000 });
      await page.locator('.pl-route').first().click();
      await page.waitForTimeout(600);
    });
    await shot(`${dev}/ui/routing-grid-quartet`, dev, '/orchestra?view=2d', async (page) => {
      await page.evaluate(() => window.__orchestra.loadPiece(window.__orchestra.pieces.findIndex((p) => p.id === 'haydn')));
      await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 30_000 });
      await page.locator('.pl-route').first().click();
      await page.waitForTimeout(600);
    });
    await shot(`${dev}/ui/solo-file-playing`, dev, '/piano?view=2d', async (page) => {
      await page.locator('.pl-play').first().click();
      await page.waitForFunction(() => window.__player?.playing, null, { timeout: 30_000 });
      await page.waitForTimeout(2500);
    });
    for (const id of ['piano', 'violin', 'flute', 'timpani', 'harp', 'trombone']) {
      await shot(`${dev}/ui/knobs-${id}`, dev, `/${id}?view=2d`, async (page) => {
        const t = page.locator('.knob-toggle');
        if (await t.isVisible()) await t.click();
        await page.waitForTimeout(400);
      });
    }
    await shot(`${dev}/ui/keys-for-orchestra`, dev, '/symphony?view=2d', async (page) => {
      await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 30_000 });
      const t = page.locator('.kf-toggle');
      if (await t.isVisible()) await t.click();
      await page.waitForTimeout(400);
    });
    // the piano's action close-up (a tap on a string), each look and both pianos
    for (const kind of ['piano', 'piano/upright']) {
      for (const look of LOOKS) {
        await shot(`${dev}/ui/action-${kind.replace('/', '-')}-${look}`, dev, `/${kind}?view=${look}`, async (page) => {
          await page.waitForTimeout(look === '3d' ? 1500 : 500);
          await page.evaluate(() => window.__piano.noteOn(60, 0.7, 'keys'));
          await page.waitForTimeout(300);
          if (look === '3d') await page.evaluate(() => window.__stage3d.zoomTo(60));
          else {
            // (a click on the key's strings, half way along them)
            const q = await page.evaluate(() => window.__piano2d()?.strings.find((x) => x.midi === 60));
            if (q) await page.mouse.click((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2);
          }
          await page.waitForTimeout(2200);
        });
      }
    }
    // the lid and the room at their ends
    for (const look of LOOKS) {
      for (const [tag, v] of [['shut-dry', 0], ['open-wet', 1]]) {
        await shot(`${dev}/ui/lid-room-${look}-${tag}`, dev, `/piano?view=${look}`, async (page) => {
          await page.waitForTimeout(look === '3d' ? 1200 : 400);
          for (const k of await page.locator('.stage-knob').all()) {
            if (!(await k.isVisible())) continue;
            await k.focus();
            await page.keyboard.press(v ? 'End' : 'Home');
          }
          await page.evaluate(() => [48, 60, 64].forEach((m) => window.__piano.noteOn(m, 0.7, 'midi')));
          await page.waitForTimeout(1800);
        });
      }
    }
    await shot(`${dev}/ui/case-hidden-3d`, dev, '/piano?view=3d', async (page) => {
      await page.waitForTimeout(1200);
      await page.evaluate(() => document.querySelector('.case-toggle')?.click());
      await page.waitForTimeout(1500);
    });
    await shot(`${dev}/ui/orchestra-seat-menu`, dev, '/orchestra?view=2d', async (page) => {
      await page.waitForTimeout(900);
      const b = await page.locator('.stage-cv').first().boundingBox();
      await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.5);
      await page.waitForTimeout(600);
    });
    await shot(`${dev}/ui/idle-before-sound`, dev, '/piano?view=2d', settle(600), { start: false });
    await shot(`${dev}/ui/chord-readout`, dev, '/piano?view=2d', hold([48, 52, 55, 60, 64, 67, 72]));
  }
  // ------------------------------------------------------------ the pages
  if (GROUPS.includes('pages')) {
    await shot(`${dev}/pages/measurements`, dev, '/measurements', settle(2500), { start: false, full: true });
    await shot(`${dev}/pages/measurements-top`, dev, '/measurements', settle(2500), { start: false });
    await shot(`${dev}/pages/notes`, dev, '/notes', settle(1200), { start: false, full: true });
    await shot(`${dev}/pages/notes-top`, dev, '/notes', settle(1200), { start: false });
    await shot(`${dev}/pages/not-found`, dev, '/no-such-page.html', async (page) => {
      await page.goto(`${BASE}/404.html`);
      await page.waitForTimeout(500);
    }, { start: false, full: true });
    await shot(`${dev}/pages/root`, dev, '/', settle(900), { start: false });
    await shot(`${dev}/pages/stage-only-violin-3d`, dev, '/violin?view=3d&ui=0', settle(1500), { start: false });
  }
}
// ------------------------------------------------------------ other windows
if (GROUPS.includes('windows')) {
  for (const dev of ['laptop', 'tablet', 'narrow', 'landscape', 'small']) {
    for (const [name, path, steps] of [
      ['piano-2d', '/piano?view=2d', hold([48, 60, 64, 67])],
      ['piano-3d', '/piano?view=3d', hold([48, 60, 64, 67])],
      ['violin-2d', '/violin?view=2d', hold([69])],
      ['bassoon-vector', '/bassoon?view=vector', hold([48])],
      ['tuba-3d', '/tuba?view=3d', hold([36])],
      ['picker', '/cello?view=2d', openPicker],
      ['symphony-2d', '/symphony?view=2d', playAt(60)],
      ['symphony-3d', '/symphony?view=3d', playAt(60, 4000)],
      ['passiton-vector', '/passiton?view=vector', playAt(50)],
      ['measurements', '/measurements', settle(2000)],
      ['notes', '/notes', settle(900)],
    ]) {
      await shot(`${dev}/${name}`, dev, path, steps, { start: !/measurements|notes/.test(path) });
    }
  }
}
await browser.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/report${ONLY.length || process.env.SETS || process.env.DEVS ? `-${Date.now()}` : ''}.json`, JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.failed || r.errs?.length || r.past?.length || (r.scroll && r.scroll[0] > r.win[0]));
console.log(`\n${report.length} shots, ${bad.length} flagged`);
