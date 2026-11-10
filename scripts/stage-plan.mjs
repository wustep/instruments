// The hall seen from above, as the engine's room hears an ensemble: the pair of microphones (cardioids
// 0.6 m apart at ±50°, 3.2 m in front of the stage's middle) and where each part's sound comes from:
// before, every part from the stage's middle (hollow ring); after, each from its seat (filled). Reads
// the seats from the JSON that scripts/render-orchestra.ts --json writes (<piece>.json).
//   node scripts/stage-plan.mjs <dir with the JSON> out.png [haydn bach handel]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out, ...ids] = process.argv.slice(2);
const pieces = (ids.length ? ids : ['haydn', 'bach', 'handel']).map((id) => JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')));
const TITLES = { haydn: 'Haydn, quartet', bach: 'Bach, Brandenburg 5', handel: 'Handel, La Réjouissance' };
const SHORT = { violin: 'vln', viola: 'vla', cello: 'vc', flute: 'fl', trumpet: 'tpt', grand: 'grand', upright: 'upright' };

const PW = 300;
const PH = 330;
const S = 48; // px per metre
let body = '';
pieces.forEach((p, i) => {
  const ox = 16 + i * (PW + 16);
  // stage x → px (−3…+3 m); depth: the microphones 3.2 m in front of the middle, upstage further up
  const X = (x) => ox + PW / 2 + x * S;
  const Y = (z) => 92 + (1.9 - z) * S;
  const micY = Y(-3.2);
  body += `<rect x="${ox}" y="40" width="${PW}" height="${PH}" rx="6" class="panel"/>`;
  body += `<text x="${ox + 12}" y="62" class="group">${TITLES[p.piece] ?? p.piece}</text>`;
  // the microphones and their axes (±50° from straight ahead)
  for (const s of [-1, 1]) {
    const mx = X(s * 0.3);
    body += `<line x1="${mx}" y1="${micY}" x2="${mx + s * Math.sin(0.87) * 40}" y2="${micY - Math.cos(0.87) * 40}" class="axis"/><circle cx="${mx}" cy="${micY}" r="3.5" class="mic"/>`;
  }
  body += `<text x="${X(0)}" y="${micY + 20}" class="note" text-anchor="middle">microphones</text>`;
  // the stage's middle: where every part was
  body += `<circle cx="${X(0)}" cy="${Y(0)}" r="7" class="before"><title>before: every part from here</title></circle>`;
  const count = {};
  p.parts.forEach((q) => {
    if (q.rmsDb < -100) return;
    count[q.voice] = (count[q.voice] ?? 0) + 1;
    const dup = p.parts.filter((r) => r.voice === q.voice).length > 1;
    const [x, z] = q.seat;
    const name = `${SHORT[q.voice] ?? q.voice}${dup ? ` ${count[q.voice]}` : ''}`;
    body += `<g><title>${name}: seat ${x.toFixed(2)}, ${z.toFixed(2)} m</title><line x1="${X(x)}" y1="${Y(z)}" x2="${X(0)}" y2="${micY}" class="ray"/><circle cx="${X(x)}" cy="${Y(z)}" r="5.5" class="after"/>`;
    body += `<text x="${X(x)}" y="${Y(z) + 20}" class="label" text-anchor="middle">${name}</text></g>`;
  });
});
const W = 16 + pieces.length * (PW + 16);
const H = 40 + PH + 46;
const html = `<!doctype html><meta charset="utf-8"><style>
:root { --surface-1: #1a1a19; --surface-2: #222220; --text-primary: #f0efec; --text-secondary: #c3c2b7; --muted: #8f8d86; --series-1: #3987e5; --series-2: #d95926; }
body { margin: 0; background: var(--surface-1); font: 13px/1.3 "IBM Plex Mono", ui-monospace, Menlo, monospace; }
svg text { fill: var(--text-secondary); }
.title { fill: var(--text-primary); font-size: 15px; }
.group { fill: var(--text-primary); }
.label { font-size: 11px; }
.note { fill: var(--muted); font-size: 11px; }
.panel { fill: var(--surface-2); }
.axis { stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 3 3; }
.mic { fill: var(--text-secondary); }
.ray { stroke: var(--series-1); stroke-width: 1; opacity: 0.25; }
.before { fill: none; stroke: var(--series-2); stroke-width: 2; }
.after { fill: var(--series-1); stroke: var(--surface-2); stroke-width: 2; }
</style><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<text x="16" y="26" class="title">The hall from above: where each part's sound comes from</text>
${body}
<circle cx="24" cy="${H - 20}" r="6" class="before"/><text x="36" y="${H - 16}">before: every part from the stage's middle</text>
<circle cx="440" cy="${H - 20}" r="5.5" class="after"/><text x="452" y="${H - 16}">after: each from its seat (1 m = ${S} px)</text>
</svg>`;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
console.log(`wrote ${out}`);
