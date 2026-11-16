/** A transfer was stopped because the queue stopped (sign-out, account switch, wipe). */
export class TransferCancelled extends Error {
  constructor() {
    super("The media transfer was cancelled");
    this.name = "TransferCancelled";
  }
}

/**
 * A file's media row is not on this device yet: the files of a new media are saved before the
 * transaction that writes the row, and must not be uploaded (or judged orphaned) until it commits.
 */
export class MediaNotCommitted extends Error {
  constructor() {
    super("The media row has not been written yet");
    this.name = "MediaNotCommitted";
  }
}

/**
 * The media row is on this device but its write has not reached the server yet (the device was
 * offline). Signing an upload now would only be refused as `NOT_FOUND`, so the upload waits until
 * the row's write is sent. Not a failure.
 */
export class MediaNotSynced extends Error {
  constructor() {
    super("The media row has not reached the server yet");
    this.name = "MediaNotSynced";
  }
}

/**
 * One generation of the queue: open from `start()` to `stop()`. Every transfer captures the signal
 * of the generation it began in, so nothing that finishes after a stop (and so after a wipe or an
 * account switch) writes a file or a record. A fresh generation starts at each `open()`.
 */
export type TransferGate = {
  readonly signal: AbortSignal;
  open(): void;
  close(): void;
};

export function createTransferGate(): TransferGate {
  let controller = new AbortController();
  // Closed until the queue starts.
  controller.abort();
  return {
    get signal() {
      return controller.signal;
    },
    open() {
      if (controller.signal.aborted) controller = new AbortController();
    },
    close() {
      controller.abort();
    },
  };
}

/**
 * Runs `work`, but gives up the moment `signal` aborts: the caller is released at once and the
 * late answer is dropped. The request itself is left to finish; nothing is written from it.
 */
export function cancellable<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(new TransferCancelled());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new TransferCancelled());
    signal.addEventListener("abort", onAbort, { once: true });
    work()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}
