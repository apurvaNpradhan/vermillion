import { describe, expect, it } from "vitest";

import { splitLegal } from "./legal-text";

describe("splitLegal", () => {
  it("keeps the order of the translated sentence", () => {
    expect(splitLegal("Agree to {terms} and {privacy}.")).toEqual([
      { kind: "text", text: "Agree to " },
      { kind: "terms" },
      { kind: "text", text: " and " },
      { kind: "privacy" },
      { kind: "text", text: "." },
    ]);
    expect(splitLegal("{privacy} und {terms}").map((part) => part.kind)).toEqual([
      "privacy",
      "text",
      "terms",
    ]);
  });

  it("returns plain text when there are no slots", () => {
    expect(splitLegal("Hello")).toEqual([{ kind: "text", text: "Hello" }]);
  });
});
