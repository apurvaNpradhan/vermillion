/**
 * Duration adaptation of PanelUI's snapping TimePicker columns.
 * https://github.com/panel-ui/PanelUI/blob/main/packages/panelui/src/components/time-picker/index.tsx
 * Copyright (c) 2026 Khalid Abdi. MIT, see docs/licenses/panelui-MIT.txt.
 * Changed: minutes/seconds, 10-minute bound, HeroUI sheet and tokens, duration presets and Off.
 */
import { REST_SECONDS_MAX } from "@workspace/shared";
import { Timer, CaretRight } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";

import { formatClock } from "../rest";
import { TargetPickerSheet } from "./target-picker-sheet";

const ROW = 44;
const HEIGHT = ROW * 5;
const PRESETS = [60, 90, 120, 180];

function DurationColumn({
  value,
  max,
  label,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const moving = useRef(false);
  const reported = useRef(value);
  useEffect(() => {
    if (!moving.current) {
      reported.current = value;
      ref.current?.scrollTo({ y: value * ROW, animated: false });
    }
  }, [value]);
  const report = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.max(0, Math.min(max, Math.round(event.nativeEvent.contentOffset.y / ROW)));
    if (next !== reported.current) {
      reported.current = next;
      onChange(next);
      haptic.tick();
    }
  };
  return (
    <View className="flex-1 gap-2">
      <Text className="text-center text-caption text-muted">{label}</Text>
      <View className="overflow-hidden rounded-xl bg-surface" style={{ height: HEIGHT }}>
        <View
          pointerEvents="none"
          className="absolute inset-x-1 rounded-lg bg-default"
          style={{ top: ROW * 2, height: ROW }}
        />
        <ScrollView
          ref={ref}
          style={{ height: HEIGHT }}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: ROW * 2 }}
          contentOffset={{ x: 0, y: value * ROW }}
          snapToInterval={ROW}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            moving.current = true;
          }}
          onScroll={report}
          onScrollEndDrag={(event) => {
            report(event);
            moving.current = false;
          }}
          onMomentumScrollBegin={() => {
            moving.current = true;
          }}
          onMomentumScrollEnd={(event) => {
            report(event);
            moving.current = false;
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max, now: value }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) =>
            onChange(
              Math.max(
                0,
                Math.min(max, value + (event.nativeEvent.actionName === "increment" ? 1 : -1)),
              ),
            )
          }
        >
          {Array.from({ length: max + 1 }, (_, number) => (
            <Pressable
              key={number}
              accessible={false}
              onPress={() => onChange(number)}
              style={{ height: ROW }}
              className="items-center justify-center"
            >
              <Text
                className={`tabular-nums text-numeric-md ${number === value ? "font-semibold text-foreground" : "text-muted"}`}
              >
                {String(number).padStart(2, "0")}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

export function RestPicker({
  value,
  onChange,
  group = false,
  compact = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  group?: boolean;
  /** A small chip with the icon and the time only, for rows that sit beside other chips. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? 120);
  const [version, setVersion] = useState(0);
  const minutes = Math.floor(draft / 60);
  const seconds = draft % 60;
  const choose = (next: number) => {
    setDraft(next);
    setVersion((current) => current + 1);
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("training__rest_chip_label", {
          value: value === null ? t("training__rest_off") : formatClock(value),
        })}
        onPress={() => {
          Keyboard.dismiss();
          choose(value ?? 120);
          setOpen(true);
        }}
        className={
          compact
            ? "min-h-11 flex-row items-center gap-2 self-start rounded-xl bg-default px-3"
            : "min-h-11 flex-row items-center gap-2 rounded-xl bg-default px-3"
        }
      >
        <Timer size={18} color={subtle} />
        {compact ? null : (
          <Text className="flex-1 text-label text-muted">
            {t(group ? "training__rest_group_title" : "training__rest_title")}
          </Text>
        )}
        <Text className="font-medium text-label text-foreground tabular-nums">
          {value === null ? t("training__rest_off") : formatClock(value)}
        </Text>
        {compact ? null : <CaretRight size={14} color={subtle} />}
      </Pressable>
      <TargetPickerSheet
        isOpen={open}
        onOpenChange={setOpen}
        title={t(group ? "training__rest_group_title" : "training__rest_title")}
        description={t("training__rest_picker_hint")}
        onDone={() => {
          onChange(draft === 0 ? null : draft);
          setOpen(false);
        }}
      >
        <Text className="text-center text-numeric-xl text-foreground tabular-nums">
          {formatClock(draft)}
        </Text>
        <View className="flex-row gap-3" key={version}>
          <DurationColumn
            value={minutes}
            max={REST_SECONDS_MAX / 60}
            label={t("training__minutes")}
            onChange={(next) => setDraft(Math.min(REST_SECONDS_MAX, next * 60 + seconds))}
          />
          <DurationColumn
            key={minutes === REST_SECONDS_MAX / 60 ? "end" : "seconds"}
            value={seconds}
            max={minutes === REST_SECONDS_MAX / 60 ? 0 : 59}
            label={t("training__seconds")}
            onChange={(next) => setDraft(minutes * 60 + next)}
          />
        </View>
        <View className="flex-row gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset}
              variant="secondary"
              className={`flex-1 ${draft === preset ? "border-foreground bg-default" : ""}`}
              onPress={() => choose(preset)}
            >
              <Button.Label>{formatClock(preset)}</Button.Label>
            </Button>
          ))}
        </View>
        <Button
          variant="secondary"
          onPress={() => {
            onChange(null);
            setOpen(false);
          }}
        >
          <Button.Label>{t("training__rest_disable")}</Button.Label>
        </Button>
      </TargetPickerSheet>
    </>
  );
}
