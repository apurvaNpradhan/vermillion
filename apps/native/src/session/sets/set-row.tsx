import {
  SET_FIELDS,
  addsLoad,
  SET_KIND_KEYS,
  type EffortScale,
  type ExerciseType,
  type SetField,
  type WeightUnit,
} from "@workspace/shared";
import type { SessionSetDetail } from "@workspace/sync";
import { Copy, DotsThree, Rows, Play, Stop, Trash, WarningCircle } from "phosphor-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { type CSSTransitionProperties } from "react-native-reanimated";
import { useThemeColor } from "heroui-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useActionColor, useOnActionColor, useSubtleColor } from "@/platform/theme";
import { SwipeRow, type SwipeAction, type SwipeA11yProps } from "@/platform/ui/swipe-row";
import type { RowView } from "@/session/store/derive";
import { SET_TONES, formatEffortRange } from "@/training";

import { hasRequiredSetValues } from "@/session/logging/history-gate";
import { displayOfText } from "@/platform/ui/keypad-entry";
import type { CellRef } from "@/session/logging/keypad-entry";
import {
  formatCell,
  formatDuration,
  previousLabel,
  valueOfSet,
  type DisplayUnits,
} from "@/session/logging/set-values";
import { timerTarget, timerView } from "@/session/timer/duration-timer";
import { useNow } from "@/session/shared/use-now";
import { useSessionStore } from "@/session/store/session-store-context";
import { RecordChip } from "./record-chip";
import { SetCell } from "./set-cell";
import { setCapLabel } from "./set-cap-label";
import { TICK_MS } from "@/session/shared/motion";
import { DONE_TINT_ALPHA, withAlpha } from "./row-tint";
import { TickMark } from "./tick-mark";

/** The cell being edited and what is typed into it. `fresh`: the next key replaces the text. */
export type ActiveEntry = { cell: CellRef; raw: string; fresh: boolean; draftValue: number | null };

/** The completed-row tint fades in and out like the tick. */
const TINT_TRANSITION: CSSTransitionProperties = {
  transitionProperty: ["backgroundColor"],
  transitionDuration: TICK_MS,
  transitionTimingFunction: "ease-out",
};

/** A refused tick and the cells that lack a value. */
export type Refusal = { setId: string; fields: readonly SetField[] };

export type SetRowProps = {
  historyReady: boolean;
  editingFinished: boolean;
  /** The Inline timer preference: a running timer still shows, but none can be started. */
  set: SessionSetDetail;
  type: ExerciseType;
  /** Previous, Ghost values and the labels of the row; the same object while they hold. */
  row: RowView;
  logEffort: boolean;
  unit: WeightUnit;
  display: DisplayUnits;
  effortScale: EffortScale;
  entry: ActiveEntry | null;
  refusal: Refusal | null;
  /** The ticked set beat a record: a "PR" chip pops in beside its number. */
  record: string | null;
  animate: boolean;
  /** The set to log next: an accent leading bar and number. */
  current: boolean;
  readOnly: boolean;
  onCopySets: (setId: string, mode: "previous" | "remaining") => void;
  onCell: (setId: string, field: SetField) => void;
  onTick: (setId: string) => void;
  onKind: (setId: string) => void;
  onSwipeOpen?: () => void;
  onLimits: (setId: string) => void;
  onEffort: (setId: string) => void;
  onPrevious: (setId: string) => void;
  onRemove: (setId: string) => Promise<boolean>;
  /** Starts, cancels or stops (and ticks) the set's duration timer. */
  onTimer: (setId: string) => void;
};

/** A running timer: counts down from its target, or up as a stopwatch; right after a restart. */
function LiveTimer({
  startedAt,
  target,
  format,
}: {
  startedAt: string;
  target: number | null;
  format: DisplayUnits["durationFormat"];
}) {
  // A paused workout holds its timers: they show the time at the pause and carry on after Resume.
  const pausedAt = useSessionStore((state) => state.session.pausedAt);
  const now = useNow(pausedAt === null, 250);
  const view = timerView(startedAt, target, pausedAt === null ? now : Date.parse(pausedAt));
  return (
    <Text
      className="text-center font-semibold text-body text-foreground"
      style={{ fontVariant: ["tabular-nums"] }}
    >
      {formatDuration(view.remaining ?? view.elapsed, format)}
    </Text>
  );
}

const grow = (field: SetField) => (field === "reps" ? "flex-[1.2]" : "flex-1");

