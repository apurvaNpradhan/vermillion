import { describe, expect, it } from "vitest";

import { barLayout, bodyIntensity, formatSets } from "./muscle-bars";

describe("barLayout", () => {
  it("puts the band and the fill on one scale with headroom past the range", () => {
    const layout = barLayout(9, { min: 10, max: 20 });
    expect(layout.bandStart).toBeCloseTo(10 / 25);
    expect(layout.bandEnd).toBeCloseTo(20 / 25);
    expect(layout.fill).toBeCloseTo(9 / 25);
  });

  it("stretches the scale when the sets pass the headroom, so the bar never overflows", () => {
    const layout = barLayout(40, { min: 10, max: 20 });
    expect(layout.fill).toBe(1);
    expect(layout.bandEnd).toBeCloseTo(0.5);
  });

  it("handles an empty muscle", () => {
    expect(barLayout(0, { min: 10, max: 20 }).fill).toBe(0);
  });
});

describe("bodyIntensity", () => {
  const rows = [
    { muscle: "chest", sets: 10, range: { min: 6, max: 10 }, status: "on_target" },
  ] as const;

  it("shades against the top of the range, with a faint tint for a few sets", () => {
    const shades = bodyIntensity(
      [
        { muscle: "chest", sets: 5 },
        { muscle: "biceps", sets: 0.5 },
        { muscle: "forearms", sets: 10 },
      ],
      rows,
    );
    expect(Object.fromEntries(shades)).toEqual({ chest: 0.5, biceps: 0.2, forearms: 1 });
  });

  it("caps at 1", () => {
    expect(bodyIntensity([{ muscle: "chest", sets: 30 }], rows).get("chest")).toBe(1);
  });
});

describe("formatSets", () => {
  it("keeps a half and drops a trailing zero", () => {
    expect(formatSets(4.5, "en")).toBe("4.5");
    expect(formatSets(9, "en")).toBe("9");
  });
});
