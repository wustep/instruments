// The double bass end to end: the picker, the keys' compass, the worklet at the sample rates the site
// meets (22.05 to 96 kHz), its own piece from the overlay, and Orchestra mode with a quintet file. The
// file is constructed (no copyrighted music): five tracks with the names and programs of Max Richter's
// "On the Nature of Daylight" string quintet, Violin I, Violin II, Viola, Violoncello and Contrabass on
// GM 40/40/41/42/43, the bass line below the cello's C as that quintet's is.
import { test, expect, type Page } from '@playwright/test';
import { smf } from '../apps/web/test/smf.ts';

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
const ens = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return { lineup: e.lineup as string[], engines: e.parts.filter((p: any) => p.engine).length as number, kinds: e.parts.map((p: any) => p.engine?.instrument ?? null) as (string | null)[] };
  });

test('the double bass: “bass” under its glyph, its full name to a screen reader; the keys E1–G4; at pitch through the worklet at 22.05, 44.1, 48 and 96 kHz', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const pick = page.locator('.instruments').getByRole('button', { name: 'Double bass' });
  await expect(pick.locator('.pick-name')).toHaveText('bass');
  await expect(pick.locator('svg.glyph')).toBeVisible();
  await pick.click();
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'bass', null, { timeout: 15_000 });
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  // its compass: E1 (28) to G4 (67), the keys outside it set aside
  await expect(page.locator('.keyboard .key[data-midi="28"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="27"]')).toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="67"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="68"]')).toHaveClass(/\bout\b/);
  for (const [rate, midi] of [[22050, 40], [44100, 28], [48000, 40], [48000, 55], [96000, 40]] as const) {
    const out = await page.evaluate(async ([fs, m]) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ instrument: 'bass', sampleRate: fs, duration: 1.6, params: { room: 0, vibrato: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: 90 } }] });
      // the mono sum (both microphones), its pitch by autocorrelation over 0.9–1.4 s
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const x = L.map((v, i) => 0.5 * (v + R[i]));
      const f = 440 * 2 ** ((m - 69) / 12);
      const s0 = Math.round(0.9 * fs);
      const W = Math.round(0.4 * fs);
      const ac = (lag: number) => {
        let s = 0;
        for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag];
        return s;
      };
      let best = -Infinity;
      let bl = 0;
      for (let lag = Math.floor(fs / (f * 1.05)); lag <= Math.ceil(fs / (f * 0.95)); lag++) {
        const v = ac(lag);
        if (v > best) [best, bl] = [v, lag];
      }
      const a = ac(bl - 1);
      const b = ac(bl);
      const c = ac(bl + 1);
      const fm = fs / (bl + (0.5 * (a - c)) / (a - 2 * b + c));
      let peak = 0;
      for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      return { cents: 1200 * Math.log2(fm / f), peak, n: x.length };
    }, [rate, midi] as const);
    const who = `${rate} Hz, MIDI ${midi}`;
    expect(out.n, who).toBe(Math.round(1.6 * rate));
    expect(out.peak, who).toBeGreaterThan(0.01);
    expect(out.peak, who).toBeLessThanOrEqual(1);
    expect(Math.abs(out.cents), who).toBeLessThan(6);
  }
  expect(errors).toEqual([]);
});

test('the double bass plays its own piece from the overlay (Bach’s Menuet II, as bassists play it), in its compass', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  await page.locator('.instruments').getByRole('button', { name: 'Double bass' }).click();
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'bass', null, { timeout: 15_000 });
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Bach, Cello Suite No\. 1, Menuet II/);
  await page.locator('.pl-play').click();
  await expect(page.locator('.player').getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as any).__player.demo?.instrument)).toBe('bass');
  await expect(page.locator('.key.down')).not.toHaveCount(0, { timeout: 4000 });
  const down = await page.locator('.key.down').evaluateAll((ks) => ks.map((k) => Number(k.getAttribute('data-midi'))));
  for (const m of down) {
    expect(m).toBeGreaterThanOrEqual(28);
    expect(m).toBeLessThanOrEqual(67);
  }
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('orchestra: a quintet file (Violin I/II, Viola, Violoncello, Contrabass; GM 40/40/41/42/43) plays on two violins, a viola, a cello and a real double bass; the routing offers the bass; two basses by hand', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
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
  const file = smf(480, tracks);
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'quintet.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, Array.from(file));
  await expect.poll(async () => (await ens(page)).engines, { timeout: 10_000 }).toBe(5);
  expect((await ens(page)).lineup).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
  expect((await ens(page)).kinds).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
  // the bass line on the bass, as written (no octave move: Contrabass's B♭1 and A1 are its own)
  await expect(page.locator('.pl-line').nth(4)).toHaveAttribute('data-voice', 'bass');
  await expect(page.locator('.pl-line').nth(3)).toHaveAttribute('data-voice', 'cello');
  const shifts = await page.evaluate(() => (window as any).__orchestra.ensemble.plan.lines.map((rs: any[]) => rs.map((r) => r.shift)));
  expect(shifts).toEqual([[0], [0], [0], [0], [0]]);
  // the bass engine plays the line: it holds the line's notes while the file plays
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts[4].down.size as number), { timeout: 5000 }).toBeGreaterThan(0);
  // a line's menu offers the double bass; the cello's line moved to it, and back
  await page.locator('.pl-line').nth(3).click();
  const menu = page.locator('.pl-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.pl-pick[aria-label="double bass"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // by hand: the ensemble's picker adds a second bass (each its own engine)
  await page.locator('.instruments').getByRole('button', { name: 'Double bass' }).click();
  await expect.poll(async () => (await ens(page)).lineup.filter((v) => v === 'bass').length, { timeout: 8000 }).toBe(2);
  await expect.poll(async () => (await ens(page)).kinds.filter((v) => v === 'bass').length, { timeout: 8000 }).toBe(2);
  expect(errors).toEqual([]);
});
