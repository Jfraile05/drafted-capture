// The 2D Sidekick head as a standalone SVG string, for places that cannot use
// the React mascot, such as the recording pill drawn into web pages. Same
// drawing as the 2D mascot in Brand.tsx, cropped to the head. (The toolbar
// icons have their own bolder drawing in icons/src.)
export const SIDEKICK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 14 260 220" aria-hidden="true">
<defs><radialGradient id="sk-icon-shell" cx="38%" cy="28%" r="80%"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#E6ECE9"/><stop offset="1" stop-color="#B9C4BF"/></radialGradient></defs>
<path d="M160 72 C160 42 148 24 124 22 C106 21 96 32 98 46" fill="none" stroke="#1B2422" stroke-width="9" stroke-linecap="round"/>
<circle cx="98" cy="54" r="13" fill="#5CFFC4"/>
<rect x="36" y="120" width="30" height="56" rx="13" fill="#1B2422"/>
<rect x="254" y="120" width="30" height="56" rx="13" fill="#1B2422"/>
<ellipse cx="160" cy="150" rx="106" ry="80" fill="url(#sk-icon-shell)"/>
<rect x="132" y="64" width="56" height="12" rx="5" fill="#1B2422"/>
<rect x="76" y="104" width="168" height="76" rx="38" fill="#3A4743"/>
<rect x="81" y="109" width="158" height="66" rx="33" fill="#030807"/>
<rect x="126" y="120" width="24" height="44" rx="12" fill="#5CFFC4"/>
<rect x="170" y="120" width="24" height="44" rx="12" fill="#5CFFC4"/>
</svg>`;
