/**
 * Whether an exercise's Previous lookup no longer holds its set up: it has loaded, or it failed.
 * A failed lookup shows no Previous and no Ghost values, but a set whose own cells are filled
 * can still be ticked (the retry banner is the only cost), so the tick must not wait on it.
 */
export function historySettled(input: { loaded: boolean; failed: boolean }): boolean {
  return input.loaded || input.failed;
}
