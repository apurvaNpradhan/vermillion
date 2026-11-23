import { createServerFn } from "@tanstack/react-start";
import { shareCodeSchema, shareSnapshotSchema, type ShareSnapshot } from "@workspace/shared";
import { z } from "zod";

import { appConfig } from "../../../../app.config.ts";

export type ShareResult =
  | { status: "found"; snapshot: ShareSnapshot }
  | { status: "missing" }
  | { status: "gone" }
  | { status: "error" };

const answer = z.object({ json: z.object({ snapshot: shareSnapshotSchema }) });

/**
 * Reads a Share link from the API on the server (the browser never calls the API, so it needs no
 * CORS). Unknown codes are `missing`, revoked ones `gone`; anything else is a retryable `error`.
 */
export async function fetchShare(code: string): Promise<ShareResult> {
  if (!shareCodeSchema.safeParse(code).success) return { status: "missing" };
  try {
    const response = await fetch(`${appConfig.urls.api}/rpc/share/get`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ json: { code } }),
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) return { status: "missing" };
    if (response.status === 410) return { status: "gone" };
    if (!response.ok) return { status: "error" };
    const parsed = answer.safeParse(await response.json());
    return parsed.success
      ? { status: "found", snapshot: parsed.data.json.snapshot }
      : { status: "error" };
  } catch {
    return { status: "error" };
  }
}

export const loadShare = createServerFn({ method: "GET" })
  .validator(z.object({ code: z.string().max(32) }))
  .handler(({ data }) => fetchShare(data.code.toUpperCase()));
