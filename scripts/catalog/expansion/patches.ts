// Turns approved review decisions into Catalog patch files and checks them against the seed.
import { z } from "zod";

import {
  EQUIPMENT,
  EXERCISE_TYPES,
  groupOf,
  hasValidDetails,
  MUSCLE_DETAIL_SLUGS,
  MUSCLE_GROUPS,
  type Equipment,
  type MuscleDetail,
  type MuscleGroup,
} from "../../../packages/shared/src/exercise/vocabulary.ts";
import type { SeedRow } from "./catalog.ts";
import type { Decision, Edits } from "./decisions.ts";
import type { BackfillItem, Candidate, RankItem } from "./proposals.ts";
import { TIER_RANK } from "./ranks.ts";
import { isBodyweightType } from "./titles.ts";

const groups = z.array(z.enum(MUSCLE_GROUPS));
const details = z.array(z.enum(MUSCLE_DETAIL_SLUGS));
const rank = z.number().int().min(0).max(32_767);

const insertRow = z.strictObject({
  id: z.uuid(),
  title: z.string().min(1).max(120),
  primary_muscle: z.enum(MUSCLE_GROUPS),
  secondary_muscles: groups,
  primary_detail: details,
  secondary_detail: details,
  equipment: z.enum(EQUIPMENT),
  exercise_type: z.enum(EXERCISE_TYPES),
  is_full_bodyweight: z.boolean(),
  rank,
  search_terms: z.string().min(1).nullable(),
  aka: z.string().min(1).nullable(),
  instructions: z.string().min(1).nullable(),
  video_key: z.string().min(1).nullable(),
  thumbnail_key: z.string().min(1).nullable(),
  retired: z.boolean(),
});

const fill = z
  .strictObject({
    id: z.uuid(),
    primary_detail: details.optional(),
    secondary_detail: details.optional(),
    secondary_muscles: groups.optional(),
    rank: rank.optional(),
  })
  .refine((entry) => Object.keys(entry).length > 1, { error: "a fill names no field" });

function change<Field extends string, Value extends z.ZodType>(field: Field, value: Value) {
  return z.strictObject({ id: z.uuid(), field: z.literal(field), from: value, to: value });
}
const changeEntry = z.discriminatedUnion("field", [
  change("equipment", z.enum(EQUIPMENT)),
  change("primary_muscle", z.enum(MUSCLE_GROUPS)),
  change("secondary_muscles", groups),
  change("rank", rank),
]);

/** The subset of slice A's patch file these scripts write (the real schema also reads it). */
export const builtPatchSchema = z.strictObject({
  requires_app_version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional(),
  insert: z.array(insertRow),
  fill: z.array(fill),
  change: z.array(changeEntry),
});
export type BuiltPatch = z.infer<typeof builtPatchSchema>;
type Fill = z.infer<typeof fill>;
type Change = z.infer<typeof changeEntry>;

export const PATCH_NAMES = {
  details: "0001-muscle-details-and-equipment.json",
  expansion: "0002-expansion.json",
  ranks: "0003-ranks.json",
} as const;

export type Proposals = {
  backfill: readonly BackfillItem[];
  candidates: readonly Candidate[];
  ranks: readonly RankItem[];
};

type Approved = { id: string; edits: Edits };

function approvedOf(decisions: readonly Decision[], tab: Decision["tab"]): Map<string, Approved> {
  const map = new Map<string, Approved>();
  for (const decision of decisions) {
    if (decision.tab !== tab || decision.decision !== "approve") continue;
    map.set(decision.id, { id: decision.id, edits: decision.edits ?? {} });
  }
  return map;
}

