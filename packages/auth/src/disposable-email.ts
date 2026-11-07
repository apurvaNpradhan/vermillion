import blocked from "disposable-email-domains" with { type: "json" };

const DOMAINS = new Set(blocked.map((domain) => domain.toLowerCase()));

/**
 * Whether the address belongs to a disposable-email provider. The host and every
 * parent domain are checked, so `x.dropmail.me` matches `dropmail.me`.
 */
export function isDisposableEmail(email: string, domains: ReadonlySet<string> = DOMAINS): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return false;
  const host = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host) return false;
  const parts = host.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (domains.has(parts.slice(i).join("."))) return true;
  }
  return false;
}
