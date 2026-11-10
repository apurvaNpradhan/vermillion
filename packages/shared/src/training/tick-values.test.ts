import { describe, expect, it } from "vitest";

import { tickValues } from "./tick-values";

describe("tickValues", () => {
  it("adopts the Ghosts into empty cells and keeps typed values", () => {
    expect(tickValues({ weight_kg: 62.5 }, { weight: 60, reps: 10 }, ["weight", "reps"])).toEqual({
      ok: true,
      values: { reps: 10 },
    });
    expect(tickValues({}, { weight: 60, reps: 8 }, ["weight", "reps"])).toEqual({
      ok: true,
      values: { weight_kg: 60, reps: 8 },
    });
  });

  it("writes nothing when every cell is filled", () => {
    expect(tickValues({ weight_kg: 50, reps: 5 }, {}, ["weight", "reps"])).toEqual({
      ok: true,
      values: {},
    });
  });

  it("lists every required field with neither a value nor a Ghost", () => {
    expect(tickValues({}, {}, ["weight", "reps"])).toEqual({
      ok: false,
      missing: ["weight", "reps"],
    });
    expect(tickValues({ weight_kg: 20 }, { weight: null }, ["weight", "reps"])).toEqual({
      ok: false,
      missing: ["reps"],
    });
  });

  it("accepts a weight of 0 but treats 0 reps or 0 duration as empty", () => {
    expect(tickValues({ weight_kg: 0, reps: 5 }, {}, ["weight", "reps"])).toEqual({
      ok: true,
      values: {},
    });
    expect(tickValues({ weight_kg: 20, reps: 0 }, {}, ["weight", "reps"])).toEqual({
      ok: false,
      missing: ["reps"],
    });
    expect(tickValues({ reps: 0 }, { reps: 8 }, ["reps"])).toEqual({
      ok: true,
      values: { reps: 8 },
    });
    expect(tickValues({ duration_s: 0 }, {}, ["duration"])).toEqual({
      ok: false,
      missing: ["duration"],
    });
  });

  it("does not adopt a Ghost that could not be stored", () => {
    expect(tickValues({}, { reps: 0 }, ["reps"])).toEqual({ ok: false, missing: ["reps"] });
  });

  it("adopts the planned effort on reps types only, into an empty cell", () => {
    expect(tickValues({ reps: 5 }, { rpe: 8 }, ["reps"])).toEqual({
      ok: true,
      values: { rpe: 8 },
    });
    expect(tickValues({ reps: 5, rpe: 9 }, { rpe: 8 }, ["reps"])).toEqual({ ok: true, values: {} });
    expect(tickValues({ duration_s: 30 }, { rpe: 8 }, ["duration"])).toEqual({
      ok: true,
      values: {},
    });
    expect(tickValues({ reps: 5 }, { rpe: null }, ["reps"])).toEqual({ ok: true, values: {} });
  });

  it("needs only the fields of the type", () => {
    expect(tickValues({}, { duration: 30 }, ["duration"])).toEqual({
      ok: true,
      values: { duration_s: 30 },
    });
  });
});
