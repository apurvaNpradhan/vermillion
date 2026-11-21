import { describe, expect, it } from "vitest";

import { redactEmails, scrubUrl } from "./telemetry-scrub";

describe("redactEmails", () => {
  it("replaces addresses anywhere in the text", () => {
    expect(redactEmails("sent to Ada.Lovelace+gym@example.co.uk and bob@x.io!")).toBe(
      "sent to [email] and [email]!",
    );
  });

  it("leaves text without an address alone", () => {
    expect(redactEmails("Network request failed at 12:30")).toBe("Network request failed at 12:30");
  });
});

describe("scrubUrl", () => {
  it("drops the query string and fragment", () => {
    expect(scrubUrl("https://api.example.com/rpc/sync/upload?token=abc&email=a@b.co#frag")).toBe(
      "https://api.example.com/rpc/sync/upload",
    );
  });

  it("drops credentials in the authority", () => {
    expect(scrubUrl("https://user:secret@host.example/path")).toBe("https://host.example/path");
  });

  it("replaces long token-like path segments", () => {
    expect(scrubUrl("https://host.example/verify/aB3dE5gH7jK9mN1pQ3sT5vX7z/done")).toBe(
      "https://host.example/verify/:token/done",
    );
  });

  it("keeps ordinary hosts and short paths", () => {
    expect(scrubUrl("https://cinnabar-api.lostsignal.cloud/api/health")).toBe(
      "https://cinnabar-api.lostsignal.cloud/api/health",
    );
  });

  it("handles an app route", () => {
    expect(scrubUrl("/settings/workouts?x=1")).toBe("/settings/workouts");
  });
});
