// Start-up diagnostics. Every step of getting sound going is recorded (cheaply,
// always); open the page with ?debug to see them live in a corner panel, with a
// copy button, so a browser that "never starts" can say exactly where it stops.

export interface DiagLine {
  t: number;
  step: string;
  detail?: string;
}

const lines: DiagLine[] = [];
const subs = new Set<() => void>();
const t0 = typeof performance !== 'undefined' ? performance.timeOrigin : Date.now();
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now() - t0);

export const debugEnabled = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search + location.hash);

export function diag(step: string, detail?: unknown): void {
  const d = detail === undefined ? undefined : typeof detail === 'string' ? detail : safeJson(detail);
  lines.push({ t: Math.round(now()), step, detail: d });
  if (lines.length > 400) lines.splice(0, lines.length - 400);
  if (debugEnabled) console.info(`[start] ${Math.round(now())} ms ${step}${d ? ` ${d}` : ''}`);
  subs.forEach((cb) => cb());
}

function safeJson(x: unknown): string {
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

export function diagText(): string {
  return lines.map((l) => `${String(l.t).padStart(6)} ms  ${l.step}${l.detail ? `  ${l.detail}` : ''}`).join('\n');
}

/** environment facts that decide whether Web Audio can start */
export function diagEnvironment(): void {
  const w = window as unknown as Record<string, unknown>;
  const AC = (w.AudioContext ?? w.webkitAudioContext) as { prototype: object } | undefined;
  diag('environment', {
    ua: navigator.userAgent,
    secure: window.isSecureContext,
    audioContext: !!AC,
    audioWorklet: !!AC && 'audioWorklet' in AC.prototype,
    webMidi: 'requestMIDIAccess' in navigator,
    audioSession: (navigator as Navigator & { audioSession?: { type: string } }).audioSession?.type ?? 'n/a',
    dpr: window.devicePixelRatio,
    cores: navigator.hardwareConcurrency,
    url: location.href.replace(/[?#].*$/, ''),
  });
  window.addEventListener('error', (e) => diag('page error', `${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => diag('unhandled rejection', String((e.reason as Error)?.stack ?? e.reason)));
  (w as { __diag?: unknown }).__diag = { get lines() { return lines; }, text: diagText };
}

/** the ?debug panel */
export function diagPanel(): HTMLElement | null {
  if (!debugEnabled) return null;
  const pre = document.createElement('pre');
  const copy = document.createElement('button');
  copy.textContent = 'copy';
  copy.addEventListener('click', () => void navigator.clipboard?.writeText(diagText()));
  const panel = document.createElement('div');
  panel.className = 'diag';
  panel.append(copy, pre);
  const paint = () => {
    pre.textContent = diagText();
    pre.scrollTop = pre.scrollHeight;
  };
  subs.add(paint);
  paint();
  return panel;
}
