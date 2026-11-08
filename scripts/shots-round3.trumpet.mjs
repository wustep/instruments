// the trumpet on the stage: a held note (valves down for the fingering), and a high one
const play = (notes) => async (page) => {
  await page.evaluate(async (ns) => {
    await window.__piano.start();
    await window.__piano.setInstrument('trumpet');
    for (const [m, v] of ns) {
      window.__piano.noteOn(m, v, 'keys');
      await new Promise((r) => setTimeout(r, 400));
    }
  }, notes);
};
export default [
  ['desktop-low', { route: '', action: play([[55, 96]]), wait: 900 }],
  ['desktop-high', { route: '', action: play([[77, 100]]), wait: 900 }],
  ['phone', { route: '', device: 'phone', action: play([[62, 96]]), wait: 900 }],
];
