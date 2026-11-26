// The four themes (apps/web/src/themes): Night Bench, Evening Hall, Day Studio, Night Gallery. A first visit
// is Night Bench. One sign in the bar opens a pick of the four; a pick changes the chrome, the 2D stage, the
// vector lines and the 3D world together, with no reload, and is the device's from then on: opened again,
// the page is that theme from before its first paint (nothing of another theme is ever shown). Every
// theme draws in 2D, in lines and in 3D without an error, and the 404 page is the device's theme too.
import { test, expect, type Page } from '@playwright/test';
import { THEMES } from '../apps/web/src/themes/index.ts';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text());
  });
  return errors;
};
const collectGl = (page: Page) => {
  const msgs: string[] = [];
  page.on('console', (m) => {
    if (/webgl|GL_[A-Z_]{4,}|feedback loop|framebuffer/i.test(m.text())) msgs.push(`${m.type()}: ${m.text()}`);
  });
  return msgs;
};
const glErrors = (page: Page, frames = 20) =>
  page.evaluate(async (n) => {
    const gl = (window as any).__stage3d.r3.r.getContext() as WebGL2RenderingContext;
    let errs = 0;
    for (let i = 0; i < n; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      for (let e = gl.getError(); e; e = gl.getError()) errs++;
    }
    return errs;
  }, frames);
async function startAudio(page: Page) {
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
}
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const onPage = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const ground = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
/** the first face of each theme's running text */
const FACE: Record<string, RegExp> = { 'night-bench': /^"?IBM Plex Sans/, 'evening-hall': /Cabin Variable/, 'day-studio': /^"?Ysabeau Office Variable/, 'night-gallery': /Libre Franklin Variable/ };
/** a picture's mean colour, as the screen shows it (a WebGL canvas cannot be read back from the page): enough
 *  to tell one theme's picture from another's, and to know one again */
const mean = async (page: Page, sel: string): Promise<[number, number, number]> => {
  const png = (await page.locator(sel).first().screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
    const im = new Image();
    im.src = `data:image/png;base64,${b64}`;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d')!;
    x.drawImage(im, 0, 0, 96, 96);
    const d = x.getImageData(0, 0, 96, 96).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
    return sum.map((v) => v / (d.length / 4)) as [number, number, number];
  }, png);
};
const apart = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** every two of the pictures are another picture (mean colours `min` apart or more) */
const allApart = (ps: number[][], min: number) => {
  let least = Infinity;
  for (let i = 0; i < ps.length; i++) for (let k = i + 1; k < ps.length; k++) least = Math.min(least, apart(ps[i], ps[k]));
  return least >= min ? true : `two pictures only ${least.toFixed(1)} apart: ${JSON.stringify(ps.map((p) => p.map(Math.round)))}`;
};

