import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { expect, it } from "vitest";

import { drainHttpServer } from "./drain-http-server";

const isAddressInfo = (address: string | AddressInfo | null): address is AddressInfo =>
  typeof address === "object" && address !== null;

it("finishes an accepted HTTP request before shutdown may stop its dependencies", async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let dependenciesStopped = false;
  const server = createServer(async (_request, response) => {
    entered();
    await blocked;
    response.end(dependenciesStopped ? "lost" : "queued");
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!isAddressInfo(address)) throw new Error("Missing listening address");
  const response = fetch(`http://127.0.0.1:${address.port}`, { headers: { connection: "close" } });
  try {
    await started;
    const shutdown = drainHttpServer(server).then(() => {
      dependenciesStopped = true;
    });
    expect(dependenciesStopped).toBe(false);
    release();
    expect(await (await response).text()).toBe("queued");
    await shutdown;
    expect(dependenciesStopped).toBe(true);
  } finally {
    release();
    server.closeAllConnections();
    server.close();
  }
});
