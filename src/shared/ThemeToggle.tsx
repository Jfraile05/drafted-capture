import { useId } from 'react';
import { toggleTheme } from './theme';

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

/** Sun in light mode, moon in dark. The shape morphs in CSS (.theme-icon). */
export default function ThemeToggle() {
  const maskId = `ti-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <button
      type="button"
      onClick={(event) => toggleTheme(event.currentTarget)}
      className="icon-btn"
      title="Light or dark"
      aria-label="Switch between light and dark"
    >
      <svg className="theme-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <mask id={maskId}>
          <rect width="24" height="24" fill="#fff" />
          <circle className="ti-cut" cx="17" cy="7" r="7" fill="#000" />
        </mask>
        <circle
          className="ti-core"
          cx="12"
          cy="12"
          r="5"
          fill="currentColor"
          mask={`url(#${maskId})`}
        />
        <g className="ti-rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {RAYS.map((deg) => (
            <line key={deg} x1="12" y1="2.5" x2="12" y2="4.5" transform={`rotate(${deg} 12 12)`} />
          ))}
        </g>
      </svg>
    </button>
  );
}
