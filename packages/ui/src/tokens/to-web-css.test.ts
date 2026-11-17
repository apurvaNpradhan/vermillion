import { describe, expect, it } from "vitest";

import { brandThemes, roleNames } from "./brand";
import { toWebCss } from "./to-web-css";

describe("web tokens", () => {
  it("defines every role for light and dark with the cinnabar accent", () => {
    const css = toWebCss();
    for (const name of roleNames) expect(css).toContain(`--color-${name}: var(--${name});`);
    expect(css).toContain(`--action: ${brandThemes.vermilion.light.action};`);
    expect(css).toContain(`--action: ${brandThemes.vermilion.dark.action};`);
  });
});
