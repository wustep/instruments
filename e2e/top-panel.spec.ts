// The top panel: what is on the stage and how it is seen (the bar), and what is sounding (the band under it).
// The readout says every note sounding (a chord is never one of its notes), an ensemble its parts; the picker
// is fifteen instruments by family, at a size to read and to touch (behind one button where there is no
// room); the view is one choice of three; the pages are two words that show which one is open.
import { test, expect, type Page } from '@playwright/test';
import { openPicker } from './picker.ts';
import { QUINTET, SYMPHONY } from '../apps/web/test/presets.ts';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};
async function startAudio(page: Page) {
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
}
const on = (page: Page, notes: number[]) => page.evaluate((ns) => ns.forEach((m) => (window as any).__piano.noteOn(m, 0.6, 'midi')), notes);
const off = (page: Page, notes: number[]) => page.evaluate((ns) => ns.forEach((m) => (window as any).__piano.noteOff(m, 'midi')), notes);
const head = (page: Page) => page.locator('.r-note');
const sub = (page: Page) => page.locator('.r-hz');
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

test('the readout says every note sounding: one note and its frequency, a chord’s notes and its name, many counted; let go, it dims; the band never moves', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/piano?view=2d');
  await startAudio(page);
  const readout = page.locator('.readout');
  // nothing played: nothing said
  await expect(head(page)).toBeEmpty();
  await expect(readout).toHaveAttribute('data-idle', '');
  const band0 = (await box(page, '.stage-top')).height;
  // one note: its name, its frequency (the piano's own tuning)
  await on(page, [64]);
  await expect(head(page)).toHaveText('E4');
  await expect(sub(page)).toHaveText(/^3(29|30)\.\d Hz$/);
  await expect(readout).not.toHaveAttribute('data-idle', '');
  await expect(readout).toHaveAttribute('data-size', '1');
  // three more: the chord, every note of it, lowest first (not the note played last)
  await on(page, [60, 67, 71]);
  await expect(head(page)).toHaveText('C4 E4 G4 B4');
  await expect(sub(page)).toHaveText('Cmaj7');
  await expect(readout).toHaveAttribute('data-size', '3');
  // it fits its box at every size, and the band is as tall as it was
  const fits = async () => {
    const [r, h] = [await box(page, '.readout'), await box(page, '.r-note')];
    expect(await head(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), await head(page).innerText()).toBe(true);
    expect(h.x + h.width).toBeLessThanOrEqual(r.x + r.width + 0.5);
    expect((await box(page, '.stage-top')).height).toBe(band0);
  };
  await fits();
  // one let go: the three left
  await off(page, [71]);
  await expect(head(page)).toHaveText('C4 E4 G4');
  await expect(sub(page)).toHaveText('C');
  // two: their interval
  await off(page, [67]);
  await expect(head(page)).toHaveText('C4 E4');
  await expect(sub(page)).toHaveText('major third');
  await off(page, [60, 64]);
  // a chord spelled as the chord spells it, at the smallest setting
  await on(page, [58, 61, 65, 68]);
  await expect(head(page)).toHaveText('B♭3 D♭4 F4 A♭4');
  await expect(sub(page)).toHaveText('B♭m7');
  await expect(readout).toHaveAttribute('data-size', '4');
  await fits();
  await off(page, [58, 61, 65, 68]);
  // many: the chord's name, how many, from where to where
  await on(page, [36, 48, 52, 55, 60, 64, 67, 72]);
  await expect(head(page)).toHaveText('C');
  await expect(sub(page)).toHaveText('8 notes · C2–C5');
  await off(page, [36, 48, 52, 55, 60, 64, 67, 72]);
  // a cluster: counted
  await on(page, [60, 61, 62, 63, 64, 65]);
  await expect(head(page)).toHaveText('6 notes');
  await expect(sub(page)).toHaveText('C4–F4');
  await fits();
  // let go (the strings damp): what was last heard stays, dimmed
  await off(page, [60, 61, 62, 63, 64, 65]);
  await expect(readout).toHaveAttribute('data-idle', '', { timeout: 8000 });
  await expect(head(page)).not.toBeEmpty();
  expect(parseFloat(await readout.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('a one-voice instrument says the one note it sounds, whatever keys are held; a cello’s double stop is both its notes; another instrument starts the readout afresh', async ({ page }) => {
  await page.goto('/flute?view=2d');
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'flute', null, { timeout: 15_000 });
  await on(page, [72]);
  await expect(head(page)).toHaveText('C5');
  await expect(sub(page)).toHaveText(/^52\d\.\d Hz$/);
  // a second key held: the flute sounds one of them (the engine's word), and the readout says that one
  await on(page, [76]);
  await expect(head(page)).toHaveText('E5');
  await off(page, [72, 76]);
  await openPicker(page);
  await page.locator('.pick[aria-label="Cello"]').click();
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'cello', null, { timeout: 15_000 });
  // (another instrument: nothing heard on it yet)
  await expect(head(page)).toBeEmpty();
  await on(page, [50]);
  await expect(head(page)).toHaveText('D3');
  await expect(sub(page)).toHaveText('146.8 Hz');
  // (its string and its bow, on a computer: one bow, as it is)
  if ((page.viewportSize()?.width ?? 0) > 760) await expect(page.locator('.scope-cap')).toContainText('D string');
  // the next string too: a double stop, both notes and their interval
  await on(page, [57]);
  await expect(head(page)).toHaveText('D3 A3');
  await expect(sub(page)).toHaveText('fifth');
  await off(page, [50, 57]);
});

test('an ensemble: the readout says the notes its parts sound together and how many parts; on a computer each instrument is lit with its own notes', async ({ page }, info) => {
  const errors = collectErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto(`${QUINTET}&view=2d`);
  await page.waitForFunction(() => (window as any).__orchestra?.ensemble.parts.length === 5);
  const mark = (part: number, midi: number, down: boolean) =>
    page.evaluate(([k, m, d]) => {
      const e = (window as any).__orchestra.ensemble;
      if (d) e.parts[k as number].down.add(m);
      else e.parts[k as number].down.delete(m);
    }, [part, midi, down] as const);
  // the scope steps aside (one bow's trace says nothing of five players); the parts take its place
  await expect(page.locator('.scope')).toBeHidden();
  const parts = page.locator('.parts .part');
  if (!phone) {
    await expect(parts).toHaveCount(4);
    expect(await parts.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.voice))).toEqual(['violin', 'viola', 'cello', 'bass']);
    await expect(parts.first().locator('.part-n')).toHaveText('×2');
  } else await expect(page.locator('.parts')).toBeHidden();
  // one part: its note
  await mark(3, 43, true);
  await expect(head(page)).toHaveText('G2');
  await expect(sub(page)).toHaveText('98.0 Hz');
  // four parts, a G major chord between them: all of it, and who
  await mark(0, 71, true);
  await mark(1, 67, true);
  await mark(2, 62, true);
  await expect(head(page)).toHaveText('G2 D4 G4 B4');
  await expect(sub(page)).toHaveText('G · 4 parts');
  if (!phone) {
    expect(await parts.evaluateAll((els) => els.map((el) => [el.hasAttribute('data-on'), el.querySelector('.part-notes')!.textContent]))).toEqual([[true, 'G4 B4'], [true, 'D4'], [true, 'G2'], [false, '']]);
    // the strip is in the band, clear of the spectrum, and names each instrument on hover
    const [s, p, band] = [await box(page, '.spec-wrap'), await box(page, '.parts'), await box(page, '.stage-top')];
    expect(p.x).toBeGreaterThanOrEqual(s.x + s.width);
    expect(p.y + p.height).toBeLessThanOrEqual(band.y + band.height + 0.5);
    await expect(parts.first()).toHaveAttribute('data-tip', 'violin ×2');
  }
  // the bass joins an octave under: five parts
  await mark(4, 31, true);
  await expect(head(page)).toHaveText('G');
  await expect(sub(page)).toHaveText('5 parts · G1–B4');
  // all let go: dimmed
  for (const [k, m] of [[0, 71], [1, 67], [2, 62], [3, 43], [4, 31]]) await mark(k, m, false);
  await expect(page.locator('.readout')).toHaveAttribute('data-idle', '');
  // its own piece playing: the readout follows the parts (never empty for long, never wider than its box)
  await page.getByRole('button', { name: /^Play/ }).first().click();
  await expect(page.locator('.readout')).not.toHaveAttribute('data-idle', '', { timeout: 20_000 });
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    seen.add(await sub(page).innerText());
    expect(await head(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.waitForTimeout(250);
  }
  expect([...seen].some((t) => /parts/.test(t)), [...seen].join(' | ')).toBe(true);
  await page.getByRole('button', { name: 'Stop' }).first().click();
  expect(errors).toEqual([]);
});

