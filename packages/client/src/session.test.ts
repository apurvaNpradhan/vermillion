import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { clearSession, SESSION_QUERY_KEY, sessionQueryOptions, type SessionStore } from "./session";

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
    await run(async () => ({ data: { user }, error: null }), store);
    expect(store.read()).toEqual({ user });
    await run(async () => ({ data: null, error: null }), store);
    expect(store.read()).toBeNull();
  });

  it("keeps the remembered user signed in when the server cannot be reached", async () => {
    const store = memory();
    store.write({ user } as never);
    expect(
      await run(async () => ({ data: null, error: new Error("Network request failed") }), store),
    ).toEqual({ user });
    expect(
      await run(async () => {
        throw new Error("fetch failed");
      }, store),
    ).toEqual({ user });
  });

  it("fails without a remembered session, so the guards fall back to the device owner", async () => {
    await expect(
      run(async () => ({ data: null, error: new Error("offline") }), memory()),
    ).rejects.toThrow("offline");
  });
});