/** Decisions that name no proposal, or name one twice, are errors: the page and files disagree. */
export function checkDecisions(decisions: readonly Decision[], proposals: Proposals): string[] {
  const known = {
    backfill: new Set(proposals.backfill.map((item) => item.id)),
    candidates: new Set(proposals.candidates.map((item) => item.id)),
    ranks: new Set(proposals.ranks.map((item) => item.id)),
  };
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const decision of decisions) {
    const key = `${decision.tab}:${decision.id}`;
    if (!known[decision.tab].has(decision.id)) errors.push(`${key}: no such proposal`);
    if (seen.has(key)) errors.push(`${key}: decided twice`);
    seen.add(key);
  }
  return errors;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function muscleChanges(
  id: string,
  current: { primary: MuscleGroup; secondary: readonly MuscleGroup[] },
  next: { primary: MuscleGroup; secondary: readonly MuscleGroup[] },
): Change[] {
  const out: Change[] = [];
  if (next.primary !== current.primary) {
    out.push({ id, field: "primary_muscle", from: current.primary, to: next.primary });
  }
  if (!sameSet(next.secondary, current.secondary)) {
    out.push({
      id,
      field: "secondary_muscles",
      from: [...current.secondary],
      to: [...next.secondary],
    });
  }
  return out;
}

function mergeFill(fills: Map<string, Fill>, entry: Fill): void {
  const existing = fills.get(entry.id);
  fills.set(entry.id, { ...entry, ...existing });
}

/** Detail backfill, retags and full_body primaries: the first patch. */
export function buildDetailsPatch(
  decisions: readonly Decision[],
  backfill: readonly BackfillItem[],
  seed: readonly SeedRow[],
): BuiltPatch {
  const approved = approvedOf(decisions, "backfill");
  const rows = new Map(seed.map((row) => [row.id, row]));
  const fills = new Map<string, Fill>();
  const changes: Change[] = [];
  for (const item of backfill) {
    const choice = approved.get(item.id);
    const row = rows.get(item.row_id);
    if (choice === undefined || row === undefined) continue;
    const edits = choice.edits;
    if (item.kind === "equipment") {
      const to: Equipment = edits.equipment ?? item.equipment;
      if (to !== row.equipment) {
        changes.push({ id: row.id, field: "equipment", from: row.equipment, to });
      }
      continue;
    }
    const proposedPrimary = item.kind === "primary" ? item.primary_muscle : row.primary_muscle;
    const proposedSecondary =
      item.kind === "primary" ? item.secondary_muscles : row.secondary_muscles;
    const primary = edits.primary_muscle ?? proposedPrimary;
    const secondary = (edits.secondary_muscles ?? proposedSecondary).filter(
      (group) => group !== primary,
    );
    changes.push(
      ...muscleChanges(
        row.id,
        { primary: row.primary_muscle, secondary: row.secondary_muscles },
        { primary, secondary },
      ),
    );
    const primaryDetail = edits.primary_detail ?? item.primary_detail;
    const secondaryDetail = edits.secondary_detail ?? item.secondary_detail;
    if (primaryDetail.length > 0 || secondaryDetail.length > 0) {
      mergeFill(fills, {
        id: row.id,
        ...(primaryDetail.length > 0 ? { primary_detail: primaryDetail } : {}),
        ...(secondaryDetail.length > 0 ? { secondary_detail: secondaryDetail } : {}),
      });
    }
  }
  return {
    insert: [],
    fill: [...fills.values()].toSorted((a, b) => a.id.localeCompare(b.id)),
    change: changes.toSorted((a, b) => a.id.localeCompare(b.id) || a.field.localeCompare(b.field)),
  };
}

function keepValid(
  primary: MuscleGroup,
  secondary: readonly MuscleGroup[],
  primaryDetail: readonly MuscleDetail[],
  secondaryDetail: readonly MuscleDetail[],
  edited: Edits,
) {
  const groupsLeft = secondary.filter((group) => group !== primary);
  // Details that belong to a group the edit moved away from leave with it.
  const own = edited.primary_detail ?? primaryDetail.filter((slug) => groupOf(slug) === primary);
  const others = (edited.secondary_detail ?? secondaryDetail).filter(
    (slug) => groupsLeft.includes(groupOf(slug)) && !own.includes(slug),
  );
  return { secondary: groupsLeft, primaryDetail: own, secondaryDetail: others };
}

