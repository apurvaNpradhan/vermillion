// Pure parts of the media copy (`copy-media.ts`): which source objects an exercise uses and where
// they land. No network here, so these are unit-tested.
/** Everything the copy writes goes under this prefix; the v1 media is never touched. */
export const DEST_PREFIX = "exercises/v2/";

/** Pixel size of the current thumbnails (measured on an existing v1 object: 180 x 180). */
export const THUMBNAIL_SIZE = 180;

export interface MediaSource {
  id: string;
  /** The small PNG: always the thumbnail source. */
  imageKey: string | null;
  /** The MP4, or null when the exercise has none. */
  videoKey: string | null;
}

export type MediaKind = "thumbnail" | "video" | "image";

export interface MediaTask {
  kind: MediaKind;
  source: string;
  dest: string;
}

export interface RowPlan {
  id: string;
  tasks: MediaTask[];
  /** Why the row cannot get a thumbnail or main image (nothing to convert). */
  problem: string | null;
}

/** The file name without its directory and extension. */
export function baseName(key: string): string {
  const name = key.slice(key.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export const thumbnailKey = (source: string): string =>
  `${DEST_PREFIX}thumbnails/${baseName(source)}.webp`;
export const videoKey = (source: string): string => `${DEST_PREFIX}videos/${baseName(source)}.mp4`;
export const imageKey = (source: string): string => `${DEST_PREFIX}images/${baseName(source)}.webp`;

/** The medium PNG next to a small one, or null when the key is not a `_small.png`. */
export function mediumSourceKey(smallKey: string): string | null {
  const suffix = "_small.png";
  return smallKey.endsWith(suffix) ? `${smallKey.slice(0, -suffix.length)}_medium.png` : null;
}

/**
 * The tasks for one exercise. The small PNG always makes the thumbnail. A medium PNG is copied
 * only for rows with no video (it is their main image); rows with a video never use it.
 */
export function planRow(source: MediaSource): RowPlan {
  const tasks: MediaTask[] = [];
  let problem: string | null = null;
  if (source.imageKey === null) {
    problem = "no source image";
  } else {
    tasks.push({ kind: "thumbnail", source: source.imageKey, dest: thumbnailKey(source.imageKey) });
  }
  if (source.videoKey !== null) {
    tasks.push({ kind: "video", source: source.videoKey, dest: videoKey(source.videoKey) });
  } else if (source.imageKey !== null) {
    const medium = mediumSourceKey(source.imageKey);
    if (medium === null) {
      problem ??= "no video and no medium image";
    } else {
      tasks.push({ kind: "image", source: medium, dest: imageKey(medium) });
    }
  }
  return { id: source.id, tasks, problem };
}

export interface MediaKeys {
  thumbnail_key: string | null;
  video_key: string | null;
  image_key?: string;
}

/** The keys a row ends up with, from the tasks that succeeded. */
export function keysFor(done: readonly MediaTask[]): MediaKeys {
  const find = (kind: MediaKind): string | undefined => done.find((t) => t.kind === kind)?.dest;
  const image = find("image");
  return {
    thumbnail_key: find("thumbnail") ?? null,
    video_key: find("video") ?? null,
    ...(image === undefined ? {} : { image_key: image }),
  };
}

// Mirror EXERCISE_MEDIA_LIMITS (packages/shared); node cannot load that file directly, so a test
// keeps the two equal.
export const MAX_THUMBNAIL_BYTES = 500 * 1024;
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

export const CONTENT_TYPES: Record<MediaKind, string> = {
  thumbnail: "image/webp",
  image: "image/webp",
  video: "video/mp4",
};

/** Whether a video fits the slot limit. */
export const videoFits = (bytes: number): boolean => bytes > 0 && bytes <= MAX_VIDEO_BYTES;

/** Object keys contain parentheses, spaces and `@`: encode each path segment for a URL. */
export const encodeKey = (key: string): string => key.split("/").map(encodeURIComponent).join("/");
