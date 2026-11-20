import { describe, expect, it } from "vitest";

import { parsePatchFile } from "../../../packages/api/src/exercise/patches/patch-file.ts";
import type { SeedRow } from "./catalog.ts";
import { decisionsFileSchema, type Decision } from "./decisions.ts";
import {
  buildDetailsPatch,
  buildExpansionPatch,
  buildRanksPatch,
  checkDecisions,
  nonEmpty,
  validatePatches,
  withVersion,
} from "./patches.ts";
import type { BackfillItem, Candidate, RankItem } from "./proposals.ts";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const NEW = "00000000-0000-4000-8000-0000000000f1";

function seedRow(overrides: Partial<SeedRow> & Pick<SeedRow, "id" | "title">): SeedRow {
  return {
    primary_muscle: "chest",
    secondary_muscles: ["shoulders"],
    primary_detail: [],
    secondary_detail: [],
    equipment: "machine",
    exercise_type: "weight_reps",
    rank: 0,
    video_key: null,
    thumbnail_key: null,
    ...overrides,
  };
}

const seed = [
  seedRow({ id: A, title: "Incline Press" }),
  seedRow({
    id: B,
    title: "Triceps Extension (Cable)",
    primary_muscle: "triceps",
    secondary_muscles: [],
  }),
  seedRow({ id: C, title: "Clean", primary_muscle: "full_body", secondary_muscles: [], rank: 8 }),
];

const base = {
  title: "",
  thumbnail_key: null,
  source_title: null,
  current_primary_muscle: "chest",
  current_secondary_muscles: [],
  current_equipment: "machine",
  dropped: [],
  flags: [],
} as const;

const backfill: BackfillItem[] = [
  {
    ...base,
    id: A,
    row_id: A,
    kind: "details",
    primary_detail: ["upper_chest"],
    secondary_detail: ["front_delts"],
  },
  { ...base, id: `${B}#equipment`, row_id: B, kind: "equipment", equipment: "cable" },
  {
    ...base,
    id: `${C}#primary`,
    row_id: C,
    kind: "primary",
    primary_muscle: "quadriceps",
    secondary_muscles: ["glutes"],
    primary_detail: [],
    secondary_detail: [],
  },
];

const candidate: Candidate = {
  id: NEW,
  source_title: "Cable Crossover",
  title: "Crossover (Cable)",
  aka: null,
  primary_muscle: "chest",
  secondary_muscles: ["shoulders"],
  primary_detail: ["lower_chest"],
  secondary_detail: ["front_delts"],
  equipment: "cable",
  exercise_type: "weight_reps",
  is_full_bodyweight: false,
  tier: 2,
  source_video_key: "static/12341201-x.mp4",
  source_image_key: null,
  dropped: [],
  flags: [],
};
const ranks: RankItem[] = [
  {
    id: A,
    source: "catalog",
    title: "Incline Press",
    tier: 1,
    rank: 100,
    current_rank: 0,
    flags: [],
  },
  {
    id: C,
    source: "catalog",
    title: "Clean",
    tier: 3,
    rank: 8,
    current_rank: 8,
    flags: ["rank_disagrees"],
  },
  {
    id: NEW,
    source: "candidate",
    title: "Crossover (Cable)",
    tier: 2,
    rank: 60,
    current_rank: 0,
    flags: [],
  },
];

const approve = (tab: Decision["tab"], id: string, edits?: Decision["edits"]): Decision => ({
  tab,
  id,
  decision: "approve",
  ...(edits ? { edits } : {}),
});

