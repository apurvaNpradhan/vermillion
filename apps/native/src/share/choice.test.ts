import { describe, expect, it } from "vitest";

import {
  availableBackgrounds,
  availableTemplates,
  choiceKey,
  defaultChoice,
  effectiveBackground,
  readChoice,
  writeChoice,
} from "./choice";
import type { ShareTemplate, ShareToggle } from "./types";

type Id = "weights" | "photo";
const toggles: ShareToggle<Id>[] = [
  { id: "weights", label: "Show weights", defaultOn: true, remember: true },
  { id: "photo", label: "Show photo", defaultOn: false, remember: false },
];
const template = (id: string, extra: Partial<ShareTemplate<Id>> = {}): ShareTemplate<Id> => ({
  id,
  label: id,
  render: () => null,
  supportsTransparent: false,
  ...extra,
});
const templates = [
  template("summary"),
  template("muscles"),
  template("photo", { requires: "photo" }),
];

describe("remembered share choice", () => {
  it("uses one key per kind", () => {
    expect(choiceKey("session")).toBe("share.session");
    expect(choiceKey("program")).toBe("share.program");
  });

  it("starts from the first template, the Theme background and the default toggles", () => {
    expect(defaultChoice(templates, toggles)).toEqual({
      template: "summary",
      background: "theme",
      toggles: { weights: true, photo: false },
    });
  });

  it.each([null, "", "not json", "null", "[]", '{"template":3}', '{"template":"muscles"}'])(
    "falls back to the defaults for %j",
    (raw) => {
      expect(readChoice(raw, templates, toggles)).toEqual(defaultChoice(templates, toggles));
    },
  );

  it("restores a stored choice", () => {
    const raw = JSON.stringify({
      template: "muscles",
      background: "dark",
      toggles: { weights: false },
    });
    expect(readChoice(raw, templates, toggles)).toEqual({
      template: "muscles",
      background: "dark",
      toggles: { weights: false, photo: false },
    });
  });

  it("drops a template that no longer exists and an unknown background", () => {
    const gone = JSON.stringify({ template: "retired", background: "dark", toggles: {} });
    expect(readChoice(gone, templates, toggles).template).toBe("summary");
    const odd = JSON.stringify({ template: "muscles", background: "neon", toggles: {} });
    expect(readChoice(odd, templates, toggles)).toEqual(defaultChoice(templates, toggles));
  });

  it("never restores Show photo, even from a stored value", () => {
    const raw = JSON.stringify({
      template: "summary",
      background: "photo",
      toggles: { weights: true, photo: true },
    });
    expect(readChoice(raw, templates, toggles).toggles.photo).toBe(false);
  });

  it("never writes Show photo", () => {
    const written = writeChoice(
      { template: "muscles", background: "accent", toggles: { weights: false, photo: true } },
      toggles,
    );
    expect(JSON.parse(written)).toEqual({
      template: "muscles",
      background: "accent",
      toggles: { weights: false },
    });
  });

  it("round-trips through storage", () => {
    const choice = {
      template: "muscles",
      background: "light",
      toggles: { weights: false, photo: false },
    } as const;
    expect(readChoice(writeChoice(choice, toggles), templates, toggles)).toEqual(choice);
  });
});

describe("what the composer offers", () => {
  it("hides templates whose toggle is off", () => {
    expect(availableTemplates(templates, { weights: true, photo: false }).map((t) => t.id)).toEqual(
      ["summary", "muscles"],
    );
    expect(availableTemplates(templates, { weights: true, photo: true }).map((t) => t.id)).toEqual([
      "summary",
      "muscles",
      "photo",
    ]);
  });

  it("offers Photo only with a picture and its toggle on", () => {
    expect(availableBackgrounds<Id>(null, { weights: true, photo: true })).toEqual([
      "theme",
      "accent",
      "light",
      "dark",
    ]);
    expect(availableBackgrounds<Id>("photo", { weights: true, photo: false })).not.toContain(
      "photo",
    );
    expect(availableBackgrounds<Id>("photo", { weights: true, photo: true })).toContain("photo");
  });

  it("offers an ungated Program cover", () => {
    expect(availableBackgrounds<Id>(undefined, { weights: false, photo: false })).toContain(
      "photo",
    );
  });

  it("falls back to Theme when the chosen background is gone, and honours a fixed one", () => {
    const offered = availableBackgrounds<Id>("photo", { weights: true, photo: false });
    expect(effectiveBackground("photo", template("summary"), offered)).toBe("theme");
    expect(effectiveBackground("dark", template("summary"), offered)).toBe("dark");
    expect(
      effectiveBackground("dark", template("photo", { fixedBackground: "photo" }), offered),
    ).toBe("photo");
  });
});
