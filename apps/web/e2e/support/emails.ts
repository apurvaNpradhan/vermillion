import { readFileSync } from "node:fs";

import { expect } from "@playwright/test";

const LOG = new URL("../.artifacts/server.log", import.meta.url);

/**
 * The newest logged email to `to` (optionally matching a subject), and the
 * first link in its body. The server's log transport prints every email as
 * `[email] to=<address> subject="<subject>"` followed by the plain-text body.
 */
export function findEmailLink(to: string, subject?: RegExp): string | undefined {
  let log: string;
  try {
    log = readFileSync(LOG, "utf8");
  } catch {
    return undefined;
  }
  const lines = log.split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    if (!line?.startsWith(`[email] to=${to} `)) continue;
    if (subject && !subject.test(line)) continue;
    for (const body of lines.slice(index + 1, index + 40)) {
      const link = /https?:\/\/\S+/.exec(body);
      if (link) return link[0];
    }
  }
  return undefined;
}

/** Waits for the email job to run and returns the link in the message. */
export async function waitForEmailLink(to: string, subject?: RegExp): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(() => (link = findEmailLink(to, subject)), {
      message: `email to ${to}`,
      timeout: 20_000,
    })
    .toBeTruthy();
  return link ?? "";
}
