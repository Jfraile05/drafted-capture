// Every look people can pick in "Choose your setup". Each setup has a light
// and a dark version; the sun and moon button switches between them. Soft
// graphite is the built-in look (styles.css, with Pearl as its light side);
// every other id has a light and a dark block in setups.css.

export type Mode = 'light' | 'dark';

export type Setup = {
  id: string;
  name: string;
  blurb: string;
};

/** The look everyone starts with. */
export const BASE_SETUP = 'soft-graphite';

export const SETUPS: readonly Setup[] = [
  {
    id: 'soft-graphite',
    name: 'Soft graphite',
    blurb: 'Graphite glass and soft clay, pearl in the light.',
  },
  { id: 'glass', name: 'Liquid Glass', blurb: 'Frosted panes over a soft glow.' },
  { id: 'aurora', name: 'Aurora glass', blurb: 'Northern lights behind glass, gradient buttons.' },
  {
    id: 'macos',
    name: 'macOS native',
    blurb: 'System font and blue selection, tidy like Finder.',
  },
  { id: 'minimal', name: 'Minimal', blurb: 'A plain page, hairlines, nothing extra.' },
  { id: 'mono', name: 'Mono', blurb: 'Black and white with one green light.' },
  { id: 'simple', name: 'Simple', blurb: 'Big buttons and soft tiles, easy reading.' },
  { id: 'mint', name: 'Mint', blurb: 'Fresh mint with a solid mint pick.' },
  { id: 'bento', name: 'Bento', blurb: 'Flat tiles in a tidy box.' },
  { id: 'tech', name: 'Techy HUD', blurb: 'Grid lines and monospace, like a heads-up display.' },
  { id: 'neon', name: 'Neon', blurb: 'Pink and cyan glow.' },
  { id: 'bold', name: 'Bold', blurb: 'Heavy type, sharp corners, loud mint.' },
  { id: 'soft', name: 'Soft clay', blurb: 'Pillowy buttons pressed out of the page.' },
  { id: 'brutal', name: 'Brutalist', blurb: 'Thick borders and hard shadows.' },
  { id: 'paper', name: 'Paper notebook', blurb: 'Ruled paper, serif type and a highlighter.' },
  { id: 'retro', name: 'Retro arcade', blurb: 'Chunky blocks in arcade colors.' },
  { id: 'mint-glass', name: 'Mint glass', blurb: 'Clear glass over mint and aqua.' },
  { id: 'frost', name: 'Frosted glass', blurb: 'Quiet frosted panels, graphite after dark.' },
  { id: 'mint-clay', name: 'Mint clay', blurb: 'Soft clay in mint.' },
  { id: 'glass-clay', name: 'Glass shell, clay keys', blurb: 'A glass panel with clay buttons.' },
  { id: 'clay-glass', name: 'Clay shell, glass core', blurb: 'A clay panel with glass inside.' },
];

export function findSetup(id: string | null | undefined): Setup | undefined {
  return SETUPS.find((setup) => setup.id === id);
}
