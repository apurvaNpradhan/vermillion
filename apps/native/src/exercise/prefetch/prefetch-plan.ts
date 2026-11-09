/** Thumbnails fetched per `Image.prefetch` call. */
export const PREFETCH_BATCH_SIZE = 20;

/** Cached-or-not checks run this many at a time. */
const CHECK_CHUNK = 50;

/** What a run did, for the debug log line. Counts only, never URLs. */
export type PrefetchResult = {
  /** Thumbnails the catalog has. */
  total: number;
  /** Already in the disk cache, so skipped. */
  alreadyCached: number;
  /** Fetched by this run. */
  prefetched: number;
  /** In batches that failed; the run stops at the first failed batch (usually the network). */
  failed: number;
  /** The run was cancelled before it finished. */
  cancelled: boolean;
};

export type PrefetchPorts = {
  /** Whether the image cache already holds this URL. */
  isCached: (url: string) => Promise<boolean>;
  /** Fetches the URLs into the disk cache; `true` when every one succeeded. */
  prefetch: (urls: string[]) => Promise<boolean>;
  /** Aborted on disconnect, a metered connection or an account reset. */
  signal: AbortSignal;
  batchSize?: number;
};

/** Splits `items` into consecutive groups of at most `size`. */
export function batches<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let start = 0; start < items.length; start += Math.max(1, size)) {
    groups.push(items.slice(start, start + Math.max(1, size)));
  }
  return groups;
}

/** The distinct URLs in `urls`, in first-seen order. */
function distinct(urls: readonly string[]): string[] {
  return [...new Set(urls)];
}

/**
 * Prefetches the thumbnails the cache does not hold yet, in batches. The cache itself is the
 * record of what is done: a run that was cut short, or a cache the system trimmed, is simply
 * topped up by the next one. Checks the signal before every step; a batch already in flight
 * cannot be recalled, but its result is dropped and no further batch starts.
 */
export async function prefetchMissing(
  urls: readonly string[],
  ports: PrefetchPorts,
): Promise<PrefetchResult> {
  const all = distinct(urls);
  const result: PrefetchResult = {
    total: all.length,
    alreadyCached: 0,
    prefetched: 0,
    failed: 0,
    cancelled: false,
  };
  const { signal } = ports;
  const missing: string[] = [];
  for (const chunk of batches(all, CHECK_CHUNK)) {
    if (signal.aborted) return { ...result, cancelled: true };
    const cached = await Promise.all(chunk.map((url) => ports.isCached(url)));
    chunk.forEach((url, index) => {
      if (cached[index]) result.alreadyCached += 1;
      else missing.push(url);
    });
  }
  for (const batch of batches(missing, ports.batchSize ?? PREFETCH_BATCH_SIZE)) {
    if (signal.aborted) return { ...result, cancelled: true };
    const ok = await ports.prefetch(batch);
    if (signal.aborted) return { ...result, cancelled: true };
    if (!ok) {
      result.failed += missing.length - result.prefetched;
      return result;
    }
    result.prefetched += batch.length;
  }
  return result;
}

/**
 * Whether a connection counts as unmetered: Wi-Fi or Ethernet. Cellular and unknown do not.
 * Known limitation: expo-network exposes no metered flag, so a metered Wi-Fi hotspot still counts
 * as unmetered here.
 */
export function isUnmetered(state: { type?: string; isConnected?: boolean }): boolean {
  return state.isConnected === true && (state.type === "WIFI" || state.type === "ETHERNET");
}
