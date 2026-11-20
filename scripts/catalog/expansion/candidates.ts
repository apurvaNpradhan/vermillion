// New-row candidates: source rows not in the catalog, filtered, deduplicated and mapped.
import {
  EQUIPMENT,
  groupOf,
  type MuscleDetail,
} from "../../../packages/shared/src/exercise/vocabulary.ts";
import type { SeedRow } from "./catalog.ts";
import { sourceMovement, type SourceExercise } from "./dataset.ts";
import {
  distinctMuscleCount,
  dropsRotatorCuff,
  mapMuscles,
  MUSCLE_MAP,
  pickPrimaryGroup,
  sortDetails,
  sortGroups,
  capSecondaries,
  type SourceMuscle,
} from "./muscles.ts";
import type { Candidate } from "./proposals.ts";
import { proposeTier } from "./ranks.ts";
import {
  isBodyweightType,
  isNotTraining,
  isPlainName,
  mapEquipment,
  mapType,
  NON_TRAINING_EQUIPMENT,
  normalizeTitle,
  suggestAka,
  suggestTitle,
} from "./titles.ts";

const MAX_PRIMARIES = 3;
const MAX_TITLE_WORDS = 6;

// Choreography, mobility and cardio-class drills that pass the spec's filters but do not belong in
// a lifting log: circles, articulations, punches, jacks, hops, skips, chair work.
const FILLER =
  /articulation|\bcircles?\b|\bjacks?\b|\bpunch(?:es)?\b|uppercut|\bhooks?\b|boxing|\bwaves?\b|swipes?|shuffle|\bhops?\b|\bskips?\b|skipping|\bflaps?\b|on (?:a )?(?:chair|stool|padded)|\bchair\b|dancer|bottle|\btoe touch|\bmarch(?:es)?\b|\bdorsal\b|\bplantar\b|flexion|\breach(?:es)?\b/i;
// Bodyweight timed work stays only when it is a hold.
const HOLD = /\b(plank|hold|hang|sit|bridge|lever|handstand|carry|wall sit)\b/i;

/** True for filler that the spec's filters let through. */
export function isFiller(row: SourceExercise): boolean {
  if (FILLER.test(row.name)) return true;
  const bodyweight = row.equipment.every((name) => name === "Body weight");
  return row.type === "duration" && bodyweight && !HOLD.test(row.name);
}

/** The source row passes the strength-and-conditioning filter. */
export function isTrainingRow(row: SourceExercise): boolean {
  if (row.videoKey === null) return false;
  if (row.bodyParts.some((part) => part === "Stretching" || part === "Yoga")) return false;
  if (row.equipment.some((name) => NON_TRAINING_EQUIPMENT.has(name))) return false;
  if (isNotTraining(row.name) || isFiller(row)) return false;
  const primaries = distinctMuscleCount(row.primary);
  return primaries >= 1 && primaries <= MAX_PRIMARIES;
}

/** One row per suggested title: a video first, then the plain name, then the lowest id. */
export function collapseDuplicates(rows: readonly SourceExercise[]): SourceExercise[] {
  const kept = new Map<string, SourceExercise>();
  const rank = (row: SourceExercise): [number, number] => [
    row.videoKey === null ? 1 : 0,
    isPlainName(row.name) ? 0 : 1,
  ];
  for (const row of rows) {
    const key = normalizeTitle(suggestTitle(row.name, row.equipment));
    const current = kept.get(key);
    if (current === undefined) {
      kept.set(key, row);
      continue;
    }
    const [a1, a2] = rank(row);
    const [b1, b2] = rank(current);
    const better = a1 !== b1 ? a1 < b1 : a2 !== b2 ? a2 < b2 : row.id < current.id;
    if (better) kept.set(key, row);
  }
  return [...kept.values()];
}

/** Turns one source row into a candidate. */
export function toCandidate(row: SourceExercise, catalogTitles: ReadonlySet<string>): Candidate {
  const primaries = mapMuscles(row.primary);
  // A rotator cuff tag on a compound press, pull or row is noise: it leaves with its muscles, and
  // the group goes too unless another muscle keeps it.
  const cuff = (muscle: SourceMuscle): boolean => MUSCLE_MAP[muscle].detail === "rotator_cuff";
  const dropCuff = dropsRotatorCuff(row.name) && row.secondary.some(cuff);
  const others = mapMuscles(
    dropCuff ? row.secondary.filter((muscle) => !cuff(muscle)) : row.secondary,
  );
  const dropped: MuscleDetail[] = dropCuff ? ["rotator_cuff"] : [];
  const group = pickPrimaryGroup(primaries.groups) ?? "other";
  const title = suggestTitle(row.name, row.equipment);
  const equipment = mapEquipment(row.equipment);
  const mapped = mapType(row.type, row.equipment, title);
  const details = [...primaries.details, ...others.details];
  const everything = sortGroups([...primaries.groups, ...others.groups]);
  const secondary = capSecondaries(primaries.groups, everything, group);

  const flags: string[] = [];
  if (catalogTitles.has(title.toLowerCase())) flags.push("title_collision");
  if (mapped.guessed) flags.push("guessed_type");
  if (everything.filter((candidate) => candidate !== group).length > secondary.length) {
    flags.push("secondaries_capped");
  }
  if (group === "other") flags.push("no_primary_group");

  return {
    id: row.id,
    source_title: row.name,
    title,
    aka: suggestAka(row.name, title),
    primary_muscle: group,
    secondary_muscles: secondary,
    primary_detail: sortDetails(details.filter((detail) => groupOf(detail) === group)),
    secondary_detail: sortDetails(details.filter((detail) => secondary.includes(groupOf(detail)))),
    equipment,
    exercise_type: mapped.type,
    is_full_bodyweight: isBodyweightType(mapped.type),
    source_video_key: row.videoKey ?? "",
    source_image_key: row.imageKey,
    tier: proposeTier(title, equipment),
    dropped,
    flags,
  };
}

/** Candidates, sorted by group, then equipment, then title. */
export function buildCandidates(
  source: readonly SourceExercise[],
  seed: readonly SeedRow[],
  matchedMovements: ReadonlySet<string>,
): Candidate[] {
  const catalogTitles = new Set(seed.map((row) => row.title.toLowerCase()));
  const catalogIds = new Set(seed.map((row) => row.id));
  const eligible = source.filter((row) => {
    if (catalogIds.has(row.id)) return false;
    const movement = sourceMovement(row);
    if (movement !== null && matchedMovements.has(movement)) return false;
    return isTrainingRow(row);
  });
  return (
    collapseDuplicates(eligible)
      .map((row) => toCandidate(row, catalogTitles))
      // A title the catalog already has is the same exercise under another video: not a new row.
      .filter(
        (candidate) =>
          !candidate.flags.includes("title_collision") &&
          candidate.title.split(" ").length <= MAX_TITLE_WORDS,
      )
      .toSorted(
        (a, b) =>
          a.primary_muscle.localeCompare(b.primary_muscle) ||
          EQUIPMENT.indexOf(a.equipment) - EQUIPMENT.indexOf(b.equipment) ||
          a.title.localeCompare(b.title),
      )
  );
}
