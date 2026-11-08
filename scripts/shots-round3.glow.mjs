// sympathetic strings: a bass note without the pedal (the undamped treble should stay dark),
// and a pedalled bass note (its octave and fifth ring, faintly)
const hold = (notes, pedal) => async (page) => {
  await page.evaluate(async ([ns, pd]) => {
    await window.__piano.start();
    if (pd) window.__piano.sustain(1);
    for (const [m, v] of ns) {
      window.__piano.noteOn(m, v, 'keys');
      await new Promise((r) => setTimeout(r, 60));
    }
  }, [notes, pedal]);
};
export default [
  ['desktop-bass-no-pedal', { route: '', action: hold([[33, 96], [45, 90]], false), wait: 700 }],
  ['desktop-bass-pedal', { route: '', action: hold([[36, 104]], true), wait: 1800 }],
  ['phone-bass-no-pedal', { route: '', device: 'phone', action: hold([[33, 96], [45, 90]], false), wait: 700 }],
];
