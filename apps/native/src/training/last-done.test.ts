import { expect, it } from "vitest";
import { lastDoneLabel } from "./last-done";
it("compares local days through DST and UTC boundaries", () => {
  expect(
    lastDoneLabel(
      "2026-11-01T07:30:00Z",
      new Date("2026-11-02T08:30:00Z"),
      "en",
      "America/Los_Angeles",
    ),
  ).toBe("yesterday");
  expect(lastDoneLabel("2026-09-21T23:00:00Z", new Date("2026-09-24T23:00:00Z"), "en", "UTC")).toBe(
    "3 days ago",
  );
  expect(
    lastDoneLabel(
      "2026-09-22T01:00:00Z",
      new Date("2026-09-22T05:00:00Z"),
      "en",
      "America/Los_Angeles",
    ),
  ).toBe("today");
});
