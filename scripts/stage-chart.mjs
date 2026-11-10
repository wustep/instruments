// Where each part of an ensemble is heard: each part's level difference between the channels (R − L,
// dB: left of the middle line is the left channel, right is the right), from the middle of the stage
// (hollow) and from its seat (filled). Reads the JSON that scripts/render-orchestra.ts --json writes
// (<piece>-flat.json and <piece>.json) and draws a PNG through Chrome.
//   node scripts/stage-chart.mjs <dir with the JSON> out.png [haydn bach handel]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out, ...ids] = process.argv.slice(2);
const pieces = (ids.length ? ids : ['haydn', 'bach', 'handel']).map((id) => ({ id, flat: JSON.parse(readFileSync(join(dir, `${id}-flat.json`), 'utf8')), seated: JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')) }));
const TITLES = { haydn: 'Haydn, Emperor Quartet II', bach: 'Bach, Brandenburg 5 III', handel: 'Handel, La Réjouissance' };

const W = 880;
const left = 230;
const right = 40;
const X = (v) => left + ((v + 10) / 20) * (W - left - right);
const rowH = 26;
let y = 78;
let body = '';
for (const p of pieces) {
  body += `<text x="16" y="${y + 4}" class="group">${TITLES[p.id] ?? p.id}</text>`;
  y += 20;
  const count = {};
  for (const [k, a] of p.flat.parts.entries()) {
    const b = p.seated.parts[k];
    // (a part with no sound in the render has no place)
    if (a.rmsDb < -100) continue;
    count[a.voice] = (count[a.voice] ?? 0) + 1;
    const dup = p.flat.parts.filter((q) => q.voice === a.voice).length > 1;
    const name = `${a.voice}${dup ? ` ${count[a.voice]}` : ''}`;
    const x0 = X(-a.ildDb);
    const x1 = X(-b.ildDb);
    const cy = y + rowH / 2;
    body += `<g class="row"><title>${name}: R − L ${(-a.ildDb).toFixed(1)} dB from the middle, ${(-b.ildDb).toFixed(1)} dB from its seat (${b.seat.map((v) => v.toFixed(2)).join(', ')} m)</title>`;
    body += `<text x="32" y="${cy + 4}" class="label">${name}</text><text x="${left - 14}" y="${cy + 4}" class="seat" text-anchor="end">at ${b.seat[0] > 0 ? '+' : b.seat[0] < 0 ? '−' : ''}${Math.abs(b.seat[0]).toFixed(2)} m</text>`;
    body += `<line x1="${x0}" y1="${cy}" x2="${x1}" y2="${cy}" class="link"/>`;
    body += `<circle cx="${x0}" cy="${cy}" r="5" class="before"/><circle cx="${x1}" cy="${cy}" r="5.5" class="after"/></g>`;
    y += rowH;
  }
  y += 14;
}
const H = y + 52;
let grid = '';
for (let v = -10; v <= 10; v += 2) grid += `<line x1="${X(v)}" y1="64" x2="${X(v)}" y2="${H - 48}" class="${v === 0 ? 'zero' : 'grid'}"/><text x="${X(v)}" y="${H - 30}" class="tick" text-anchor="middle">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}</text>`;
const html = `<!doctype html><meta charset="utf-8"><style>
:root { --surface-1: #1a1a19; --text-primary: #f0efec; --text-secondary: #c3c2b7; --muted: #8f8d86; --grid: #2e2d2b; --series-1: #3987e5; --series-2: #d95926; }
body { margin: 0; background: var(--surface-1); font: 13px/1.3 "IBM Plex Mono", ui-monospace, Menlo, monospace; }
svg text { fill: var(--text-secondary); }
.title { fill: var(--text-primary); font-size: 15px; }
.group { fill: var(--text-primary); font-size: 13px; }
.label { fill: var(--text-secondary); }
.seat, .tick, .axis { fill: var(--muted); font-size: 11px; }
.grid { stroke: var(--grid); stroke-width: 1; }
.zero { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 2 3; }
.link { stroke: var(--muted); stroke-width: 2; stroke-linecap: round; opacity: 0.6; }
.before { fill: var(--surface-1); stroke: var(--series-2); stroke-width: 2; }
.after { fill: var(--series-1); stroke: var(--surface-1); stroke-width: 2; }
</style><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<text x="16" y="26" class="title">Where each part is heard: the level difference between the channels</text>
<circle cx="24" cy="46" r="5" class="before"/><text x="36" y="50">from the middle of the stage (main)</text>
<circle cx="330" cy="46" r="5.5" class="after"/><text x="342" y="50">from its seat (this change)</text>
${grid}${body}
<text x="${X(-10)}" y="${H - 12}" class="axis">← louder on the left</text><text x="${X(0)}" y="${H - 12}" class="axis" text-anchor="middle">R − L, dB</text><text x="${X(10)}" y="${H - 12}" class="axis" text-anchor="end">louder on the right →</text>
</svg>`;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
console.log(`wrote ${out}`);
