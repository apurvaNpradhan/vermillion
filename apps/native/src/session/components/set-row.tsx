import {
  SET_FIELDS,
  SET_KIND_KEYS,
  type EffortScale,
  type ExerciseType,
  type Ghosts,
  type LoggedSet,
  type SetField,
  type WeightUnit,
} from "@workspace/shared";
import type { SessionSetDetail } from "@workspace/sync";
import { Check, Trash } from "phosphor-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useOnIdentityColor, useSubtleColor } from "@/platform/theme";
import { SwipeRow, type SwipeA11yProps } from "@/platform/ui/swipe-row";
import { SET_TONES, formatEffortRange } from "@/training";

import type { CellRef } from "../keypad-entry";
import { formatCell, previousLabel, valueOfSet } from "../set-values";
import { SetCell } from "./set-cell";

/** The cell being edited and what is typed into it, as the row shows it. */
export type ActiveEntry = { cell: CellRef; text: string };

/** A refused tick: which cells lack a value, and a counter so a repeat shakes again. */
export type Refusal = { setId: string; fields: readonly SetField[]; nonce: number };

export type SetRowProps = {
  set: SessionSetDetail;
  type: ExerciseType;
  /** Number or letter on the badge. */
  badge: string;
  /** The row's place among the exercise's sets, for screen readers (1-based). */
  number: number;
  logEffort: boolean;
  previous: LoggedSet | null;
  ghosts: Ghosts;
  unit: WeightUnit;
  effortScale: EffortScale;
  entry: ActiveEntry | null;
  refusal: Refusal | null;
  /** The set to log next in its block. */
  highlighted: boolean;
  readOnly: boolean;
  canRemove: boolean;
  onCell: (setId: string, field: SetField) => void;
  onTick: (setId: string) => void;
  onKind: (setId: string) => void;
  onEffort: (setId: string) => void;
  onPrevious: (setId: string) => void;
  onRemove: (setId: string) => void;
};

const grow = (field: SetField) => (field === "reps" ? "flex-[1.2]" : "flex-1");

/**
 * One Logged set: a badge that changes its kind, Previous (tap to copy), a cell for each field
 * of the exercise's type, effort when the exercise logs it, and the tick. Cells are pressables
 * that open the keypad. Warm-ups record no effort.
 */
export const SetRow = memo(function SetRow(props: SetRowProps) {
  const {
    set,
    type,
    badge,
    number,
    logEffort,
    previous,
    ghosts,
    unit,
    effortScale,
    entry,
    refusal,
    highlighted,
    readOnly,
    canRemove,
  } = props;
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const onIdentity = useOnIdentityColor();
  const fields: readonly SetField[] = SET_FIELDS[type];
  const ticked = set.completedAt !== null;
  const showsEffort = logEffort && fields.includes("reps") && set.kind !== "warmup";
  const previousText = previous ? previousLabel(previous, type, unit) : null;
  const unitName = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");

  const header = (field: SetField): string => {
    switch (field) {
      case "weight":
        return t("training__field_weight", { unit: unitName });
      case "reps":
        return t("training__field_reps");
      case "duration":
        return t("training__field_duration");
      case "distance":
        return t("training__col_distance", { unit: t("training__unit_m") });
      case "floors":
        return t("training__field_floors");
      case "steps":
        return t("training__field_steps");
    }
  };

  const cell = (field: SetField) => {
    const stored = valueOfSet(set, field);
    const editing = entry?.cell.setId === set.id && entry.cell.field === field;
    const text = editing ? entry.text : formatCell(field, stored, unit);
    const ghost = formatCell(field, ghosts[field] ?? null, unit);
    const refused = refusal?.setId === set.id && refusal.fields.includes(field);
    return (
      <View key={field} className={`min-w-0 flex-row ${grow(field)}`}>
        <SetCell
          text={text}
          ghost={ghost}
          active={editing}
          refused={refused}
          refusedNonce={refusal?.nonce ?? 0}
          disabled={readOnly}
          label={t("training__cell_label", { number, field: header(field) })}
          onPress={() => props.onCell(set.id, field)}
        />
      </View>
    );
  };

  const rpeText = (rpe: number) => formatEffortRange(rpe, rpe, effortScale);
  const effortValue = set.rpe === null ? null : rpeText(set.rpe);
  const effortGhost = ghosts.rpe ?? null;

  const row = (a11y?: SwipeA11yProps) => (
    <View
      className={`flex-row items-center gap-1.5 rounded-xl px-1 py-1 ${highlighted && !ticked ? "bg-identity-soft" : ""}`}
    >
      <Pressable
        {...a11y}
        accessibilityRole="button"
        accessibilityLabel={t("training__set_kind_change", {
          number,
          kind: t(SET_KIND_KEYS[set.kind]),
        })}
        disabled={readOnly}
        onPress={() => {
          haptic.tick();
          props.onKind(set.id);
        }}
        hitSlop={4}
        className={`h-10 w-10 items-center justify-center rounded-lg ${SET_TONES[set.kind].background}`}
      >
        <Text className={`font-semibold text-label ${SET_TONES[set.kind].text}`}>{badge}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          previousText === null
            ? t("session__previous_none")
            : t("session__previous_copy", { value: previousText })
        }
        disabled={readOnly || previous === null || previousText === null}
        onPress={() => {
          haptic.tick();
          props.onPrevious(set.id);
        }}
        className="h-10 min-w-0 flex-[1.3] items-center justify-center rounded-lg px-1 active:bg-default"
      >
        <Text
          numberOfLines={1}
          className="text-center text-caption text-muted"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {previousText ?? "–"}
        </Text>
      </Pressable>
      {fields.map(cell)}
      {showsEffort ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("training__effort_cell_label", {
            number,
            value: effortValue ?? t("training__effort_none"),
          })}
          disabled={readOnly}
          onPress={() => props.onEffort(set.id)}
          className="h-10 w-11 items-center justify-center rounded-lg bg-field active:bg-default"
        >
          <Text
            className={`text-body ${effortValue === null ? "text-muted" : "text-foreground"}`}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {effortValue ?? (effortGhost === null ? "–" : rpeText(effortGhost))}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: ticked }}
        accessibilityLabel={t(ticked ? "session__untick_set" : "session__tick_set", { number })}
        disabled={readOnly}
        onPress={() => props.onTick(set.id)}
        hitSlop={4}
        className={`h-10 w-11 items-center justify-center rounded-lg ${ticked ? "bg-identity" : "bg-field"}`}
      >
        <Check size={18} weight="bold" color={ticked ? onIdentity : subtle} />
      </Pressable>
    </View>
  );

  return canRemove && !readOnly ? (
    <SwipeRow
      direct
      actions={[
        {
          key: "remove",
          label: t("training__remove"),
          icon: Trash,
          tone: "danger",
          iconOnly: true,
          onPress: () => props.onRemove(set.id),
        },
      ]}
    >
      {(a11y) => row(a11y)}
    </SwipeRow>
  ) : (
    row()
  );
});
