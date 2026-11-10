import { POSITION_REBALANCE_LENGTH } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import {
  keyAfterLast,
  keyBetween,
  keyForMove,
  keysAfterLast,
  needsRebalance,
  rebalanced,
  sortByPosition,
  type Positioned,
} from "./position";

const item = (id: string, position: string): Positioned => ({ id, position });

describe("position keys", () => {
  it("makes keys between neighbours and at both ends", () => {
    const first = keyBetween(null, null);
    const second = keyBetween(first, null);
    const between = keyBetween(first, second);
    const start = keyBetween(null, first);
    expect([start, first, between, second].toSorted()).toEqual([start, first, between, second]);
  });

  it("appends after the last item, whatever order the list came in", () => {
    const keys = keysAfterLast([], 3);
    const list = [item("c", keys[2] ?? ""), item("a", keys[0] ?? ""), item("b", keys[1] ?? "")];
    const next = keyAfterLast(list);
    expect(next > (keys[2] ?? "")).toBe(true);
    expect(keysAfterLast(list, 2).every((key) => key > (keys[2] ?? ""))).toBe(true);
  });

  it("orders by key, then by id when two devices chose the same key", () => {
    const list = [item("b", "a1"), item("z", "a0"), item("a", "a1")];
    expect(sortByPosition(list).map((i) => i.id)).toEqual(["z", "a", "b"]);
    // Code-unit order: capitals sort before lowercase, as the keys are designed for.
    expect(sortByPosition([item("1", "a"), item("2", "Z")]).map((i) => i.id)).toEqual(["2", "1"]);
  });

  it("moves an item before another, to the end, and rewrites only the moved key", () => {
    const [k1, k2, k3] = keysAfterLast([], 3);
    const list = [item("a", k1 ?? ""), item("b", k2 ?? ""), item("c", k3 ?? "")];
    const order = (moved: string, key: string) =>
      sortByPosition(list.map((i) => (i.id === moved ? { ...i, position: key } : i))).map(
        (i) => i.id,
      );
    expect(order("c", keyForMove(list, "c", "a"))).toEqual(["c", "a", "b"]);
    expect(order("a", keyForMove(list, "a", "c"))).toEqual(["b", "a", "c"]);
    expect(order("a", keyForMove(list, "a", null))).toEqual(["b", "c", "a"]);
    expect(order("b", keyForMove(list, "b", "a"))).toEqual(["b", "a", "c"]);
    expect(() => keyForMove(list, "a", "missing")).toThrow();
  });

  it("keeps two inserts at the same spot in a stable order by id", () => {
    const [start, end] = keysAfterLast([], 2);
    // Both devices insert between the same neighbours and get the same key.
    const key = keyBetween(start ?? null, end ?? null);
    const list = [item("zz", key), item("aa", key), item("m", start ?? ""), item("n", end ?? "")];
    expect(sortByPosition(list).map((i) => i.id)).toEqual(["m", "aa", "zz", "n"]);
    expect(needsRebalance(list)).toBe(true);
  });

  it("rebalances long or colliding keys to short keys, keeping the order", () => {
    const low = keyBetween(null, null);
    let high = keyBetween(low, null);
    const list = [item("low", low), item("high", high)];
    // Always inserting just after the first item halves the gap, so the key grows.
    for (let step = 0; step < 400 && high.length <= POSITION_REBALANCE_LENGTH; step++) {
      high = keyBetween(low, high);
      list.push(item(`n${step}`, high));
    }
    expect(needsRebalance(list)).toBe(true);
    const order = sortByPosition(list).map((i) => i.id);
    const changes = rebalanced(list);
    const next = list.map((i) => ({
      ...i,
      position: changes.find((c) => c.id === i.id)?.position ?? i.position,
    }));
    expect(needsRebalance(next)).toBe(false);
    expect(next.every((i) => i.position.length < POSITION_REBALANCE_LENGTH)).toBe(true);
    expect(sortByPosition(next).map((i) => i.id)).toEqual(order);
  });

  it("does not need a rebalance for short unique keys", () => {
    expect(needsRebalance([item("a", "a0"), item("b", "a1")])).toBe(false);
    expect(needsRebalance([])).toBe(false);
  });

  it("is deterministic, so two devices rebalancing the same list agree", () => {
    const list = [item("b", "a0"), item("a", "a0"), item("c", "a0V")];
    expect(rebalanced(list)).toEqual(rebalanced(list.toReversed()));
  });
});