describe("decisions file", () => {
  it("accepts the documented shape and refuses unknown fields or values", () => {
    expect(
      decisionsFileSchema.safeParse([
        { tab: "ranks", id: "x", decision: "reject" },
        { tab: "candidates", id: "y", decision: "approve", edits: { tier: 2, title: "T" } },
      ]).success,
    ).toBe(true);
    expect(
      decisionsFileSchema.safeParse([{ tab: "x", id: "y", decision: "approve" }]).success,
    ).toBe(false);
    expect(
      decisionsFileSchema.safeParse([
        { tab: "ranks", id: "y", decision: "approve", edits: { tier: 5 } },
      ]).success,
    ).toBe(false);
    expect(
      decisionsFileSchema.safeParse([
        { tab: "ranks", id: "y", decision: "approve", edits: { bogus: 1 } },
      ]).success,
    ).toBe(false);
  });
  it("reports decisions that name no proposal, or name one twice", () => {
    const decisions = [approve("ranks", A), approve("ranks", A), approve("ranks", "ghost")];
    expect(checkDecisions(decisions, { backfill, candidates: [candidate], ranks })).toEqual([
      "ranks:00000000-0000-4000-8000-00000000000a: decided twice",
      "ranks:ghost: no such proposal",
    ]);
  });
});

describe("the details patch", () => {
  it("fills approved details, retags equipment and changes full_body primaries", () => {
    const decisions = [
      approve("backfill", A),
      approve("backfill", `${B}#equipment`),
      approve("backfill", `${C}#primary`),
    ];
    const patch = buildDetailsPatch(decisions, backfill, seed);
    expect(patch.fill).toEqual([
      { id: A, primary_detail: ["upper_chest"], secondary_detail: ["front_delts"] },
    ]);
    expect(patch.change).toEqual([
      { id: B, field: "equipment", from: "machine", to: "cable" },
      { id: C, field: "primary_muscle", from: "full_body", to: "quadriceps" },
      { id: C, field: "secondary_muscles", from: [], to: ["glutes"] },
    ]);
    expect(validatePatches([{ name: "0001", patch }], seed)).toEqual([]);
  });
  it("leaves out rejected and undecided proposals", () => {
    const patch = buildDetailsPatch(
      [{ tab: "backfill", id: A, decision: "reject" }],
      backfill,
      seed,
    );
    expect(nonEmpty(patch)).toBe(false);
  });
  it("applies edits to details and equipment", () => {
    const patch = buildDetailsPatch(
      [
        approve("backfill", A, { primary_detail: ["lower_chest"], secondary_detail: [] }),
        approve("backfill", `${B}#equipment`, { equipment: "smith_machine" }),
      ],
      backfill,
      seed,
    );
    expect(patch.fill).toEqual([{ id: A, primary_detail: ["lower_chest"] }]);
    expect(patch.change[0]).toMatchObject({ field: "equipment", to: "smith_machine" });
  });
  it("fails validation when a detail sits outside the row's groups", () => {
    const patch = buildDetailsPatch(
      [approve("backfill", A, { secondary_detail: ["rear_delts", "biceps_brachii"] })],
      backfill,
      seed,
    );
    expect(validatePatches([{ name: "0001", patch }], seed)).toEqual([
      `0001: ${A}: the result has bad muscles or details`,
    ]);
  });
  it("is a real patch file the server's schema accepts", () => {
    const patch = withVersion(
      buildDetailsPatch(
        [
          approve("backfill", A),
          approve("backfill", `${B}#equipment`),
          approve("backfill", `${C}#primary`),
        ],
        backfill,
        seed,
      ),
      "1.4.0",
    );
    const parsed = parsePatchFile("0001", JSON.stringify(patch));
    expect(parsed.requires_app_version).toBe("1.4.0");
    expect(parsed.fill).toHaveLength(1);
    expect(parsed.change).toHaveLength(3);
  });
});

