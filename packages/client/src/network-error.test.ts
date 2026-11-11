import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { errorMessageKey } from "./orpc-error";
import { isNetworkError, isOfflineAuthFailure } from "./network-error";
import { createQueryClient } from "./query-client";

describe("isNetworkError", () => {
  it("recognises fetch failures on the supported platforms", () => {
    expect(isNetworkError(new TypeError("Network request failed"))).toBe(true);
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
  });

  it("recognises expo/fetch failures on Android and iOS", () => {
    for (const message of [
      'fetch failed: Unable to resolve host "api.example.com": No address associated with hostname',
      "fetch failed: Failed to connect to api.example.com/10.0.2.2:443",
      "fetch failed: java.net.ConnectException: Connection refused",
      "fetch failed: Software caused connection abort",
      "fetch failed: The Internet connection appears to be offline.",
      "fetch failed: Could not connect to the server.",
    ]) {
      expect(isNetworkError(new Error(message))).toBe(true);
      const named = new Error(message);
      named.name = "FetchError";
      expect(isNetworkError(named)).toBe(true);
    }
  });
  it("recognises timeouts and aborts", () => {
    expect(isNetworkError(new DOMException("The operation timed out", "TimeoutError"))).toBe(true);
    expect(isNetworkError(new DOMException("Aborted", "AbortError"))).toBe(true);
  });

  it("looks through a cause chain", () => {
    const wrapped = new Error("Request failed", { cause: new TypeError("Network request failed") });
    expect(isNetworkError(wrapped)).toBe(true);
  });

  it("treats a server answer as not a network error, even a 5xx", () => {
    expect(isNetworkError(new ORPCError("INTERNAL_SERVER_ERROR"))).toBe(false);
    expect(isNetworkError(new ORPCError("BAD_GATEWAY", { message: "Network error" }))).toBe(false);
    expect(isNetworkError(new ORPCError("UNAUTHORIZED"))).toBe(false);
  });

  it("is false for other failures and never throws", () => {
    expect(isNetworkError(new Error("boom"))).toBe(false);
    expect(isNetworkError(new TypeError("Cannot read property 'x' of undefined"))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe("isOfflineAuthFailure", () => {
  it("is true only for status 0", () => {
    expect(isOfflineAuthFailure({ status: 0 })).toBe(true);
    expect(isOfflineAuthFailure({ status: 500 })).toBe(false);
    expect(isOfflineAuthFailure(null)).toBe(false);
  });
});

describe("offline wording", () => {
  it("maps a network error to the needs-a-connection message", () => {
    expect(errorMessageKey(new TypeError("Network request failed"))).toBe("errors__offline");
  });
});

describe("createQueryClient", () => {
  it("does not report a network failure, but reports other failures", async () => {
    const seen: Error[] = [];
    const client = createQueryClient({ onError: (error) => seen.push(error) });
    const mutation = (error: Error) =>
      client
        .getMutationCache()
        .build(client, {
          mutationFn: () => Promise.reject(error),
        })
        .execute(undefined)
        .catch(() => undefined);
    await mutation(new TypeError("Network request failed"));
    expect(seen).toEqual([]);
    const other = new Error("boom");
    await mutation(other);
    expect(seen).toEqual([other]);
  });
});