test('a first visit is Night Bench; the bar’s one sign opens a pick of the four; a pick changes the page at once and is the device’s: opened again it is that theme before anything is painted', async ({ page }) => {
  const errors = collectErrors(page);
  // (every value <html data-theme> ever has on this page, and when, against the first paint)
  await page.addInitScript(() => {
    const seen: [string | undefined, number][] = [];
    new MutationObserver(() => seen.push([document.documentElement?.dataset.theme, performance.now()])).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'] });
    (window as any).__seen = seen;
  });
  await page.goto('/piano?view=2d');
  expect(await onPage(page)).toBe('night-bench');
  expect(await ground(page)).toBe(rgb(THEMES[0].ink.ground));
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', THEMES[0].bar);
  // the button: a sign and no word; it says the theme in its tooltip and to assistive tech
  const btn = page.locator('header.top .theme-btn');
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText('');
  await expect(btn).toHaveAttribute('aria-label', 'Theme: Night Bench');
  await expect(btn).toHaveAttribute('data-tip', 'theme · Night Bench');
  await expect(btn.locator('circle')).toHaveCount(4);
  // the pick: the four by name, the one in use checked, inside the window
  await btn.click();
  const menu = page.locator('.theme-menu[role="menu"]');
  await expect(menu).toBeVisible();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  const items = menu.locator('[role="menuitemradio"]');
  await expect(items).toHaveText(THEMES.map((t) => t.name));
  await expect(menu.locator('[aria-checked="true"]')).toHaveText('Night Bench');
  await expect(menu.locator('[aria-checked="true"]')).toBeFocused();
  const fits = await menu.evaluate((m) => {
    const r = m.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && r.width > 80;
  });
  expect(fits, 'the pick is whole inside the window').toBe(true);
  // from the keyboard: the arrows walk it, Escape shuts it and gives the button the focus back
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(items.nth(3)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(btn).toBeFocused();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  // a tap elsewhere shuts it too
  await btn.click();
  await expect(menu).toBeVisible();
  await page.locator('.stage').click({ position: { x: 30, y: 200 } });
  await expect(menu).toHaveCount(0);
  // each of the others in turn: the page is it at once, nothing reloaded
  await page.evaluate(() => ((window as any).__same = true));
  for (const t of [...THEMES.slice(1), THEMES[0], THEMES[3]]) {
    await btn.click();
    await menu.getByRole('menuitemradio', { name: t.name }).click();
    await expect(menu).toHaveCount(0);
    expect(await onPage(page), t.id).toBe(t.id);
    expect(await ground(page), `${t.id}: the page's ground`).toBe(rgb(t.ink.ground));
    await expect(btn).toHaveAttribute('aria-label', `Theme: ${t.name}`);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', t.bar);
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily), `${t.id}: its type`).toMatch(FACE[t.id]);
    expect(await page.evaluate(() => localStorage.getItem('piano-model.theme'))).toBe(t.id);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), t.id).toBe(t.scheme);
  }
  expect(await page.evaluate(() => (window as any).__same), 'no reload').toBe(true);
  // opened again (a reload, another page of the app): Night Gallery from the start. <html> is never any
  // other theme, and it is that theme before the first paint
  for (const path of ['/piano?view=2d', '/notes', '/orchestra']) {
    await page.goto(path);
    expect(await onPage(page), path).toBe('night-gallery');
    expect(await ground(page), path).toBe(rgb(THEMES[3].ink.ground));
    const seen = await page.evaluate(() => {
      const paint = performance.getEntriesByType('paint').find((p) => p.name === 'first-paint')?.startTime ?? Infinity;
      return { values: ((window as any).__seen as [string, number][]).map((s) => s[0]), first: (window as any).__seen[0]?.[1] ?? Infinity, paint };
    });
    expect(seen.values.length, path).toBeGreaterThan(0);
    expect([...new Set(seen.values)], `${path}: never another theme`).toEqual(['night-gallery']);
    expect(seen.first, `${path}: on <html> before the first paint`).toBeLessThan(seen.paint);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', THEMES[3].bar);
  }
  expect(errors).toEqual([]);
});

test('every theme draws the stage its own way: the 2D drawing, the vector lines and the 3D world each differ from theme to theme, change with the theme at once, and 3D draws without one WebGL warning', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  const gl = collectGl(page);
  const set = (id: string) => page.evaluate((t) => (window as any).__themes.set(t, false), id);
  const frames = (n = 4) => page.evaluate((k) => new Promise<void>((res) => {
    const step = (i: number) => (i ? requestAnimationFrame(() => step(i - 1)) : res());
    step(k);
  }), n);
  await page.goto('/piano?view=2d');
  await startAudio(page);
  const CHORD = [48, 60, 64, 67];
  // ---- 2D as drawn, then in lines: four pictures, no two alike; and back to the first, the same again
  for (const view of ['2d', 'vector'] as const) {
    if (view === 'vector') await page.locator('.view-seg button', { hasText: 'vector' }).click();
    await frames(6);
    // (Night Bench at rest, to know it again; then a chord held, so what sounds is in each picture)
    const rest = await mean(page, '.stage');
    await page.evaluate((ns) => ns.forEach((m) => (window as any).__piano.noteOn(m, 100, 'keys')), CHORD);
    await page.waitForTimeout(400);
    const prints: number[][] = [];
    for (const t of THEMES) {
      await set(t.id);
      // (Day Studio's own drawers are a chunk of their own: the stage waits for them)
      await page.waitForFunction(() => (window as any).__themes.ready?.() ?? true, null, { timeout: 15_000 });
      await frames(6);
      expect(await onPage(page)).toBe(t.id);
      // the stage's canvas has a drawing on it
      const inked = await page.evaluate(() => {
        const cv = document.querySelector<HTMLCanvasElement>('.stage canvas')!;
        const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 40) n++;
        return n;
      });
      expect(inked, `${t.id}, ${view}: something is drawn`).toBeGreaterThan(200);
      prints.push(await mean(page, '.stage'));
    }
    expect(allApart(prints, 3), `${view}: each theme its own picture`).toBe(true);
    // and back to the first, the chord let go: its picture at rest again (nothing of another theme is left)
    await set(THEMES[0].id);
    await page.evaluate((ns) => ns.forEach((m) => (window as any).__piano.noteOff(m, 'keys')), CHORD);
    await expect.poll(async () => apart(await mean(page, '.stage'), rest), { message: `${view}: Night Bench again, as it was`, timeout: 8000 }).toBeLessThan(1.5);
  }
  // ---- 3D: each theme's world, built as the theme changes; never a WebGL error or warning
  await set('night-bench');
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  const drawn = async () => page.waitForFunction((n) => (window as any).__stage3d?.stats.frames > n, (await page.evaluate(() => (window as any).__stage3d?.stats.frames ?? 0)) + 6, { timeout: 30_000 });
  await drawn();
  await page.evaluate((ns) => ns.forEach((m) => (window as any).__piano.noteOn(m, 100, 'keys')), CHORD);
  const worlds: number[][] = [];
  for (const t of [...THEMES, THEMES[0]]) {
    await set(t.id);
    await drawn();
    expect(await glErrors(page), `${t.id}: WebGL errors`).toBe(0);
    // (Evening Hall's light comes up with the sound: it is running, give it its second)
    await page.waitForTimeout(t.id === 'evening-hall' ? 1500 : 300);
    worlds.push(await mean(page, '.stage-3d'));
  }
  expect(allApart(worlds.slice(0, 4), 4), 'each theme its own world').toBe(true);
  expect(apart(worlds[4], worlds[0]), 'Night Bench’s world again, as it was').toBeLessThan(2);
  // the 3D stage holds no more for having been through four worlds twice (programs, textures, geometries)
  const held = () => page.evaluate(() => {
    const i = (window as any).__stage3d.r3.r.info;
    return [i.programs?.length ?? 0, i.memory.textures, i.memory.geometries];
  });
  const before = await held();
  for (const t of [...THEMES.slice(1), THEMES[0]]) {
    await set(t.id);
    await drawn();
  }
  expect(await held(), 'nothing left behind by a change of world').toEqual(before);
  // an orchestra in each (its risers, its floor)
  await page.goto('/symphony?view=3d');
  await expect(page.locator('.stage-3d')).toBeVisible();
  for (const t of THEMES) {
    await set(t.id);
    await drawn();
    expect(await glErrors(page, 10), `${t.id}, an orchestra: WebGL errors`).toBe(0);
  }
  expect(gl, 'WebGL messages on the console').toEqual([]);
  expect(errors).toEqual([]);
});