describe("the expansion patch", () => {
  it("inserts approved candidates with the ranked tier and no media yet", () => {
    const patch = buildExpansionPatch(
      [approve("candidates", NEW), approve("ranks", NEW)],
      [candidate],
      ranks,
    );
    expect(patch.insert).toEqual([
      {
        id: NEW,
        title: "Crossover (Cable)",
        primary_muscle: "chest",
        secondary_muscles: ["shoulders"],
        primary_detail: ["lower_chest"],
        secondary_detail: ["front_delts"],
        equipment: "cable",
        exercise_type: "weight_reps",
        is_full_bodyweight: false,
        rank: 60,
        search_terms: null,
        aka: null,
        instructions: null,
        video_key: null,
        thumbnail_key: null,
        retired: false,
      },
    ]);
    expect(validatePatches([{ name: "0002", patch }], seed)).toEqual([]);
    expect(parsePatchFile("0002", JSON.stringify(patch)).insert).toHaveLength(1);
  });
  it("ranks from a tier edit and gives a rejected rank 0", () => {
    const edited = buildExpansionPatch(
      [approve("candidates", NEW, { tier: 1 })],
      [candidate],
      ranks,
    );
    expect(edited.insert[0]?.rank).toBe(100);
    const rejected = buildExpansionPatch(
      [approve("candidates", NEW), { tab: "ranks", id: NEW, decision: "reject" }],
      [candidate],
      ranks,
    );
    expect(rejected.insert[0]?.rank).toBe(0);
  });
  it("moves details with an edited primary group and recomputes the bodyweight flag", () => {
    const patch = buildExpansionPatch(
      [
        approve("candidates", NEW, {
          primary_muscle: "shoulders",
          exercise_type: "bodyweight_reps",
        }),
      ],
      [candidate],
      ranks,
    );
    expect(patch.insert[0]).toMatchObject({
      primary_muscle: "shoulders",
      secondary_muscles: [],
      primary_detail: [],
      secondary_detail: [],
      is_full_bodyweight: true,
    });
    expect(validatePatches([{ name: "0002", patch }], seed)).toEqual([]);
  });
  it("fails on a repeated title or an id that exists", () => {
    const repeat = buildExpansionPatch(
      [approve("candidates", NEW, { title: "incline press" })],
      [candidate],
      ranks,
    );
    expect(validatePatches([{ name: "0002", patch: repeat }], seed)[0]).toMatch(/repeats/);
    const clash = buildExpansionPatch([approve("candidates", A)], [{ ...candidate, id: A }], ranks);
    expect(validatePatches([{ name: "0002", patch: clash }], seed)[0]).toMatch(/id already exists/);
  });
});

describe("the ranks patch", () => {
  it("fills a zero rank and changes a differing one, from the current value", () => {
    const patch = buildRanksPatch(
      [approve("ranks", A), approve("ranks", C, { tier: 2 }), approve("ranks", NEW)],
      ranks,
      seed,
    );
    expect(patch.fill).toEqual([{ id: A, rank: 100 }]);
    expect(patch.change).toEqual([{ id: C, field: "rank", from: 8, to: 60 }]);
    expect(validatePatches([{ name: "0003", patch }], seed)).toEqual([]);
    expect(parsePatchFile("0003", JSON.stringify(patch)).change).toHaveLength(1);
  });
  it("leaves a kept rank alone", () => {
    expect(nonEmpty(buildRanksPatch([approve("ranks", C)], ranks, seed))).toBe(false);
  });
});

describe("validating a set of files", () => {
  it("rejects a change whose from no longer matches the seed", () => {
    const stale = {
      insert: [],
      fill: [],
      change: [
        { id: B, field: "equipment" as const, from: "barbell" as const, to: "cable" as const },
      ],
    };
    expect(validatePatches([{ name: "0001", patch: stale }], seed)[0]).toMatch(
      /from does not match/,
    );
  });
  it("applies files in order, so a later file can touch an earlier insert", () => {
    const first = buildExpansionPatch([approve("candidates", NEW)], [candidate], ranks);
    const second = {
      insert: [],
      fill: [],
      change: [{ id: NEW, field: "rank" as const, from: 60, to: 100 }],
    };
    expect(
      validatePatches(
        [
          { name: "0002", patch: first },
          { name: "0003", patch: second },
        ],
        seed,
      ),
    ).toEqual([]);
  });
});
