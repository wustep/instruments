// The address bar follows the page (address.ts). A tab clicked (an instrument, the piano's kind, the
// Orchestra, the measurements, the notes) is a new entry in the history, so back and forward walk the
// tabs; anything else (the Orchestra's lineup, routing and keys, the stage's look, the expression)
// rewrites the entry it is on (replaceState, debounced: a burst of changes is written as it starts and
// once more as it settles). Nothing to press: the address is always the page as it is. An address opened (a link, a reload) sets the page up; one walked to (back, forward)
// brings its tab and its Orchestra back, leaving the look and the expression as they are.

import { audio } from './audio.ts';
import { formatAddress, parseAddress, setupKey, tabOf, type Address, type Page } from './address.ts';
import { look } from './look.ts';
import { ensemble } from './orchestra/ensemble.ts';
import { enterOrchestra, leaveOrchestra } from './orchestra/setup.ts';
import type { MidiPlayer } from './ui/player.ts';

/** how long a burst of changes is quiet before the address is written once more */
const SETTLE_MS = 250;

export interface Nav {
  /** the page shown */
  readonly page: Page;
  /** a page by a link: a new entry */
  go(page: Page): void;
}

const presetOf = (p: string): 'grand' | 'upright' => (p === 'upright' || p === 'honky-tonk' ? 'upright' : 'grand');

/** start following the page: `render` shows a page (the app's views) */
export function startNav(player: MidiPlayer, render: (page: Page) => void): Nav {
  let page: Page = 'stage';
  /** parameters that are not the app's, kept (?debug) */
  let rest: string[] = [];
  /** the tab of the history entry the page is on */
  let entryTab = '';
  let timer = 0;
  let queued = false;

  const state = (): Address => ({
    page,
    instrument: audio.instrument,
    preset: presetOf(audio.preset),
    orchestra: ensemble.active ? ensemble.setup() : null,
    look: look.value,
    expr: player.auto,
    rest,
  });

  /** the links back to the stage go where the stage is now (a new tab opened from one, too) */
  const stageLinks = () => {
    const href = formatAddress({ ...state(), page: 'stage' });
    document.querySelectorAll<HTMLAnchorElement>('a[data-route="stage"]').forEach((a) => a.getAttribute('href') !== href && a.setAttribute('href', href));
  };

  /** the address as the page is: a new entry (`push`, a new tab) or this one rewritten */
  const write = (push: boolean) => {
    window.clearTimeout(timer);
    timer = 0;
    const a = state();
    const url = formatAddress(a);
    const tab = tabOf(a);
    push &&= tab !== entryTab;
    entryTab = tab;
    stageLinks();
    if (url === location.pathname + location.search && !location.hash) return;
    try {
      if (push) history.pushState(null, '', url);
      else history.replaceState(history.state, '', url);
    } catch {
      /* a sandboxed page, or too many rewrites in a moment: the next change tries again */
    }
  };

  /** something changed: a new tab at once; the rest rewritten at once too, then a burst of changes
   *  (instruments tapped in, a routing being set) once more when it settles (a reload straight after a
   *  change opens the page as it was) */
  const changed = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (tabOf(state()) !== entryTab) return write(true);
      if (!timer) write(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => write(false), SETTLE_MS);
    });
  };
  window.addEventListener('pagehide', () => timer && write(false));

  /** the page set up as an address says (`first`: the address the page opened at) */
  const apply = (a: Address, first: boolean) => {
    rest = a.rest;
    if (first) {
      // the look and the expression are the page's, for this page (the device keeps its own)
      if (a.look) look.ask(a.look);
      if (a.expr !== null) player.setAuto(a.expr, false);
    }
    if (a.page === 'stage') {
      if (a.orchestra) {
        if (!ensemble.active || (a.orchestra.seats.length && setupKey(a.orchestra) !== setupKey(ensemble.setup()))) enterOrchestra(player, a.orchestra);
      } else {
        if (ensemble.active) leaveOrchestra(player);
        if (a.instrument && a.instrument !== audio.instrument) void audio.setInstrument(a.instrument);
        if (a.instrument === 'piano' && a.preset && a.preset !== presetOf(audio.preset)) void audio.setPreset(a.preset);
      }
    }
    if (first || a.page !== page) {
      page = a.page;
      render(page);
    }
    // the entry now holds the page as it is (an old or loose spelling rewritten)
    write(false);
  };

  const walked = () => apply(parseAddress(location.pathname, location.search, location.hash), false);
  window.addEventListener('popstate', walked);
  // (an old link to #/notes followed within the page)
  window.addEventListener('hashchange', () => /^#\//.test(location.hash) && walked());

  // the page's own links (the header's, the stage's back link, the pieces' credit): a new entry, no
  // reload (a click that opens a new tab or window is the browser's)
  document.addEventListener('click', (e) => {
    const t = (e.target as Element | null)?.closest?.('a[data-route]') as HTMLAnchorElement | null;
    if (!t || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(t.dataset.route as Page);
  });

  const go = (p: Page) => {
    if (p !== page) {
      page = p;
      render(page);
    }
    changed();
  };

  audio.instrumentChanging.on(changed);
  audio.instrumentChanged.on(changed);
  audio.presetChanged.on(changed);
  ensemble.changed.on(changed);
  ensemble.keysChanged.on(changed);
  look.on(changed);
  player.onAuto(changed);

  apply(parseAddress(location.pathname, location.search, location.hash), true);
  return {
    get page() {
      return page;
    },
    go,
  };
}
