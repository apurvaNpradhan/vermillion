import { describe, expect, it } from "vitest";
import { loadBar } from "./plates";
import { defaultGymKit } from "./gym-kit";
import { KG_PER_LB, parseWeight } from "./format";

const plate = (weightKg: number, count: number | null = null) => ({
  id: String(weightKg),
  weightKg,
  count,
});
const kit = defaultGymKit("kg").flatMap((p) => (p.kind === "plate" ? [plate(p.weight_kg)] : []));
describe("loadBar", () => {
  it("bounds a tiny unlimited custom plate at a large target", () => {
    const start = performance.now();
    const result = loadBar(500, { weightKg: 20 }, [...kit, plate(0.1)]);
    expect(result.exact).toBe(true);
    expect(result.platesPerSide).toHaveLength(10);
    expect(performance.now() - start).toBeLessThan(2000);
  });
  it("compares duplicate tiny denominations without expanding every tied solution", () => {
    const start = performance.now();
    const result = loadBar(20, { weightKg: 0 }, [plate(0.001), { ...plate(0.001), id: "second" }]);
    expect(result.exact).toBe(true);
    expect(performance.now() - start).toBeLessThan(2000);
  });
  it.each([60, 61, 142.5])("loads %s kg exactly, largest first", (target) => {
    const result = loadBar(target, { weightKg: 20 }, kit);
    expect(result.exact).toBe(true);
    expect(result.totalKg).toBe(target);
    const weights = result.platesPerSide.map((p) => p.weightKg);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    expect(20 + weights.reduce((a, b) => a + b * 2, 0)).toBe(target);
  });
  it.each([
    [60, [20]],
    [61, [20, 0.5]],
    [142.5, [25, 25, 10, 1.25]],
  ])("loads %s kg with the fewest plates", (target, perSide) => {
    const result = loadBar(target, { weightKg: 20 }, kit);
    expect(result.platesPerSide.map((p) => p.weightKg)).toEqual(perSide);
  });
  it("finds both closest neighbours", () => {
    const result = loadBar(61, { weightKg: 20 }, [plate(20), plate(1.25)]);
    expect(result.exact).toBe(false);
    expect(result.below?.totalKg).toBe(60);
    expect(result.above?.totalKg).toBe(62.5);
  });
  it("respects counts per pair and exhausted inventory", () => {
    const result = loadBar(100, { weightKg: 20 }, [plate(20, 1), plate(5, 2)]);
    expect(result.totalKg).toBe(80);
    expect(result.above).toBeNull();
    expect(result.platesPerSide).toHaveLength(3);
  });
  it("finds an exact custom combination that greedy alone misses", () => {
    expect(loadBar(12, { weightKg: 0 }, [plate(5, 1), plate(3, 2)]).exact).toBe(true);
  });
  it("supports a zero bar and no plates", () => {
    expect(loadBar(0, { weightKg: 0 }, []).exact).toBe(true);
    expect(loadBar(5, { weightKg: 0 }, []).above).toBeNull();
  });
  it("supports lb kits without rounding their kg conversion", () => {
    const plates = defaultGymKit("lb").flatMap((p) =>
      p.kind === "plate" ? [plate(p.weight_kg)] : [],
    );
    const result = loadBar(135 * KG_PER_LB, { weightKg: 45 * KG_PER_LB }, plates);
    expect(result.exact).toBe(true);
    expect(result.platesPerSide.map((p) => p.weightKg)).toEqual([45 * KG_PER_LB]);
  });
  it("recognises a lb target rounded to the stored cell precision", () => {
    const plates = defaultGymKit("lb").flatMap((p) =>
      p.kind === "plate" ? [plate(p.weight_kg)] : [],
    );
    expect(loadBar(parseWeight("135", "lb") ?? 0, { weightKg: 45 * KG_PER_LB }, plates).exact).toBe(
      true,
    );
  });
  it("has no below solution when the target is below the bar", () => {
    const result = loadBar(10, { weightKg: 20 }, kit);
    expect(result.below).toBeNull();
    expect(result.above?.totalKg).toBe(20);
    expect(result.exact).toBe(false);
  });
  it("ignores zero-weight and unavailable plates", () => {
    expect(loadBar(60, { weightKg: 20 }, [plate(0), plate(20, 0)]).totalKg).toBe(20);
  });
});
