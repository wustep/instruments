// One small tooltip for icon-only controls: any element with data-tip. It shows on hover (after
// a moment), at once on keyboard focus, and while a slider grip is dragged (so it also works on
// touch, where there is no hover). It follows live changes to data-tip (a grip's value).
export function installTips(): void {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let cur: HTMLElement | null = null;
  let timer = 0;
  const place = (el: HTMLElement) => {
    const t = el.dataset.tip;
    if (!t || !el.isConnected) return hide();
    tip.textContent = t;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const x = Math.min(window.innerWidth - tw - 6, Math.max(6, r.left + r.width / 2 - tw / 2));
    let y = r.top - th - 6;
    if (y < 6) y = r.bottom + 6;
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const show = (el: HTMLElement, now: boolean) => {
    cur = el;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => cur === el && place(el), now ? 0 : 350);
  };
  const hide = () => {
    window.clearTimeout(timer);
    cur = null;
    tip.hidden = true;
  };
  const tipped = (t: EventTarget | null) => ((t as Element | null)?.closest?.('[data-tip]') as HTMLElement | null) ?? null;
  const isSlider = (el: HTMLElement | null) => el?.getAttribute('role') === 'slider';
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = tipped(e.target);
    if (el && el !== cur) show(el, false);
    else if (!el && cur && !cur.classList.contains('dragging')) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = tipped(e.target);
    if (el && el.matches(':focus-visible')) show(el, true);
  });
  document.addEventListener('focusout', () => {
    if (cur && !cur.classList.contains('dragging')) hide();
  });
  document.addEventListener('pointerdown', (e) => {
    const el = tipped(e.target);
    if (isSlider(el)) show(el!, true);
    else if (cur) hide();
  }, true); // capture: the grips stop their own pointer events from bubbling
  document.addEventListener('pointerup', () => {
    const el = cur;
    if (isSlider(el)) window.setTimeout(() => cur === el && !el!.matches(':hover') && hide(), 900);
  }, true);
  // the hovered grip's value changes as it is dragged, and the grip itself moves
  new MutationObserver(() => {
    if (cur && !tip.hidden) place(cur);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-tip', 'style'], subtree: true });
}
