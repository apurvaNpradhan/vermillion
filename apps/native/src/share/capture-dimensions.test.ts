import { describe, expect, it } from "vitest";
import { captureDimensions } from "./capture-dimensions";

describe("capture dimensions", () => {
  it.each([1, 2, 2.625, 3, 4])("exports 1080 × 1920 at density %s", (density) => {
    for (const platform of ["ios", "android"]) {
      const target = captureDimensions(platform, density);
      const outputScale = platform === "ios" ? density : 1;
      expect(target.width * outputScale).toBe(1080);
      expect(target.height * outputScale).toBe(1920);
      expect(target.layoutWidth * density).toBe(1080);
      expect(target.layoutHeight * density).toBe(1920);
      expect(1080 * target.designScale).toBeCloseTo(target.layoutWidth);
    }
  });
});
