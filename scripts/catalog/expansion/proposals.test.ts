import { describe, expect, it } from "vitest";

import { backfillDetails, buildBackfill, indexByMovement, matchRows } from "./backfill.ts";
import type { SeedRow } from "./catalog.ts";
import { buildCandidates, collapseDuplicates, isTrainingRow } from "./candidates.ts";
import type { SourceExercise } from "./dataset.ts";
import { propose } from "./propose.ts";
import { proposeTier, TIER_RANK } from "./ranks.ts";

function source(overrides: Partial<SourceExercise> & Pick<SourceExercise, "id" | "name">) {
  return {
    type: "weight_reps",
    videoKey: `static/${overrides.id.padStart(4, "0")}1201-Clip.mp4`,
    imageKey: null,
    bodyParts: [],
    equipment: ["Dumbbell"],
    primary: ["QUADRICEPS"],
    secondary: [],
    ...overrides,
  } satisfies SourceExercise;
}

function seedRow(overrides: Partial<SeedRow> & Pick<SeedRow, "id" | "title">): SeedRow {
  return {
    primary_muscle: "chest",
    secondary_muscles: [],
    primary_detail: [],
    secondary_detail: [],
    equipment: "barbell",
    exercise_type: "weight_reps",
    rank: 0,
    video_key: null,
    thumbnail_key: null,
    ...overrides,
  };
}

describe("matching the catalog to the source", () => {
  const rows = [
    source({ id: "0025", name: "Bench Press (male)", equipment: ["Barbell"] }),
    source({
      id: "0025",
      name: "Bench Press",
      equipment: ["Barbell"],
      videoKey: "static/00251201-B.mp4",
    }),
    source({ id: "0031", name: "Lateral Raise" }),
  ].map((row, index) => ({ ...row, id: `s${index}` }));

  it("joins by movement id and keeps the closest title", () => {
    const seed = [
      seedRow({
        id: "r1",
        title: "Bench Press (Barbell)",
        video_key: "exercises/v1/00251201-B.mp4",
      }),
      seedRow({ id: "r2", title: "Nothing", video_key: null }),
      seedRow({ id: "r3", title: "Torso Rotation", thumbnail_key: "x/00311201-t.jpg" }),
    ];
    const matches = matchRows(seed, indexByMovement(rows));
    expect(matches[0]?.source?.name).toBe("Bench Press");
    expect(matches[1]?.source).toBeNull();
    // Same media id but nothing in common in the title: a stale join.
    expect(matches[2]?.source).toBeNull();
  });
});

describe("detail backfill", () => {
  const row = {
    title: "Incline Bench Press",
    primary_muscle: "chest",
    secondary_muscles: ["shoulders", "triceps"],
  } as const;

  it("keeps details whose group is already the row's, never changing groups", () => {
    const result = backfillDetails(
      row,
      source({
        id: "1",
        name: "Incline Bench Press",
        primary: ["PECTORALIS_MAJOR_CLAVICULAR_HEAD", "SERRATUS_ANTERIOR"],
        secondary: ["DELTOID_ANTERIOR", "BICEPS_BRACHII", "TRICEPS_BRACHII"],
      }),
    );
    expect(result.primary).toEqual(["upper_chest"]);
    // Biceps is not one of the row's groups, so biceps_brachii is not proposed.
    expect(result.secondary).toEqual(["front_delts"]);
  });
  it("drops a secondary rotator cuff on a press and says so", () => {
    const result = backfillDetails(
      row,
      source({
        id: "1",
        name: "x",
        primary: ["QUADRICEPS"],
        secondary: ["INFRASPINATUS", "DELTOID_ANTERIOR"],
      }),
    );
    expect(result.secondary).toEqual(["front_delts"]);
    expect(result.dropped).toEqual(["rotator_cuff"]);
  });
  it("flags unmatched rows, weak matches and too many primary details", () => {
    const wide = seedRow({
      id: "w",
      title: "Chest Thing",
      video_key: "k/00991201-a.mp4",
      primary_muscle: "shoulders",
    });
    const matched = source({
      id: "99",
      name: "Chest Thing Reach",
      primary: ["DELTOID_ANTERIOR", "DELTOID_LATERAL", "DELTOID_POSTERIOR", "INFRASPINATUS"],
    });
    const items = buildBackfill(
      matchRows([wide, seedRow({ id: "u", title: "Lonely" })], indexByMovement([matched])),
    );
    const [first, second] = items;
    expect(first?.flags).toEqual(["too_many_primary_details"]);
    expect(second?.flags).toEqual(["unmatched"]);
  });
});

