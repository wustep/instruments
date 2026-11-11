// The Notes page names who built the instruments, with icon buttons (not text links)
// to the author's site and X.
import { test, expect } from '@playwright/test';

test('the notes name who built them, with icons to the site and X', async ({ page }) => {
  await page.goto('/notes');
  const credit = page.locator('.notes .credit');
  await expect(credit).toBeVisible();
  await expect(credit).toContainText('Built by Stephen Wu');
  await expect(credit).toContainText('with Opus 5.5 and Fable 5.2.');
  const site = credit.locator('a[href="https://wustep.me"]');
  const x = credit.locator('a[href="https://x.com/wustep"]');
  await expect(site).toHaveAttribute('aria-label', "Stephen Wu’s site");
  await expect(x).toHaveAttribute('aria-label', 'Stephen Wu on X');
  await expect(site.locator('svg')).toHaveCount(1);
  await expect(x.locator('svg')).toHaveCount(1);
  await expect(site).not.toHaveText(/wustep|Stephen|site/i);
  await expect(x).not.toHaveText(/wustep|X|Twitter/i);
});
