import { z } from "zod";

/**
 * App versions and the update check (story 45 to 49 of the web spec). The server holds the
 * Minimum supported version; the latest release comes from GitHub Releases. Native compares its
 * own version with both.
 */

/** `major.minor.patch`, optionally with a pre-release suffix (`1.2.0-beta.1`). No build metadata. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export const semverSchema = z.string().trim().max(64).regex(SEMVER, "Use a version like 1.2.0");

/** A release tag (`v1.2.0`) as a version (`1.2.0`), or null when it is not one. */
export function versionFromTag(tag: string): string | null {
  const version = tag.trim().replace(/^v/, "");
  return SEMVER.test(version) ? version : null;
}

type Parsed = { core: [number, number, number]; pre: string[] };

function parse(version: string): Parsed | null {
  const match = SEMVER.exec(version.trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split(".") : [],
  };
}

function comparePre(a: string[], b: string[]): number {
  // A version without a pre-release ranks above the same version with one.
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;
    const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
    const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return left < right ? -1 : 1;
  }
  return 0;
}

/**
 * Semver precedence: negative when `a` is older, positive when newer, 0 when equal. Null when
 * either is not a version.
 */
export function compareVersions(a: string, b: string): number | null {
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;
  for (let index = 0; index < 3; index += 1) {
    const diff = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return Math.sign(comparePre(left.pre, right.pre));
}

export const latestReleaseSchema = z.object({
  version: z.string(),
  url: z.url(),
  publishedAt: z.string(),
});
export type LatestRelease = z.infer<typeof latestReleaseSchema>;

/** What `release.status` answers. */
export const releaseStatusSchema = z.object({
  minimumVersion: z.string().nullable(),
  latest: latestReleaseSchema.nullable(),
});
export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;

export type UpdateDecision = "none" | "available" | "required";

/**
 * What the app should show: `required` below the Minimum supported version (a blocking screen),
 * `available` below the latest release (a dismissible notice), else `none`. A value that is not
 * a version never blocks.
 */
export function updateDecision(current: string, status: ReleaseStatus | null): UpdateDecision {
  if (!status) return "none";
  if (status.minimumVersion && (compareVersions(current, status.minimumVersion) ?? 0) < 0) {
    return "required";
  }
  if (status.latest && (compareVersions(current, status.latest.version) ?? 0) < 0) {
    return "available";
  }
  return "none";
}
