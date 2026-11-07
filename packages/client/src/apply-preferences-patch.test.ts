import { DEFAULT_UI_PREFERENCES, type Preferences } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { applyPreferencesPatch } from "./apply-preferences-patch";

const current: Preferences = {
  locale: "de",
  timezone: "Europe/Berlin",
  ui: DEFAULT_UI_PREFERENCES,
};

describe("applyPreferencesPatch", () => {
  it("leaves omitted fields alone", () => {
    expect(applyPreferencesPatch(current, {})).toEqual(current);
  });
  it("clears a field set to null", () => {
    expect(applyPreferencesPatch(current, { locale: null }).locale).toBeNull();
  });
  it("merges ui keys instead of replacing the object", () => {
    const next = applyPreferencesPatch(
      { ...current, ui: { sidebarCollapsed: false, dismissedHints: ["a"] } },
      { ui: { sidebarCollapsed: true } },
    );
    expect(next.ui).toEqual({ sidebarCollapsed: true, dismissedHints: ["a"] });
  });
  it("ignores explicitly undefined ui keys", () => {
    const next = applyPreferencesPatch(current, { ui: { sidebarCollapsed: undefined } });
    expect(next.ui.sidebarCollapsed).toBe(false);
  });
});
