import type { Equipment, ExerciseType } from "../../exercise/vocabulary";
import type { ImportedSet } from "./parse-history";

/** An exercise the user can already log: a catalog exercise or one of their own. */
export type LibraryEntry = {
  id: string;
  title: string;
  aka: string | null;
  custom: boolean;
  exerciseType: ExerciseType;
};

/** A name for comparing: no case, accents or punctuation (`Bench Press (Barbell)` and `bench press barbell`). */
export function normalizeExerciseName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The same name with its words in order, so `Barbell Bench Press` finds `Bench Press (Barbell)`. */
const wordSetKey = (normalized: string) => normalized.split(" ").sort().join(" ");

type Candidate = { id: string; custom: boolean };

function addCandidate(index: Map<string, Candidate[]>, key: string, candidate: Candidate) {
  if (key === "") return;
  const list = index.get(key);
  if (!list) index.set(key, [candidate]);
  else if (!list.some((item) => item.id === candidate.id)) list.push(candidate);
}

/** One candidate wins, or none: the user's own exercise beats a catalog one; a tie is no match. */
function pick(candidates: readonly Candidate[] | undefined): string | null {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]?.id ?? null;
  const custom = candidates.filter((candidate) => candidate.custom);
  return custom.length === 1 ? (custom[0]?.id ?? null) : null;
}

export type ExerciseMatcher = (name: string) => string | null;

/**
 * Finds the library exercise a file's exercise name means: by title or alias with the name
 * normalized, then with the words in any order. The user's own exercise wins over the catalog's;
 * a name that fits several exercises equally is left unmatched for the user to map.
 */
export function createExerciseMatcher(library: readonly LibraryEntry[]): ExerciseMatcher {
  const exact = new Map<string, Candidate[]>();
  const words = new Map<string, Candidate[]>();
  for (const entry of library) {
    const candidate = { id: entry.id, custom: entry.custom };
    const names = [entry.title, ...(entry.aka ?? "").split(/[,;|/]/u)];
    for (const name of names) {
      const normalized = normalizeExerciseName(name);
      addCandidate(exact, normalized, candidate);
      addCandidate(words, wordSetKey(normalized), candidate);
    }
  }
  return (name) => {
    const normalized = normalizeExerciseName(name);
    return pick(exact.get(normalized)) ?? pick(words.get(wordSetKey(normalized)));
  };
}

/**
 * The type for an exercise the file has and the library does not, from the sets it logged: a
 * distance and a time, a time alone, weight with reps, or reps alone (bodyweight).
 */
export function inferExerciseType(sets: readonly ImportedSet[]): ExerciseType {
  const has = (value: (set: ImportedSet) => number | null) =>
    sets.some((set) => (value(set) ?? 0) > 0);
  const weight = has((set) => set.weight);
  if (has((set) => set.distanceM)) {
    if (has((set) => set.durationS)) return "distance_duration";
    return weight ? "short_distance_weight" : "distance_duration";
  }
  if (has((set) => set.reps)) return weight ? "weight_reps" : "bodyweight_reps";
  if (has((set) => set.durationS)) return "duration";
  return weight ? "weight_reps" : "bodyweight_reps";
}

const EQUIPMENT_WORDS = [
  ["smith machine", "smith_machine"],
  ["ez bar", "ez_bar"],
  ["ez-bar", "ez_bar"],
  ["trap bar", "trap_bar"],
  ["hex bar", "trap_bar"],
  ["barbell", "barbell"],
  ["dumbbell", "dumbbell"],
  ["kettlebell", "kettlebell"],
  ["cable", "cable"],
  ["machine", "machine"],
  ["band", "resistance_band"],
  ["suspension", "suspension"],
  ["plate", "plate"],
  ["body weight", "none"],
  ["bodyweight", "none"],
] as const satisfies readonly (readonly [string, Equipment])[];

/** The equipment a name hints at, usually in brackets (`Curl (Dumbbell)`), else `other` or `none`. */
export function inferEquipment(name: string, type: ExerciseType): Equipment {
  const lower = name.toLowerCase();
  for (const [word, equipment] of EQUIPMENT_WORDS) {
    if (lower.includes(word)) return equipment;
  }
  return type === "bodyweight_reps" || type === "duration" ? "none" : "other";
}
