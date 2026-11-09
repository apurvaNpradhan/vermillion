import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { sha256Hex } from "./sha256";
import {
  canonicalOpsJson,
  checkSyncLimits,
  computeOpsDigest,
  isSyncSchemaVersionSupported,
  SYNC_LIMITS,
  SYNC_MIN_SCHEMA_VERSION,
  SYNC_SCHEMA_VERSION,
  syncUploadRequestSchema,
  type SyncOp,
} from "./sync";

describe("sha256Hex", () => {
  it.each([
    "",
    "abc",
    "héllo wörld",
    "😀".repeat(50),
    "x".repeat(55),
    "x".repeat(56),
    "x".repeat(64),
  ])("matches node:crypto for %j", (text) => {
    expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
  });
});

describe("canonical ops digest", () => {
  const put: SyncOp = { op: "PUT", table: "exercise", id: "a", opData: { title: "T", body: "B" } };

  it("does not depend on key order", () => {
    const reordered: SyncOp = {
      opData: { body: "B", title: "T" },
      id: "a",
      table: "exercise",
      op: "PUT",
    };
    expect(canonicalOpsJson([reordered])).toBe(canonicalOpsJson([put]));
    expect(computeOpsDigest([reordered])).toBe(computeOpsDigest([put]));
  });

  it("is compact, sorted JSON", () => {
    expect(canonicalOpsJson([put, { op: "DELETE", table: "exercise", id: "b" }])).toBe(
      '[{"id":"a","op":"PUT","opData":{"body":"B","title":"T"},"table":"exercise"},{"id":"b","op":"DELETE","table":"exercise"}]',
    );
  });

  it("is the sha256 of the canonical text", () => {
    expect(computeOpsDigest([put])).toBe(
      createHash("sha256")
        .update(canonicalOpsJson([put]))
        .digest("hex"),
    );
  });

  it("changes with any content, order or null versus empty string", () => {
    const other: SyncOp = { op: "PATCH", table: "exercise", id: "a", opData: { body: "" } };
    const nulled: SyncOp = { op: "PATCH", table: "exercise", id: "a", opData: { body: null } };
    expect(computeOpsDigest([put])).not.toBe(computeOpsDigest([other]));
    expect(computeOpsDigest([other])).not.toBe(computeOpsDigest([nulled]));
    expect(computeOpsDigest([put, other])).not.toBe(computeOpsDigest([other, put]));
  });

  it("escapes strings so values cannot forge structure", () => {
    const a: SyncOp = { op: "PUT", table: "n", id: "1", opData: { t: 'x","op":"DELETE' } };
    expect(canonicalOpsJson([a])).toContain('\\"');
    expect(computeOpsDigest([a])).toHaveLength(64);
  });
});

describe("limits and versions", () => {
  const op = (opData: SyncOp["opData"]): SyncOp => ({
    op: "PATCH",
    table: "exercise",
    id: "a",
    opData,
  });

  it("accepts a small transaction", () => {
    expect(checkSyncLimits([op({ title: "x" })])).toBeNull();
  });

  it("refuses too many operations, fields, long names and large values", () => {
    expect(
      checkSyncLimits(Array.from({ length: SYNC_LIMITS.maxOps + 1 }, () => op({})))?.reason,
    ).toBe("operations");
    const fields = Object.fromEntries(
      Array.from({ length: SYNC_LIMITS.maxFields + 1 }, (_, i) => [`f${i}`, 1]),
    );
    expect(checkSyncLimits([op(fields)])?.reason).toBe("fields");
    expect(
      checkSyncLimits([{ ...op({}), id: "i".repeat(SYNC_LIMITS.maxNameLength + 1) }])?.reason,
    ).toBe("name");
    expect(checkSyncLimits([op({ body: "x".repeat(SYNC_LIMITS.maxValueBytes + 1) })])?.reason).toBe(
      "value",
    );
  });

  it("refuses an oversize transaction", () => {
    const big = Array.from({ length: 20 }, () =>
      op({ body: "x".repeat(SYNC_LIMITS.maxValueBytes) }),
    );
    expect(checkSyncLimits(big)?.reason).toBe("bytes");
  });

  it("windows the schema version", () => {
    expect(isSyncSchemaVersionSupported(SYNC_SCHEMA_VERSION)).toBe(true);
    expect(isSyncSchemaVersionSupported(SYNC_MIN_SCHEMA_VERSION - 1)).toBe(false);
    expect(isSyncSchemaVersionSupported(SYNC_SCHEMA_VERSION + 1)).toBe(false);
  });

  it("validates the request shape", () => {
    const ops: SyncOp[] = [{ op: "DELETE", table: "exercise", id: "a" }];
    const request = {
      userId: "u",
      installId: "0190a0a0-0000-7000-8000-000000000000",
      txId: 1,
      schemaVersion: 1,
      digest: computeOpsDigest(ops),
      ops,
    };
    expect(syncUploadRequestSchema.safeParse(request).success).toBe(true);
    expect(syncUploadRequestSchema.safeParse({ ...request, digest: "nope" }).success).toBe(false);
    expect(syncUploadRequestSchema.safeParse({ ...request, ops: [] }).success).toBe(false);
  });
});
