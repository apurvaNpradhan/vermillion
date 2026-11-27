import { describe, expect, it } from "vitest";

import { effortCellOf } from "./effort-cell";

describe("effortCellOf", () => {
  it("keeps logged effort on a completed set", () => {
    expect(effortCellOf({ logged: 8, target: 7, ticked: true, current: false })).toEqual({
      kind: "logged",
      value: 8,
    });
    expect(effortCellOf({ logged: null, target: 7, ticked: true, current: false })).toEqual({
      kind: "empty",
    });
  });

  it("shows a target only while the set is next", () => {
    const set = { logged: null, target: 7, ticked: false };
    expect(effortCellOf({ ...set, current: true })).toEqual({ kind: "target", value: 7 });
    expect(effortCellOf({ ...set, current: false })).toEqual({ kind: "empty" });
  });

  it("shows entered effort on the next set, even before it is ticked", () => {
    const set = { logged: 8, target: 7, ticked: false };
    expect(effortCellOf({ ...set, current: true })).toEqual({ kind: "logged", value: 8 });
    expect(effortCellOf({ ...set, current: false })).toEqual({ kind: "empty" });
  });

  it("shows a dash on the next set if it has no target", () => {
    const set = { logged: null, target: null, ticked: false };
    expect(effortCellOf({ ...set, current: true })).toEqual({ kind: "dash" });
    expect(effortCellOf({ ...set, current: false })).toEqual({ kind: "empty" });
  });
});
