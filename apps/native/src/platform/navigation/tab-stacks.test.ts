import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "../../../app/(app)");
const tabs = readdirSync(APP, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

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

  it("pops every tab to its first screen when it is left", () => {
    const layout = readFileSync(join(APP, "_layout.tsx"), "utf8");
    expect(layout).toMatch(/popToTopOnBlur:\s*true/u);
  });
});