/** The new catalog rows: approved candidates, with the review page's edits applied. */
export function buildExpansionPatch(
  decisions: readonly Decision[],
  candidates: readonly Candidate[],
  ranks: readonly RankItem[],
): BuiltPatch {
  const approved = approvedOf(decisions, "candidates");
  const rankDecisions = decisions.filter((decision) => decision.tab === "ranks");
  const proposedRank = new Map(ranks.map((item) => [item.id, item]));
  const insert: BuiltPatch["insert"] = [];
  for (const candidate of candidates) {
    const choice = approved.get(candidate.id);
    if (choice === undefined) continue;
    const edits = choice.edits;
    const primary = edits.primary_muscle ?? candidate.primary_muscle;
    const kept = keepValid(
      primary,
      edits.secondary_muscles ?? candidate.secondary_muscles,
      candidate.primary_detail,
      candidate.secondary_detail,
      edits,
    );
    const type = edits.exercise_type ?? candidate.exercise_type;
    const rankDecision = rankDecisions.find((decision) => decision.id === candidate.id);
    const tier = rankDecision?.edits?.tier ?? edits.tier ?? candidate.tier;
    const rejectedRank = rankDecision?.decision === "reject";
    const value = rejectedRank
      ? 0
      : rankDecision?.edits?.tier === undefined && edits.tier === undefined
        ? (proposedRank.get(candidate.id)?.rank ?? TIER_RANK[tier])
        : TIER_RANK[tier];
    insert.push({
      id: candidate.id,
      title: edits.title ?? candidate.title,
      primary_muscle: primary,
      secondary_muscles: kept.secondary,
      primary_detail: kept.primaryDetail,
      secondary_detail: kept.secondaryDetail,
      equipment: edits.equipment ?? candidate.equipment,
      exercise_type: type,
      is_full_bodyweight:
        type === candidate.exercise_type ? candidate.is_full_bodyweight : isBodyweightType(type),
      rank: value,
      search_terms: null,
      aka: candidate.aka,
      instructions: null,
      video_key: null,
      thumbnail_key: null,
      retired: false,
    });
  }
  return {
    insert: insert.toSorted((a, b) => a.id.localeCompare(b.id)),
    fill: [],
    change: [],
  };
}

/** Ranks of existing rows: a fill where the rank is 0, a change where it holds another value. */
export function buildRanksPatch(
  decisions: readonly Decision[],
  ranks: readonly RankItem[],
  seed: readonly SeedRow[],
): BuiltPatch {
  const approved = approvedOf(decisions, "ranks");
  const rows = new Map(seed.map((row) => [row.id, row]));
  const fills: Fill[] = [];
  const changes: Change[] = [];
  for (const item of ranks) {
    const choice = approved.get(item.id);
    const row = rows.get(item.id);
    if (choice === undefined || item.source !== "catalog" || row === undefined) continue;
    // The tier decides the rank. The old catalog's own ranks used another scale (10 was its top),
    // so keeping an existing non-zero rank would sort staples below tier-2 rows.
    const to = TIER_RANK[choice.edits.tier ?? item.tier];
    if (to === row.rank) continue;
    if (row.rank === 0) fills.push({ id: row.id, rank: to });
    else changes.push({ id: row.id, field: "rank", from: row.rank, to });
  }
  return {
    insert: [],
    fill: fills.toSorted((a, b) => a.id.localeCompare(b.id)),
    change: changes.toSorted((a, b) => a.id.localeCompare(b.id)),
  };
}

type State = {
  title: string;
  primary: MuscleGroup;
  secondary: MuscleGroup[];
  primaryDetail: MuscleDetail[];
  secondaryDetail: MuscleDetail[];
  equipment: Equipment;
  rank: number;
};

function stateOf(row: SeedRow): State {
  return {
    title: row.title,
    primary: row.primary_muscle,
    secondary: [...row.secondary_muscles],
    primaryDetail: [...row.primary_detail],
    secondaryDetail: [...row.secondary_detail],
    equipment: row.equipment,
    rank: row.rank,
  };
}

