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

it("works on native runtimes without RelativeTimeFormat", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, "RelativeTimeFormat");
  Object.defineProperty(Intl, "RelativeTimeFormat", { configurable: true, value: undefined });
  try {
    expect(
      lastDoneLabel("2026-09-21T23:00:00Z", new Date("2026-09-24T23:00:00Z"), "en", "UTC"),
    ).toBe("3 days ago");
  } finally {
    if (descriptor) Object.defineProperty(Intl, "RelativeTimeFormat", descriptor);
  }
});

it("localizes today, tomorrow and future calendar days with the supported locale fallback", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  expect(lastDoneLabel("2026-09-24T01:00:00Z", now, "de", "UTC")).toBe("today");
  expect(lastDoneLabel("2026-09-25T01:00:00Z", now, "en", "UTC")).toBe("tomorrow");
  expect(lastDoneLabel("2026-09-27T01:00:00Z", now, "en", "UTC")).toBe("in 3 days");
});
