// An SVG file as a PNG (Chrome draws it): node scripts/svg-png.mjs <in.svg> <out.png> [scale]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [src, out, scale = '1'] = process.argv.slice(2);
const svg = readFileSync(src, 'utf8');
const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale });
await page.setContent(`<body style="margin:0;background:#14110f">${svg}</body>`);
await page.screenshot({ path: out });
await browser.close();
