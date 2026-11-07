import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { brandTokens, colorTokenNames } from "./brand";
import { toWebCss } from "./to-web-css";

describe("web brand tokens", () => {
  it("keeps the committed tokens.css in sync with brand.ts", () => {
    const committed = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
    expect(committed).toBe(toWebCss());
  });

  it("defines every token for both themes", () => {
    for (const theme of ["light", "dark"] as const)
      for (const name of colorTokenNames) expect(brandTokens.colors[theme][name]).toBeTruthy();
  });
});
