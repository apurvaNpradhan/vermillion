import type { ProgramSummary } from "@workspace/sync";
import { Copy, Play, Stop, Trash } from "phosphor-react-native";
import { memo, useMemo, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import type { SwipeAction } from "@/platform/ui/swipe-row";
import { ProgramTile } from "@/training/programs/program-row";
import { useProgramMeta } from "@/training/programs/use-program-meta";
import { rotationSummary } from "@/training/rotation/rotation";

/** Page gutter and the gap between the two columns. */
const GUTTER = 16;
const GAP = 12;

/** The width of one cover card: two columns on the page. */
export function gridCardWidth(screenWidth: number) {
  return Math.floor((screenWidth - GUTTER * 2 - GAP) / 2);
}

/**
 * One Program as a card: its cover (or the initial) as a square, then its name and a muted line.
 * Tapping opens the Program; a long press lists the same actions as the Programs list.
 */
const ProgramCoverCard = memo(function ProgramCoverCard({
  program,
  width,
  active,
  onActivate,
  onStop,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  program: ProgramSummary;
  width: number;
  active: boolean;
  onActivate: (id: string) => void;
  onStop: () => void;
  onOpen: (id: string) => void;
  onDuplicate: (program: ProgramSummary) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);
  const meta = useProgramMeta(rotationSummary(program.slots), program.plannedWeeks);
  const line = active ? t("training__program_card_active", { meta }) : meta;
  const actions = useMemo<SwipeAction[]>(
    () => [
      {
        key: "active",
        label: t(active ? "run__stop" : "run__set_active"),
        icon: active ? Stop : Play,
        onPress: () => (active ? onStop() : onActivate(program.id)),
      },
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
    [t, active, onStop, onActivate, onDuplicate, onDelete, program],
  );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${program.title}, ${line}`}
        accessibilityHint={t("training__program_card_hint")}
        onPress={() => onOpen(program.id)}
        onLongPress={() => setMenu(true)}
        className="gap-2 active:opacity-70"
        style={{ width }}
      >
        <ProgramTile title={program.title} size={width} coverMediaId={program.coverMediaId} />
        <View className="gap-0.5">
          <Text numberOfLines={1} className="font-semibold text-body text-foreground">
            {program.title}
          </Text>
          <Text numberOfLines={1} className="font-normal text-caption text-muted">
            {line}
          </Text>
        </View>
      </Pressable>
      <ActionSheet title={program.title} actions={actions} isOpen={menu} onOpenChange={setMenu} />
    </>
  );
});

/** The Programs of Train: two columns of cover cards. */
export function ProgramGrid({
  programs,
  activeId,
  onActivate,
  onStop,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  programs: readonly ProgramSummary[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onStop: () => void;
  onOpen: (id: string) => void;
  onDuplicate: (program: ProgramSummary) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const { width: screen } = useWindowDimensions();
  const width = gridCardWidth(screen);
  return (
    <View className="flex-row flex-wrap" style={{ columnGap: GAP, rowGap: 20 }}>
      {programs.map((program) => (
        <ProgramCoverCard
          key={program.id}
          program={program}
          width={width}
          active={program.id === activeId}
          onActivate={onActivate}
          onStop={onStop}
          onOpen={onOpen}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
}
