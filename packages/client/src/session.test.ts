import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearSession,
  expireRememberedSession,
  refreshSession,
  SESSION_FETCH_TIMEOUT_MS,
  SESSION_QUERY_KEY,
  sessionQueryOptions,
  type SessionStore,
} from "./session";

it("notifies the existing route-guard observer and removes other user data", async () => {
  const client = new QueryClient();
  client.setQueryData(SESSION_QUERY_KEY, { user: { id: "user-a" } });
  client.setQueryData(["exercises"], ["private exercise"]);
  const observer = new QueryObserver(client, { queryKey: SESSION_QUERY_KEY, enabled: false });
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    await clearSession(client);
    expect(observer.getCurrentResult().data).toBeNull();
    expect(client.getQueryData(["exercises"])).toBeUndefined();
  } finally {
    unsubscribe();
    client.clear();
  }
});

describe("sessionQueryOptions", () => {
  const user = { id: "user-a", email: "a@example.com" };
  const future = () => ({ id: "s1", expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  const live = { user, session: future() };
  afterEach(() => vi.useRealTimers());
  const memory = () => {
    let held: SessionStore["read"] extends () => infer T ? T : never = null;
    return {
      read: () => held,
      // SAFETY: the doubles below only ever store what their own getSession returned.
      write: (value: typeof held) => {
        held = value;
      },
    };
  };
  const run = (
    getSession: () => Promise<{ data: object | null; error: Error | null }>,
    store: ReturnType<typeof memory>,
  ) =>
    new QueryClient().fetchQuery({
      // SAFETY: test doubles standing in for the Better Auth client and its session type.
      ...sessionQueryOptions({ getSession } as never, store as never),
      retry: false,
    });

  it("remembers the answer and forgets it when nobody is signed in", async () => {
    const store = memory();
    await run(async () => ({ data: live, error: null }), store);
    expect(store.read()).toEqual(live);
    await run(async () => ({ data: null, error: null }), store);
    expect(store.read()).toBeNull();
  });

  it("keeps the remembered user signed in when the server cannot be reached", async () => {
    const store = memory();
    store.write(live as never);
    expect(
      await run(async () => ({ data: null, error: new Error("Network request failed") }), store),
    ).toEqual(live);
    expect(
      await run(async () => {
        throw new Error("fetch failed");
      }, store),
    ).toEqual(live);
  });

  it("does not trust an expired remembered session: signed out, and forgotten", async () => {
    const store = memory();
    store.write({ user, session: { id: "s1", expiresAt: new Date(Date.now() - 1000) } } as never);
    expect(
      await run(async () => ({ data: null, error: new Error("Network request failed") }), store),
    ).toBeNull();
    expect(store.read()).toBeNull();
    store.write({ user, session: { id: "s1", expiresAt: "not a date" } } as never);
    expect(await run(async () => ({ data: null, error: new Error("offline") }), store)).toBeNull();
  });

  it("treats a 401 as the server's answer, not a lost connection", async () => {
    const store = memory();
    store.write(live as never);
    const error = Object.assign(new Error("Unauthorized"), { status: 401 });
    expect(await run(async () => ({ data: null, error }), store)).toBeNull();
    expect(store.read()).toBeNull();
  });

  it("still applies a definitive answer that arrives after the stored session was used", async () => {
    vi.useFakeTimers();
    const store = memory();
    store.write(live as never);
    const client = new QueryClient();
    let reply: (value: { data: null; error: null }) => void = () => undefined;
    const slow = new Promise<{ data: null; error: null }>((resolve) => (reply = resolve));
    // SAFETY: test double standing in for the Better Auth client.
    const options = sessionQueryOptions({ getSession: () => slow } as never, store as never);
    const first = client.fetchQuery({ ...options, retry: false });
    await vi.advanceTimersByTimeAsync(SESSION_FETCH_TIMEOUT_MS);
    expect(await first).toEqual(live);
    reply({ data: null, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getQueryData(SESSION_QUERY_KEY)).toBeNull();
    expect(store.read()).toBeNull();
  });

  it("never persists an answer that was in flight when the user signed out", async () => {
    const store = memory();
    const client = new QueryClient();
    let reply: (value: { data: typeof live; error: null }) => void = () => undefined;
    const slow = new Promise<{ data: typeof live; error: null }>((resolve) => (reply = resolve));
    // SAFETY: test double standing in for the Better Auth client.
    const options = sessionQueryOptions({ getSession: () => slow } as never, store as never);
    const running = client.fetchQuery({ ...options, retry: false }).catch(() => undefined);
    await clearSession(client);
    reply({ data: live, error: null });
    await running;
    expect(store.read()).toBeNull();
    expect(client.getQueryData(SESSION_QUERY_KEY)).toBeNull();
  });

  it("fails without a remembered session, so the guards fall back to the device owner", async () => {
    await expect(
      run(async () => ({ data: null, error: new Error("offline") }), memory()),
    ).rejects.toThrow("offline");
  });

  it("makes a new request after sign-in instead of joining a lookup from before it", async () => {
    const store = memory();
    const client = new QueryClient();
    const replies: Array<(value: { data: typeof live | null; error: null }) => void> = [];
    const getSession = vi.fn(
      () =>
        new Promise<{ data: typeof live | null; error: null }>((resolve) => replies.push(resolve)),
    );
    // SAFETY: test double standing in for the Better Auth client.
    const authClient = { getSession } as never;
    const before = client
      .fetchQuery({ ...sessionQueryOptions(authClient, store as never), retry: false })
      .catch(() => undefined);
    const after = refreshSession(client, authClient, store as never);
    await vi.waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
    replies[1]?.({ data: live, error: null });
    expect(await after).toEqual(live);
    // The old lookup answers "nobody" late; it must not replace the confirmed session.
    replies[0]?.({ data: null, error: null });
    await before;
    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual(live);
    expect(store.read()).toEqual(live);
  });

  it("does not let a timed-out lookup replace a newer confirmed session", async () => {
    vi.useFakeTimers();
    const store = memory();
    store.write(live as never);
    const client = new QueryClient();
    let reply: (value: { data: null; error: null }) => void = () => undefined;
    const slow = new Promise<{ data: null; error: null }>((resolve) => (reply = resolve));
    const first = client.fetchQuery({
      // SAFETY: test double standing in for the Better Auth client.
      ...sessionQueryOptions({ getSession: () => slow } as never, store as never),
      retry: false,
    });
    await vi.advanceTimersByTimeAsync(SESSION_FETCH_TIMEOUT_MS);
    await first;
    // A newer lookup confirms the session; then the old one answers "nobody".
    const confirmed = {
      ...live,
      session: { ...live.session, id: "s2" },
    };
    await refreshSession(
      client,
      // SAFETY: test double standing in for the Better Auth client.
      { getSession: async () => ({ data: confirmed, error: null }) } as never,
      store as never,
    );
    reply({ data: null, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual(confirmed);
    expect(store.read()).toEqual(confirmed);
  });

  it("does not hand out a fallback that ran out while waiting for the network", async () => {
    vi.useFakeTimers();
    const store = memory();
    const soon = { user, session: { id: "s1", expiresAt: new Date(Date.now() + 1000) } };
    store.write(soon as never);
    // SAFETY: test double standing in for the Better Auth client.
    const options = sessionQueryOptions(
      { getSession: () => new Promise(() => undefined) } as never,
      store as never,
    );
    const running = new QueryClient().fetchQuery({ ...options, retry: false });
    await vi.advanceTimersByTimeAsync(SESSION_FETCH_TIMEOUT_MS);
    expect(await running).toBeNull();
    expect(store.read()).toBeNull();
  });

  it("expires a cached session on resume once it has run out", () => {
    const store = memory();
    const client = new QueryClient();
    const gone = { user, session: { id: "s1", expiresAt: new Date(Date.now() - 1000) } };
    store.write(gone as never);
    client.setQueryData(SESSION_QUERY_KEY, gone);
    expireRememberedSession(client, store as never);
    expect(client.getQueryData(SESSION_QUERY_KEY)).toBeNull();
    expect(store.read()).toBeNull();
    client.setQueryData(SESSION_QUERY_KEY, live);
    expireRememberedSession(client, store as never);
    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual(live);
  });
});
