// An address that is none of the app's. The host (Vercel) answers it 404 with the build's 404.html;
// Vite's own server answers every path with the app, so here the host is played: the address is
// fulfilled with that file and that status. The page: its own small sheet in the app's type and
// colours, the address asked for, every place that does exist a link that opens it, nothing of the
// app loaded (no sound, no WebGL), whole on a phone. And the icons a browser asks for unasked.
import { test, expect } from '@playwright/test';

test('an unknown address: the 404 page names it and links every instrument, the Orchestra and the pages; a link opens the app', async ({ page, request }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text());
  });
  const file = await request.get('/404.html');
  expect(file.status()).toBe(200);
  const body = await file.text();
  for (const path of ['/sympony', '/no/such/place', '/an-address-far-too-long-to-print-whole-on-a-line']) {
    await page.route(`**${path}`, (route) => route.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body }));
    const res = await page.goto(path);
    expect(res!.status()).toBe(404);
    await expect(page).toHaveTitle('Not Found · Instruments');
    await expect(page.locator('.nf-word')).toHaveText('Tacet');
    const said = path.length > 29 ? `${path.slice(1, 27)}…` : path.slice(1);
    await expect(page.locator('.nf-line')).toHaveText(`404 · no ${said} plays at this address`);
    // the app is not here: no stage, no keys, no script of its own
    await expect(page.locator('#app, .keyboard, canvas')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__piano)).toBeUndefined();
    // its type and colours are the app's
    await page.evaluate(() => document.fonts.ready);
    const look = await page.evaluate(() => {
      const cs = (s: string) => getComputedStyle(document.querySelector(s)!);
      return { word: cs('.nf-word').fontFamily, style: cs('.nf-word').fontStyle, line: cs('.nf-line').fontFamily, ground: cs('html').backgroundColor, loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')), scroll: document.documentElement.scrollWidth };
    });
    expect(look.word).toMatch(/^"?Newsreader Variable/);
    expect(look.style).toBe('italic');
    expect(look.line).toMatch(/^"?IBM Plex Mono/);
    expect(look.ground).toBe('rgb(14, 13, 11)');
    expect(look.loaded).toEqual(expect.arrayContaining(['Newsreader Variable', 'IBM Plex Mono']));
    expect(look.scroll, 'no horizontal scroll').toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  // the places: sixteen instruments by family, the Orchestra and the two pieces' own addresses, the two pages; each whole on the page,
  // a finger's height on a phone
  const links = page.locator('.nf a');
  await expect(links).toHaveText(['piano', 'violin', 'viola', 'cello', 'bass', 'harp', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'tuba', 'timpani', 'glockenspiel', 'orchestra', 'symphony', 'everything', 'measurements', 'notes']);
  const vp = page.viewportSize()!;
  for (const b of await links.evaluateAll((as) => as.map((a) => a.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number; height: number }))) {
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(vp.width);
    expect(b.bottom).toBeLessThanOrEqual(vp.height);
    if (info.project.name === 'phone') expect(b.height).toBeGreaterThanOrEqual(30);
  }
  // one of them: the app, on that instrument
  await page.getByRole('link', { name: 'cello', exact: true }).click();
  await expect(page).toHaveURL(/\/cello$/);
  await expect(page).toHaveTitle('Instruments');
  await expect.poll(() => page.evaluate(() => (window as any).__piano?.instrument)).toBe('cello');
  expect(errors).toEqual([]);
});

test('the icons a browser asks for are served: /favicon.ico, /favicon.svg, /apple-touch-icon.png, and the page links them', async ({ page, request }) => {
  const ico = await request.get('/favicon.ico');
  expect(ico.status()).toBe(200);
  const b = await ico.body();
  expect([b.readUInt16LE(0), b.readUInt16LE(2), b.readUInt16LE(4)]).toEqual([0, 1, 3]);
  const apple = await request.get('/apple-touch-icon.png');
  expect(apple.status()).toBe(200);
  expect(apple.headers()['content-type']).toBe('image/png');
  const a = await apple.body();
  expect([a.readUInt32BE(16), a.readUInt32BE(20)]).toEqual([180, 180]);
  expect((await request.get('/favicon.svg')).headers()['content-type']).toMatch(/^image\/svg\+xml/);
  await page.goto('/');
  await expect(page).toHaveTitle('Instruments');
  expect(await page.evaluate(() => [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]')].map((l) => `${l.rel} ${new URL(l.href).pathname}`))).toEqual(['icon /favicon.ico', 'icon /favicon.svg', 'apple-touch-icon /apple-touch-icon.png']);
  // the icon is the drawing in the stage's colours: its corner the ground, its keys ivory, its string vermilion
  const px = await page.evaluate(async () => {
    const img = new Image();
    img.src = '/apple-touch-icon.png';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const at = (x: number, y: number) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
    return { corner: at(2, 2), key: at(53, 123), sharp: at(74, 65), string: at(90, 110) };
  });
  expect(px).toEqual({ corner: '20,17,13', key: '239,231,214', sharp: '21,18,15', string: '255,94,56' });
});
