import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createObjectStore, ObjectStoreError } from "./storage";

/**
 * The S3 API as a store answers it when part of a batch delete fails. MinIO and R2 do not fail on
 * demand, so this one is a stand-in for the network boundary only: it speaks just enough XML.
 */
let server: Server | undefined;
afterEach(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  server = undefined;
});

type Answer = { status: number; body: string };

function addressOf(listening: Server) {
  return z.object({ port: z.number() }).parse(listening.address());
}

async function storeAnswering(handler: (method: string, url: URL) => Answer) {
  server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      const answer = handler(request.method ?? "GET", new URL(request.url ?? "/", "http://x"));
      response.writeHead(answer.status, { "Content-Type": "application/xml" });
      response.end(answer.body);
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = addressOf(server);
  return createObjectStore({
    endpoint: `http://127.0.0.1:${port}`,
    region: "auto",
    bucket: "test",
    accessKeyId: "key",
    secretAccessKey: "secret",
  });
}

const listing = (keys: string[], next?: string) =>
  `<ListBucketResult>${keys.map((key) => `<Contents><Key>${key}</Key></Contents>`).join("")}<IsTruncated>${
    next ? "true" : "false"
  }</IsTruncated>${next ? `<NextContinuationToken>${next}</NextContinuationToken>` : ""}</ListBucketResult>`;

describe("object store prefix deletion", () => {
  it("fails when the store reports keys it could not delete, so the purge is retried", async () => {
    const store = await storeAnswering((method) =>
      method === "GET"
        ? { status: 200, body: listing(["users/a/1.jpg", "users/a/2.jpg"]) }
        : {
            status: 200,
            body: "<DeleteResult><Error><Key>users/a/2.jpg</Key><Code>AccessDenied</Code></Error></DeleteResult>",
          },
    );
    await expect(store.deletePrefix("users/a/")).rejects.toBeInstanceOf(ObjectStoreError);
  });

  it("fails on a batch the store refuses", async () => {
    const store = await storeAnswering((method) =>
      method === "GET"
        ? { status: 200, body: listing(["users/a/1.jpg"]) }
        : { status: 503, body: "<Error/>" },
    );
    await expect(store.deletePrefix("users/a/")).rejects.toMatchObject({ status: 503 });
  });

  it("fails on a listing the store refuses, and deletes nothing", async () => {
    const calls: string[] = [];
    const store = await storeAnswering((method) => {
      calls.push(method);
      return { status: 500, body: "<Error/>" };
    });
    await expect(store.deletePrefix("users/a/")).rejects.toMatchObject({ status: 500 });
    // The client retries a listing; no delete was ever sent.
    expect(calls.every((method) => method === "GET")).toBe(true);
  });

  it("stops at the first failed page: later pages are not claimed as deleted", async () => {
    let pages = 0;
    const store = await storeAnswering((method, url) => {
      if (method === "GET") {
        pages += 1;
        return url.searchParams.get("continuation-token")
          ? { status: 200, body: listing(["users/a/3.jpg"]) }
          : { status: 200, body: listing(["users/a/1.jpg", "users/a/2.jpg"], "page-2") };
      }
      return { status: 200, body: "<DeleteResult><Error><Key>x</Key></Error></DeleteResult>" };
    });
    await expect(store.deletePrefix("users/a/")).rejects.toBeInstanceOf(ObjectStoreError);
    expect(pages).toBe(1);
  });

  it("deletes every page of a truncated listing and counts them", async () => {
    const store = await storeAnswering((method, url) => {
      if (method === "GET") {
        return url.searchParams.get("continuation-token")
          ? { status: 200, body: listing(["users/a/3.jpg"]) }
          : { status: 200, body: listing(["users/a/1.jpg", "users/a/2.jpg"], "page-2") };
      }
      return { status: 200, body: "<DeleteResult></DeleteResult>" };
    });
    expect(await store.deletePrefix("users/a/")).toBe(3);
  });
});
