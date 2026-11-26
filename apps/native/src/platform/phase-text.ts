import type { TranslationKey } from "@workspace/i18n";
import {
  patternRuns,
  phaseEffects,
  type PatternRun,
  type Phase,
  type PhaseModifiers,
  type TestTop,
  type WeeksSummary,
} from "@workspace/shared";
import { useCallback } from "react";

import { useTranslation } from "@/platform/i18n";

const NAME_KEYS = {
  build: "phase__build",
  push: "phase__push",
  test: "phase__test",
  deload: "phase__deload",
} as const satisfies Record<Phase, TranslationKey>;

const HINT_KEYS = {
  build: "phase__build_hint",
  push: "phase__push_hint",
  test: "phase__test_hint",
  deload: "phase__deload_hint",
} as const satisfies Record<Phase, TranslationKey>;

const MINUS = "−";

/** A signed effort shift as shown: "+1", "−2", "+0.5". */
export function signedEffort(value: number, locale: string): string {
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.abs(value));
  return `${value < 0 ? MINUS : "+"}${text}`;
}

/**
 * The words for phases: a phase's name and hint, and what it does to a Workout as one line ("sets
 * halved, −2 RPE, −10% load"). Shared by the Program page, Train and the Session banner.
 */
export function usePhaseText() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const name = useCallback((phase: Phase) => t(NAME_KEYS[phase]), [t]);
  const hint = useCallback((phase: Phase) => t(HINT_KEYS[phase]), [t]);
  /** What a phase changes, in plain words; "as planned" when it changes nothing. */
  const effects = useCallback(
    (phase: Phase, modifiers: PhaseModifiers, testTop: TestTop = "single", hasEffort = true) => {
      const found = phaseEffects(phase, modifiers, testTop, hasEffort);
      const parts: string[] = [];
      if (found.top !== null)
        parts.push(t(found.top === "single" ? "phase__effect_single" : "phase__effect_amrap"));
      if (found.sets !== null) {
        parts.push(
          found.sets === 0.5
            ? t("phase__effect_sets_half")
            : t("phase__effect_sets", {
                value: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                  found.sets,
                ),
              }),
        );
      }
      if (found.rpe !== null)
        parts.push(t("phase__effect_rpe", { value: signedEffort(found.rpe, locale) }));
      if (found.loadPct !== null)
        parts.push(t("phase__effect_load", { value: 100 - found.loadPct }));
      if (parts.length === 0) return t("phase__as_planned");
      return new Intl.ListFormat(locale, { style: "narrow", type: "unit" }).format(parts);
    },
    [t, locale],
  );
  /**
   * "Deload: sets halved, −10% load"; null for Build as planned, which needs no banner. The
   * effort shift is left out when the Workout has no effort targets for it to move.
   */
  const banner = useCallback(
    (
      phase: Phase,
      modifiers: PhaseModifiers,
      testTop: TestTop = "single",
      hasEffort = true,
      loadCuts?: readonly [number, number],
    ) => {
      const parts = effects(phase, { ...modifiers, load: 1 }, testTop, hasEffort);
      const signedCut = (value: number) =>
        `${value < 0 ? "+" : value > 0 ? MINUS : ""}${Math.abs(value)}%`;
      const cut = loadCuts
        ? loadCuts[0] === loadCuts[1]
          ? t("phase__effect_actual_load", { value: signedCut(loadCuts[0]) })
          : t("phase__effect_actual_load_range", {
              min: signedCut(loadCuts[1]),
              max: signedCut(loadCuts[0]),
            })
        : null;
      const text = cut
        ? new Intl.ListFormat(locale, { style: "narrow", type: "unit" }).format(
            parts === t("phase__as_planned") ? [cut] : [parts, cut],
          )
        : parts;
      const plain = phase === "build" && text === t("phase__as_planned");
      return plain ? null : t("phase__banner", { phase: name(phase), effects: text });
    },
    [effects, name, t, locale],
  );
  const runsText = useCallback(
    (runs: readonly PatternRun[]) => {
      const parts = runs.map((run) =>
        run.count === 1
          ? name(run.phase)
          : t("phase__pattern_run", { phase: name(run.phase), count: run.count }),
      );
      return new Intl.ListFormat(locale, { style: "narrow", type: "unit" }).format(parts);
    },
    [name, t, locale],
  );
  /** A pattern with its runs folded: "Build ×3, Deload". */
  const pattern = useCallback(
    (weeks: readonly Phase[]) => runsText(patternRuns(weeks)),
    [runsText],
  );
  /** The Weeks row: "12 weeks · Build ×3, Deload", "Open-ended · No phases". */
  const summary = useCallback(
    ({ length, runs }: WeeksSummary) =>
      t("phase__summary", {
        length:
          length === null
            ? t("phase__open_ended")
            : t("training__program_meta_weeks", { count: length }),
        pattern: runs.length === 0 ? t("phase__no_phases") : runsText(runs),
      }),
    [t, runsText],
  );
  return { name, hint, effects, banner, pattern, summary };
}
