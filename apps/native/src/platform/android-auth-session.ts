const SESSION_TIMEOUT_MS = 120_000;

type AndroidBrowser = {
  onAppActiveChange: (listener: (active: boolean) => void) => () => void;
  onLink: (listener: (url: string) => void) => () => void;
  open: () => Promise<boolean>;
};

type BrowserResult = { type: "cancel" } | { type: "success"; url: string };

/** Allow retry after returning without a redirect, while still receiving a late callback. */
export function openAndroidAuthSession(
  browser: AndroidBrowser,
  isCallback: (url: string) => boolean,
  signal: AbortSignal,
  allowRetry: () => void,
): Promise<BrowserResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      resolve({ type: "cancel" });
      return;
    }

    let left = false;
    let finished = false;
    const stopAppState = browser.onAppActiveChange((active) => {
      if (active && left) allowRetry();
      left = !active;
    });
    const stopLinks = browser.onLink((url) => {
      if (isCallback(url)) finish({ type: "success", url });
    });
    const timeout = setTimeout(() => finish({ type: "cancel" }), SESSION_TIMEOUT_MS);

    function cleanup() {
      if (finished) return false;
      finished = true;
      clearTimeout(timeout);
      stopAppState();
      stopLinks();
      signal.removeEventListener("abort", cancel);
      return true;
    }

    function finish(result: BrowserResult) {
      if (cleanup()) resolve(result);
    }

    function cancel() {
      finish({ type: "cancel" });
    }

    signal.addEventListener("abort", cancel);
    // Android's native launch returns "opened" immediately. AppState and Linking stay ours.
    browser.open().then(
      (opened) => {
        if (!opened) cancel();
      },
      (error: Error) => {
        if (cleanup()) reject(error);
      },
    );
  });
}
