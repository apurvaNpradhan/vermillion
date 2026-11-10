import type { ProgramSummary } from "@workspace/sync";
import { CaretRight, Copy, Trash } from "phosphor-react-native";
import { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { SwipeRow, type SwipeAction } from "@/platform/ui/swipe-row";

import { rotationSummary } from "../rotation";
import { useProgramMeta } from "../use-program-meta";

const TILE = 48;

/** The first letter of a title, for the generated tile (the cover photo arrives later). */
export function initialOf(title: string): string {
  return [...title.trim()][0]?.toUpperCase() ?? "?";
}

/** The generated tile of a Program: its initial on a tint. */
export function ProgramTile({ title, size }: { title: string; size: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center rounded-xl bg-default"
      style={{ width: size, height: size }}
    >
      <Text
        className="font-semibold text-title-md text-foreground"
        style={{ fontSize: size * 0.42 }}
      >
        {initialOf(title)}
      </Text>
    </View>
  );
}

/** One Program: tile, title and `4 days · 6-day rotation · 12 weeks`. */
export const ProgramRow = memo(function ProgramRow({
  program,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  program: ProgramSummary;
  onOpen: (id: string) => void;
  onDuplicate: (program: ProgramSummary) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const meta = useProgramMeta(rotationSummary(program.slots), program.plannedWeeks);

  const swipe = useMemo<SwipeAction[]>(
    () => [
      {
        key: "duplicate",
        label: t("training__duplicate"),
        icon: Copy,
        onPress: () => onDuplicate(program),
      },
      {
        key: "delete",
        label: t("training__delete"),
        icon: Trash,
        tone: "danger",
        onPress: () => onDelete(program.id, program.title),
      },
    ],
    [t, onDuplicate, onDelete, program],
  );

  return (
    <SwipeRow actions={swipe}>
      {(a11y) => (
        <Pressable
          {...a11y}
          accessibilityRole="button"
          accessibilityLabel={`${program.title}, ${meta}`}
          onPress={() => onOpen(program.id)}
          className="min-h-[72px] flex-row items-center gap-3 border-b border-border bg-background px-4 py-3 active:bg-default"
        >
          <ProgramTile title={program.title} size={TILE} />
          <View className="flex-1 gap-0.5">
            <Text numberOfLines={1} className="font-medium text-body text-foreground">
              {program.title}
            </Text>
            <Text numberOfLines={1} className="text-caption text-muted">
              {meta}
            </Text>
          </View>
          <CaretRight size={18} color={subtle} />
        </Pressable>
      )}
    </SwipeRow>
  );
});
