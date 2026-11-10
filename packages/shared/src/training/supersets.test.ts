import { describe, expect, it } from "vitest";

import {
  planLeaveSuperset,
  planSupersetAfterMove,
  planSupersetAfterRemoval,
  planSupersetRepair,
  planSupersetWithNext,
  supersetPlaces,
  supersetRuns,
  type SupersetItem,
} from "./supersets";

const row = (id: string, group: string | null = null, rest: number | null = 90): SupersetItem => ({
  id,
  superset_group: group,
  rest_seconds: rest,
});
const group = (item: SupersetItem) => item.superset_group;
const ids = (runs: ReturnType<typeof supersetRuns<SupersetItem>>) =>
  runs.map((run) => run.items.map((item) => item.id));

describe("supersetRuns", () => {
  it("finds consecutive members of a group and ignores ungrouped rows", () => {
    const rows = [row("a"), row("b", "g"), row("c", "g"), row("d"), row("e", "h"), row("f", "h")];
    expect(ids(supersetRuns(rows, group))).toEqual([
      ["b", "c"],
      ["e", "f"],
    ]);
    expect(supersetRuns(rows, group).map((run) => run.start)).toEqual([1, 4]);
  });

  it("treats a gap as the end of a run, so each consecutive run is its own group", () => {
    const rows = [row("a", "g"), row("b", "g"), row("x"), row("c", "g"), row("d", "g")];
    expect(ids(supersetRuns(rows, group))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("drops a group of one, including a member left alone after a concurrent reorder", () => {
    const rows = [row("a", "g"), row("x"), row("b", "g"), row("c", "h")];
    expect(supersetRuns(rows, group)).toEqual([]);
  });

  it("splits adjacent groups and handles empty input", () => {
    expect(supersetRuns([], group)).toEqual([]);
    const rows = [row("a", "g"), row("b", "g"), row("c", "h"), row("d", "h"), row("e", "h")];
    expect(ids(supersetRuns(rows, group))).toEqual([
      ["a", "b"],
      ["c", "d", "e"],
    ]);
  });

  it("places each row in its run", () => {
    const rows = [row("a"), row("b", "g"), row("c", "g"), row("d", "g"), row("e", "h")];
    expect(supersetPlaces(rows, group)).toEqual(["none", "first", "middle", "last", "none"]);
  });
});

describe("planSupersetWithNext", () => {
  it("groups the row with the next one and keeps the last member's rest", () => {
    const rows = [row("a", null, 60), row("b", null, 120), row("c")];
    const changes = planSupersetWithNext(rows, "a", "new");
    expect(changes).toEqual([
      { id: "a", superset_group: "new", rest_seconds: null },
      { id: "b", superset_group: "new" },
    ]);
  });

  it("joins the next row's group", () => {
    const rows = [row("a"), row("b", "g", null), row("c", "g", 120)];
    expect(planSupersetWithNext(rows, "a", "new")).toEqual([
      { id: "a", superset_group: "g", rest_seconds: null },
    ]);
  });

  it("extends the row's own group over an ungrouped next row", () => {
    const rows = [row("a", "g", null), row("b", "g", 100), row("c", null, 45)];
    expect(planSupersetWithNext(rows, "b", "new")).toEqual([
      { id: "b", rest_seconds: null },
      { id: "c", superset_group: "g" },
    ]);
  });

  it("merges two groups into the next one's", () => {
    const rows = [row("a", "g", null), row("b", "g", 60), row("c", "h", null), row("d", "h", 90)];
    const changes = planSupersetWithNext(rows, "b", "new");
    expect(changes).toContainEqual({ id: "a", superset_group: "h" });
    expect(changes).toContainEqual({ id: "b", superset_group: "h", rest_seconds: null });
    expect(changes.find((change) => change.id === "d")).toBeUndefined();
  });

  it("does nothing for the last row or for rows already together", () => {
    expect(planSupersetWithNext([row("a")], "a", "n")).toEqual([]);
    expect(planSupersetWithNext([row("a", "g", null), row("b", "g")], "a", "n")).toEqual([]);
  });
});

describe("planLeaveSuperset", () => {
  it("dissolves a pair and gives both the group's rest", () => {
    const rows = [row("a", "g", null), row("b", "g", 120)];
    expect(planLeaveSuperset(rows, "b")).toEqual([
      { id: "a", superset_group: null, rest_seconds: 120 },
      { id: "b", superset_group: null },
    ]);
    expect(planLeaveSuperset(rows, "a")).toEqual([
      { id: "a", superset_group: null, rest_seconds: 120 },
      { id: "b", superset_group: null },
    ]);
  });

  it("hands the rest to the new last member when the last one leaves a trio", () => {
    const rows = [row("a", "g", null), row("b", "g", null), row("c", "g", 150)];
    expect(planLeaveSuperset(rows, "c")).toEqual([
      { id: "b", rest_seconds: 150 },
      { id: "c", superset_group: null },
    ]);
  });

  it("gives the rest to both halves when a middle member leaves", () => {
    const rows = [row("a", "g", null), row("b", "g", null), row("c", "g", 150)];
    const changes = planLeaveSuperset(rows, "b");
    expect(changes).toContainEqual({ id: "a", superset_group: null, rest_seconds: 150 });
    expect(changes).toContainEqual({ id: "b", superset_group: null, rest_seconds: 150 });
    expect(changes).toContainEqual({ id: "c", superset_group: null });
  });

  it("keeps rest off when the group's rest was off", () => {
    const rows = [row("a", "g", null), row("b", "g", null)];
    expect(planLeaveSuperset(rows, "a")).toEqual([
      { id: "a", superset_group: null },
      { id: "b", superset_group: null },
    ]);
  });
});

describe("planSupersetAfterMove", () => {
  const before = [row("a", "g", null), row("b", "g", 90), row("c"), row("d")];

  it("removes a member dragged out of its run", () => {
    const after = [row("a", "g", null), row("c"), row("d"), row("b", "g", 90)];
    const changes = planSupersetAfterMove(before, after, "b");
    expect(changes).toContainEqual({ id: "b", superset_group: null });
    expect(changes).toContainEqual({ id: "a", superset_group: null, rest_seconds: 90 });
  });

  it("keeps a member that moved within its run", () => {
    const three = [row("a", "g", null), row("b", "g", null), row("c", "g", 90), row("d")];
    const after = [row("b", "g", null), row("a", "g", null), row("c", "g", 90), row("d")];
    expect(planSupersetAfterMove(three, after, "a")).toEqual([]);
  });

  it("lets a row dropped between two members join the group", () => {
    const after = [row("a", "g", null), row("c", null, 60), row("b", "g", 90), row("d")];
    expect(planSupersetAfterMove(before, after, "c")).toEqual([
      { id: "c", superset_group: "g", rest_seconds: null },
    ]);
  });

  it("leaves an ungrouped row alone", () => {
    const after = [row("c"), row("a", "g", null), row("b", "g", 90), row("d")];
    expect(planSupersetAfterMove(before, after, "c")).toEqual([]);
  });

  it("clears the members left apart when the last one moves away", () => {
    const after = [row("a", "g", null), row("c"), row("d"), row("b", "g", 90)];
    const changes = planSupersetAfterMove(before, after, "b");
    expect(changes.filter((change) => change.superset_group === null)).toHaveLength(2);
  });
});

describe("planSupersetAfterRemoval", () => {
  it("clears the partner of a removed pair member and keeps the group's rest", () => {
    const rows = [row("a", "g", null), row("b", "g", 120), row("c")];
    expect(planSupersetAfterRemoval(rows, "b")).toEqual([
      { id: "a", superset_group: null, rest_seconds: 120 },
    ]);
  });

  it("hands a removed last member's rest to the new last of a trio", () => {
    const rows = [row("a", "g", null), row("b", "g", null), row("c", "g", 60)];
    expect(planSupersetAfterRemoval(rows, "c")).toEqual([{ id: "b", rest_seconds: 60 }]);
  });

  it("changes nothing when an ungrouped row goes", () => {
    expect(planSupersetAfterRemoval([row("a"), row("b", "g", null), row("c", "g")], "a")).toEqual(
      [],
    );
  });
});

describe("planSupersetRepair", () => {
  it("clears stale groups of one and nulls the rest of non-last members", () => {
    const rows = [row("a", "g", 30), row("b", "g", 60), row("c", "h", 45)];
    expect(planSupersetRepair(rows)).toEqual([
      { id: "a", rest_seconds: null },
      { id: "c", superset_group: null },
    ]);
  });
});