test('the picker on a computer: fifteen instruments in five families on one row, each name whole and clear of its neighbour’s, the one on the stage marked; the orchestra beside them', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'the bar with room for all fifteen');
  await page.goto('/piano?view=2d');
  await expect(page.locator('.pick-open')).toBeHidden();
  expect(await page.locator('.instruments .fam').evaluateAll((els) => els.map((el) => `${(el as HTMLElement).dataset.fam}:${el.querySelectorAll('.pick').length}`))).toEqual(['keys:2', 'strings:4', 'woodwinds:4', 'brass:4', 'percussion:1']);
  const names = await page.locator('.instruments .pick-name').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { t: el.textContent, l: r.left, r: r.right, y: r.top, cut: (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1 }; }));
  expect(names.map((n) => n.t)).toEqual(['piano', 'harp', 'violin', 'viola', 'cello', 'bass', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'tuba', 'timpani']);
  for (let i = 1; i < names.length; i++) {
    expect(names[i].l, `${names[i].t} clear of ${names[i - 1].t}`).toBeGreaterThanOrEqual(names[i - 1].r + 4);
    expect(names[i].y).toBeCloseTo(names[0].y, 0);
    expect(names[i].cut).toBe(false);
  }
  // the bar is one row: the picker, the tools and the pages share it, none over another
  const bar = await box(page, 'header.top');
  const [pk, tools, links] = [await box(page, '.picker'), await box(page, '.stage-tools'), await box(page, 'header nav')];
  for (const b of [pk, tools, links]) {
    expect(b.y).toBeGreaterThanOrEqual(bar.y);
    expect(b.y + b.height).toBeLessThanOrEqual(bar.y + bar.height + 0.5);
  }
  expect(pk.x + pk.width).toBeLessThan(tools.x);
  expect(tools.x + tools.width).toBeLessThan(links.x);
  // the orchestra: named, at the end of the instruments
  const ens = page.locator('.ens-toggle');
  await expect(ens.locator('.pick-name')).toHaveText('orchestra');
  expect((await ens.boundingBox())!.x).toBeGreaterThan(names[names.length - 1].r);
  // a small laptop (1366 px), at its fullest (an upright in 3D: its kind, its case, the view; no sound yet, so
  // the lamp says what to do): still one row, the lamp's words whole; narrower, the picker folds behind its button
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/piano/upright?view=3d');
  await expect(page.locator('.case-toggle')).toBeVisible();
  const b2 = await box(page, '.picker');
  expect(b2.x + b2.width).toBeLessThan((await box(page, '.stage-tools')).x);
  await expect(page.locator('.lamp-text')).toHaveText('tap a key');
  expect(await page.locator('.lamp-text').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.locator('.pick-open')).toBeVisible();
  await expect(page.locator('.instruments')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the picker on a phone: one button names the instrument; its sheet shows all fifteen, each large enough to touch, four to a row, every row a kind; the piano’s kind at its foot; choosing one shuts it; an orchestra keeps it open to count instruments in', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout');
  const errors = collectErrors(page);
  for (const size of [null, { width: 390, height: 844 }, { width: 320, height: 640 }, { width: 844, height: 390 }]) {
    if (size) await page.setViewportSize(size);
    const where = size ? `${size.width}×${size.height}` : 'Pixel 7';
    await page.goto('/piano?view=2d');
    const open = page.locator('.pick-open');
    await expect(open).toBeVisible();
    await expect(open).toHaveText('piano');
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.instruments')).toBeHidden();
    await open.click();
    await expect(open).toHaveAttribute('aria-expanded', 'true');
    const picks = page.locator('.instruments .pick');
    await expect(picks).toHaveCount(15);
    const vp = page.viewportSize()!;
    const boxes = await picks.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); const n = el.querySelector('.pick-name')!.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, nl: n.left, nr: n.right, name: el.querySelector('.pick-name')!.textContent }; }));
    for (const [i, b] of boxes.entries()) {
      // a target a finger finds (44 px across; sideways the rows are a little lower), whole on the screen
      expect(b.r - b.l, `${where}: ${b.name} wide`).toBeGreaterThanOrEqual(44);
      expect(b.b - b.t, `${where}: ${b.name} tall`).toBeGreaterThanOrEqual(vp.height < 500 ? 40 : 44);
      expect(b.l, where).toBeGreaterThanOrEqual(0);
      expect(b.r, where).toBeLessThanOrEqual(vp.width);
      expect(b.b, `${where}: ${b.name} on the screen`).toBeLessThanOrEqual(vp.height);
      // its whole name, inside its own button
      expect(b.nl, `${where}: ${b.name}`).toBeGreaterThanOrEqual(b.l - 0.5);
      expect(b.nr, `${where}: ${b.name}`).toBeLessThanOrEqual(b.r + 0.5);
      // no two overlap
      for (const c of boxes.slice(0, i)) expect(b.l >= c.r - 0.5 || c.l >= b.r - 0.5 || b.t >= c.b - 0.5 || c.t >= b.b - 0.5, `${where}: ${b.name} / ${c.name}`).toBe(true);
    }
    expect(boxes.map((b) => b.name)).toEqual(['piano', 'harp', 'violin', 'viola', 'cello', 'bass', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'tuba', 'timpani']);
    // four to a row, every row a kind: what is struck or plucked first (the piano, the harp, the timpani beside them), then
    // the strings, the woodwinds, the brass; every row begins in the first column, and none has a gap in it
    const rows = [...new Set(boxes.map((b) => Math.round(b.t)))].sort((a, b) => a - b);
    expect(rows.length, where).toBe(4);
    const row = (k: number) => boxes.filter((b) => Math.round(b.t) === rows[k]).sort((a, b) => a.l - b.l);
    expect(row(0).map((b) => b.name)).toEqual(['piano', 'harp', 'timpani']);
    expect(row(1).map((b) => b.name)).toEqual(['violin', 'viola', 'cello', 'bass']);
    expect(row(2).map((b) => b.name)).toEqual(['flute', 'oboe', 'clarinet', 'bassoon']);
    expect(row(3).map((b) => b.name)).toEqual(['horn', 'trumpet', 'trombone', 'tuba']);
    const pitch = row(1)[1].l - row(1)[0].l;
    for (const k of [0, 1, 2, 3]) row(k).forEach((b, i) => expect(b.l, `${where}: ${b.name} in column ${i + 1}`).toBeCloseTo(row(1)[0].l + i * pitch, 0));
    // the piano's kind at the sheet's foot: under every instrument, inside the sheet, from the first column
    const pre = page.locator('.presets');
    await pre.scrollIntoViewIfNeeded();
    const pb = (await pre.boundingBox())!;
    const sheet = (await page.locator('.picker-pop').boundingBox())!;
    const after = await picks.evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().bottom)));
    expect(pb.y, where).toBeGreaterThanOrEqual(after - 0.5);
    expect(pb.y + pb.height, where).toBeLessThanOrEqual(sheet.y + sheet.height + 0.5);
    expect(pb.x, where).toBeGreaterThanOrEqual(sheet.x);
    expect(pb.x + pb.width, where).toBeLessThanOrEqual(sheet.x + sheet.width);
    expect(pb.height, where).toBeGreaterThanOrEqual(28);
    await page.locator('.picker-pop').evaluate((el) => (el.scrollTop = 0));
    // the sheet lies over everything under the bar (the file player too)
    const mid = boxes[6];
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.picker-pop'), [(mid.l + mid.r) / 2, (mid.t + mid.b) / 2])).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), where).toBe(true);
    // one chosen: on the stage, the sheet shut, the button says so
    await page.locator('.pick[aria-label="Clarinet"]').click();
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.instruments')).toBeHidden();
    await expect(open).toHaveText('clarinet');
    await expect.poll(() => page.evaluate(() => (window as any).__piano.instrument)).toBe('clarinet');
    // a touch outside shuts it, and Esc
    await open.click();
    await expect(page.locator('.instruments')).toBeVisible();
    await page.touchscreen.tap(vp.width - 20, vp.height - 20);
    await expect(page.locator('.instruments')).toBeHidden();
    await open.click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.instruments')).toBeHidden();
  }
  // an orchestra: the button counts the players; the sheet stays open while instruments are tapped in
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${SYMPHONY}&view=2d`);
  const open = page.locator('.pick-open');
  await expect(open).toHaveText('18 players');
  await expect(page.locator('.ens-toggle')).toHaveAttribute('aria-pressed', 'true');
  await open.click();
  await expect(page.locator('.pick[aria-label="Flute"] .pick-n')).toHaveText('×2');
  await page.locator('.pick[aria-label="Trombone"]').click();
  await expect(open).toHaveText('19 players');
  await expect(page.locator('.instruments')).toBeVisible();
  await page.locator('.pick[aria-label="Timpani"]').click();
  await expect(page.locator('.instruments')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the bar on a phone: the button, the orchestra, the lamp and the two pages on one row; under it the readout beside the view, then the spectrum; no taller with a chord sounding', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout');
  for (const size of [null, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    if (size) await page.setViewportSize(size);
    const where = size ? `${size.width}` : 'Pixel 7';
    await page.goto('/piano/upright?view=3d');
    await startAudio(page);
    await expect(page.locator('.stage-3d')).toBeVisible();
    const vp = page.viewportSize()!;
    const bar = await box(page, 'header.top');
    const row = [await box(page, '.pick-open'), await box(page, '.ens-toggle'), await box(page, '.lamp'), await box(page, 'header nav a >> nth=0'), await box(page, 'header nav a >> nth=1')];
    for (const [i, b] of row.entries()) {
      expect(b.y, where).toBeGreaterThanOrEqual(bar.y - 0.5);
      expect(b.y + b.height, where).toBeLessThanOrEqual(bar.y + bar.height + 0.5);
      expect(b.x + b.width, where).toBeLessThanOrEqual(vp.width);
      if (i) expect(b.x, `${where}: #${i} clear of #${i - 1}`).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].width);
    }
    // the pages' links: a finger's height
    expect(row[3].height).toBeGreaterThanOrEqual(28);
    // in the band: the readout on the left, the view (with the piano's case, in 3D) on the right, the spectrum under both
    const band = async () => (await box(page, '.stage-top')).height;
    const before = await band();
    await on(page, [58, 61, 65, 68]);
    await expect(head(page)).toHaveText('B♭3 D♭4 F4 A♭4');
    expect(await band(), where).toBe(before);
    const [r, t, s, h] = [await box(page, '.readout'), await box(page, '.stage-tools'), await box(page, '.spec-wrap'), await box(page, '.r-note')];
    expect(r.x + r.width, where).toBeLessThanOrEqual(t.x);
    expect(h.x + h.width, where).toBeLessThanOrEqual(t.x);
    expect(await head(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), where).toBe(true);
    expect(t.x + t.width, where).toBeLessThanOrEqual(vp.width);
    expect(s.y, where).toBeGreaterThanOrEqual(Math.max(r.y + r.height, t.y + t.height) - 0.5);
    await expect(page.locator('.case-toggle')).toBeVisible();
    await expect(page.locator('.scope')).toBeHidden();
    await off(page, [58, 61, 65, 68]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), where).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1), where).toBe(true);
  }
});

