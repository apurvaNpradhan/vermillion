/**
 * The public URL of a media file: the base URL plus the object key, each path segment encoded on
 * its own so spaces and reserved characters in a key survive and the `/` separators stay.
 */
export function exerciseMediaUrl(baseUrl: string, key: string): string {
  const base = baseUrl.replace(/\/+$/u, "");
  const path = key
    .split("/")
    .filter((segment) => segment !== "")
    .map(encodeURIComponent)
    .join("/");
  return `${base}/${path}`;
}

/** The URL of an exercise's thumbnail, or `null` when the exercise has none. */
export function thumbnailUrl(baseUrl: string, key: string | null): string | null {
  return key === null || key.trim() === "" ? null : exerciseMediaUrl(baseUrl, key);
}

/** The URL of an exercise's demonstration video, or `null` when the exercise has none. */
export function videoUrl(baseUrl: string, key: string | null): string | null {
  return key === null || key.trim() === "" ? null : exerciseMediaUrl(baseUrl, key);
}
