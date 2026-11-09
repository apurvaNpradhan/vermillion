import { watchCatalogThumbnailKeys } from "@workspace/sync";
import { Image } from "expo-image";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";
import { useEffect, useState } from "react";

import { appConfig } from "@/platform/app-config";
import { useLocalData, useSyncStatus } from "@/sync";

import { thumbnailUrl } from "../media-url";
import { isUnmetered, prefetchMissing } from "./prefetch-plan";

/** Whether the device is on an unmetered connection now, following changes. */
function useUnmetered(): boolean {
  const [unmetered, setUnmetered] = useState(false);
  useEffect(() => {
    let current = true;
    void getNetworkStateAsync()
      .then((state) => current && setUnmetered(isUnmetered(state)))
      .catch(() => undefined);
    const subscription = addNetworkStateListener((state) => setUnmetered(isUnmetered(state)));
    return () => {
      current = false;
      subscription.remove();
    };
  }, []);
  return unmetered;
}

/**
 * Keeps every live catalog thumbnail in expo-image's disk cache, so the library looks complete
 * offline. Starts once the catalog has downloaded, and again whenever its thumbnails change; runs
 * only on an unmetered connection, in batches, and is cancelled when the connection goes or is
 * metered, or the account is reset (the write scope changes). The disk cache is the record of what
 * is done, so a cut-short run resumes where it stopped. Videos are never prefetched. Mount it once
 * under the signed-in tabs; it draws nothing.
 */
export function useThumbnailPrefetch() {
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const unmetered = useUnmetered();
  const database = local?.status === "ready" ? local.database : null;
  const writeScope = snapshot?.writeScope ?? null;
  const catalogSynced = snapshot?.catalogSynced === true;
  const [keysSignature, setKeysSignature] = useState("");

  const watching = database !== null && catalogSynced;
  useEffect(() => {
    if (!database || !catalogSynced) return;
    return watchCatalogThumbnailKeys(database, {
      // The key list changes only when the catalog does; compare by content, not identity.
      onKeys: (keys) => setKeysSignature(JSON.stringify(keys)),
      onError: () => undefined,
    });
  }, [database, catalogSynced]);

  useEffect(() => {
    if (!watching || !unmetered || writeScope === null || keysSignature === "") return;
    const keys: string[] = JSON.parse(keysSignature);
    const urls = keys.flatMap((key) => thumbnailUrl(appConfig.urls.exerciseMedia, key) ?? []);
    const controller = new AbortController();
    void prefetchMissing(urls, {
      signal: controller.signal,
      isCached: async (url) => (await Image.getCachePathAsync(url)) !== null,
      prefetch: (batch) => Image.prefetch(batch, "disk"),
    })
      .then((result) => {
        if (__DEV__) console.debug("[thumbnail-prefetch]", result);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [watching, unmetered, writeScope, keysSignature]);
}
