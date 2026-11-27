import { describe, expect, it } from "vitest";

import { effortCellOf } from "./effort-cell";

describe("effortCellOf", () => {
  it("shows a logged effort on any row", () => {
    expect(effortCellOf({ logged: 8, ghost: 7, current: false })).toEqual({
      kind: "logged",
      value: 8,
    });
    expect(effortCellOf({ logged: 8, ghost: null, current: true })).toEqual({
      kind: "logged",
      value: 8,
    });
  });

  it("shows the target only on the next set to log", () => {
    expect(effortCellOf({ logged: null, ghost: 7, current: true })).toEqual({
      kind: "ghost",
      value: 7,
    });
    expect(effortCellOf({ logged: null, ghost: 7, current: false })).toEqual({ kind: "empty" });
  });

  it("shows a dash on the next set when there is no target, and nothing elsewhere", () => {
    expect(effortCellOf({ logged: null, ghost: null, current: true })).toEqual({ kind: "dash" });
    expect(effortCellOf({ logged: null, ghost: null, current: false })).toEqual({ kind: "empty" });
  });
});
