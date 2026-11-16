import { IDLE_CONFIG } from '../config/idle';
import { activeElapsed, nextTimerTick } from '../shared/activeTime';
import { STORAGE_KEYS } from '../shared/constants';
import { formatEarnings } from '../shared/earnings';
import { type EarningsClock, liveEarnings } from '../shared/liveEarnings';
import type { Settings } from '../shared/types';
import { fmtDuration } from '../shared/utils/format';

let overlayContainer: HTMLDivElement | null = null;
let clock: EarningsClock | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let amount: HTMLSpanElement | null = null;
let elapsed: HTMLSpanElement | null = null;
let dot: HTMLSpanElement | null = null;
let idleNotice: HTMLDivElement | null = null;
let showEarnings = true;

// The student can hide the money from the pill. The timer and dot always stay,
// so it is still obvious that recording is on.
function readEarningsSetting(saved: unknown): void {
  showEarnings = (saved as Partial<Settings> | undefined)?.show_page_earnings !== false;
}
chrome.storage?.local.get(STORAGE_KEYS.SETTINGS, (r) => {
  readEarningsSetting(r?.[STORAGE_KEYS.SETTINGS]);
  paint();
});
chrome.storage?.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEYS.SETTINGS]) return;
  readEarningsSetting(changes[STORAGE_KEYS.SETTINGS].newValue);
  paint();
});

function paint(): void {
  clearTimeout(timer);
  // After an extension reload this script is orphaned and never hears Stop.
  // Remove its pill instead of letting an old clock keep counting.
  if (!chrome.runtime?.id) {
    destroyOverlay();
    return;
  }
  if (!clock || !overlayContainer || !amount || !elapsed || !dot) return;
  if (idleNotice) {
    idleNotice.hidden = clock.pause_reason !== 'idle';
  }
  const now = Date.now();
  const activeMs = activeElapsed(clock, now);
  const earnings = liveEarnings(clock, now);
  amount.hidden = !showEarnings;
  amount.textContent = earnings
    ? formatEarnings(earnings.total_earnings_micro_usd ?? earnings.base_earnings_micro_usd)
    : 'N/A';
  amount.title =
    earnings?.annotation_bonus_micro_usd !== undefined
      ? `Estimated earnings: base ${formatEarnings(earnings.base_earnings_micro_usd)}, annotation bonus ${formatEarnings(earnings.annotation_bonus_micro_usd)}`
      : 'Estimated session earnings';
  elapsed.textContent = fmtDuration(activeMs);
  dot.dataset.paused = String(clock.state === 'paused');
  dot.title = clock.state === 'paused' ? 'Recording paused' : 'Recording';
  dot.setAttribute('aria-label', dot.title);
  const gateHeight =
    document.getElementById('drafted-privacy-host')?.getBoundingClientRect().height ?? 0;
  const bottom = `${gateHeight ? gateHeight + 32 : 20}px`;
  if (overlayContainer.style.bottom !== bottom) overlayContainer.style.bottom = bottom;
  if (!document.hidden)
    timer = setTimeout(paint, nextTimerTick(clock.state === 'paused' ? 0 : activeMs));
}

export function createOverlay(next: EarningsClock | null): void {
  if (window.top !== window.self) return;
  clock = next;
  if (!clock) {
    destroyOverlay();
    return;
  }
  if (overlayContainer) {
    paint();
    return;
  }
  // A pill left by an orphaned copy of this script would show a stale time.
  document.getElementById('drafted-overlay-host')?.remove();
  overlayContainer = document.createElement('div');
  overlayContainer.id = 'drafted-overlay-host';
  overlayContainer.style.cssText =
    'position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;max-width:calc(100vw - 40px);';
  const shadow = overlayContainer.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .overlay-pill{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(18,8,46,.85);backdrop-filter:blur(12px);border-radius:20px;border:1px solid rgba(77,255,160,.2);pointer-events:auto;user-select:none;color:#fff;font:11px/1.4 system-ui,sans-serif;white-space:nowrap}
    .wordmark{font-family:'Poppins',system-ui,sans-serif;font-weight:800;letter-spacing:.02em}
    .amount,.elapsed{font-variant-numeric:tabular-nums}.amount{font-weight:600}.elapsed{color:#BFC5C1}
    .dot{width:6px;height:6px;border-radius:50%;background:#4DFFA0;flex-shrink:0;animation:pulse 2s ease-in-out infinite}
    .dot[data-paused=true]{background:#F5A623;animation:none}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @media(prefers-reduced-motion:reduce){.dot{animation:none}}
  `;
  const pill = document.createElement('div');
  pill.className = 'overlay-pill';
  const wordmark = document.createElement('span');
  wordmark.className = 'wordmark';
  wordmark.textContent = 'drafted.';
  dot = document.createElement('span');
  dot.className = 'dot';
  dot.setAttribute('role', 'img');
  amount = document.createElement('span');
  amount.className = 'amount';
  amount.title = 'Estimated session earnings';
  elapsed = document.createElement('span');
  elapsed.className = 'elapsed';
  elapsed.title = 'Active recording time';
  pill.append(wordmark, dot, amount, elapsed);
  idleNotice = document.createElement('div');
  idleNotice.style.cssText =
    'max-width:260px;margin-top:8px;padding:12px;border-radius:12px;background:#0B0D0C;color:#F2F4F3;font:12px/1.5 system-ui;pointer-events:auto;';
  idleNotice.setAttribute('role', 'dialog');
  idleNotice.setAttribute('aria-label', 'Continue recording?');
  const prompt = document.createElement('p');
  prompt.style.cssText = 'margin:0 0 12px;';
  prompt.textContent = IDLE_CONFIG.notice;
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;';
  const error = document.createElement('p');
  error.setAttribute('role', 'alert');
  error.style.cssText = 'margin:8px 0 0;color:#FF9B8D;';
  const buttons = [
    ['Continue', 'RESUME_CAPTURE'],
    ['Keep paused', 'PAUSE_CAPTURE'],
  ].map(([label, type]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText =
      'font:inherit;cursor:pointer;padding:8px 12px;border:1px solid #69736C;border-radius:8px;background:#F2F4F3;color:#0B0D0C;';
    button.onclick = async (event) => {
      if (!event.isTrusted || clock?.pause_reason !== 'idle') return;
      for (const item of buttons) item.disabled = true;
      error.textContent = '';
      try {
        const result = await chrome.runtime.sendMessage({
          type,
          payload: { session_id: clock.id, requested_at: Date.now() },
        });
        if (result?.error) throw new Error(result.error);
      } catch {
        error.textContent = 'Could not update recording. Open Sidekick to try again.';
      } finally {
        for (const item of buttons) item.disabled = false;
      }
    };
    return button;
  });
  actions.append(...buttons);
  idleNotice.append(prompt, actions, error);
  shadow.append(style, pill, idleNotice);
  document.documentElement.appendChild(overlayContainer);
  document.addEventListener('visibilitychange', paint);
  paint();
}

export function destroyOverlay(): void {
  clearTimeout(timer);
  document.removeEventListener('visibilitychange', paint);
  overlayContainer?.remove();
  overlayContainer = null;
  clock = null;
  amount = null;
  elapsed = null;
  dot = null;
  idleNotice = null;
}
