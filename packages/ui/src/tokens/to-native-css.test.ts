import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { brandTokens } from "./brand";
import { nativeTokenSources, toNativeCss } from "./to-native-css";

describe("native brand tokens", () => {
  it("keeps the committed native-tokens.css in sync with brand.ts", () => {
    const committed = readFileSync(new URL("../styles/native-tokens.css", import.meta.url), "utf8");
    expect(committed).toBe(toNativeCss());
  });

  it("maps the brand accent to HeroUI's accent in both themes", () => {
    expect(nativeTokenSources.accent).toBe("primary");
    const css = toNativeCss();
    expect(css).toContain(`--accent: ${brandTokens.colors.light.primary};`);
    expect(css).toContain(`--accent: ${brandTokens.colors.dark.primary};`);
  });
});