describe("equipment retags and full_body primaries", () => {
  it("proposes cable, Smith, EZ and trap bar retags, with the current kind as the from", () => {
    const seed = [
      seedRow({ id: "a", title: "Triceps Extension (Cable)", equipment: "machine" }),
      seedRow({ id: "b", title: "Squat (Smith Machine)", equipment: "machine" }),
      seedRow({ id: "c", title: "Curl", equipment: "barbell", video_key: "k/00071201-a.mp4" }),
      seedRow({ id: "d", title: "Deadlift (Trap bar)", equipment: "barbell" }),
      seedRow({ id: "e", title: "Battle Ropes", equipment: "machine" }),
      seedRow({ id: "f", title: "Leg Press (Machine)", equipment: "machine" }),
    ];
    const sourceRows = [
      source({ id: "7", name: "Curl", equipment: ["EZ Barbell"], videoKey: "x/00071201-c.mp4" }),
    ];
    const retags = buildBackfill(matchRows(seed, indexByMovement(sourceRows))).filter(
      (item) => item.kind === "equipment",
    );
    expect(
      retags.map((item) => [item.row_id, item.kind === "equipment" ? item.equipment : ""]),
    ).toEqual([
      ["a", "cable"],
      ["b", "smith_machine"],
      ["c", "ez_bar"],
      ["d", "trap_bar"],
    ]);
  });
  it("gives lifts filed under full_body a real primary, and leaves conditioning alone", () => {
    const seed = [
      seedRow({
        id: "s",
        title: "Power Snatch",
        primary_muscle: "full_body",
        video_key: "k/00551201-a.mp4",
      }),
      seedRow({
        id: "b",
        title: "Burpee",
        primary_muscle: "full_body",
        video_key: "k/00561201-a.mp4",
      }),
    ];
    const sourceRows = [
      source({
        id: "55",
        name: "Power Snatch",
        primary: ["GLUTEUS_MAXIMUS", "QUADRICEPS"],
        secondary: ["TRAPEZIUS_UPPER_FIBERS", "DELTOID_ANTERIOR"],
        videoKey: "x/00551201-a.mp4",
      }),
      source({ id: "56", name: "Burpee", primary: ["QUADRICEPS"], videoKey: "x/00561201-a.mp4" }),
    ];
    const primaries = buildBackfill(matchRows(seed, indexByMovement(sourceRows))).filter(
      (item) => item.kind === "primary",
    );
    expect(primaries).toHaveLength(1);
    const [lift] = primaries;
    expect(lift?.kind === "primary" && lift.primary_muscle).toBe("quadriceps");
    expect(lift?.kind === "primary" && lift.secondary_muscles).toEqual([
      "glutes",
      "shoulders",
      "traps",
    ]);
  });
});

describe("candidate filtering", () => {
  const ok = source({ id: "1", name: "Concentration Curl", primary: ["BICEPS_BRACHII"] });
  it("keeps a lifting row and drops the filler", () => {
    expect(isTrainingRow(ok)).toBe(true);
    expect(isTrainingRow({ ...ok, videoKey: null })).toBe(false);
    expect(isTrainingRow({ ...ok, bodyParts: ["Stretching"] })).toBe(false);
    expect(isTrainingRow({ ...ok, bodyParts: ["Yoga"] })).toBe(false);
    expect(isTrainingRow({ ...ok, name: "Neck Stretch" })).toBe(false);
    expect(isTrainingRow({ ...ok, equipment: ["Roll"] })).toBe(false);
    expect(isTrainingRow({ ...ok, primary: [] })).toBe(false);
    expect(
      isTrainingRow({ ...ok, primary: ["BICEPS_BRACHII", "QUADRICEPS", "HAMSTRINGS", "OBLIQUES"] }),
    ).toBe(false);
    expect(
      isTrainingRow({
        ...ok,
        name: "Max Speed Uppercut",
        type: "duration",
        equipment: ["Body weight"],
      }),
    ).toBe(false);
    expect(
      isTrainingRow({ ...ok, name: "Front Plank", type: "duration", equipment: ["Body weight"] }),
    ).toBe(true);
  });
  it("collapses male, female and version copies, keeping a video and then the plain name", () => {
    const rows = [
      source({
        id: "a",
        name: "Bicycle Crunch (male)",
        equipment: ["Body weight"],
        videoKey: null,
      }),
      source({ id: "b", name: "Bicycle Crunch (female)", equipment: ["Body weight"] }),
      source({ id: "c", name: "Bicycle Crunch", equipment: ["Body weight"] }),
      source({ id: "d", name: "Bicycle Crunch (VERSION 2)", equipment: ["Body weight"] }),
      source({ id: "e", name: "Dumbbell Curl" }),
      source({ id: "f", name: "Curl", equipment: ["Barbell"] }),
    ];
    expect(collapseDuplicates(rows).map((row) => row.id)).toEqual(["c", "e", "f"]);
  });
});

