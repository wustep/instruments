// An SVG as a PNG (headless Chrome): node artifacts/bow-polish/tools/svg2png.mjs <in.svg> <out.png>
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [inp, out] = process.argv.slice(2);
const svg = readFileSync(inp, 'utf8');
const m = /width="(\d+)" height="(\d+)"/.exec(svg);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(m[1]), height: Number(m[2]) } });
await p.setContent(`<body style="margin:0;background:#14110f">${svg}</body>`);
await p.screenshot({ path: out });
await b.close();
