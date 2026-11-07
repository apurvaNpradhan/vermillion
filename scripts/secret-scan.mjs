// Staged secret scan: rejects added lines that look like credentials.
// Complements `varlock scan`, which only knows values from the env schema.
// Allow a deliberate match with a trailing `secret-scan:allow` comment.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const PATTERNS = [
  ["private key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ["AWS access key id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["Stripe live key", /\b[sr]k_live_[A-Za-z0-9]{16,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Resend API key", /\bre_[A-Za-z0-9_]{24,}\b/],
  [
    "database URL with password",
    /\bpostgres(?:ql)?:\/\/[^\s:@/]+:(?!password\b|postgres\b|\$\{)[^\s:@/]{8,}@(?!localhost|127\.0\.0\.1|postgres\b)/,
  ],
];

/** Findings `{ label, line }` for one added line. */
export function scanLine(line) {
  if (line.includes("secret-scan:allow")) return [];
  return PATTERNS.flatMap(([label, pattern]) => (pattern.test(line) ? [{ label, line }] : []));
}

/** Findings `{ file, label }` in the added lines of a unified diff. */
export function scanDiff(diff) {
  const findings = [];
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) file = line.slice(6);
    else if (line.startsWith("+")) {
      for (const { label } of scanLine(line.slice(1))) findings.push({ file, label });
    }
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const diff = execFileSync(
    "git",
    // Vendored skills are third-party docs pinned by hash in skills-lock.json.
    [
      "diff",
      "--cached",
      "--unified=0",
      "--no-color",
      "--diff-filter=ACMR",
      "--",
      ".",
      ":(exclude).agents/skills",
    ],
    {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  const findings = scanDiff(diff);
  for (const { file, label } of findings)
    console.error(`secret-scan: possible ${label} in ${file}`);
  if (findings.length > 0) {
    console.error('Remove it, or mark a deliberate match with a "secret-scan:allow" comment.');
    process.exit(1);
  }
}
