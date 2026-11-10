// The address (address.ts, nav.ts): every tab its own (back and forward walk them, a reload or a link
// opens the tab), and the Orchestra's whole setup kept in it with nothing to press, so a reload brings
// it back and an address is a preset: the string quintet's takes a file with the track names and
// programs of Max Richter's "On the Nature of Daylight" and plays it on two violins, a viola, a cello
// and a double bass, all starting together. The file is constructed (no copyrighted music).
import { test, expect, type Page } from '@playwright/test';
import { smf } from '../apps/web/test/smf.ts';
import { QUINTET } from '../apps/web/test/presets.ts';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};
const path = (page: Page) => {
  const u = new URL(page.url());
  return decodeURI(u.pathname + u.search);
};
const ens = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return { active: e.active as boolean, lineup: e.lineup as string[], engines: e.parts.filter((p: any) => p.engine).length as number, seats: e.plan.lines.map((rs: any[]) => rs.map((r) => r.part)) as number[][], keys: e.keys as { parts: number[]; split: boolean; byUser: boolean }, rules: e.rules as unknown };
  });
const pick = (page: Page, name: string) => page.locator('.instruments').getByRole('button', { name, exact: true });

/** a file with the quintet's track names and programs, every line from the first beat */
function quintetFile(): number[] {
  const name = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
  const parts = [
    ['Violin I', 40, [77, 81, 82, 81]],
    ['Violin II', 40, [69, 72, 74, 72]],
    ['Viola', 41, [62, 65, 65, 64]],
    ['Violoncello', 42, [50, 53, 50, 52]],
    ['Contrabass', 43, [38, 34, 41, 33]],
  ] as const;
  const tracks: [number, ...number[]][][] = [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]];
  parts.forEach(([n, prog, ns], ch) => {
    const t: [number, ...number[]][] = [[0, ...name(n)], [0, 0xc0 | ch, prog]];
    for (let r = 0; r < 3; r++) for (const m of ns) t.push([0, 0x90 | ch, m, 80], [960, 0x80 | ch, m, 0]);
    tracks.push(t);
  });
  return Array.from(smf(480, tracks));
}
const drop = (page: Page, file: number[]) =>
  page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'quintet.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, file);