test('the view is one choice of three, side by side: 2d, vector, 3d; the one shown is the one lit; the address follows', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/cello?view=2d');
  const [flat, vec, dim] = [page.locator('.view-2d'), page.locator('.vec-toggle'), page.locator('.dim-toggle')];
  const lit = async () => (await Promise.all([flat, vec, dim].map((b) => b.getAttribute('aria-pressed')))).join();
  await expect(page.locator('.view-seg button')).toHaveText(['2d', 'vector', '3d']);
  expect(await lit()).toBe('true,false,false');
  await vec.click();
  await expect.poll(lit).toBe('false,true,false');
  await expect(page.locator('html')).toHaveAttribute('data-style', 'vector');
  await expect.poll(() => page.evaluate(() => location.search)).toContain('view=vector');
  await dim.click();
  await expect(page.locator('.stage-3d')).toBeVisible({ timeout: 20_000 });
  await expect.poll(lit).toBe('false,false,true');
  await expect.poll(() => page.evaluate(() => location.search)).toContain('view=3d');
  // 2d from 3D: the drawing, not the lines it was on before
  await flat.click();
  await expect.poll(lit).toBe('true,false,false');
  await expect(page.locator('.stage-3d')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.dataset.style ?? null)).toBeNull();
  await expect.poll(() => page.evaluate(() => location.search)).not.toContain('view=');
  // each of the other two turns off where it is pressed again
  await vec.click();
  await vec.click();
  await expect.poll(lit).toBe('true,false,false');
  // the three sit in one frame, in the bar on a computer and in the band on a phone
  const seg = await box(page, '.view-seg');
  const host = await box(page, (page.viewportSize()?.width ?? 0) > 760 ? 'header.top' : '.stage-top');
  expect(seg.y).toBeGreaterThanOrEqual(host.y - 0.5);
  expect(seg.y + seg.height).toBeLessThanOrEqual(host.y + host.height + 0.5);
  expect(errors).toEqual([]);
});

