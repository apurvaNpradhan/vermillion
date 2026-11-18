/** The pop's peak scale and its two spring legs; a pop settles in about 200ms and never loops. */
export const POP_SCALE = 1.15;
export const POP_UP_MS = 80;
/** The fade a pop becomes under Reduce Motion (`motion-fast`). */
export const POP_REDUCED_MS = 120;

/** A pop plays when the flag turns on after the first render, never on mount or when it turns off. */
export function shouldPop(previous: boolean | null, next: boolean): boolean {
  return previous !== null && !previous && next;
}
