import { readFileSync } from "node:fs";

import { expect } from "@playwright/test";

const LOG = new URL("../.artifacts/server.log", import.meta.url);

function readLog(): string[] {
  try {
    return readFileSync(LOG, "utf8").split("\n");
  } catch {
    return [];
  }
}

/** Every one-time code logged for `to`, oldest first. A code email's subject starts with it. */
export function emailCodes(to: string): string[] {
  const codes: string[] = [];
  for (const line of readLog()) {
    if (!line.startsWith(`[email] to=${to} `)) continue;
    const code = /subject="(\d{6})\b/.exec(line)?.[1];
    if (code) codes.push(code);
  }
  return codes;
}

/** Waits for a code beyond the `seen` earlier ones and returns the newest. */
export async function waitForEmailCode(to: string, seen: number): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      () =>
        (code =
          emailCodes(to).at(-1) && emailCodes(to).length > seen
            ? emailCodes(to).at(-1)
            : undefined),
      {
        message: `sign-in code for ${to}`,
        timeout: 20_000,
      },
    )
    .toBeTruthy();
  return code ?? "";
}

/** Whether an email to `to` with a subject matching `subject` was logged. */
export function hasEmail(to: string, subject: RegExp): boolean {
  return readLog().some((line) => line.startsWith(`[email] to=${to} `) && subject.test(line));
}

/**
 * The newest logged email to `to` (optionally matching a subject), and the
 * first link in its body. The server's log transport prints every email as
 * `[email] to=<address> subject="<subject>"` followed by the plain-text body.
 */
export function findEmailLink(to: string, subject?: RegExp): string | undefined {
  const lines = readLog();
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
