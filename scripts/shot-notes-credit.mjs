import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(process.env.OUT || 'artifacts/realistic-3d/final-symphony/notes-credit');
const tag = process.env.TAG || 'after';
mkdirSync(outDir, { recursive: true });
const base = process.env.SHOT_URL || 'http://127.0.0.1:4489';

const browser = await chromium.launch();

async function shot(name, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.goto(base + '/notes', { waitUntil: 'networkidle' });
  const credit = page.locator('.notes .credit');
  await credit.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box = await credit.boundingBox();
  if (!box) throw new Error('no credit box for ' + name);
  const padX = 48;
  const padTop = 90;
  const padBot = 48;
  const clip = {
    x: Math.max(0, box.x - padX),
    y: Math.max(0, box.y - padTop),
    width: Math.min(viewport.width - Math.max(0, box.x - padX), Math.max(box.width + padX * 2, 720)),
    height: box.height + padTop + padBot,
  };
  const path = `${outDir}/${name}-${tag}.jpg`;
  await page.screenshot({ path, type: 'jpeg', quality: 92, clip });
  await page.close();
  console.log('wrote', path, clip);
}

await shot('notes-credit-desktop', { width: 1280, height: 900 });
await shot('notes-credit-phone', { width: 390, height: 844 });
await browser.close();
