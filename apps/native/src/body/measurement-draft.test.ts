import { describe, expect, it } from "vitest";
import { inToCm } from "@workspace/shared";
import { acceptsMeasurementDraft } from "./measurement-draft";

describe("measurement keypad drafts", () => {
  it("accepts typed quarter inches with the same conversion as a step", () => {
    for (const value of ["14.25", "14.50", "14.75", "14.12"]) {
      expect(acceptsMeasurementDraft(value, "in")).toBe(true);
    }
    expect(inToCm(Number("14.25"))).toBe(inToCm(14 + 0.25));
  });
  it("allows incomplete drafts but rejects excess precision and invalid input", () => {
    for (const value of ["", "0.", "14", "14.2"])
      expect(acceptsMeasurementDraft(value, "in")).toBe(true);
    for (const value of ["14.251", "-1", "1..2", "abc"])
      expect(acceptsMeasurementDraft(value, "in")).toBe(false);
    expect(acceptsMeasurementDraft("14.25", "cm")).toBe(false);
    expect(acceptsMeasurementDraft("14.2", "kg")).toBe(true);
  });
});
