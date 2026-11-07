import { describe, expect, test } from "vitest";
import { scanDiff, scanLine } from "./secret-scan.mjs";

describe("secret scan", () => {
  test("flags credential shapes", () => {
    expect(scanLine("-----BEGIN RSA PRIVATE KEY-----")).toHaveLength(1); // secret-scan:allow
    expect(scanLine(`key = "AKIA${"A".repeat(16)}"`)).toHaveLength(1);
    expect(scanLine(`t = ghp_${"a".repeat(36)}`)).toHaveLength(1);
    expect(
      scanLine("DATABASE_URL=postgres://app:s3cretpassw0rd@db.example.com:5432/app"), // secret-scan:allow
    ).toHaveLength(1);
  });

  test("flags Resend keys without a second underscore", () => {
    expect(scanLine(`RESEND_API_KEY=re_${"a".repeat(32)}`)).toHaveLength(1);
    expect(scanLine("const re_x = 1;")).toEqual([]);
  });

  test("ignores local dev URLs and allow-marked lines", () => {
    expect(scanLine("postgres://postgres:password@localhost:5432/app")).toEqual([]);
    expect(scanLine(`k = "AKIA${"A".repeat(16)}" // secret-scan:allow`)).toEqual([]);
    expect(scanLine("const a = 1;")).toEqual([]);
  });

  test("reports the file of an added line", () => {
    const diff = [
      "+++ b/a.ts",
      "@@ -0,0 +1 @@",
      "+-----BEGIN " + "PRIVATE KEY-----",
      "--- a/b.ts",
    ].join(
      // secret-scan:allow
      "\n",
    );
    expect(scanDiff(diff)).toEqual([{ file: "a.ts", label: "private key" }]);
  });
});
