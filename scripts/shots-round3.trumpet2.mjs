// the redrawn trumpet (round 3b): a low note with three valves down, a high open note, phone
const play = (notes) => async (page) => {
  await page.evaluate(async (ns) => {
    try { localStorage.setItem('piano-model.3d', '0'); } catch {}
    await window.__piano.start();
    await window.__piano.setInstrument('trumpet');
    for (const [m, v] of ns) {
      window.__piano.noteOn(m, v, 'keys');
      await new Promise((r) => setTimeout(r, 400));
    }
  }, notes);
};
export default [
  ['desktop-low-123', { route: '', instrument: 'trumpet', action: play([[52, 96]]), wait: 900 }],
  ['desktop-mid-13', { route: '', instrument: 'trumpet', action: play([[56, 90]]), wait: 900 }],
  ['desktop-high-open', { route: '', instrument: 'trumpet', action: play([[77, 100]]), wait: 900 }],
  ['phone', { route: '', device: 'phone', instrument: 'trumpet', action: play([[62, 96]]), wait: 900 }],
];
