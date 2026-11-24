import { describe, expect, it } from "vitest";

import { displayLink, spacedCode } from "./link-display";

describe("link display", () => {
  it("drops the scheme", () => {
    expect(displayLink("https://sigil.lostsignal.cloud/p/K7QM2X")).toBe(
      "sigil.lostsignal.cloud/p/K7QM2X",
    );
  });

  it("splits a code in the middle", () => {
    expect(spacedCode("K7QM2X")).toBe("K7Q M2X");
  });
});
