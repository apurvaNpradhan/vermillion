// Detail backfill, equipment retags and full_body primaries for the rows already in the catalog.
import type {
  Equipment,
  MuscleDetail,
  MuscleGroup,
} from "../../../packages/shared/src/exercise/vocabulary.ts";
import { groupOf } from "../../../packages/shared/src/exercise/vocabulary.ts";
import type { SeedRow } from "./catalog.ts";
import { movementId, sourceMovement, type SourceExercise } from "./dataset.ts";
import {
  capSecondaries,
  dropsRotatorCuff,
  mapMuscles,
  pickPrimaryGroup,
  sortDetails,
} from "./muscles.ts";
import type { BackfillItem } from "./proposals.ts";
import { isPlainName, leadEquipment, titleSimilarity } from "./titles.ts";

export type Match = { row: SeedRow; source: SourceExercise | null; similarity: number };

/** The catalog row's movement id: from its video, else its thumbnail. */
export function rowMovement(row: SeedRow): string | null {
  return movementId(row.video_key) ?? movementId(row.thumbnail_key);
}

/** Source rows by movement id. */
export function indexByMovement(source: readonly SourceExercise[]): Map<string, SourceExercise[]> {
  const index = new Map<string, SourceExercise[]>();
  for (const row of source) {
    const id = sourceMovement(row);
    if (id === null) continue;
    index.set(id, [...(index.get(id) ?? []), row]);
  }
  return index;
}

/** A tie goes to the plain name, then to the one with a video, then to the lower id. */
function prefers(option: SourceExercise, current: SourceExercise): boolean {
  const score = (row: SourceExercise): number =>
    (isPlainName(row.name) ? 0 : 2) + (row.videoKey === null ? 1 : 0);
  return score(option) !== score(current) ? score(option) < score(current) : option.id < current.id;
}

/** Joins each catalog row to the source row of its movement with the closest title. */
export function matchRows(
  seed: readonly SeedRow[],
  index: ReadonlyMap<string, SourceExercise[]>,
): Match[] {
  return seed.map((row) => {
    const id = rowMovement(row);
    const options = id === null ? [] : (index.get(id) ?? []);
    let best: Match = { row, source: null, similarity: 0 };
    for (const option of options) {
      const similarity = titleSimilarity(row.title, option.name);
      // Nothing in common but the media id: a stale join, not a match.
      if (similarity === 0) continue;
      const better =
        best.source === null ||
        similarity > best.similarity ||
        (similarity === best.similarity && prefers(option, best.source));
      if (better) best = { row, source: option, similarity };
    }
    return best;
  });
}

const WEAK_MATCH = 0.34;
const MAX_PRIMARY_DETAILS = 3;

function common(row: SeedRow, source: SourceExercise | null) {
  return {
    row_id: row.id,
    title: row.title,
    thumbnail_key: row.thumbnail_key,
    source_title: source?.name ?? null,
    current_primary_muscle: row.primary_muscle,
    current_secondary_muscles: row.secondary_muscles,
    current_equipment: row.equipment,
  };
}

type BackfilledDetails = {
  primary: MuscleDetail[];
  secondary: MuscleDetail[];
  dropped: MuscleDetail[];
};

/** Details of the source row, kept where their group is already the row's. Never changes groups. */
export function backfillDetails(
  row: Pick<SeedRow, "title" | "primary_muscle" | "secondary_muscles">,
  source: SourceExercise,
): BackfilledDetails {
  const all = mapMuscles([...source.primary, ...source.secondary]).details;
  const primary = all.filter((detail) => groupOf(detail) === row.primary_muscle);
  let secondary = all.filter(
    (detail) =>
      groupOf(detail) !== row.primary_muscle && row.secondary_muscles.includes(groupOf(detail)),
  );
  const dropped: MuscleDetail[] = [];
  if (dropsRotatorCuff(row.title) && secondary.includes("rotator_cuff")) {
    secondary = secondary.filter((detail) => detail !== "rotator_cuff");
    dropped.push("rotator_cuff");
  }
  return { primary: sortDetails(primary), secondary: sortDetails(secondary), dropped };
}

const NOT_A_MACHINE = /\b(jump rope|battle|battling|ropes?)\b/i;

type Retag = { pattern: RegExp; to: Equipment; from: readonly Equipment[]; sourceName: string };

