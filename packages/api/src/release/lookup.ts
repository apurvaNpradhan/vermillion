import { log } from "@workspace/logger";
import { versionFromTag, type LatestRelease } from "@workspace/shared";
import { z } from "zod";

/** How long a good answer is reused. */
const CACHE_MS = 10 * 60 * 1000;
/** After a failure, wait this long before asking GitHub again (the last good value stays). */
const RETRY_MS = 60 * 1000;

const releaseSchema = z.object({
  tag_name: z.string(),
  html_url: z.url(),
  published_at: z.string().nullable(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.url() })),
});

export type ReleaseLookup = {
  /** The newest published release, or null when there is none (or none could be read yet). */
  latest(): Promise<LatestRelease | null>;
};

export type ReleaseLookupOptions = {
  owner: string;
  repo: string;
  userAgent: string;
  /** Replaced in tests: GitHub is a network boundary. */
  fetch?: typeof fetch;
  now?: () => number;
};

/** The APK to link: the arm64 build if there is one, else any APK, else the release page. */
function downloadUrl(release: z.infer<typeof releaseSchema>): string {
  const apks = release.assets.filter((asset) => asset.name.endsWith(".apk"));
  const preferred = apks.find((asset) => asset.name.includes("arm64")) ?? apks[0];
  return preferred?.browser_download_url ?? release.html_url;
}

/**
 * The latest release from the public GitHub Releases API, cached in memory for ten minutes. A
 * failure keeps the last good value; a repository without releases is a good answer of null.
 */
export function createReleaseLookup(options: ReleaseLookupOptions): ReleaseLookup {
  const now = options.now ?? Date.now;
  let cached: { value: LatestRelease | null; at: number } | null = null;
  let retryAfter = 0;
  let pending: Promise<LatestRelease | null> | null = null;

  async function load(): Promise<LatestRelease | null> {
    const url = `https://api.github.com/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/releases/latest`;
    try {
      const response = await (options.fetch ?? fetch)(url, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": options.userAgent,
          "x-github-api-version": "2022-11-28",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 404) {
        cached = { value: null, at: now() };
        return null;
      }
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      const release = releaseSchema.parse(await response.json());
      const version = versionFromTag(release.tag_name);
      if (!version) throw new Error("The latest release tag is not a version");
      const value = {
        version,
        url: downloadUrl(release),
        publishedAt: release.published_at ?? new Date(now()).toISOString(),
      };
      cached = { value, at: now() };
      return value;
    } catch (error) {
      retryAfter = now() + RETRY_MS;
      log.warn({
        action: "release.lookup.failed",
        message: error instanceof Error ? error.message : "unknown",
      });
      return cached?.value ?? null;
    }
  }

  return {
    async latest() {
      const time = now();
      if (cached && time - cached.at < CACHE_MS) return cached.value;
      if (time < retryAfter) return cached?.value ?? null;
      pending ??= load().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}
