// the piano's action and structure: grand and upright, a held chord with the pedal
const chord = [[36, 96], [43, 80], [48, 76], [55, 76], [60, 84], [64, 88], [67, 96]];
const play = (preset, soft = false) => async (page) => {
  await page.evaluate(async ([pr, sf, ch]) => {
    await window.__piano.start();
    await window.__piano.setPreset(pr);
    document.querySelectorAll('.presets button').forEach((b) => b.textContent === pr && b.click());
    window.__piano.sustain(1);
    if (sf) window.__piano.soft(1);
    for (const [m, v] of ch) {
      window.__piano.noteOn(m, v, 'keys');
      await new Promise((r) => setTimeout(r, 70));
    }
  }, [preset, soft, chord]);
};
export default [
  ['desktop-grand', { route: '', action: play('grand'), wait: 160 }],
  ['desktop-grand-una-corda', { route: '', action: play('grand', true), wait: 900 }],
  ['desktop-upright', { route: '', action: play('upright'), wait: 160 }],
  ['phone-grand', { route: '', device: 'phone', action: play('grand'), wait: 160 }],
  ['phone-upright', { route: '', device: 'phone', action: play('upright'), wait: 160 }],
];
