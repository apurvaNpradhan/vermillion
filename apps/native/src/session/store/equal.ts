/** Plain data as the local database and the zod schemas produce it. */
export type Plain =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Plain[]
  | { readonly [key: string]: Plain };

const isArray = (value: Plain): value is readonly Plain[] => Array.isArray(value);
const isRecord = (value: Plain): value is { readonly [key: string]: Plain } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Field-by-field equality of plain data. The rows the store holds are small and flat, so this is
 * cheaper than turning them into text, and it does not depend on key order.
 */
export function deepEqual(a: Plain, b: Plain): boolean {
  if (Object.is(a, b)) return true;
  if (isArray(a))
    return isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}

/** `next`, or `before` when it holds the same data, so a selector sees an unchanged identity. */
export function keepIfEqual<T extends Plain>(before: T | undefined, next: T): T {
  return before !== undefined && deepEqual(before, next) ? before : next;
}
