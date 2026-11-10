/** Serializes system notification mutations; superseded jobs stop after every await. */
export function createRestReconciler() {
  let generation = 0;
  let queue = Promise.resolve();
  return {
    enqueue(run: (current: () => boolean) => Promise<void>) {
      const token = ++generation;
      queue = queue
        .catch(() => undefined)
        .then(async () => {
          if (token === generation) await run(() => token === generation);
        });
      return queue;
    },
    invalidate() {
      generation++;
    },
  };
}
