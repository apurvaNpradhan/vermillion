/** How an awaited step ended when it may also be abandoned or run out of time. */
export type Settled<T> =
  | { status: "done"; value: T }
  | { status: "abandoned" }
  | { status: "timeout" };

/**
 * Waits for `work`, but gives up when `abandoned` resolves first or `ms` pass. A step that never
 * settles (a browser flow cancelled on Android) must not hold a button in its busy state.
 * A rejection of `work` rejects. `work` keeps running after a give-up; its late result is the
 * caller's to ignore.
 */
export function settleWithin<T>(
  work: Promise<T>,
  abandoned: Promise<void>,
  ms: number,
): Promise<Settled<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ status: "timeout" }), ms);
    const finish = (result: Settled<T>) => {
      clearTimeout(timer);
      resolve(result);
    };
    void abandoned.then(() => finish({ status: "abandoned" }));
    work.then(
      (value) => finish({ status: "done", value }),
      (error: Error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
