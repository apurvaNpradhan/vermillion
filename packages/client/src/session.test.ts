import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vitest";

import { clearSession, SESSION_QUERY_KEY } from "./session";

it("notifies the existing route-guard observer and removes other user data", async () => {
  const client = new QueryClient();
  client.setQueryData(SESSION_QUERY_KEY, { user: { id: "user-a" } });
  client.setQueryData(["notes"], ["private note"]);
  const observer = new QueryObserver(client, { queryKey: SESSION_QUERY_KEY, enabled: false });
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    await clearSession(client);
    expect(observer.getCurrentResult().data).toBeNull();
    expect(client.getQueryData(["notes"])).toBeUndefined();
  } finally {
    unsubscribe();
    client.clear();
  }
});
