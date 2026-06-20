export const SEGMENT_COLORS = [
  '#4DFFA0', // green
  '#9B7FFF', // violet
  '#F5A623', // orange
  '#FF6B8A', // coral
  '#4DA6FF', // blue
  '#FFD84D', // yellow
  '#FF4D9E', // pink
  '#4DFFEF', // cyan
];

export function getSegmentColor(index: number): string {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}
