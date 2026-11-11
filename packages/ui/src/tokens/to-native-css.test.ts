import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { brandTokens, themeNames } from "./brand";
import { nativeTokenSources, toNativeCss } from "./to-native-css";

describe("native brand tokens", () => {
  it("keeps the committed native-tokens.css in sync with brand.ts", () => {
    const committed = readFileSync(new URL("../styles/native-tokens.css", import.meta.url), "utf8");
    expect(committed).toBe(toNativeCss());
  });

  it("maps the action role to HeroUI's accent in both themes", () => {
    expect(nativeTokenSources.accent).toBe("action");
    const css = toNativeCss();
    expect(css).toContain(`--accent: ${brandTokens.colors.light.action};`);
    expect(css).toContain(`--accent: ${brandTokens.colors.dark.action};`);
  });

  it("fills all ten variants with complete matching variable sets", () => {
    const css = toNativeCss();
    const names = [...css.matchAll(/@variant ([\w-]+) \{/g)].map((match) => match[1]);
    expect(names).toEqual(
      themeNames.flatMap((name) =>
        name === "classic" ? ["light", "dark"] : [`${name}-light`, `${name}-dark`],
      ),
    );
    const blocks = [...css.matchAll(/@variant [\w-]+ \{([^}]+)\}/g)];
    const variables = blocks.map((block) =>
      [...(block[1] ?? "").matchAll(/--([\w-]+):/g)].map((match) => match[1]),
    );
    for (const set of variables) expect(set).toEqual(variables[0]);
    expect(css).toContain(`--background: ${brandTokens.colors.light.canvas};`);
    expect(css).toContain(`--background: ${brandTokens.colors.dark.canvas};`);
  });

  it("keeps cards flat in light mode", () => {
    expect(toNativeCss()).toContain("--surface-shadow: 0 0 0 0 transparent inset;");
  });
});
