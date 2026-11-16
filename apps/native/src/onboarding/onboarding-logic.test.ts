import { describe, expect, it } from "vitest";

import { parseBody } from "./body-input";
import { defaultUnits } from "./default-units";

const empty = { heightCm: "", feet: "", inches: "", weight: "" };
const metric = { weightUnit: "kg", lengthUnit: "cm" } as const;
const imperial = { weightUnit: "lb", lengthUnit: "in" } as const;

describe("default units", () => {
  it("suggests pounds and inches where the US system is used", () => {
    expect(defaultUnits({ measurementSystem: "us", regionCode: "US" })).toEqual(imperial);
    expect(defaultUnits({ measurementSystem: null, regionCode: "LR" })).toEqual(imperial);
  });

  it("suggests kilograms and centimetres everywhere else, the UK included", () => {
    expect(defaultUnits({ measurementSystem: "metric", regionCode: "IN" })).toEqual(metric);
    expect(defaultUnits({ measurementSystem: "uk", regionCode: "GB" })).toEqual(metric);
    expect(defaultUnits({})).toEqual(metric);
  });
});

describe("body step input", () => {
  it("accepts both fields empty", () => {
    expect(parseBody(empty, metric)).toEqual({
      ok: true,
      values: { heightCm: null, bodyweightKg: null },
    });
  });

  it("reads metric values, with a comma as the decimal point", () => {
    expect(parseBody({ ...empty, heightCm: "178", weight: "81,5" }, metric)).toEqual({
      ok: true,
      values: { heightCm: 178, bodyweightKg: 81.5 },
    });
  });

  it("converts feet, inches and pounds", () => {
    expect(parseBody({ ...empty, feet: "5", inches: "10", weight: "180" }, imperial)).toEqual({
      ok: true,
      values: { heightCm: 177.8, bodyweightKg: 81.6 },
    });
    expect(parseBody({ ...empty, feet: "6" }, imperial)).toMatchObject({
      values: { heightCm: 182.9 },
    });
  });

  it("names the fields outside the stored ranges", () => {
    expect(parseBody({ ...empty, heightCm: "90", weight: "500" }, metric)).toEqual({
      ok: false,
      invalid: ["height", "weight"],
    });
    expect(parseBody({ ...empty, heightCm: "abc" }, metric)).toEqual({
      ok: false,
      invalid: ["height"],
    });
    // Inches without feet, or twelve and more, are not a height.
    expect(parseBody({ ...empty, inches: "10" }, imperial)).toMatchObject({ ok: false });
    expect(parseBody({ ...empty, feet: "5", inches: "12" }, imperial)).toMatchObject({ ok: false });
  });
});