const RETAGS: readonly Retag[] = [
  {
    pattern: /\bcable\b/i,
    to: "cable",
    from: ["machine", "other"],
    sourceName: "Cable",
  },
  {
    pattern: /\bsmith\b/i,
    to: "smith_machine",
    from: ["machine", "barbell", "other"],
    sourceName: "Smith machine",
  },
  {
    pattern: /\bez\b/i,
    to: "ez_bar",
    from: ["barbell", "other", "dumbbell"],
    sourceName: "EZ Barbell",
  },
  {
    pattern: /\btrap bar\b|\bhex bar\b/i,
    to: "trap_bar",
    from: ["barbell", "other"],
    sourceName: "Trap bar",
  },
];

/** The equipment a row should carry instead, from its title or its source row; null to leave it. */
export function proposeRetag(row: SeedRow, source: SourceExercise | null): Equipment | null {
  if (NOT_A_MACHINE.test(row.title)) return null;
  const lead = source === null ? null : leadEquipment(source.equipment);
  for (const retag of RETAGS) {
    if (!retag.from.includes(row.equipment)) continue;
    const named = retag.pattern.test(row.title);
    const sourced = lead === retag.sourceName && !NOT_A_MACHINE.test(row.title);
    if (named || sourced) return retag.to;
  }
  return null;
}

// Lifts filed under full_body only because no single group fits: they get a real primary.
const LIFT =
  /\b(snatch|clean|jerk|high pull|overhead squat|landmine squat|press under|jump shrug|thruster)\b/i;

/** A full_body lift's real primary and secondaries, from the source row's muscles. */
export function proposePrimary(
  row: SeedRow,
  source: SourceExercise | null,
): { primary: MuscleGroup; secondary: MuscleGroup[]; details: MuscleDetail[] } | null {
  if (row.primary_muscle !== "full_body" || !LIFT.test(row.title) || source === null) return null;
  const primaries = mapMuscles(source.primary).groups;
  const primary = pickPrimaryGroup(
    primaries.length > 0 ? primaries : mapMuscles(source.secondary).groups,
  );
  if (primary === null) return null;
  const everything = mapMuscles([...source.primary, ...source.secondary]);
  const secondary = capSecondaries(primaries, everything.groups, primary);
  // Details of a group the cap left out go with it.
  const details = everything.details.filter(
    (detail) => groupOf(detail) === primary || secondary.includes(groupOf(detail)),
  );
  return { primary, secondary, details };
}

/** Every backfill proposal: details for each row, plus retags and full_body primaries. */
export function buildBackfill(matches: readonly Match[]): BackfillItem[] {
  const items: BackfillItem[] = [];
  for (const { row, source, similarity } of matches) {
    const base = common(row, source);
    const flags: string[] = [];
    let primary: MuscleDetail[] = [];
    let secondary: MuscleDetail[] = [];
    let dropped: MuscleDetail[] = [];
    if (source === null) {
      flags.push("unmatched");
    } else {
      ({ primary, secondary, dropped } = backfillDetails(row, source));
      if (similarity < WEAK_MATCH) flags.push("weak_match");
      if (primary.length > MAX_PRIMARY_DETAILS) flags.push("too_many_primary_details");
      if (dropped.length > 0) flags.push("rotator_cuff_dropped");
      if (primary.length === 0 && secondary.length === 0) flags.push("no_details");
    }
    items.push({
      ...base,
      id: row.id,
      kind: "details",
      primary_detail: primary,
      secondary_detail: secondary,
      dropped,
      flags,
    });

    const retag = proposeRetag(row, source);
    if (retag !== null) {
      items.push({
        ...base,
        id: `${row.id}#equipment`,
        kind: "equipment",
        equipment: retag,
        dropped: [],
        flags: [],
      });
    }
    const lift = proposePrimary(row, source);
    if (lift !== null) {
      items.push({
        ...base,
        id: `${row.id}#primary`,
        kind: "primary",
        primary_muscle: lift.primary,
        secondary_muscles: lift.secondary,
        primary_detail: sortDetails(
          lift.details.filter((detail) => groupOf(detail) === lift.primary),
        ),
        secondary_detail: sortDetails(
          lift.details.filter((detail) => groupOf(detail) !== lift.primary),
        ),
        dropped: [],
        flags: [],
      });
    }
  }
  return items;
}
