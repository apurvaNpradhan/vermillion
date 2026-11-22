import { z } from "zod";

/** What the email sheet's one submit does. The client is injected so the rule is testable. */
export type SendCodeDeps<K extends string> = {
  confirmOnline: () => Promise<boolean>;
  sendCode: (email: string) => Promise<K | null>;
};

export type SendCodeOutcome<K extends string> =
  | { status: "invalid" }
  | { status: "offline" }
  | { status: "failed"; errorKey: K }
  | { status: "sent"; email: string };

/**
 * Validates the address, checks the connection once, and asks for the code once. A successful
 * send is the only outcome that moves on, so the code screen is opened by one submit, never two.
 */
export async function submitEmail<K extends string>(
  raw: string,
  deps: SendCodeDeps<K>,
): Promise<SendCodeOutcome<K>> {
  const parsed = z.email().safeParse(raw.trim());
  if (!parsed.success) return { status: "invalid" };
  if (!(await deps.confirmOnline())) return { status: "offline" };
  const errorKey = await deps.sendCode(parsed.data);
  return errorKey ? { status: "failed", errorKey } : { status: "sent", email: parsed.data };
}
