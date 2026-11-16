/** A private thumbnail needs an explicit reveal when Hide photos is enabled. */
export function isHidden(hide: boolean, revealed: boolean): boolean {
  return hide && !revealed;
}
