// the stage's icon-only controls explain themselves on hover / focus / touch
const hover = (sel) => async (page) => {
  await page.evaluate(() => window.__piano.start());
  await page.waitForFunction(() => window.__piano?.piano, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.locator(sel).hover();
};
const tap = (sel) => async (page) => {
  await page.evaluate(() => window.__piano.start());
  await page.waitForFunction(() => window.__piano?.piano, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const b = await page.locator(sel).boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};
export default [
  ['desktop-lid', { route: '', action: hover('.grip-lid'), wait: 600 }],
  ['desktop-reverb', { route: '', action: hover('.grip-room'), wait: 600 }],
  ['desktop-octave', { route: '', action: hover('.oct-btn >> nth=1'), wait: 600 }],
  ['phone-reverb', { route: '', device: 'phone', action: tap('.grip-room'), wait: 200 }],
];
