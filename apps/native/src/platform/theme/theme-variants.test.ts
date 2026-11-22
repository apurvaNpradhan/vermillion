import { nativeVariantNames } from "@workspace/ui/tokens/brand";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Metro's Uniwind themes", () => {
  it("registers every generated theme variant", () => {
    const source = readFileSync(new URL("../../../metro.config.js", import.meta.url), "utf8");
    const extraThemes = source.match(/extraThemes: \[([^\]]*)\]/)?.[1] ?? "";
    const registered = [...extraThemes.matchAll(/"([\w-]+)"/g)].map((match) => match[1]);
    expect(["light", "dark", ...registered]).toEqual(nativeVariantNames);
  });
});
