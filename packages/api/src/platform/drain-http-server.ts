import type { ServerType } from "@hono/node-server";

/** Stops new connections, then waits for accepted requests before dependencies are stopped. */
export function drainHttpServer(server: Pick<ServerType, "close">): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => (error ? reject(error) : resolve()));
  });
}
