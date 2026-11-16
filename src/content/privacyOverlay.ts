import { PRIVACY_CONFIG } from '../config/privacy';
import type { PrivacyGate } from '../shared/privacy';

let host: HTMLDivElement | null = null;
let shown = '';

export function showPrivacyGate(
  gate: PrivacyGate | null,
  collapsed = gate?.kept_paused ?? false,
): void {
  if (window.top !== window.self) return;
  const key = gate ? `${gate.id}:${collapsed}` : '';
  if (shown === key) return;
  host?.remove();
  host = null;
  shown = key;
  if (!gate) return;
  host = document.createElement('div');
  host.id = 'drafted-privacy-host';
  host.style.cssText =
    'position:fixed;bottom:20px;right:20px;z-index:2147483647;max-width:calc(100vw - 40px);';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    *{box-sizing:border-box}section{width:280px;max-width:100%;padding:16px;background:#0B0D0C;color:#F2F4F3;border:1px solid #363C38;border-radius:14px;box-shadow:0 8px 30px #0005;font:13px/1.5 system-ui,sans-serif}
    p{margin:0 0 12px}button{font:inherit;cursor:pointer;border:1px solid #363C38;border-radius:9px;padding:9px 12px;background:#0B0D0C;color:#F2F4F3}button:focus-visible{outline:2px solid #4DFFA0;outline-offset:3px}button:disabled{opacity:.5;cursor:wait}.primary{background:#F2F4F3;color:#0B0D0C}footer{display:flex;flex-direction:column;gap:8px}.paused{border-radius:22px}.error{margin-top:10px;color:#FF9B8D;font-size:12px}
  `;
  root.append(style);
  if (collapsed) {
    const button = document.createElement('button');
    button.className = 'paused';
    button.textContent = 'Recording paused';
    button.onclick = (event) => {
      if (event.isTrusted) showPrivacyGate(gate, false);
    };
    root.append(button);
  } else {
    const section = document.createElement('section');
    section.setAttribute('role', 'dialog');
    section.setAttribute('aria-label', 'Recording paused for privacy');
    const prompt = document.createElement('p');
    prompt.textContent = PRIVACY_CONFIG.prompt;
    const footer = document.createElement('footer');
    const error = document.createElement('p');
    error.className = 'error';
    error.setAttribute('role', 'alert');
    const buttons = [
      ['Resume recording', 'CONFIRM_PRIVACY'],
      ['Keep paused', 'KEEP_PRIVACY_PAUSED'],
    ].map(([label, type]) => {
      const button = document.createElement('button');
      button.textContent = label;
      if (type === 'CONFIRM_PRIVACY') button.className = 'primary';
      button.onclick = async (event) => {
        if (!event.isTrusted) return;
        for (const b of buttons) b.disabled = true;
        try {
          const result = await chrome.runtime.sendMessage({ type, payload: { gateId: gate.id } });
          if (result?.error) throw new Error(result.error);
          if (shown !== key) return;
          if (type === 'KEEP_PRIVACY_PAUSED') showPrivacyGate(gate, true);
          else if (result?.state === 'capturing') showPrivacyGate(null);
          else error.textContent = 'This screen changed. Review the current privacy prompt.';
        } catch {
          error.textContent = 'Could not resume. Open Sidekick to check the current screen.';
        } finally {
          for (const b of buttons) b.disabled = false;
        }
      };
      return button;
    });
    footer.append(...buttons);
    section.append(prompt, footer, error);
    root.append(section);
  }
  document.documentElement.append(host);
}

export function watchPrivacy(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void chrome.runtime.sendMessage({ type: 'PRIVACY_CHECK' }).catch(() => {});
    }, PRIVACY_CONFIG.observerDebounceMs);
  };
  const observer = new MutationObserver(notify);
  observer.observe(document, { childList: true, subtree: true, attributes: true });
  document.addEventListener('focusin', notify, true);
  document.addEventListener('scroll', notify, { passive: true, capture: true });
  notify();
  return () => {
    clearTimeout(timer);
    observer.disconnect();
    document.removeEventListener('focusin', notify, true);
    document.removeEventListener('scroll', notify, true);
  };
}
