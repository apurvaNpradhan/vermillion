import type { MuscleGroup } from "@workspace/shared";
import type { ProgramSummary } from "@workspace/sync";
import { Image } from "expo-image";
import { CaretRight, Copy, Trash } from "phosphor-react-native";
import { memo, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ExerciseThumbnail } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Card } from "@/platform/ui/card";
import { SwipeRow, type SwipeAction } from "@/platform/ui/swipe-row";

import { rotationSummary } from "../rotation";
import { useProgramMeta } from "../use-program-meta";

const TILE = 72;

/** The first letter of a title, for the generated tile. */
export function initialOf(title: string): string {
  return [...title.trim()][0]?.toUpperCase() ?? "?";
}

/**
 * The tile of a Program: its cover photo from this device when there is one, else the thumbnail of
 * the first exercise of its first Workout, else the generated tile (its initial on a tint). A
 * photo that cannot be read falls back the same way.
 */
export function ProgramTile({
  title,
  size,
  coverUri = null,
  firstExercise = null,
}: {
  title: string;
  size: number;
  coverUri?: string | null;
  firstExercise?: { thumbnailKey: string | null; primaryMuscle: MuscleGroup } | null;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  if (coverUri !== null && failedUri !== coverUri) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="overflow-hidden rounded-xl bg-default"
        style={{ width: size, height: size }}
      >
        <Image
          source={{ uri: coverUri }}
          recyclingKey={coverUri}
          contentFit="cover"
          transition={120}
          onError={() => setFailedUri(coverUri)}
          style={{ width: size, height: size }}
        />
      </View>
    );
  }
  if (firstExercise?.thumbnailKey) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="overflow-hidden rounded-xl bg-default"
        style={{ width: size, height: size }}
      >
        <ExerciseThumbnail
          thumbnailKey={firstExercise.thumbnailKey}
          muscle={firstExercise.primaryMuscle}
          size={size}
        />
      </View>
    );
  }
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

/** One Program as a card: tile, title, `4 days · 6-day rotation · 12 weeks` and a chevron. */
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
          className="active:opacity-80"
        >
          <Card className="flex-row items-center gap-3 p-3">
            <ProgramTile
              title={program.title}
              size={TILE}
              coverUri={program.coverUri}
              firstExercise={program.firstExercise}
            />
            <View className="flex-1 gap-1">
              <Text numberOfLines={2} className="font-semibold text-title-md text-foreground">
                {program.title}
              </Text>
              <Text numberOfLines={2} className="text-caption text-muted">
                {meta}
              </Text>
            </View>
            <CaretRight size={18} color={subtle} />
          </Card>
        </Pressable>
      )}
    </SwipeRow>
  );
});
