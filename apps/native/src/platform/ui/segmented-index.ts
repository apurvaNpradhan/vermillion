/** Index of the option with `value`, or -1 when none matches. */
export function indexOfValue<T extends string>(options: readonly { value: T }[], value: T): number {
  return options.findIndex((option) => option.value === value);
}

/** Width of one segment given the track's inner width. */
export function segmentWidth(trackWidth: number, count: number): number {
  return count > 0 ? Math.max(trackWidth, 0) / count : 0;
}

/** Horizontal offset of the indicator for `index`; an unknown selection (-1) parks at 0. */
export function indicatorOffset(index: number, trackWidth: number, count: number): number {
  return Math.max(index, 0) * segmentWidth(trackWidth, count);
}

/** The segment under a horizontal touch position, clamped to the ends. */
export function indexAtPosition(x: number, trackWidth: number, count: number): number {
  if (count <= 0 || trackWidth <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor(x / segmentWidth(trackWidth, count))));
}

/** Next index for keyboard / accessibility increment (+1) and decrement (-1); stops at the ends. */
export function stepIndex(index: number, direction: 1 | -1, count: number): number {
  return Math.min(count - 1, Math.max(0, index + direction));
}
