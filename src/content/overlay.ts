let shadowRoot: ShadowRoot | null = null;
let overlayContainer: HTMLDivElement | null = null;

export function createOverlay(): void {
  if (window.top !== window.self) {
    return;
  }

  if (overlayContainer) {
    return;
  }

  overlayContainer = document.createElement('div');
  overlayContainer.id = 'drafted-overlay-host';
  overlayContainer.style.cssText =
    'position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; pointer-events: none;';

  shadowRoot = overlayContainer.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .overlay-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(18, 8, 46, 0.85);
      backdrop-filter: blur(12px);
      border-radius: 20px;
      border: 1px solid rgba(77, 255, 160, 0.2);
      pointer-events: auto;
      user-select: none;
    }
    .wordmark {
      font-family: 'Poppins', system-ui, sans-serif;
      font-weight: 800;
      font-size: 11px;
      color: #fff;
      letter-spacing: 0.02em;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #4DFFA0;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;

  const pill = document.createElement('div');
  pill.className = 'overlay-pill';

  const wordmark = document.createElement('span');
  wordmark.className = 'wordmark';
  wordmark.textContent = 'drafted.';

  const dot = document.createElement('span');
  dot.className = 'dot';

  pill.appendChild(wordmark);
  pill.appendChild(dot);

  shadowRoot.appendChild(style);
  shadowRoot.appendChild(pill);

  document.documentElement.appendChild(overlayContainer);
}

export function destroyOverlay(): void {
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
    shadowRoot = null;
  }
}
