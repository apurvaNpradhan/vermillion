// Proposed rank tiers: 1 staple, 2 common, 3 variant, 4 niche (higher rank value sorts first).
import type { Equipment } from "../../../packages/shared/src/exercise/vocabulary.ts";

export const TIERS = [1, 2, 3, 4] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_RANK = { 1: 100, 2: 60, 3: 30, 4: 10 } as const satisfies Record<Tier, number>;

const STAPLE_EQUIPMENT: ReadonlySet<Equipment> = new Set([
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "none",
]);

// The movements most lifters expect to find first, matched on the title without its equipment.
const STAPLES: readonly RegExp[] = [
  /^(?:(?:flat|incline|decline|close[- ]grip|wide[- ]grip|seated|standing|bent[- ]over|overhead|front|back|goblet|hack|sumo|romanian|stiff[- ]leg|reverse|hammer|preacher|lying|one[- ]arm|single[- ]arm|single[- ]leg|lateral|rear|walking|bulgarian split|incline)\s+)*(?:bench press|chest press|shoulder press|overhead press|military press|squat|deadlift|row|pull[- ]?up|chin[- ]?up|lat pulldown|pulldown|(?:biceps? )?curl|triceps? (?:pushdown|extension)|pushdown|skullcrusher|lateral raise|front raise|leg press|leg extension|leg curl|hip thrust|calf raise|face pull|(?:chest )?fly|dip|push[- ]?up|lunge|shrug|plank|crunch|pullover|good morning)$/i,
];

const COMMON =
  /\b(press|squat|row|curl|raise|extension|lunge|pulldown|pullover|fly|flye|deadlift|shrug|crunch|dips?|pull[- ]?ups?|push[- ]?ups?|thrust|kickback|pushdown|twist|plank|swing|snatch|clean|jerk)\b/i;

const NICHE =
  /\b(bosu|stability ball|medicine ball|wheel|isometric|on a (?:padded )?(?:stool|bench|ball)|pause|tempo|1\.5|offset|zottman|jefferson|sissy|cossack)\b/i;

function movementOf(title: string): string {
  return title
    .replaceAll(/\([^)]*\)/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/** Staple, common, variant or niche, from the title and equipment alone (a proposal, reviewed). */
export function proposeTier(title: string, equipment: Equipment): Tier {
  const movement = movementOf(title);
  const words = movement.split(" ").length;
  if (NICHE.test(title) || words >= 6) return 4;
  if (STAPLES.some((pattern) => pattern.test(movement)) && words <= 5) {
    if (words > 3) return 2;
    return STAPLE_EQUIPMENT.has(equipment) ? 1 : 2;
  }
  if (COMMON.test(movement) && words <= 4 && STAPLE_EQUIPMENT.has(equipment)) return 2;
  if (equipment === "other" || equipment === "plate") return 4;
  return 3;
}