test('a phone: the theme’s sign is in the bar’s corner, the bar’s height to a finger; its pick is whole inside the window, and nothing of any theme widens the page', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout');
  const errors = collectErrors(page);
  for (const size of [null, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    if (size) await page.setViewportSize(size);
    await page.goto('/piano?view=2d');
    const btn = page.locator('header.top .theme-btn');
    for (const t of THEMES) {
      await expect(btn).toBeVisible();
      const b = (await btn.boundingBox())!;
      const bar = (await page.locator('header.top').boundingBox())!;
      const where = `${size?.width ?? 'Pixel 7'}, ${t.id}`;
      // (its box is the bar's corner: the margin's width, the bar's height)
      expect(b.width, where).toBeGreaterThanOrEqual(22);
      expect(b.height, where).toBeGreaterThanOrEqual(40);
      expect(b.y, where).toBeGreaterThanOrEqual(bar.y - 0.5);
      expect(b.y + b.height, where).toBeLessThanOrEqual(bar.y + bar.height + 0.5);
      expect(b.x + b.width, where).toBeLessThanOrEqual(page.viewportSize()!.width);
      await btn.tap();
      const menu = page.locator('.theme-menu');
      await expect(menu).toBeVisible();
      const m = (await menu.boundingBox())!;
      expect(m.x, where).toBeGreaterThanOrEqual(0);
      expect(m.x + m.width, where).toBeLessThanOrEqual(page.viewportSize()!.width);
      // (each row a finger's height)
      for (const r of await menu.locator('[role="menuitemradio"]').all()) expect((await r.boundingBox())!.height, where).toBeGreaterThanOrEqual(36);
      const next = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
      await menu.getByRole('menuitemradio', { name: next.name }).tap();
      await expect(menu).toHaveCount(0);
      expect(await onPage(page)).toBe(next.id);
      for (const path of ['stage', 'notes'] as const) {
        if (path === 'notes') await page.locator('header nav.links a[data-route="notes"]').tap();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${where} → ${next.id}, ${path}: no horizontal scroll`).toBeLessThanOrEqual(0);
        if (path === 'notes') await page.locator('header nav.links a.to-stage').tap();
      }
      await expect(page.locator('html')).toHaveAttribute('data-route', 'stage');
    }
  }
  expect(errors).toEqual([]);
});

test('an address that is none of the app’s is the device’s theme too: the 404 page in each', async ({ page, request }) => {
  const errors = collectErrors(page);
  const body = await (await request.get('/404.html')).text();
  expect(body, 'the boot script is in the 404 page’s head').toContain('piano-model.theme');
  await page.route('**/no-such-page', (route) => route.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body }));
  await page.goto('/notes');
  const grounds: string[] = [];
  for (const t of THEMES) {
    await page.goto('/notes');
    await page.evaluate((id) => localStorage.setItem('piano-model.theme', id), t.id);
    const res = await page.goto('/no-such-page');
    expect(res!.status()).toBe(404);
    expect(await onPage(page), t.id).toBe(t.id);
    await expect(page.locator('.nf-word')).toHaveText('Tacet');
    expect(await ground(page), `${t.id}: the 404's ground`).toBe(rgb(t.ink.ground));
    // (the browser's chrome: the theme's bar; under the default, the 404's own ground, as it always was)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', t === THEMES[0] ? t.ink.ground : t.bar);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${t.id}: no horizontal scroll`).toBeLessThanOrEqual(0);
    grounds.push(await ground(page));
  }
  expect(new Set(grounds).size).toBe(THEMES.length);
  expect(errors).toEqual([]);
});

test('what a look has of its own in the page comes and goes with it: its drawn signs, a sign on each stage knob, a way past the bar for a keyboard, and what the Notes say of the stage', async ({ page }, info) => {
  const errors = collectErrors(page);
  const set = (id: string) => page.evaluate((t) => (window as any).__themes.set(t, false), id);
  await page.goto('/piano?view=2d');
  for (const t of [...THEMES, THEMES[0]]) {
    await set(t.id);
    // the chrome's signs (the octave's arrows, the knobs' way back): a character of the type, or a drawn path
    for (const [sel, name] of [['.oct-btn >> nth=0', 'prev'], ['.oct-btn >> nth=1', 'next'], ['.k-reset', 'reset']] as const) {
      const g = t.glyphs[name];
      const host = page.locator(sel).first();
      if (typeof g === 'string') {
        await expect(host.locator('svg'), `${t.id}: ${name} is a character`).toHaveCount(0);
        expect((await host.textContent())!.trim(), `${t.id}: ${name}`).toBe(g);
      } else {
        await expect(host.locator(`svg.${t.glyphs.svgClass} path`), `${t.id}: ${name} is drawn`).toHaveAttribute('d', g.d);
        expect((await host.textContent())!.trim(), `${t.id}: ${name}: no character beside it`).toBe('');
      }
    }
    // a knob on the stage (the room's, the grand's lid's): its cap's sign where the look has one
    const signs = t.chrome.stageSigns;
    for (const k of ['room', 'lid'] as const) {
      const knob = page.locator(`.stage-knob.knob-${k}`);
      await expect(knob, `${t.id}: the ${k}'s knob`).toHaveCount(1);
      if (signs) await expect(knob.locator(`.${signs.cls}`), `${t.id}: the ${k}'s sign`).toHaveAttribute('d', signs[k]);
      else await expect(knob.locator('.sk-sign, .sk-glyph'), `${t.id}: a bare dial`).toHaveCount(0);
    }
    // the way past the bar: the page's first stop where the look has it, not there at all elsewhere
    const skip = page.locator('a.skip');
    if (t.chrome.skip) {
      await expect(page.locator('main#main')).toHaveAttribute('tabindex', '-1');
      if (info.project.name === 'desktop') {
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.keyboard.press('Tab');
        await expect(skip, `${t.id}: the first stop`).toBeFocused();
        await expect(skip).toBeVisible();
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      }
    } else {
      await expect(skip, `${t.id}: no skip link`).toBeHidden();
      expect(await page.locator('main#main').getAttribute('tabindex'), t.id).toBeNull();
    }
  }
  // the Notes say what is true of the stage in this look, and say the other look's when the theme changes
  await page.locator('header nav.links a[data-route="notes"]').click();
  const stage = page.locator('section#n-stage');
  await expect(stage).toBeAttached();
  const said: string[] = [];
  for (const t of THEMES) {
    await set(t.id);
    said.push((await stage.textContent())!);
  }
  expect(said[0], 'Night Bench: a studio light').toContain('under a studio light');
  expect(said[1], 'Evening Hall: one spotlight').toContain('under one spotlight');
  expect(said[2], 'Day Studio: daylight').toContain('daylight studio');
  expect(new Set(said).size, 'each look’s own words').toBe(THEMES.length);
  expect(errors).toEqual([]);
});
