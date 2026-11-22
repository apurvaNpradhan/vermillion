import { themeVariantNames } from "@workspace/ui/tokens/theme-variants";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Metro's Uniwind themes", () => {
  it("registers every generated theme variant", () => {
    const source = readFileSync(new URL("../../../theme-variants.js", import.meta.url), "utf8");
    const registered = [...source.matchAll(/"([\w-]+)"/g)].map((match) => match[1]);
    expect(registered).toEqual(themeVariantNames);
  });
});
