import {
  checkSet,
  formatLoad,
  loadBasisOf,
  referenceFrom,
  resolveExerciseUnit,
  type SetKind,
  type SetCheck,
  type WeightUnit,
} from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { useTranslation } from "@/platform/i18n";
import { ChoiceDialog, type DialogChoice } from "@/platform/ui/choice-dialog";

import type { PreviousSets } from "./use-previous-sets";

type Typed = { weightKg: number | null; reps: number | null };

export type GuardRequest = {
  setId: string;
  exercise: SessionExerciseDetail;
  kind: SetKind;
  editedField?: "weight" | "reps";
  /** What the lifter typed; a cell the app filled is left null so it is never questioned. */
  typed: Typed;
  /** Today's suggested load for the set, when there is one. */
  suggestedKg: number | null;
  /** Carry on with what was typed (tick, or leave the saved edit as it is). */
  proceed: () => void;
  /** Back to the cell that looks wrong. */
  change: (field: "weight" | "reps") => void;
  /** Put the weight in the weight cell and the reps in the reps cell, then carry on. */
  swap: (weightKg: number, reps: number) => void;
};

type Asked = { request: GuardRequest; check: SetCheck; unit: WeightUnit };

/**
 * "Check this set": one quiet question before a typed set that is far outside the lifter's own
 * history is logged. It reads the histories the Session already holds, so no row subscribes to
 * anything for it, and a set kept once is not asked about again in this Session. `ask` returns
 * whether the dialog opened; `dialog` is rendered once by the screen.
 */
export function useEntryGuard(
  previous: PreviousSets,
  preferredUnit: WeightUnit,
  sessionId: string,
) {
  const { t } = useTranslation();
  // Mounted closed and opened by a change, as dialogs are; `asked` stays for the closing animation.
  const [asked, setAsked] = useState<Asked | null>(null);
  const [open, setOpen] = useState(false);
  const kept = useRef(new Set<string>());
  const references = useMemo(() => {
    const result = new Map<string, ReturnType<typeof referenceFrom>>();
    for (const [id, sessions] of previous) {
      result.set(
        id,
        referenceFrom(
          sessions.flatMap((session) => (session.id === sessionId ? [] : session.sets)),
        ),
      );
    }
    return result;
  }, [previous, sessionId]);

  const ask = useCallback(
    (request: GuardRequest): boolean => {
      const { typed, exercise, setId } = request;
      if (typed.weightKg === null && typed.reps === null) return false;
      if (!request.editedField && kept.current.has(setId)) return false;
      const unit = resolveExerciseUnit(preferredUnit, exercise.unit);
      const check = checkSet({
        type: exercise.type,
        kind: request.kind,
        basis: loadBasisOf(exercise.exercise?.equipment ?? "other"),
        unit,
        weightKg: typed.weightKg,
        reps: typed.reps,
        editedField: request.editedField,
        history: references.get(exercise.exerciseId) ?? { heaviestKg: null, bestReps: null },
        suggestedKg: request.suggestedKg,
      });
      if (!check) return false;
      setAsked({ request, check, unit });
      setOpen(true);
      return true;
    },
    [references, preferredUnit],
  );

  const close = useCallback(() => setOpen(false), []);
  let choices: DialogChoice[] = [];
  let description = "";
  if (asked) {
    const { request, check, unit } = asked;
    const { exercise, typed } = request;
    const unitName = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
    const loadText = (kg: number) => `${formatLoad(kg, unit, exercise.type)} ${unitName}`;
    const value = typed.weightKg === null ? "" : loadText(typed.weightKg);
    description = (() => {
      switch (check.reason) {
        case "high_load":
          return t(check.source === "history" ? "guard__high_history" : "guard__high_suggestion", {
            exercise: exercise.title,
            reference: loadText(check.referenceKg),
            value,
          });
        case "ceiling":
          return t("guard__ceiling", { exercise: exercise.title, value });
        case "unit_slip":
          return t(
            check.direction === "down"
              ? "guard__slip_down"
              : unit === "kg"
                ? "guard__slip_up_kg"
                : "guard__slip_up_lb",
            { value, reference: loadText(check.referenceKg) },
          );
        case "high_reps":
          return t("guard__reps", { exercise: exercise.title, reps: typed.reps });
        case "swapped":
          return t("guard__swapped");
      }
    })();
    const keepLabel =
      check.reason === "high_reps" && typed.reps !== null
        ? t("guard__keep_reps", { count: typed.reps })
        : check.reason === "swapped" || value === ""
          ? t("guard__keep_as_typed")
          : t("guard__keep", { value });
    choices = [
      {
        label: t("guard__change"),
        primary: true,
        onPress: () => request.change(check.reason === "high_reps" ? "reps" : "weight"),
      },
      {
        label: keepLabel,
        onPress: () => {
          if (!request.editedField) kept.current.add(request.setId);
          request.proceed();
        },
      },
      ...(check.reason === "swapped"
        ? [
            {
              label: t("guard__swap"),
              onPress: () => request.swap(check.weightKg, check.reps),
            },
          ]
        : []),
    ];
  }
  const dialog: ReactNode = (
    <ChoiceDialog
      isOpen={open}
      onClose={close}
      title={t("guard__set_title")}
      description={description}
      choices={choices}
    />
  );
  return { ask, dialog };
}
