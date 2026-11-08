// "after" screenshot set for scripts/shots-round3.mjs (the round-3 stage UI)
const chord = [[36, 88], [48, 70], [55, 70], [60, 78], [64, 82], [67, 90]];
export default [
  ['desktop-play', { route: '', notes: chord, pedal: true, wait: 700 }],
  ['desktop-play-full', { route: '', full: true }],
  ['desktop-violin', { route: '', instrument: 'violin', notes: [[69, 104]], wait: 1600 }],
  ['desktop-cello', { route: '', instrument: 'cello', notes: [[43, 110]], wait: 1600 }],
  ['desktop-flute', { route: '', instrument: 'flute', notes: [[67, 84]], wait: 1300 }],
  ['desktop-measurements', { route: 'measurements', wait: 2000 }],
  ['desktop-notes', { route: 'notes', wait: 600 }],
  ['phone-play', { route: '', device: 'phone', notes: [[55, 80], [60, 84], [64, 84], [67, 90]], pedal: true, wait: 700 }],
  ['phone-play-full', { route: '', device: 'phone', full: true }],
  ['phone-violin', { route: '', device: 'phone', instrument: 'violin', notes: [[69, 100]], wait: 1600 }],
  ['phone-flute', { route: '', device: 'phone', instrument: 'flute', notes: [[72, 84]], wait: 1300 }],
  ['phone-knobs', { route: '', device: 'phone', notes: [[60, 90]], wait: 500, action: async (p) => p.click('.knob-toggle') }],
  ['phone-measurements', { route: 'measurements', device: 'phone', wait: 2000 }],
];