describe("candidates", () => {
  const press = source({
    id: "10",
    name: "Dumbbell Incline Press (male)",
    primary: ["PECTORALIS_MAJOR_CLAVICULAR_HEAD", "DELTOID_ANTERIOR", "TRICEPS_BRACHII"],
    secondary: ["INFRASPINATUS", "SERRATUS_ANTERIOR"],
  });
  const assisted = source({
    id: "11",
    name: "Lever Assisted Chin-up",
    equipment: ["Assisted"],
    primary: ["LATISSIMUS_DORSI"],
  });
  const matched = source({
    id: "12",
    name: "Squat",
    equipment: ["Barbell"],
    videoKey: "s/00121201-a.mp4",
  });
  const seed = [
    seedRow({ id: "r", title: "Squat (Barbell)", video_key: "k/00121201-z.mp4" }),
    seedRow({ id: "t", title: "Incline Press (Dumbbell)" }),
  ];
  const candidates = buildCandidates([press, assisted, matched], seed, new Set(["0012"]));

  it("skips rows whose movement is already in the catalog", () => {
    expect(candidates.map((item) => item.id)).not.toContain("12");
  });
  it("drops a title the catalog already has", () => {
    expect(candidates.map((item) => item.id)).not.toContain("10");
  });
  it("maps title, type, equipment and muscles", () => {
    const [chinUp] = candidates;
    expect(chinUp).toMatchObject({
      id: "11",
      title: "Chin-Up (Assisted)",
      equipment: "machine",
      exercise_type: "bodyweight_assisted_reps",
      is_full_bodyweight: true,
      primary_muscle: "lats",
      flags: ["guessed_type"],
    });
  });
  it("splits primaries by the heuristic and drops a cuff secondary on a press", () => {
    const [mapped] = buildCandidates([{ ...press, name: "Dumbbell Incline Press" }], [], new Set());
    expect(mapped).toMatchObject({
      title: "Incline Press (Dumbbell)",
      primary_muscle: "chest",
      primary_detail: ["upper_chest"],
      secondary_muscles: ["shoulders", "triceps"],
      secondary_detail: ["front_delts"],
      dropped: ["rotator_cuff"],
    });
  });
  it("sorts by group, then equipment, then title", () => {
    const rows = [
      source({ id: "1", name: "Z Curl", primary: ["BICEPS_BRACHII"], equipment: ["Dumbbell"] }),
      source({ id: "2", name: "A Curl", primary: ["BICEPS_BRACHII"], equipment: ["Dumbbell"] }),
      source({ id: "3", name: "M Curl", primary: ["BICEPS_BRACHII"], equipment: ["Barbell"] }),
      source({
        id: "4",
        name: "Leg Press",
        primary: ["QUADRICEPS"],
        equipment: ["Leverage machine"],
      }),
    ];
    expect(buildCandidates(rows, [], new Set()).map((item) => item.title)).toEqual([
      "M Curl (Barbell)",
      "A Curl (Dumbbell)",
      "Z Curl (Dumbbell)",
      "Leg Press (Machine)",
    ]);
  });
});

describe("rank tiers", () => {
  it("tiers staples, common lifts, variants and niche work", () => {
    expect(proposeTier("Bench Press (Barbell)", "barbell")).toBe(1);
    expect(proposeTier("Lat Pulldown (Cable)", "cable")).toBe(1);
    expect(proposeTier("Incline Dumbbell Row", "dumbbell")).toBe(2);
    expect(proposeTier("Concentration Curl (Dumbbell)", "dumbbell")).toBe(2);
    expect(proposeTier("Push-Up (Bosu Ball)", "other")).toBe(4);
    expect(proposeTier("Cuban Press Variation (Band)", "resistance_band")).toBe(3);
  });
  it("proposes every catalog row and candidate, keeping a differing non-zero rank", () => {
    const seed = [
      seedRow({ id: "a", title: "Bench Press (Barbell)", rank: 0 }),
      seedRow({ id: "b", title: "Bench Press (Barbell) Pause", rank: 8 }),
    ];
    const { ranks } = propose(
      [source({ id: "5", name: "Concentration Curl", primary: ["BICEPS_BRACHII"] })],
      seed,
    );
    expect(ranks.map((item) => [item.id, item.source, item.rank])).toEqual([
      ["a", "catalog", TIER_RANK[1]],
      ["b", "catalog", 8],
      ["5", "candidate", TIER_RANK[2]],
    ]);
    expect(ranks[1]?.flags).toEqual(["rank_disagrees"]);
  });
});
