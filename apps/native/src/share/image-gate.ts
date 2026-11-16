/**
 * Counts the pictures a card is still loading, so the capture can wait for local images without
 * ever waiting on the network: it waits at most `timeoutMs`, then captures what is there.
 */
export type ImageGate = {
  /** A picture started loading; call the result once it has loaded or failed. Idempotent. */
  begin: () => () => void;
  /** Resolves when nothing is loading, or after `timeoutMs`. */
  whenIdle: (timeoutMs: number) => Promise<void>;
};

export function createImageGate(): ImageGate {
  let pending = 0;
  let waiting: (() => void)[] = [];
  const release = () => {
    if (pending > 0) return;
    const resolvers = waiting;
    waiting = [];
    for (const resolve of resolvers) resolve();
  };
  return {
    begin() {
      pending += 1;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        pending -= 1;
        release();
      };
    },
    whenIdle(timeoutMs) {
      if (pending === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          waiting = waiting.filter((entry) => entry !== finish);
          resolve();
        }, timeoutMs);
        const finish = () => {
          clearTimeout(timer);
          resolve();
        };
        waiting.push(finish);
      });
    },
  };
}
