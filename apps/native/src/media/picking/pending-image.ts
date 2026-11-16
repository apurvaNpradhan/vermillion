/** Owns the processed files while a form is open, including picker results arriving after close. */
export function createPendingImage<Image>(discard: (image: Image) => void) {
  let image: Image | null = null;
  let disposed = false;
  return {
    current: () => image,
    reopen() {
      disposed = false;
    },
    replace(next: Image | null) {
      if (disposed) {
        if (next) discard(next);
        return;
      }
      if (image && image !== next) discard(image);
      image = next;
    },
    dispose() {
      disposed = true;
      if (image) discard(image);
      image = null;
    },
  };
}
