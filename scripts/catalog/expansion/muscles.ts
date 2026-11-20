// Maps the earlier dataset's 44 anatomical muscles onto our groups and details (ADR 0050).
import {
  MUSCLE_DETAIL_SLUGS,
  MUSCLE_GROUPS,
  groupOf,
  type MuscleDetail,
  type MuscleGroup,
} from "../../../packages/shared/src/exercise/vocabulary.ts";

export type MappedMuscle = { group: MuscleGroup; detail: MuscleDetail | null };

function detail(slug: MuscleDetail): MappedMuscle {
  return { group: groupOf(slug), detail: slug };
}
function group(slug: MuscleGroup): MappedMuscle {
  return { group: slug, detail: null };
}

export const MUSCLE_MAP = {
  PECTORALIS_MAJOR_STERNAL_HEAD: detail("lower_chest"),
  PECTORALIS_MAJOR_CLAVICULAR_HEAD: detail("upper_chest"),
  DELTOID_ANTERIOR: detail("front_delts"),
  DELTOID_LATERAL: detail("side_delts"),
  DELTOID_POSTERIOR: detail("rear_delts"),
  INFRASPINATUS: detail("rotator_cuff"),
  TERES_MINOR: detail("rotator_cuff"),
  SUBSCAPULARIS: detail("rotator_cuff"),
  TRAPEZIUS_UPPER_FIBERS: group("traps"),
  TRAPEZIUS_MIDDLE_FIBERS: detail("mid_traps"),
  TRAPEZIUS_LOWER_FIBERS: detail("lower_traps"),
  TERES_MAJOR: detail("teres_major"),
  BICEPS_BRACHII: detail("biceps_brachii"),
  BRACHIALIS: detail("brachialis"),
  BRACHIORADIALIS: detail("brachioradialis"),
  WRIST_FLEXORS: detail("wrist_flexors"),
  WRIST_EXTENSORS: detail("wrist_extensors"),
  RECTUS_ABDOMINIS: detail("rectus_abdominis"),
  OBLIQUES: detail("obliques"),
  TRANSVERSE_ABDOMINUS: detail("deep_core"),
  GASTROCNEMIUS: detail("gastrocnemius"),
  SOLEUS: detail("soleus"),
  TIBIALIS_ANTERIOR: detail("tibialis"),
  GLUTEUS_MEDIUS: detail("glute_medius"),
  GLUTEUS_MINIMUS: detail("glute_medius"),
  TENSOR_FASCIAE_LATAE: detail("tfl"),
  ILIOPSOAS: detail("hip_flexors"),
  GLUTEUS_MAXIMUS: group("glutes"),
  QUADRICEPS: group("quadriceps"),
  HAMSTRINGS: group("hamstrings"),
  LATISSIMUS_DORSI: group("lats"),
  TRICEPS_BRACHII: group("triceps"),
  ERECTOR_SPINAE: group("lower_back"),
  ADDUCTOR_MAGNUS: group("adductors"),
  ADDUCTOR_LONGUS: group("adductors"),
  STERNOCLEIDOMASTOID: group("neck"),
  SERRATUS_ANTERIOR: group("chest"),
  SARTORIUS: group("quadriceps"),
  PECTINEOUS: group("adductors"),
  GRACILIS: group("adductors"),
  POPLITEUS: group("calves"),
  SPLENIUS: group("neck"),
  LEVATOR_SCAPULAE: group("traps"),
  DEEP_HIP_EXTERNAL_ROTATORS: group("glutes"),
} as const satisfies Record<string, MappedMuscle>;
export type SourceMuscle = keyof typeof MUSCLE_MAP;

const sourceMuscles: ReadonlySet<string> = new Set(Object.keys(MUSCLE_MAP));

/** True for a muscle name the mapping knows; the dataset is untrusted, so unknown names fail. */
export function isSourceMuscle(name: string): name is SourceMuscle {
  return sourceMuscles.has(name);
}

/** Primary-group preference: legs and hips, then back, chest, shoulders, arms, core, neck. */
const GROUP_PRIORITY: readonly MuscleGroup[] = [
  "quadriceps",
  "hamstrings",
  "glutes",
  "adductors",
  "abductors",
  "calves",
  "lats",
  "upper_back",
  "traps",
  "lower_back",
  "chest",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abdominals",
  "neck",
];

/** The group an exercise is filed under when it works several: the first by the preference. */
export function pickPrimaryGroup(groups: readonly MuscleGroup[]): MuscleGroup | null {
  for (const candidate of GROUP_PRIORITY) {
    if (groups.includes(candidate)) return candidate;
  }
  return groups[0] ?? null;
}

export function sortGroups(groups: Iterable<MuscleGroup>): MuscleGroup[] {
  const set = new Set(groups);
  return MUSCLE_GROUPS.values()
    .filter((slug) => set.has(slug))
    .toArray();
}

export function sortDetails(details: Iterable<MuscleDetail>): MuscleDetail[] {
  const set = new Set(details);
  return MUSCLE_DETAIL_SLUGS.values()
    .filter((slug) => set.has(slug))
    .toArray();
}

export type MuscleSet = { groups: MuscleGroup[]; details: MuscleDetail[] };

/** The distinct groups and details of a list of source muscles, in vocabulary order. */
export function mapMuscles(names: readonly SourceMuscle[]): MuscleSet {
  const mapped = names.map((name): MappedMuscle => MUSCLE_MAP[name]);
  const details = mapped.flatMap((entry) => (entry.detail === null ? [] : [entry.detail]));
  return {
    groups: sortGroups(mapped.map((entry) => entry.group)),
    details: sortDetails(details),
  };
}

/** How many distinct muscles a list maps to (two cuff muscles count once). */
export function distinctMuscleCount(names: readonly SourceMuscle[]): number {
  const keys = names.map((name) => {
    const entry: MappedMuscle = MUSCLE_MAP[name];
    return entry.detail ?? entry.group;
  });
  return new Set(keys).size;
}

// Compound presses, pulls and rows load the rotator cuff as a stabiliser, not a target.
const COMPOUND = /\b(press|push[- ]?ups?|pull[- ]?ups?|chin[- ]?ups?|pulldowns?|rows?|dips?)\b/i;
const CUFF_WORK = /\b(face pull|external rotation|internal rotation|rotator|cuff)\b/i;

/** True for a title where a secondary rotator cuff tag is noise. */
export function dropsRotatorCuff(title: string): boolean {
  return COMPOUND.test(title) && !CUFF_WORK.test(title);
}

export const MAX_SECONDARY_GROUPS = 5;

/**
 * Secondary groups: the other primaries first, then everything else the source lists, at most
 * five, in vocabulary order. The earlier dataset tags whole-body drills with a dozen muscles.
 */
export function capSecondaries(
  primaries: readonly MuscleGroup[],
  all: readonly MuscleGroup[],
  primary: MuscleGroup,
): MuscleGroup[] {
  const ordered = [
    ...GROUP_PRIORITY.filter((slug) => primaries.includes(slug)),
    ...GROUP_PRIORITY,
    ...all,
  ].filter((slug) => slug !== primary && all.includes(slug));
  return sortGroups(new Set(ordered).values().take(MAX_SECONDARY_GROUPS));
}
