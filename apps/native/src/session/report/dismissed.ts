import { z } from "zod";

/** The device-storage key of the reports Home no longer offers. */
export const DISMISSED_KEY = "report.dismissed";

const MAX_KEPT = 24;
const schema = z.array(z.string());

/** The dismissed report keys; anything unreadable counts as none. */
export function readDismissed(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** The list with `key` added, newest last, keeping only the most recent few. */
export function withDismissed(list: readonly string[], key: string): string[] {
  return [...list.filter((entry) => entry !== key), key].slice(-MAX_KEPT);
}
