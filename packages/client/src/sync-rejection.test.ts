import { SYNC_REJECTION_CODES, SYNC_TRANSACTION_ROLLED_BACK } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { rejectionMessageKey } from "./sync-rejection";

describe("rejectionMessageKey", () => {
  it("maps every code the server can store to its own message", () => {
    const keys = [...SYNC_REJECTION_CODES, SYNC_TRANSACTION_ROLLED_BACK].map(rejectionMessageKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("sync__rejected_code_unknown");
  });

  it("falls back for a code from a newer server", () => {
    expect(rejectionMessageKey("SYNC_SOMETHING_NEW")).toBe("sync__rejected_code_unknown");
  });
});
