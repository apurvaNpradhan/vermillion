import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openAndroidAuthSession } from "./android-auth-session";
import { matchesCallback } from "./auth-callback";

const callback = (id: string) => new URL(`sigil:///?authAttempt=${id}`);

function androidBrowser() {
  const appState = new Set<(active: boolean) => void>();
  const links = new Set<(url: string) => void>();
  const open = vi.fn(() => Promise.resolve(true));
  return {
    appState,
    links,
    open,
    returnToApp() {
      for (const notify of appState) notify(false);
      for (const notify of appState) notify(true);
    },
    redirect(url: URL) {
      for (const notify of links) notify(url.href);
    },
    start(id: string) {
      const controller = new AbortController();
      const allowRetry = vi.fn();
      const result = openAndroidAuthSession(
        {
          onAppActiveChange(listener) {
            appState.add(listener);
            return () => appState.delete(listener);
          },
          onLink(listener) {
            links.add(listener);
            return () => links.delete(listener);
          },
          open,
        },
        (url) => matchesCallback(url, callback(id)),
        controller.signal,
        allowRetry,
      );
      return { controller, allowRetry, result };
    },
  };
}

describe("Android Google browser", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("accepts a matching redirect that arrives after the foreground fallback", async () => {
    const browser = androidBrowser();
    const attempt = browser.start("first");

    browser.returnToApp();
    expect(attempt.allowRetry).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2_001);

    const signedIn = callback("first");
    signedIn.searchParams.set("cookie", "test");
    browser.redirect(signedIn);
    await expect(attempt.result).resolves.toEqual({ type: "success", url: signedIn.href });
    expect(browser.appState.size).toBe(0);
    expect(browser.links.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up synchronously before a retry and ignores a redirect from the old tab", async () => {
    const browser = androidBrowser();
    const first = browser.start("first");
    browser.returnToApp();
    expect(first.allowRetry).toHaveBeenCalledOnce();

    first.controller.abort();
    expect(browser.appState.size).toBe(0);
    expect(browser.links.size).toBe(0);
    const next = browser.start("next");
    browser.redirect(callback("first"));
    browser.redirect(new URL("sigil:///different?authAttempt=next"));
    expect(browser.links.size).toBe(1);
    expect(browser.open).toHaveBeenCalledTimes(2);

    browser.redirect(callback("next"));
    await expect(first.result).resolves.toEqual({ type: "cancel" });
    await expect(next.result).resolves.toEqual({ type: "success", url: callback("next").href });
  });

  it("stops listening for a foreground return on unmount", async () => {
    const browser = androidBrowser();
    const attempt = browser.start("first");
    attempt.controller.abort();
    browser.returnToApp();
    await vi.runAllTimersAsync();
    expect(attempt.allowRetry).not.toHaveBeenCalled();
    await expect(attempt.result).resolves.toEqual({ type: "cancel" });
    expect(browser.appState.size).toBe(0);
    expect(browser.links.size).toBe(0);
  });

  it("settles and removes the listeners even when AppState sends no return event", async () => {
    const browser = androidBrowser();
    const attempt = browser.start("first");
    await vi.runAllTimersAsync();
    await expect(attempt.result).resolves.toEqual({ type: "cancel" });
    expect(browser.appState.size).toBe(0);
    expect(browser.links.size).toBe(0);
  });

  it("removes the listeners if the browser cannot open", async () => {
    const browser = androidBrowser();
    browser.open.mockRejectedValueOnce(new Error("No browser"));
    const attempt = browser.start("first");
    await expect(attempt.result).rejects.toThrow("No browser");
    expect(browser.appState.size).toBe(0);
    expect(browser.links.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
