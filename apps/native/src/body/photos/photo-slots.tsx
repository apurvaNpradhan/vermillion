import { Image } from "expo-image";
import { useThemeColor } from "heroui-native";
import { Camera, Image as ImageIcon, Trash } from "phosphor-react-native";
import { useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import { PROGRESS_POSES, type ProgressPose } from "@workspace/shared";

import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";

import { poseLabels } from "./pose-labels";
import type { PendingPhotoStore } from "./pending-photos";
import type { usePhotoActions } from "./use-photo-actions";

/**
 * The three pose slots at the top of a Check-in: Front, Side and Back (optional). A slot opens an
 * action sheet (camera or library, and Remove once it holds a photo). A picked photo is processed
 * at once and kept until the Check-in is saved; nothing is written before that. A photo that is
 * replaced or removed is deleted by `store` on the spot.
 */
export function PhotoSlots({
  store,
  actions,
  disabled,
}: {
  store: PendingPhotoStore;
  actions: Pick<ReturnType<typeof usePhotoActions>, "pick">;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const muted = useThemeColor("muted");
  const pending = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [pose, setPose] = useState<ProgressPose | null>(null);

  const take = async (selected: ProgressPose, source: "camera" | "library") => {
    const image = await actions.pick(source);
    if (image) store.set(selected, image);
  };
  const remove = (selected: ProgressPose) => store.remove(selected);
  const open = pose ? pending[pose] : undefined;
  // Back is optional; say so to a screen reader, which never sees the visible "Optional" caption.
  const slotLabel = (slot: ProgressPose, name: string, filled: boolean) =>
    slot === "back"
      ? t(filled ? "body__photo_slot_replace_optional" : "body__photo_slot_add_optional", {
          pose: name,
        })
      : t(filled ? "body__photo_slot_replace" : "body__photo_slot_add", { pose: name });

  return (
    <View className="flex-row gap-3">
      {PROGRESS_POSES.map((slot) => {
        const image = pending[slot];
        const name = t(poseLabels[slot]);
        return (
          <Pressable
            key={slot}
            accessibilityRole="button"
            accessibilityLabel={slotLabel(slot, name, image !== undefined)}
            disabled={disabled}
            onPress={() => setPose(slot)}
            className="h-[72px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-separator bg-default"
          >
            {image ? (
              <>
                <Image
                  source={{ uri: image.thumbUri }}
                  contentFit="cover"
                  style={{ width: "100%", height: "100%" }}
                />
                <View className="absolute inset-x-0 bottom-0 bg-background/80 py-0.5">
                  <Text className="text-center text-caption text-foreground">{name}</Text>
                </View>
              </>
            ) : (
              <View className="items-center gap-0.5">
                <Camera size={20} color={muted} />
                <Text className="text-caption text-foreground">{name}</Text>
                {slot === "back" ? (
                  <Text className="text-caption text-muted">{t("body__photo_optional")}</Text>
                ) : null}
              </View>
            )}
          </Pressable>
        );
      })}
      <ActionSheet
        title={pose ? t("body__photo_slot_add", { pose: t(poseLabels[pose]) }) : ""}
        isOpen={pose !== null}
        onOpenChange={(next) => {
          if (!next) setPose(null);
        }}
        actions={
          pose
            ? [
                {
                  key: "camera",
                  label: t("body__photo_take"),
                  icon: Camera,
                  onPress: () => void take(pose, "camera"),
                },
                {
                  key: "library",
                  label: t("body__photo_choose"),
                  icon: ImageIcon,
                  onPress: () => void take(pose, "library"),
                },
                ...(open
                  ? [
                      {
                        key: "remove",
                        label: t("body__photo_remove"),
                        icon: Trash,
                        tone: "danger" as const,
                        onPress: () => remove(pose),
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
    </View>
  );
}
