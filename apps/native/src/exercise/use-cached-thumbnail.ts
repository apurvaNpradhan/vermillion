import { Image } from "expo-image";
import { useEffect, useState } from "react";

/** Resolve only expo-image's existing disk entry. getCachePathAsync never downloads a miss. */
export function useCachedThumbnail(uri: string | null, enabled: boolean) {
  const [cached, setCached] = useState<{ source: string; path: string | null } | null>(null);
  useEffect(() => {
    if (!enabled || uri === null) return;
    let active = true;
    void Image.getCachePathAsync(uri)
      .then((path) => {
        if (active) {
          // Both native implementations return an absolute filesystem path, not a URL.
          const localUri = path ? (path.startsWith("file://") ? path : `file://${path}`) : null;
          setCached({ source: uri, path: localUri });
        }
      })
      .catch(() => {
        if (active) setCached({ source: uri, path: null });
      });
    return () => {
      active = false;
    };
  }, [uri, enabled]);
  return {
    uri: cached?.source === uri ? cached.path : null,
    loading: enabled && uri !== null && cached?.source !== uri,
  };
}