test('the address: each tab its own path; back and forward walk the tabs; a link or a reload opens the tab; old #/ addresses still open', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect.poll(() => path(page)).toBe('/piano');
  await pick(page, 'Violin').click();
  await expect.poll(() => path(page)).toBe('/violin');
  await pick(page, 'Flute').click();
  await expect.poll(() => path(page)).toBe('/flute');
  await pick(page, 'Piano').click();
  await expect.poll(() => path(page)).toBe('/piano');
  await page.locator('.presets').getByRole('button', { name: 'upright' }).click();
  await expect.poll(() => path(page)).toBe('/piano/upright');
  await page.locator('.ens-toggle').click();
  await expect.poll(() => path(page)).toBe('/orchestra?v=1&seats=violin,violin,viola,cello&view=2d&expr=on');
  await page.locator('nav.links').getByRole('link', { name: 'notes' }).click();
  await expect.poll(() => path(page)).toBe('/notes');
  await expect(page.locator('html')).toHaveAttribute('data-route', 'notes');
  // back: the Orchestra as it was; then the upright, the grand, the flute; forward again
  await page.goBack();
  await expect.poll(() => path(page)).toMatch(/^\/orchestra\?/);
  await expect(page.locator('html')).toHaveAttribute('data-route', 'stage');
  expect((await ens(page)).active).toBe(true);
  await page.goBack();
  await expect.poll(() => path(page)).toBe('/piano/upright');
  await expect.poll(async () => (await ens(page)).active).toBe(false);
  expect(await page.evaluate(() => (window as any).__piano.preset)).toBe('upright');
  await expect(page.locator('.presets').getByRole('button', { name: 'upright' })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect.poll(() => page.evaluate(() => (window as any).__piano.preset)).toBe('grand');
  await page.goBack();
  await expect.poll(() => page.evaluate(() => (window as any).__piano.instrument)).toBe('flute');
  await expect(pick(page, 'Flute')).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect.poll(() => page.evaluate(() => (window as any).__piano.instrument)).toBe('piano');
  // the back link from a page goes to the stage as it is
  await page.locator('nav.links').getByRole('link', { name: 'measurements' }).click();
  await expect.poll(() => path(page)).toBe('/measurements');
  await expect(page.locator('a.back')).toHaveAttribute('href', '/piano');
  await page.locator('a.back').click();
  await expect.poll(() => path(page)).toBe('/piano');
  // a link to a tab, and a reload, open it
  await page.goto('/viola');
  expect(await page.evaluate(() => (window as any).__piano.instrument)).toBe('viola');
  await expect(pick(page, 'Viola')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(pick(page, 'Viola')).toHaveAttribute('aria-pressed', 'true');
  // an old address: the page it was, at its new address
  await page.goto('/#/notes');
  await expect(page.locator('html')).toHaveAttribute('data-route', 'notes');
  await expect.poll(() => path(page)).toBe('/notes');
  await page.goto('/?style=vector');
  await expect(page.locator('html')).toHaveAttribute('data-style', 'vector');
  await expect.poll(() => path(page)).toBe('/viola?view=vector');
  // (an address's look is the page's: the device keeps its own)
  expect(await page.evaluate(() => localStorage.getItem('piano-model.style'))).toBe(null);
  expect(errors).toEqual([]);
});

test('the Orchestra’s setup is the address, with nothing to press: lineup with duplicates, routing, keys, look and expression come back on a reload, and a file then plays as it was routed', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await page.locator('.ens-toggle').click();
  // a quintet with a third violin (two of a kind and three of another)
  await pick(page, 'Double bass').click();
  await pick(page, 'Violin').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(['violin', 'violin', 'violin', 'viola', 'cello', 'bass']);
  await drop(page, quintetFile());
  await expect(page.locator('.pl-line')).toHaveCount(5, { timeout: 10_000 });
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // by hand: the third violin doubles the first violin's line (the grid), the keys play the viola and
  // the bass, the vector lines, no automatic expression
  await page.locator('.pl-route').click();
  await page.locator('.pg-cell[data-cell="2:0"]').click();
  await page.keyboard.press('Escape');
  await page.locator('.kf-part[data-part="3"]').click();
  await page.locator('.kf-part[data-part="5"]').click();
  await page.locator('.kf-part[data-part="0"]').click();
  await page.locator('.pl-expr').click();
  await page.locator('.vec-toggle').click();
  const before = await ens(page);
  expect(before.keys).toEqual({ parts: [3, 5], split: false, byUser: true });
  expect(before.seats[0]).toContain(2);
  const want = '/orchestra?v=1&seats=violin,violin,violin,viola,cello,bass&lines=Violin+I~40:1.3,Violin+II~40:2,Viola~41:4,Violoncello~42:5,Contrabass~43:6&keys=4.6&view=vector&expr=off';
  await expect.poll(() => path(page)).toBe(want);
  // one entry for the whole Orchestra: back goes to the instrument it came from
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(3);
  // (the device forgets its own choices: the address alone brings them back)
  await page.evaluate(() => ['piano-model.style', 'piano-model.3d', 'piano-model.expression'].forEach((k) => localStorage.removeItem(k)));
  await page.reload();
  // all of it back, and the sound not started by the page opening (a gesture starts it)
  expect(await page.evaluate(() => (window as any).__piano.ctx)).toBe(null);
  const after = await ens(page);
  expect(after.active).toBe(true);
  expect(after.lineup).toEqual(before.lineup);
  expect(after.keys).toEqual(before.keys);
  expect(after.rules).toEqual(before.rules);
  expect(after.engines).toBe(0);
  await expect(page.locator('.kf-part[aria-pressed="true"]')).toHaveCount(2);
  await expect(page.locator('html')).toHaveAttribute('data-style', 'vector');
  expect(await page.evaluate(() => (window as any).__player.auto)).toBe(false);
  // (and the device's own choices are left as they were)
  expect(await page.evaluate(() => [localStorage.getItem('piano-model.style'), localStorage.getItem('piano-model.expression')])).toEqual([null, null]);
  expect(path(page)).toBe(want);
  // the file dropped again plays as it was routed
  await drop(page, quintetFile());
  await expect.poll(async () => (await ens(page)).engines, { timeout: 15_000 }).toBe(6);
  expect((await ens(page)).seats).toEqual(before.seats);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('the string quintet preset: the address alone sets it up; the Daylight quintet’s lines (Violin I, Violin II, Viola, Violoncello, Contrabass) land on violin, violin, viola, cello and double bass and start together', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto(QUINTET);
  expect((await ens(page)).lineup).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
  await expect(page.locator('.pick[aria-label="Violin"] .pick-n')).toHaveText('×2');
  // (nothing added to the page for it: no button, no words)
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/share|copy link/i);
  // each part's first note, as scheduled: its context time, and whether its engine was there
  await page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    const first: Record<number, { at: number; engine: boolean }> = {};
    (window as any).__first = first;
    const sched = e.schedule.bind(e);
    e.schedule = (ev: any, at: number) => {
      if (ev.kind === 'on') for (const r of e.plan.lines[ev.line] ?? []) first[r.part] ??= { at, engine: !!e.parts[r.part]?.engine };
      return sched(ev, at);
    };
  });
  await drop(page, quintetFile());
  await expect(page.locator('.pl-line')).toHaveCount(5, { timeout: 10_000 });
  expect(await page.locator('.pl-line').evaluateAll((els) => els.map((b) => b.getAttribute('data-voices')))).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
  expect((await ens(page)).seats).toEqual([[0], [1], [2], [3], [4]]);
  // (the engines are made as it starts to play: the sound starts with the drop)
  await expect.poll(async () => (await ens(page)).engines, { timeout: 15_000 }).toBe(5);
  expect(await page.evaluate(() => (window as any).__orchestra.ensemble.parts.map((p: any) => p.engine?.instrument))).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
  await expect.poll(() => page.evaluate(() => Object.keys((window as any).__first).length), { timeout: 5000 }).toBe(5);
  const first = await page.evaluate(() => (window as any).__first as Record<number, { at: number; engine: boolean }>);
  const ats = Object.values(first).map((f) => f.at);
  expect(Math.max(...ats) - Math.min(...ats), 'every part’s first note at the same time').toBeLessThan(1e-9);
  expect(Object.values(first).every((f) => f.engine), 'every engine there before its first note').toBe(true);
  // every part sounding
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.filter((p: any) => p.down.size > 0).length), { timeout: 5000 }).toBe(5);
  // the address still the preset (the file's names do not replace it)
  expect(path(page)).toMatch(/^\/orchestra\?v=1&seats=violin,violin,viola,cello,bass&lines=Violin\+I~40:1,Violin\+II~40:2,Viola~41:3,Cello~42:4,Contrabass~43:5&view=/);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});
