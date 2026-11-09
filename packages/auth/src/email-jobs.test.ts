import { describe, expect, it } from "vitest";

import { authEmailSchema } from "./email-jobs";

describe("queued auth email jobs", () => {
  it("still parse when the stored language is no longer supported", () => {
    const job = authEmailSchema.parse({
      kind: "sign-in-notice",
      userId: "u1",
      request: { requestedAt: "2026-01-01T00:00:00Z", localeHint: "de" },
    });
    expect(job.request.localeHint).toBe("en");
  });
});
