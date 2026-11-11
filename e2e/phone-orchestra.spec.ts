// A full score on a phone held upright, in 3D: thirteen parts (flute, oboe, clarinet, bassoon, horn,
// trumpet, trombone, timpani, two violins, viola, cello, double bass) on thirteen seats. The file
// player's lines sit in one row under its icons (a second row lay over the back row: the brass, the
// timpani); where a row cannot hold them (a narrower screen) and they wrap, the orchestra is framed out
// from under them. The lamp's hint beside the orchestra's count is whole, never cut short ("tap a …").
// The file is constructed (track names and programs only; no music of anyone's).
import { test, expect, type Page } from '@playwright/test';
import { smf } from '../apps/web/test/smf.ts';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || /webgl|GL_[A-Z_]{4,}|feedback loop|framebuffer/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`);
  });
  return errors;
};

const PARTS = [
  ['Flute', 73, 74],
  ['Oboe', 68, 69],
  ['Clarinet', 71, 65],
  ['Bassoon', 70, 50],
  ['Horn', 60, 57],
  ['Trumpet', 56, 62],
  ['Trombone', 57, 50],
  ['Timpani', 47, 45],
  ['Violin I', 40, 77],
  ['Violin II', 40, 69],
  ['Viola', 41, 62],
  ['Cello', 42, 50],
  ['Double Bass', 43, 38],
] as const;
const SEATS = 'flute,oboe,clarinet,bassoon,horn,trumpet,trombone,timpani,violin,violin,viola,cello,bass';
const THIRTEEN = `/orchestra?v=1&seats=${SEATS}&lines=${PARTS.map(([n, p], i) => `${n.replace(/ /g, '+')}~${p}:${i + 1}`).join(',')}&view=3d`;

/** thirteen tracks, each named and programmed as its part, a few long notes each */
function score(): number[] {
  const name = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
  const tracks: [number, ...number[]][][] = [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]];
  PARTS.forEach(([n, prog, m], i) => {
    const ch = i < 9 ? i : i + 1;
    const t: [number, ...number[]][] = [[0, ...name(n)], [0, 0xc0 | ch, prog]];
    for (let r = 0; r < 4; r++) t.push([0, 0x90 | ch, m, 70], [1920, 0x80 | ch, m, 0]);
    tracks.push(t);
  });
  return Array.from(smf(480, tracks));
}
const drop = (page: Page, file: number[]) =>
  page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'thirteen.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, file);

/** the player's lines and the orchestra as drawn (every vertex), in page pixels */
const seen = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__stage3d;
    const cv = s.el.getBoundingClientRect();
    const lines = [...document.querySelectorAll<HTMLElement>('.pl-lines .pl-line')].map((e) => e.getBoundingClientRect());
    const strip = document.querySelector('.pl-lines')!.getBoundingClientRect();
    const b = s.box() as { x0: number; y0: number; x1: number; y1: number } | null;
    return {
      n: lines.length,
      rows: new Set(lines.map((r) => Math.round(r.top))).size,
      chip: lines.length ? lines[0].width : 0,
      strip: { top: strip.top, bottom: strip.bottom },
      player: document.querySelector('.player')!.getBoundingClientRect().bottom,
      box: b && { x0: cv.left + b.x0, x1: cv.left + b.x1, y0: cv.top + b.y0, y1: cv.top + b.y1 },
      stage: { left: cv.left, right: cv.right, top: cv.top, bottom: cv.bottom },
      seats: (window as any).__orchestra.ensemble.parts.length as number,
      flying: !s.home || Math.hypot(...(s.eye as number[]).map((v: number, k: number) => v - (s.home.target[k] + s.home.dist * [Math.cos(s.home.pitch) * Math.sin(s.home.yaw), Math.sin(s.home.pitch), -Math.cos(s.home.pitch) * Math.cos(s.home.yaw)][k]))) > 1e-3,
      scroll: [document.documentElement.scrollWidth, innerWidth],
    };
  });

test('a phone held upright, a thirteen-part score in 3D: the player’s lines in one row, the whole orchestra under them (back row and timpani too); on a narrower screen, where they wrap, it is framed under both rows', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'a phone’s layout');
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  /** the file's lines shown, and the camera at rest again (it settles under them over 0.4 s where they
   *  move its frame) */
  const settled = async () => {
    await expect.poll(async () => (await seen(page)).n, { timeout: 30_000 }).toBe(13);
    await page.waitForTimeout(700);
    await expect.poll(async () => {
      const v = await seen(page);
      return v.seats === 13 && !!v.box && !v.flying;
    }, { timeout: 15_000 }).toBe(true);
    return seen(page);
  };
  const under = (v: Awaited<ReturnType<typeof seen>>, where: string) => {
    const b = v.box!;
    expect(b.y0, `${where}: the back row under the player’s lines`).toBeGreaterThanOrEqual(v.strip.bottom);
    expect(b.y1, `${where}: the front row on the stage`).toBeLessThanOrEqual(v.stage.bottom);
    expect(b.x0, `${where}: left`).toBeGreaterThanOrEqual(v.stage.left);
    expect(b.x1, `${where}: right`).toBeLessThanOrEqual(v.stage.right);
    expect(v.scroll[0], `${where}: no horizontal scroll`).toBeLessThanOrEqual(v.scroll[1]);
  };
  // this project's phone (412 px wide), an iPhone with Safari's bars (390 × 664), a small one (360 × 640)
  const vp = page.viewportSize()!;
  for (const size of [vp, { width: 390, height: 664 }, { width: 360, height: 640 }]) {
    await page.setViewportSize(size);
    await page.goto(THIRTEEN);
    await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3 && (window as any).__orchestra.ensemble.parts.length === 13, null, { timeout: 30_000 });
    // the orchestra as it sits before a file: its height on the stage
    const before = (await seen(page)).box!;
    await drop(page, score());
    const v = await settled();
    const where = `${size.width}×${size.height}`;
    expect(v.rows, `${where}: one row of lines`).toBe(1);
    expect(v.chip, `${where}: each a chip of 22 px or more`).toBeGreaterThanOrEqual(22);
    under(v, where);
    // and no smaller for them: the lines' row lay over nothing
    expect((v.box!.y1 - v.box!.y0) / (before.y1 - before.y0), `${where}: as large as before the file`).toBeGreaterThan(0.97);
    test.info().annotations.push({ type: `thirteen lines ${where}`, description: JSON.stringify({ chip: v.chip, strip: v.strip, top: v.box!.y0 }) });
  }
  // the narrowest phone (320 px): thirteen chips of 22 px do not fit one row; the orchestra moves out
  // from under the second (a stage tall enough that two rows are within the two fifths of it the
  // framing will clear)
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(THIRTEEN);
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3 && (window as any).__orchestra.ensemble.parts.length === 13, null, { timeout: 30_000 });
  await drop(page, score());
  const w = await settled();
  expect(w.rows, '320 px: the lines wrap').toBe(2);
  under(w, '320×740');
  expect(errors).toEqual([]);
});

test('a phone: the lamp’s hint is never cut short: whole on one line, on two beside an orchestra’s count or a long name, or the lamp alone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'a phone’s layout');
  const hint = () =>
    page.evaluate(() => {
      const t = document.querySelector<HTMLElement>('.lamp-text')!;
      const s = document.querySelector<HTMLElement>('.status')!;
      const lamp = document.querySelector('.lamp')!.getBoundingClientRect();
      const links = document.querySelector('.links')!.getBoundingClientRect();
      const r = t.getBoundingClientRect();
      return { fit: s.dataset.fit, text: t.textContent, shown: r.width > 0, cutX: t.scrollWidth > t.clientWidth, lines: Math.round(r.height / 12), cutY: t.scrollHeight > t.clientHeight + 6, lamp: lamp.width, clear: r.width === 0 || r.right <= links.left, title: s.title };
    });
  const seen: Record<string, string> = {};
  for (const width of [412, 390, 375, 360, 320]) {
    await page.setViewportSize({ width, height: 700 });
    for (const path of [`/orchestra?v=1&seats=${SEATS}`, '/piano', '/timpani', '/trombone']) {
      await page.goto(path);
      await expect(page.locator('.lamp')).toBeVisible();
      await expect.poll(async () => (await hint()).fit).toBeTruthy();
      const h = await hint();
      const where = `${width} px ${path.slice(0, 10)}`;
      expect(h.text, where).toBe('tap a key');
      expect(h.title, where).toBe('tap a key to start');
      expect(h.lamp, `${where}: the lamp shows`).toBeGreaterThan(0);
      if (h.fit === 'none') expect(h.shown, `${where}: the lamp alone`).toBe(false);
      else {
        // every word of it, on one line or two, and not under the pages' links
        expect(h.cutX || h.cutY, `${where}: cut short`).toBe(false);
        expect(h.lines, where).toBe(h.fit === 'two' ? 2 : 1);
        expect(h.clear, where).toBe(true);
      }
      seen[`${width}${path.slice(0, 6)}`] = h.fit!;
    }
  }
  // the phones people hold: the words are there (one line on this project's, two on an iPhone's 390 px
  // beside "13 players")
  expect(seen['412/orche']).toBe('line');
  expect(seen['390/orche']).toBe('two');
  expect(seen['390/piano']).toBe('line');
  expect(seen['320/orche']).toBe('none');
});
