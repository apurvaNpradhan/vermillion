import { loadIdentity } from "../../vocabulary/format";
import { lightenLoad } from "../../progress/progression-steps";
import type {
  Progression,
  ProgressionReason,
  SetOutcome,
  SuggestedSet,
} from "../../progress/progression";
import type { ProgressionRule } from "../rule";
import { BACKOFF_FALLBACK_PERCENT, DEFAULT_RULE, type RuleConfig } from "../rule-config";
import { OUTCOME_ORDER, REASON_OF } from "../slots";
import { doubleRule } from "./double";

type TopBackoffConfig = Extract<RuleConfig, { id: "top_backoff" }>;

/** Which reason names the exercise when its sets differ: the strongest change first. */
const REASON_ORDER: readonly ProgressionReason[] = [
  ...OUTCOME_ORDER.filter((outcome) => outcome !== "same").map((outcome) => REASON_OF[outcome]),
  "backoff_share",
  "same_as_last",
];

const SHARE_MIN = 0.5;
const SHARE_MAX = 0.95;

/**
 * Top set with back-offs. The top set moves like a Double set on its own: reps to the top of its
 * range, then load. The back-offs then take a share of today's top load, rounded onto the grid:
 * the rule's own percent, else the share the lifter used last time, else 90%. The share is kept as
 * it was first meant (a back-off done as suggested hands it on unrounded), so rounding onto the
 * grid never creeps it. Their reps climb within the range and never leave it.
 */
export const topBackoffRule: ProgressionRule<TopBackoffConfig> = {
  id: "top_backoff",
  propose(input): Progression {
    const base = doubleRule.propose({ ...input, config: DEFAULT_RULE });
    const { slots, saved, last, equipment, unit, grid, config } = input;
    const top = slots.find(
      ({ target, index }) => target.kind === "top" && base.sets[index]?.weightKg != null,
    );
    const backoffs = slots.filter(({ target }) => target.kind === "backoff");
    const topLoad = top ? (base.sets[top.index]?.weightKg ?? null) : null;
    if (top === undefined || topLoad === null || backoffs.length === 0) return base;

    // The share used last time, when the lifter logged a top set and a back-off. A back-off done
    // as suggested keeps the share that was meant, not the ratio the grid rounded it to: reading
    // that back would creep the share a little every Session.
    const lastTop = last?.sets.find((set) => set.kind === "top" && set.weight_kg != null);
    const lastBackoff = last?.sets.find((set) => set.kind === "backoff" && set.weight_kg != null);
    const followed =
      lastBackoff?.suggested?.share !== undefined &&
      lastBackoff.suggested.weight_kg != null &&
      lastBackoff.weight_kg != null &&
      loadIdentity(lastBackoff.weight_kg) === loadIdentity(lastBackoff.suggested.weight_kg);
    const lastShare =
      lastTop?.weight_kg && lastBackoff?.weight_kg
        ? Math.min(
            SHARE_MAX,
            Math.max(
              SHARE_MIN,
              followed
                ? (lastBackoff.suggested?.share ?? 0)
                : lastBackoff.weight_kg / lastTop.weight_kg,
            ),
          )
        : null;
    const share =
      config.backoff_percent !== undefined
        ? config.backoff_percent / 100
        : (lastShare ?? BACKOFF_FALLBACK_PERCENT / 100);
    const load = lightenLoad(topLoad, share, equipment, unit, grid, "nearest");

    const sets: (SuggestedSet | null)[] = [...base.sets];
    const outcomes: (SetOutcome | null)[] = [...base.outcomes];
    for (const { index } of backoffs) {
      const before = saved.get(index)?.before;
      const proposal = base.sets[index];
      if (!before || !proposal) continue;
      // Double adds load, or extends the reps past the range, once they reach its top. Here the
      // load follows the top set instead, so a back-off keeps its reps and never leaves its range.
      const reason = base.outcomes[index]?.reason;
      const keeps = reason === "add_weight" || reason === "more_reps" || reason === "cap_reps";
      const target = slots.find((slot) => slot.index === index)?.target;
      const rangeTop = target?.reps_max ?? target?.reps_min;
      const reps = keeps ? (before.reps ?? null) : proposal.reps;
      sets[index] = {
        weightKg: load,
        reps: reps !== null && rangeTop !== undefined ? Math.min(rangeTop, reps) : reps,
      };
      outcomes[index] = { reason: "backoff_share", loadFactor: load / topLoad, share };
    }
    const reason =
      REASON_ORDER.find((candidate) => outcomes.some((outcome) => outcome?.reason === candidate)) ??
      base.reason;
    return { ...base, reason, sets, outcomes };
  },
};
