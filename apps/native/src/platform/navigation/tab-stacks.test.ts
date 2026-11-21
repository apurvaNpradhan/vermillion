import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { NavigationState } from "expo-router";

import { blurredTabStack } from "./blurred-tab-stack";

const APP = join(__dirname, "../../../app/(app)");
const tabs = readdirSync(APP, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const tabState: NavigationState = {
  type: "tab",
  stale: false,
  key: "tabs",
  routeKeySeq: 2,
  index: 1,
  routeNames: ["index", "exercises"],
  routes: [
    { key: "home", name: "index" },
    {
      key: "exercises",
      name: "exercises",
      state: {
        type: "stack",
        stale: false,
        key: "exercise-stack",
        routeKeySeq: 2,
        index: 1,
        routeNames: ["index", "[id]"],
        routes: [
          { key: "library", name: "index" },
          { key: "detail", name: "[id]" },
        ],
      },
    },
  ],
};

describe("tab stacks", () => {
  it("finds the tabs", () => {
    expect(tabs).toEqual(
      expect.arrayContaining(["body", "exercises", "history", "muscles", "settings", "train"]),
    );
  });

  it.each(tabs)("%s names its first screen, which exists", (tab) => {
    const layout = readFileSync(join(APP, tab, "_layout.tsx"), "utf8");
    const initial = /unstable_settings\s*=\s*\{\s*initialRouteName:\s*"([^"]+)"/u.exec(layout)?.[1];
    expect(initial, `${tab}/_layout.tsx needs unstable_settings.initialRouteName`).toBeDefined();
    const route = initial ?? "";
    expect(
      existsSync(join(APP, tab, `${route}.tsx`)) || existsSync(join(APP, tab, route, "index.tsx")),
    ).toBe(true);
  });

  it("targets the exercise stack when switching away from exercise detail to Home", () => {
    expect(blurredTabStack({ ...tabState, index: 0 }, "exercises")).toBe("exercise-stack");
  });

  it("preserves exercise detail when a root modal takes focus", () => {
    expect(blurredTabStack(tabState, "exercises")).toBeUndefined();
  });
});
