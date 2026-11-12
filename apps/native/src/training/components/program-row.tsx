import type { ProgramSummary } from "@workspace/sync";
import { Image } from "expo-image";
import { Copy, Trash, Play, Stop } from "phosphor-react-native";
import { memo, useMemo, useState, type ComponentProps } from "react";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import type { SwipeAction } from "@/platform/ui/swipe-row";

import { rotationSummary } from "../rotation";
import { useProgramMeta } from "../use-program-meta";
import { PlanInitialTile } from "./plan-initial-tile";
import { PlanRow } from "./plan-row";

const TILE = 36;

/**
 * The tile of a Program: its cover photo from this device or a generated initial. A
 * photo that cannot be read falls back the same way.
 */
export function ProgramTile({
  title,
  size,
  coverUri = null,
}: {
  title: string;
  size: number;
  coverUri?: string | null;
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
  return <PlanInitialTile title={title} size={size} />;
}

/** A compact program row; the same menu and swipe actions are available in either list. */
export const ProgramRow = memo(function ProgramRow({
  program,
  activeId,
  onActivate,
  onStop,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  program: ProgramSummary;
  /** The Program of the active Run, read once by the list. */
  activeId: string | null;
  onActivate: (id: string) => void;
  onStop: () => void;
  onOpen: (id: string) => void;
  onDuplicate: (program: ProgramSummary) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const isActive = activeId === program.id;
  const meta = useProgramMeta(rotationSummary(program.slots), program.plannedWeeks);

  const swipe = useMemo<SwipeAction[]>(
    () => [
      {
        key: "active",
        label: t(isActive ? "run__stop" : "run__set_active"),
        icon: isActive ? Stop : Play,
        onPress: () => {
          if (isActive) onStop();
          else onActivate(program.id);
        },
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
    [t, onDuplicate, onDelete, program, isActive, onActivate, onStop],
  );

  return (
    <PlanRow
      title={program.title}
      lines={[meta]}
      tile={<ProgramTile title={program.title} size={TILE} coverUri={program.coverUri} />}
      menuLabel={t("training__program_menu")}
      onOpen={() => onOpen(program.id)}
      actions={swipe}
    />
  );
});

/** Flat rows keep programs compact while exposing their full actions. */
export function ProgramList({
  programs,
  ...actions
}: Omit<ComponentProps<typeof ProgramRow>, "program"> & { programs: readonly ProgramSummary[] }) {
  return (
    <View>
      {programs.map((program) => (
        <ProgramRow key={program.id} program={program} {...actions} />
      ))}
    </View>
  );
}