/**
 * One Logged set: a badge that changes its kind, Previous (tap to copy), a cell for each field
 * of the exercise's type, effort when the exercise logs it, and the tick. Cells are pressables
 * that open the keypad. Warm-ups record no effort.
 */
export const SetRowView = memo(function SetRowView(props: SetRowProps) {
  const {
    set,
    type,
    row: { badge, number, previous, ghosts, canRemove },
    logEffort,
    unit,
    display,
    effortScale,
    entry,
    refusal,
    readOnly,
  } = props;
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const accent = useActionColor();
  const onAccent = useOnActionColor();
  const danger = useThemeColor("danger");
  const ink = useThemeColor("foreground");
  const faint = useThemeColor("muted");
  const fields: readonly SetField[] = SET_FIELDS[type];
  const ticked = set.completedAt !== null;
  const weighted = type === "weight_reps" || type === "bodyweight_weighted_reps";
  // The whole row takes the accent at 15%; unticked it is the same colour fully transparent, so
  // the transition fades the tint instead of passing through grey.
  const tint = withAlpha(accent, DONE_TINT_ALPHA);
  const transparent = withAlpha(accent, 0);
  // What is typed since the cell was opened; nothing until the first key.
  const activeField = entry?.cell.field;
  const draftValue = entry && !entry.fresh ? entry.draftValue : undefined;
  const capLabel =
    weighted && set.kind !== "warmup"
      ? setCapLabel({
          capKg: props.row.capKg,
          kg: (activeField === "weight" ? draftValue : null) ?? set.weightKg ?? ghosts.weight,
          reps: (activeField === "reps" ? draftValue : null) ?? set.reps ?? previous?.reps,
          repMax: set.target?.reps_max ?? set.target?.reps_min,
        })
      : null;
  const waitingForPrevious =
    !ticked &&
    !props.historyReady &&
    !hasRequiredSetValues(type, (field) =>
      activeField === field && draftValue !== undefined ? draftValue : valueOfSet(set, field),
    );
  const hasEffortColumn = logEffort && fields.includes("reps");
  const previousText = previous ? previousLabel(previous, type, unit, display) : null;
  const unitName = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");

  const header = (field: SetField, editing: boolean): string => {
    switch (field) {
      case "weight":
        return t(addsLoad(type) ? "training__field_added_weight" : "training__field_weight", {
          unit: unitName,
        });
      case "reps":
        return t("training__field_reps");
      case "duration":
        return t(editing ? "session__edit_duration" : "training__field_duration");
      case "distance":
        return editing || display.distanceUnit === "m"
          ? t("training__col_distance", { unit: t("training__unit_m") })
          : t("exercise__metric_distance");
      case "floors":
        return t("training__field_floors");
      case "steps":
        return t("training__field_steps");
    }
  };

  const cell = (field: SetField) => {
    const stored = valueOfSet(set, field);
    const editing = entry?.cell.setId === set.id && entry.cell.field === field;
    const text = editing
      ? displayOfText(field, entry.raw)
      : formatCell(field, stored, unit, undefined, display);
    const ghost = formatCell(field, ghosts[field] ?? null, unit, undefined, display);
    const refused = refusal?.setId === set.id && refusal.fields.includes(field);
    const running = field === "duration" && set.timerStartedAt !== null && !ticked;
    const target = timerTarget(set);
    return (
      <View key={field} className={`min-w-0 flex-row gap-1 ${grow(field)}`}>
        <SetCell
          text={text}
          ghost={ghost}
          animate={props.animate}
          active={editing}
          refused={refused}
          ink={ink}
          faint={faint}
          disabled={readOnly}
          label={t("training__cell_label", { number, field: header(field, editing) })}
          onPress={() => props.onCell(set.id, field)}
        >
          {running && set.timerStartedAt !== null ? (
            <LiveTimer
              startedAt={set.timerStartedAt}
              target={target}
              format={display.durationFormat}
            />
          ) : undefined}
        </SetCell>
        {field === "duration" && !props.editingFinished && !ticked && !readOnly ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              !running
                ? "session__timer_start"
                : target === null
                  ? "session__timer_stop"
                  : "session__timer_cancel",
              { number },
            )}
            onPress={() => {
              haptic.tick();
              props.onTimer(set.id);
            }}
            className="h-10 w-9 items-center justify-center rounded-lg active:bg-default"
          >
            {running ? (
              <Stop size={20} weight="fill" color={subtle} />
            ) : (
              <Play size={20} color={subtle} />
            )}
          </Pressable>
        ) : null}
      </View>
    );
  };

  const rpeText = (rpe: number) => formatEffortRange(rpe, rpe, effortScale);
  const effortValue = set.rpe === null ? null : rpeText(set.rpe);
  const effortGhost = ghosts.rpe ?? null;

  const row = (a11y?: SwipeA11yProps) => (
    <Animated.View
      className="flex-row items-center gap-1.5 rounded-xl px-1 py-1"
      style={{
        backgroundColor: ticked ? tint : transparent,
        ...TINT_TRANSITION,
        transitionDuration: props.animate ? TICK_MS : 0,
      }}
    >
      {props.current && !ticked ? (
        <View
          pointerEvents="none"
          accessible={false}
          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-accent"
        />
      ) : null}
      <RecordChip record={props.record} animate={props.animate} />
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
        accessibilityActions={
          weighted && !readOnly
            ? [
                { name: "limits", label: t("gym__limits_action") },
                ...(a11y?.accessibilityActions ?? []),
              ]
            : a11y?.accessibilityActions
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "limits") props.onLimits(set.id);
          else a11y?.onAccessibilityAction(event);
        }}
        hitSlop={4}
        className="h-10 w-10 items-center justify-center rounded-lg active:bg-default"
      >
        <Text
          className={`font-semibold text-label ${props.current && !ticked ? "text-accent-text" : SET_TONES[set.kind].text}`}
        >
          {badge}
        </Text>
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
        {!props.historyReady ? (
          <View className="h-3 w-10" />
        ) : (
          <Text
            numberOfLines={1}
            className="font-normal text-center text-caption text-muted"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {previousText ?? "–"}
          </Text>
        )}
      </Pressable>
      {fields.map(cell)}
      {hasEffortColumn && set.kind === "warmup" ? <View className="w-11" /> : null}
      {hasEffortColumn && set.kind !== "warmup" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("training__effort_cell_label", {
            number,
            value: effortValue ?? t("training__effort_none"),
          })}
          disabled={readOnly}
          onPress={() => props.onEffort(set.id)}
          className="h-10 w-11 items-center justify-center rounded-lg active:bg-default"
        >
          <Text
            className={`font-normal text-body ${effortValue === null ? "text-muted" : "text-foreground"}`}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {effortValue ?? (effortGhost === null ? "–" : rpeText(effortGhost))}
          </Text>
        </Pressable>
      ) : null}
      {props.editingFinished ? null : (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{
            checked: ticked,
            busy: waitingForPrevious && !readOnly,
            disabled: readOnly || waitingForPrevious,
          }}
          accessibilityLabel={t(
            readOnly ? "session__set_number" : ticked ? "session__untick_set" : "session__tick_set",
            { number },
          )}
          accessibilityHint={
            waitingForPrevious && !readOnly ? t("session__set_waiting_for_previous") : undefined
          }
          disabled={readOnly || waitingForPrevious}
          onPress={() => props.onTick(set.id)}
          className="h-11 w-11 items-center justify-center rounded-lg active:bg-default"
        >
          {waitingForPrevious && !readOnly ? (
            <DotsThree size={20} color={subtle} />
          ) : (
            <TickMark ticked={ticked} animate={props.animate} subtle={subtle} onAccent={onAccent} />
          )}
        </Pressable>
      )}
    </Animated.View>
  );

  const actions: SwipeAction[] = [];
  if (props.row.canCopyPrevious)
    actions.push({
      key: "copy",
      label: t("session__copy_previous"),
      icon: Copy,
      onPress: () => props.onCopySets(set.id, "previous"),
    });
  if (props.row.canFillRemaining)
    actions.push({
      key: "fill",
      label: t("session__fill_remaining"),
      icon: Rows,
      onPress: () => props.onCopySets(set.id, "remaining"),
    });
  if (canRemove)
    actions.push({
      key: "remove",
      label: t("training__remove"),
      icon: Trash,
      tone: "danger",
      onPress: () => void props.onRemove(set.id),
    });
  return (
    <View>
      {!readOnly && actions.length > 0 ? (
        <SwipeRow actions={actions} motion={false} onOpen={props.onSwipeOpen}>
          {(a11y) => row(a11y)}
        </SwipeRow>
      ) : (
        row()
      )}
      {capLabel ? <Text className="px-3 pb-1 text-caption text-muted">{t(capLabel)}</Text> : null}
      {refusal ? (
        <View className="flex-row items-center gap-1.5 px-3">
          <WarningCircle size={16} color={danger} />
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="font-normal shrink text-caption text-danger"
          >
            {t("session__tick_missing_values")}
          </Text>
        </View>
      ) : null}
    </View>
  );
});
