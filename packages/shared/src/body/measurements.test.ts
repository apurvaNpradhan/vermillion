import { describe, expect, it } from "vitest";
import { changeSincePrevious, lastN, ratios } from "./measurements";
import { cmToIn, inToCm } from "./weight";
const entry = (value: number, day: string, time = "12:00") => ({
  value,
  local_date: day,
  measured_at: `${day}T${time}:00Z`,
});
describe("tape measurements", () => {
  it("sorts unsorted entries and retains the last seven without mutating input", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      entry(i, `2026-01-${String(i + 1).padStart(2, "0")}`),
    ).reverse();
    expect(lastN(rows, 7).map((e) => e.value)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(rows[0]?.value).toBe(9);
    expect(lastN([], 7)).toEqual([]);
    expect(lastN(rows, 0)).toEqual([]);
  });
  it("uses the previous entry including on the same day", () => {
    expect(changeSincePrevious([])).toBeNull();
    expect(changeSincePrevious([entry(80, "2026-01-01")])).toBeNull();
    expect(changeSincePrevious([entry(79, "2026-01-01", "13:00"), entry(80, "2026-01-01")])).toBe(
      -1,
    );
    expect(changeSincePrevious([entry(80, "2026-01-01"), entry(80, "2026-01-02")])).toBe(0);
  });
  it("only computes ratios with their prerequisites", () => {
    expect(ratios({}, null)).toEqual({ waistToHeight: null, waistToHip: null });
    expect(ratios({ waist: 80 }, 160)).toEqual({ waistToHeight: 0.5, waistToHip: null });
    expect(ratios({ waist: 80, hips: 100 }, null)).toEqual({
      waistToHeight: null,
      waistToHip: 0.8,
    });
    expect(ratios({ waist: 80, hips: 0 }, 0)).toEqual({ waistToHeight: null, waistToHip: null });
  });
  it("round trips cm and inches across the site range", () => {
    for (const cm of [5, 37.1, 80, 249.9, 250]) expect(inToCm(cmToIn(cm))).toBeCloseTo(cm, 10);
  });
});
