// keys light only what really sounds: superseded held keys stay pressed but dark
const hold = (inst, notes) => async (page) => {
  await page.evaluate(async ([i, ns]) => {
    await window.__piano.start();
    await window.__piano.setInstrument(i);
    for (const m of ns) {
      window.__piano.noteOn(m, 90, 'keys');
      await new Promise((r) => setTimeout(r, 80));
    }
  }, [inst, notes]);
};
export default [
  ['desktop-flute-two-held', { route: '', instrument: 'flute', action: hold('flute', [72, 76]), wait: 700 }],
  ['desktop-violin-five-held', { route: '', instrument: 'violin', action: hold('violin', [55, 62, 69, 76, 79]), wait: 700 }],
  ['phone-trumpet-two-held', { route: '', device: 'phone', instrument: 'trumpet', action: hold('trumpet', [60, 64]), wait: 700 }],
];
