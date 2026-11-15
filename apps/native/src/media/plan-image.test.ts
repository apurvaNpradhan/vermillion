import { describe, expect, it } from "vitest";

import { centredSquare, planImage } from "./plan-image";

describe("centredSquare", () => {
  it("cuts the centred largest square of a picture that is not one", () => {
    expect(centredSquare(1000, 1000)).toBeNull();
    expect(centredSquare(4000, 3000)).toEqual({
      originX: 500,
      originY: 0,
      width: 3000,
      height: 3000,
    });
    expect(centredSquare(600, 800)).toEqual({ originX: 0, originY: 100, width: 600, height: 600 });
  });
});

describe("planImage", () => {
  it("scales the long edge to 2048 and 512 and keeps the aspect ratio", () => {
    expect(planImage(4032, 3024, false)).toEqual({
      crop: null,
      full: { width: 2048, height: 1536 },
      thumb: { width: 512, height: 384 },
    });
    expect(planImage(3024, 4032, false).full).toEqual({ width: 1536, height: 2048 });
  });

  it("never scales up", () => {
    expect(planImage(800, 600, false)).toEqual({
      crop: null,
      full: { width: 800, height: 600 },
      thumb: { width: 512, height: 384 },
    });
    expect(planImage(300, 200, false).thumb).toEqual({ width: 300, height: 200 });
  });

  it("cuts a square first when asked, then sizes the square", () => {
    const plan = planImage(4000, 3000, true);
    expect(plan.crop).toEqual({ originX: 500, originY: 0, width: 3000, height: 3000 });
    expect(plan.full).toEqual({ width: 2048, height: 2048 });
    expect(plan.thumb).toEqual({ width: 512, height: 512 });
    // A picture that already is a square needs no cut.
    expect(planImage(1024, 1024, true).crop).toBeNull();
    expect(planImage(1024, 1024, true).full).toEqual({ width: 1024, height: 1024 });
  });
});