function applyChange(state: State, entry: Change): boolean {
  switch (entry.field) {
    case "equipment":
      if (state.equipment !== entry.from) return false;
      state.equipment = entry.to;
      return true;
    case "primary_muscle":
      if (state.primary !== entry.from) return false;
      state.primary = entry.to;
      return true;
    case "secondary_muscles":
      if (!sameSet(state.secondary, entry.from)) return false;
      state.secondary = [...entry.to];
      return true;
    case "rank":
      if (state.rank !== entry.from) return false;
      state.rank = entry.to;
      return true;
  }
}

/**
 * Applies the files in order to a copy of the seed the way the server would and reports every
 * problem: bad shape, ids that clash or do not exist, a change whose `from` is stale, details that
 * break the group rules, a repeated title. An empty list means the server will accept them.
 */
export function validatePatches(
  files: readonly { name: string; patch: BuiltPatch }[],
  seed: readonly SeedRow[],
): string[] {
  const errors: string[] = [];
  const state = new Map(seed.map((row) => [row.id, stateOf(row)]));
  for (const { name, patch } of files) {
    const parsed = builtPatchSchema.safeParse(patch);
    if (!parsed.success) {
      errors.push(
        `${name}: ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`,
      );
      continue;
    }
    for (const row of patch.insert) {
      if (state.has(row.id)) errors.push(`${name}: insert ${row.id}: id already exists`);
      const valid =
        hasValidDetails(row) &&
        !row.secondary_muscles.includes(row.primary_muscle) &&
        new Set(row.secondary_muscles).size === row.secondary_muscles.length;
      if (!valid) errors.push(`${name}: insert ${row.id}: bad muscles or details`);
      state.set(row.id, {
        title: row.title,
        primary: row.primary_muscle,
        secondary: [...row.secondary_muscles],
        primaryDetail: [...row.primary_detail],
        secondaryDetail: [...row.secondary_detail],
        equipment: row.equipment,
        rank: row.rank,
      });
    }
    const touched = new Set<string>();
    for (const entry of patch.change) {
      const current = state.get(entry.id);
      if (current === undefined) {
        errors.push(`${name}: change ${entry.id}: not a catalog row`);
      } else if (!applyChange(current, entry)) {
        errors.push(`${name}: change ${entry.id}:${entry.field}: from does not match the seed`);
      }
      touched.add(entry.id);
    }
    for (const entry of patch.fill) {
      const current = state.get(entry.id);
      if (current === undefined) {
        errors.push(`${name}: fill ${entry.id}: not a catalog row`);
        continue;
      }
      if (entry.primary_detail !== undefined && current.primaryDetail.length === 0) {
        current.primaryDetail = [...entry.primary_detail];
      }
      if (entry.secondary_detail !== undefined && current.secondaryDetail.length === 0) {
        current.secondaryDetail = [...entry.secondary_detail];
      }
      if (entry.rank !== undefined && current.rank === 0) current.rank = entry.rank;
      touched.add(entry.id);
    }
    for (const id of touched) {
      const current = state.get(id);
      if (current === undefined) continue;
      const rule = {
        primary_muscle: current.primary,
        secondary_muscles: current.secondary,
        primary_detail: current.primaryDetail,
        secondary_detail: current.secondaryDetail,
      };
      const secondaryOk =
        !current.secondary.includes(current.primary) &&
        new Set(current.secondary).size === current.secondary.length;
      if (!hasValidDetails(rule) || !secondaryOk) {
        errors.push(`${name}: ${id}: the result has bad muscles or details`);
      }
    }
    const titles = new Map<string, string>();
    for (const [id, current] of state) {
      const key = current.title.toLowerCase();
      const clash = titles.get(key);
      if (clash !== undefined)
        errors.push(`${name}: the title "${current.title}" repeats (${clash}, ${id})`);
      titles.set(key, id);
    }
  }
  return [...new Set(errors)];
}

/** Which of the three patches have anything in them. */
export function nonEmpty(patch: BuiltPatch): boolean {
  return patch.insert.length + patch.fill.length + patch.change.length > 0;
}

export function withVersion(patch: BuiltPatch, version: string | null): BuiltPatch {
  return version === null ? patch : { requires_app_version: version, ...patch };
}
