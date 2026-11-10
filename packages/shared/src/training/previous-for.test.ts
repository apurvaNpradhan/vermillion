import { describe, expect, it } from "vitest";

import { previousFor } from "./previous-for";
import { loggedSet, sessionOf, untickedSet } from "./session-fixtures";

describe("previousFor", () => {
  it("is null without history", () => {
    expect(previousFor([], "working", 0)).toBeNull();
  });

  it("matches by kind and by position within the kind in the latest finished Session", () => {
    const warmup = loggedSet({ kind: "warmup", weight_kg: 40 });
    const first = loggedSet({ weight_kg: 100 });
    const second = loggedSet({ weight_kg: 105 });
    const history = [sessionOf("a", "2026-01-02T10:00:00Z", [warmup, first, second])];
    expect(previousFor(history, "warmup", 0)).toBe(warmup);
    expect(previousFor(history, "working", 0)).toBe(first);
    expect(previousFor(history, "working", 1)).toBe(second);
    expect(previousFor(history, "working", 2)).toBeNull();
    expect(previousFor(history, "drop", 0)).toBeNull();
  });

  it("uses the latest Session by start, whatever the order passed, ties by id", () => {
    const old = loggedSet({ weight_kg: 80 });
    const newest = loggedSet({ weight_kg: 90 });
    const tie = loggedSet({ weight_kg: 95 });
    const history = [
      sessionOf("b", "2026-02-01T10:00:00Z", [newest]),
      sessionOf("a", "2026-01-01T10:00:00Z", [old]),
      sessionOf("c", "2026-02-01T10:00:00Z", [tie]),
    ];
    expect(previousFor(history, "working", 0)).toBe(tie);
  });

  it("ignores unfinished Sessions and unticked sets", () => {
    const done = loggedSet({ weight_kg: 70 });
    const history = [
      sessionOf("a", "2026-01-01T10:00:00Z", [done]),
      sessionOf("b", "2026-02-01T10:00:00Z", [loggedSet({ weight_kg: 999 })], false),
      sessionOf("c", "2026-01-15T10:00:00Z", [untickedSet(), untickedSet()]),
    ];
    expect(previousFor(history, "working", 0)).toBe(done);
  });

  it("takes the latest Session even when it lacks the position", () => {
    const history = [
      sessionOf("a", "2026-01-01T10:00:00Z", [loggedSet(), loggedSet(), loggedSet()]),
      sessionOf("b", "2026-01-08T10:00:00Z", [loggedSet()]),
    ];
    expect(previousFor(history, "working", 2)).toBeNull();
  });
});
