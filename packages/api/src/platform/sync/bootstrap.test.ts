import { describe, expect, it } from "vitest";

import { settingsProblems } from "./bootstrap";

const good = { version: 180_000, wal_level: "logical", max_slots: 10, max_senders: 10 };

describe("settingsProblems", () => {
  it("accepts a server set up for logical replication", () => {
    expect(settingsProblems(good)).toEqual([]);
  });

  it("reports every missing requirement", () => {
    const problems = settingsProblems({
      version: 130_000,
      wal_level: "replica",
      max_slots: 1,
      max_senders: 0,
    });
    expect(problems).toHaveLength(4);
    expect(problems.join("\n")).toMatch(
      /older than supported[\s\S]*wal_level[\s\S]*slots[\s\S]*senders/,
    );
  });

  it("requires wal_level logical specifically", () => {
    expect(settingsProblems({ ...good, wal_level: "minimal" })).toHaveLength(1);
  });
});
