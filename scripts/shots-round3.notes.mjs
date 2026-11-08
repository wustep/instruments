// the Notes deep-dive (still behind its corner link): top, a middle section, phone
export default [
  ['desktop-top', { route: 'notes', wait: 500 }],
  ['desktop-trumpet', { route: 'notes', wait: 300, action: async (page) => { await page.locator('#n-trumpet').scrollIntoViewIfNeeded(); await page.waitForTimeout(400); } }],
  ['desktop-full', { route: 'notes', wait: 500, full: true }],
  ['phone-top', { route: 'notes', device: 'phone', wait: 500 }],
];
