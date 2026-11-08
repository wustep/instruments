// stopping points on the strings (with vibrato) and the flute's holes
const play = (inst, notes, vib) => async (page) => {
  await page.evaluate(async ([i, ns, v]) => {
    await window.__piano.start();
    await window.__piano.setInstrument(i);
    if (v !== null) window.__piano.setParams({ vibrato: v });
    for (const [m, vel] of ns) window.__piano.noteOn(m, vel, 'keys');
  }, [inst, notes, vib]);
};
export default [
  ['desktop-violin-double-stop', { route: '', action: play('violin', [[64, 90], [71, 90]], 20), wait: 1600 }],
  ['desktop-cello-vibrato', { route: '', action: play('cello', [[50, 96]], 30), wait: 1600 }],
  ['phone-viola', { route: '', device: 'phone', action: play('viola', [[60, 96]], 20), wait: 1600 }],
];
export const flute = [
  ['desktop-flute-low', { route: '', action: play('flute', [[62, 90]], 0.12), wait: 1500 }],
  ['desktop-flute-high', { route: '', action: play('flute', [[81, 90]], 0.12), wait: 1500 }],
  ['phone-flute', { route: '', device: 'phone', action: play('flute', [[67, 90]], 0.12), wait: 1500 }],
];