test('the pages: two words in the corner, the open one marked; the stage’s controls leave the bar with the stage and come back with it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/violin?view=2d');
  const [m, n] = [page.locator('header nav a[data-route="measurements"]'), page.locator('header nav a[data-route="notes"]')];
  await expect(m).not.toHaveAttribute('aria-current', 'page');
  await expect(page.locator('header .back')).toBeHidden();
  await m.click();
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/measurements');
  await expect(m).toHaveAttribute('aria-current', 'page');
  expect(await m.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  // the stage's own controls are gone from the bar; the way back shows
  for (const sel of ['.picker', '.pick-open', '.view-seg', '.ens-toggle']) await expect(page.locator(sel), sel).toHaveCount(0);
  await expect(page.locator('header .back')).toBeVisible();
  const slim = (await box(page, 'header.top')).height;
  await n.click();
  await expect(n).toHaveAttribute('aria-current', 'page');
  await expect(m).not.toHaveAttribute('aria-current', 'page');
  await page.locator('header .back').click();
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/violin');
  await expect(page.locator('.view-seg')).toBeVisible();
  await expect(page.locator('.picker')).toHaveCount(1);
  await expect(page.locator('.view-seg')).toHaveCount(1);
  expect((await box(page, 'header.top')).height).toBeGreaterThanOrEqual(slim);
  await openPicker(page);
  await expect(page.locator('.pick[aria-pressed="true"]')).toHaveAttribute('aria-label', 'Violin');
  expect(errors).toEqual([]);
});
