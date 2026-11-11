import type { Page } from '@playwright/test';

/** Where the picker is folded behind its button (a phone either way up, a narrow window), open its sheet:
 *  the instruments and the piano's kind are in it. Where they sit in the bar, nothing to do. */
export async function openPicker(page: Page): Promise<void> {
  const b = page.locator('.pick-open');
  if ((await b.isVisible()) && (await b.getAttribute('aria-expanded')) !== 'true') await b.click();
}

/** Shut the picker's sheet where it is open (an orchestra keeps it open while instruments are tapped in, over
 *  the band under the bar). */
export async function closePicker(page: Page): Promise<void> {
  const b = page.locator('.pick-open');
  if ((await b.isVisible()) && (await b.getAttribute('aria-expanded')) === 'true') await page.keyboard.press('Escape');
}
