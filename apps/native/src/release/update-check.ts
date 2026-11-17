import {
  releaseStatusSchema,
  updateDecision,
  type ReleaseStatus,
  type UpdateDecision,
} from "@workspace/shared";
import { z } from "zod";

/** The app asks the server at most this often (on start and on returning to the foreground). */
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;

const storedSchema = z.object({
  status: releaseStatusSchema,
  checkedAt: z.number().int(),
  /** The latest version whose "update available" notice was dismissed. */
  dismissed: z.string().nullable().default(null),
});
export type StoredCheck = z.infer<typeof storedSchema>;

/** The last answer as it was stored, or null when there is none or it no longer parses. */
export function parseStoredCheck(raw: string | null): StoredCheck | null {
  if (!raw) return null;
  try {
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function serializeCheck(check: StoredCheck): string {
  return JSON.stringify(check);
}

/** Whether to ask the server now. */
export function isCheckDue(stored: StoredCheck | null, now: number): boolean {
  return !stored || now - stored.checkedAt >= CHECK_INTERVAL_MS;
}

/**
 * Stores a fresh answer, keeping the dismissal (a dismissal belongs to a version, so a newer
 * latest release shows its notice again).
 */
export function recordAnswer(
  stored: StoredCheck | null,
  status: ReleaseStatus,
  now: number,
): StoredCheck {
  return { status, checkedAt: now, dismissed: stored?.dismissed ?? null };
}

export type UpdateView =
  | { kind: "none" }
  | { kind: "required"; minimumVersion: string }
  | { kind: "available"; version: string };

/**
 * What to show from the last known answer. Offline or after an error the last answer stands; with
 * none at all nothing is shown, so a check never blocks logging a Session it did not already block.
 */
export function updateView(current: string, stored: StoredCheck | null): UpdateView {
  const status = stored?.status ?? null;
  const decision: UpdateDecision = updateDecision(current, status);
  if (decision === "required" && status?.minimumVersion) {
    return { kind: "required", minimumVersion: status.minimumVersion };
  }
  if (decision === "available" && status?.latest && stored?.dismissed !== status.latest.version) {
    return { kind: "available", version: status.latest.version };
  }
  return { kind: "none" };
}
