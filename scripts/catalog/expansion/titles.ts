// Title cleaning and the equipment and type mappings for candidate rows.
import type { Equipment, ExerciseType } from "../../../packages/shared/src/exercise/vocabulary.ts";

const SMALL_WORDS = new Set(["a", "an", "the", "of", "on", "with", "and", "to", "in", "for", "or"]);

/** Strips gender, version and spacing noise: "Bicycle Crunch (male)" is "Bicycle Crunch". */
export function stripNoise(title: string): string {
  return title
    .replaceAll(/\((?:male|female)\)/gi, " ")
    .replaceAll(/\(\s*version\s*\d+\s*\)/gi, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/** Lowercase and noise-free: the key duplicates collapse on. */
export function normalizeTitle(title: string): string {
  return stripNoise(title).toLowerCase();
}

/** True when the source title carries no gender or version tag. */
export function isPlainName(title: string): boolean {
  return stripNoise(title) === title.replaceAll(/\s+/g, " ").trim();
}

function capitalise(word: string): string {
  if (word === "") return word;
  // Words that already carry capitals ("EZ", "StepOut", "T-Bar") are left alone.
  if (/[A-Z]/.test(word.slice(1)) || /^[A-Z]{2,}$/.test(word)) return word;
  return word.slice(0, 1).toUpperCase() + word.slice(1);
}

/** Title Case with small words lowercase (not first) and hyphen parts capitalised. */
export function titleCase(title: string): string {
  return title
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return word
        .split("-")
        .map((part) => capitalise(part))
        .join("-");
    })
    .join(" ")
    .replaceAll(/\(([a-z])/g, (_match, letter: string) => `(${letter.toUpperCase()}`);
}

/** What a source equipment kind maps to, the label shown in a title, and leading title words. */
type EquipmentRule = {
  equipment: Equipment;
  /** Title suffix; null for no suffix (the old name is used for `other`). */
  label: string | null;
  prefixes: readonly string[];
};

const EQUIPMENT_RULES = {
  "Leverage machine": { equipment: "machine", label: "Machine", prefixes: ["lever", "leverage"] },
  "Sled machine": { equipment: "machine", label: "Machine", prefixes: ["sled"] },
  Assisted: { equipment: "machine", label: "Assisted", prefixes: ["assisted"] },
  "Smith machine": { equipment: "smith_machine", label: "Smith Machine", prefixes: ["smith"] },
  Cable: { equipment: "cable", label: "Cable", prefixes: ["cable"] },
  Rope: { equipment: "cable", label: "Cable", prefixes: ["rope"] },
  Barbell: { equipment: "barbell", label: "Barbell", prefixes: ["barbell"] },
  "Olympic barbell": { equipment: "barbell", label: "Barbell", prefixes: ["olympic barbell"] },
  "EZ Barbell": {
    equipment: "ez_bar",
    label: "EZ Bar",
    prefixes: ["ez barbell", "ez-bar", "ez bar", "ez"],
  },
  "Trap bar": { equipment: "trap_bar", label: "Trap Bar", prefixes: ["trap bar"] },
  "Body weight": { equipment: "none", label: null, prefixes: [] },
  Band: { equipment: "resistance_band", label: "Band", prefixes: ["band", "banded"] },
  "Resistance Band": {
    equipment: "resistance_band",
    label: "Band",
    prefixes: ["resistance band", "band", "banded"],
  },
  Weighted: { equipment: "plate", label: "Weighted", prefixes: ["weighted"] },
  Suspension: { equipment: "suspension", label: "Suspension", prefixes: ["suspension"] },
  Dumbbell: { equipment: "dumbbell", label: "Dumbbell", prefixes: ["dumbbell"] },
  Kettlebell: { equipment: "kettlebell", label: "Kettlebell", prefixes: ["kettlebell"] },
} as const satisfies Record<string, EquipmentRule>;

function isKnownEquipment(name: string): name is keyof typeof EQUIPMENT_RULES {
  return Object.hasOwn(EQUIPMENT_RULES, name);
}

/** Source equipment that marks rolling, massage and vibration work: never a candidate. */
export const NON_TRAINING_EQUIPMENT: ReadonlySet<string> = new Set([
  "Roll",
  "Rollball",
  "Stick",
  "Vibrate Plate",
]);

function ruleFor(name: string): EquipmentRule {
  if (isKnownEquipment(name)) return EQUIPMENT_RULES[name];
  return { equipment: "other", label: titleCase(name), prefixes: [name] };
}

/** The source equipment that decides the row: the first listed that is not plain body weight. */
export function leadEquipment(names: readonly string[]): string {
  const loaded = names.filter((name) => name !== "Body weight");
  return loaded.find(isKnownEquipment) ?? loaded[0] ?? "Body weight";
}

/** Old 28 kinds to our 13. */
export function mapEquipment(names: readonly string[]): Equipment {
  return ruleFor(leadEquipment(names)).equipment;
}

const SLED_OR_CARRY = /\b(sled|carry|carries|farmers?|yoke)\b/i;

export type MappedType = { type: ExerciseType; guessed: boolean };

/** Old three types to our ten, using the equipment kind and the title. */
export function mapType(
  sourceType: "weight_reps" | "duration" | "distance_duration",
  names: readonly string[],
  title: string,
): MappedType {
  if (sourceType === "duration") return { type: "duration", guessed: false };
  if (sourceType === "distance_duration") {
    return { type: "distance_duration", guessed: false };
  }
  if (SLED_OR_CARRY.test(title)) return { type: "short_distance_weight", guessed: true };
  const lead = leadEquipment(names);
  if (lead === "Body weight") return { type: "bodyweight_reps", guessed: false };
  if (lead === "Assisted") return { type: "bodyweight_assisted_reps", guessed: true };
  if (lead === "Weighted") return { type: "bodyweight_weighted_reps", guessed: true };
  if (lead === "Band") return { type: "reps_only", guessed: true };
  return { type: "weight_reps", guessed: false };
}

/** True for the bodyweight types, where the row's load is the lifter's own weight. */
export function isBodyweightType(type: ExerciseType): boolean {
  return (
    type === "bodyweight_reps" ||
    type === "bodyweight_assisted_reps" ||
    type === "bodyweight_weighted_reps"
  );
}

function stripLeading(words: string, prefixes: readonly string[]): string {
  // "Lever Assisted Chin-up": the machine word and the kind word both lead the title.
  const sorted = [...prefixes, "lever", "leverage"].toSorted((a, b) => b.length - a.length);
  let rest = words;
  for (;;) {
    const lower = rest.toLowerCase();
    const prefix = sorted.find((candidate) => lower.startsWith(`${candidate} `));
    if (prefix === undefined) return rest;
    rest = rest.slice(prefix.length + 1).trim();
  }
}

/**
 * "Movement (Equipment)": the equipment word leaves the front of the source title and is added as
 * a suffix, unless the title already carries it. Body weight gets no suffix.
 */
export function suggestTitle(sourceTitle: string, names: readonly string[]): string {
  const rule = ruleFor(leadEquipment(names));
  const cleaned = stripNoise(sourceTitle);
  const movement = titleCase(stripLeading(cleaned, rule.prefixes));
  const base = movement === "" ? titleCase(cleaned) : movement;
  if (rule.label === null) return base;
  if (base.toLowerCase().includes(`(${rule.label.toLowerCase()})`)) return base;
  return `${base} (${rule.label})`;
}

// Equipment words say how a movement is loaded, not which movement it is.
const EQUIPMENT_WORDS: ReadonlySet<string> = new Set([
  "lever",
  "leverage",
  "machine",
  "cable",
  "barbell",
  "dumbbell",
  "smith",
  "kettlebell",
  "ez",
  "bar",
  "band",
  "banded",
  "weighted",
  "suspension",
  "sled",
  "assisted",
  "rope",
  "plate",
  "loaded",
  "bodyweight",
]);

function tokens(title: string): Set<string> {
  const words = normalizeTitle(title).split(/[^a-z0-9]+/);
  return new Set(words.filter((token) => token !== "" && !EQUIPMENT_WORDS.has(token)));
}

/** Share of words two titles have in common, 0 to 1. */
export function titleSimilarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  const shared = left
    .values()
    .filter((token) => right.has(token))
    .toArray().length;
  return shared / (left.size + right.size - shared);
}

/** The source title as `aka` when it differs a lot from the suggestion (equipment words aside). */
export function suggestAka(sourceTitle: string, suggested: string): string | null {
  const cleaned = stripNoise(sourceTitle);
  const withoutSuffix = suggested.replace(/\s*\([^)]*\)$/, "");
  return titleSimilarity(cleaned, withoutSuffix) < 0.6 ? cleaned : null;
}

const NOT_TRAINING =
  /stretch|yoga|\bpose\b|pilates|massage|\broll(?:ing)?\b.*\b(?:foam|ball|stick)\b|foam|warm[- ]?up|vibrat/i;

/** True for titles that are mobility, rolling or warm-up work rather than training. */
export function isNotTraining(title: string): boolean {
  return NOT_TRAINING.test(title);
}
