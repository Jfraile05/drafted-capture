import type { FormatConverter, Session } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Universal format converter: direct JSON serialization of the full Session
// object. Steps reference screenshots by hash; the ZIP carries PNGs separately.
// This is the superset format that preserves DOM, segments, annotations, origins.
// ─────────────────────────────────────────────────────────────────────────────

export const universalConverter: FormatConverter = {
  key: 'universal',
  name: 'Drafted Universal',
  filename: 'session.json',

  async convert(session: Session): Promise<string> {
    return JSON.stringify(session, null, 2);
  },
};
