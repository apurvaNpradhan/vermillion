import { describe, expect, it } from "vitest";

import { createTabBarHolds } from "./tab-bar-holds";

describe("tab bar holds", () => {
  it("stays hidden until every hold is released", () => {
    const changes: boolean[] = [];
    const holds = createTabBarHolds((hidden) => changes.push(hidden));
    const picker = holds.hold();
    const form = holds.hold();
    form();
    expect(changes).toEqual([true]);
    picker();
    expect(changes).toEqual([true, false]);
  });

  it("ignores a second release of the same hold", () => {
    const changes: boolean[] = [];
    const holds = createTabBarHolds((hidden) => changes.push(hidden));
    const first = holds.hold();
    const second = holds.hold();
    first();
    first();
    expect(changes).toEqual([true]);
    second();
    expect(changes).toEqual([true, false]);
  });
});
