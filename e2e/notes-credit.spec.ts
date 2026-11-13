// The Notes page names who built the instruments, with icon buttons (not text links)
// to the author's site and X, after the sentence, not inside it; and, over that line, what the work
// stands on that is not a paper, each a link: Chimera (the vector view is after it; none of its code
// is used), the Mutopia Project, the Iowa samples, VSCO 2 CE and VCSL (the harp's two dynamics), three.js.
import { test, expect } from '@playwright/test';

test('the notes name who built them, with icons to the site and X', async ({ page }) => {
  await page.goto('/notes');
  const credit = page.locator('.notes .credit');
  await expect(credit).toBeVisible();
  const line = credit.locator('.credit-line');
  await expect(line).toHaveText('Built by Stephen Wu with Opus 5.5 and Fable 5.2.');
  await expect(line.locator('a')).toHaveCount(0);
  const icons = credit.locator('.credit-icons');
  const site = icons.locator('a[href="https://wustep.me"]');
  const x = icons.locator('a[href="https://x.com/wustep"]');
  await expect(site).toHaveAttribute('aria-label', 'Stephen Wu’s site');
  await expect(x).toHaveAttribute('aria-label', 'Stephen Wu on X');
  await expect(site).toHaveAttribute('data-tip', 'Stephen Wu’s site');
  await expect(x).toHaveAttribute('data-tip', 'Stephen Wu on X');
  await expect(site.locator('svg')).toHaveCount(1);
  await expect(x.locator('svg')).toHaveCount(1);
  await expect(site).not.toHaveText(/wustep|Stephen|site/i);
  await expect(x).not.toHaveText(/wustep|X|Twitter/i);
  // the sentence comes first; the two icons follow it, together
  await expect(credit.locator('.credit-line, .credit-icons, .credit-icons a')).toHaveCount(4);
});

test('the notes thank what the work stands on, each a link: Chimera (the vector view’s inspiration, none of its code), Mutopia, the Iowa samples, VSCO 2 CE and VCSL, three.js', async ({ page }) => {
  await page.goto('/notes');
  const thanks = page.locator('.notes .thanks');
  await expect(thanks).toBeVisible();
  await expect(thanks).toContainText('The vector view is after Chimera, Jameson Hodge’s vocal synth: its screens were the inspiration, and none of its code is used.');
  const links: [string, string][] = [
    ['Chimera', 'https://github.com/jamesondh/chimera-vocal-synth'],
    ['Mutopia Project', 'https://www.mutopiaproject.org'],
    ['University of Iowa Musical Instrument Samples', 'https://theremin.music.uiowa.edu/MIS.html'],
    ['VSCO 2 Community Edition', 'https://github.com/sgossner/VSCO-2-CE'],
    ['Versilian Community Sample Library', 'https://github.com/sgossner/VCSL'],
    ['three.js', 'https://threejs.org'],
  ];
  await expect(thanks.locator('a')).toHaveCount(links.length);
  for (const [name, href] of links) {
    const a = thanks.getByRole('link', { name, exact: true });
    await expect(a).toHaveAttribute('href', href);
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', /noopener/);
  }
  // it sits between the sources and the line that says who built them, and fits the page
  const [refs, t, credit] = await Promise.all(['.notes .refs', '.notes .thanks', '.notes .credit'].map((s) => page.locator(s).boundingBox()));
  expect(t!.y).toBeGreaterThanOrEqual(refs!.y + refs!.height);
  expect(credit!.y).toBeGreaterThanOrEqual(t!.y + t!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});
