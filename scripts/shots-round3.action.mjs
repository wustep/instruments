// one key's action, close up: open it by clicking the note's strings, then play it
const open = (preset, midi, play, afterMs) => async (page) => {
  await page.evaluate(async (pr) => {
    await window.__piano.start();
    await window.__piano.setPreset(pr);
    document.querySelectorAll('.presets button').forEach((b) => b.textContent === pr && b.click());
  }, preset);
  await page.waitForTimeout(500);
  const key = page.locator(`.key[data-midi="${midi}"]`);
  await key.scrollIntoViewIfNeeded();
  const kb = await key.boundingBox();
  const cv = await page.locator('.stage-cv').boundingBox();
  await page.mouse.click(kb.x + kb.width / 2, cv.y + cv.height * (preset === "upright" ? 0.55 : 0.8));
  await page.waitForSelector('.av-panel', { timeout: 3000 });
  if (play) {
    await page.waitForTimeout(300);
    await page.evaluate((m) => window.__piano.noteOn(m, 96, 'keys'), midi);
    await page.waitForTimeout(afterMs);
  }
};
export default [
  ['desktop-grand-rest', { route: '', action: open('grand', 48, false, 0), wait: 400 }],
  ['desktop-grand-flight', { route: '', action: open('grand', 48, true, 380), wait: 0 }],
  ['desktop-grand-checked', { route: '', action: open('grand', 48, true, 2600), wait: 0 }],
  ['desktop-upright-flight', { route: '', action: open('upright', 48, true, 380), wait: 0 }],
  ['desktop-upright-checked', { route: '', action: open('upright', 48, true, 2600), wait: 0 }],
  ['phone-grand-checked', { route: '', device: 'phone', action: open('grand', 60, true, 2600), wait: 0 }],
];
