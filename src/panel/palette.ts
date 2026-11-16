// Muted so task colors mark ranges without competing with the content.
export const SEGMENT_COLORS = [
  '#5FBF8A', // green
  '#8F85D6', // violet
  '#D2A04A', // amber
  '#D27585', // rose
  '#5F9BD2', // blue
  '#BFAF5A', // olive
  '#B86FA0', // plum
  '#57B3AC', // teal
];

export function getSegmentColor(index: number): string {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}
