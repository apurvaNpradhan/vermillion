import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { brandTokens, roleNames } from "./brand";
import { toWebCss, webTokenSources } from "./to-web-css";

describe("web brand tokens", () => {
  it("keeps the committed tokens.css in sync with brand.ts", () => {
    const committed = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
    expect(committed).toBe(toWebCss());
  });

  it("defines every role for both themes", () => {
    for (const theme of ["light", "dark"] as const)
      for (const name of roleNames) expect(brandTokens.colors[theme][name]).toBeTruthy();
  });

  it("maps the action role to the shadcn primary and keeps accent a subtle background", () => {
    expect(webTokenSources.primary).toBe("action");
    expect(webTokenSources.accent).toBe("surface-control");
  });
});
