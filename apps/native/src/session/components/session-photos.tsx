import { useState } from "react";
import { ScrollView, Text, View, Pressable } from "react-native";
import { Camera, Image as ImageIcon, Trash, Plus } from "phosphor-react-native";
import { useThemeColor } from "heroui-native";
import { MediaImage, MediaViewer } from "@/media";
import { Button } from "@/platform/ui/button";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { ConfirmSheet } from "@/platform/ui/confirm-sheet";
import { useTranslation } from "@/platform/i18n";
import { useSessionPhotos } from "../use-session-photos";

/** Tap to view; long press or the accessibility action opens photo removal. */
export function SessionPhotos({
  sessionId,
  readOnly = false,
}: {
  sessionId: string;
  readOnly?: boolean;
}) {
  const state = useSessionPhotos(sessionId);
  const { t } = useTranslation();
  const muted = useThemeColor("muted");
  const [viewing, setViewing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<{ id: string; index: number } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  if (state.failed)
    return (
      <Button onPress={state.retry}>
        <Button.Label>{t("training__retry")}</Button.Label>
      </Button>
    );
  if (state.loading) return <Text className="text-caption text-muted">{t("common__loading")}</Text>;
  return (
    <View className="gap-2">
      {state.photos.length ? (
        <Text className="text-caption text-muted">
          {t("media__photo_count", { count: state.photos.length })}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {state.photos.map((photo, index) => (
          <Pressable
            key={photo.id}
            className="mr-2 min-h-11 min-w-11 items-center justify-center overflow-hidden rounded-xl"
            accessibilityRole="button"
            accessibilityLabel={t("media__open_photo", { index: index + 1 })}
            onPress={() => setViewing(index)}
            onLongPress={readOnly ? undefined : () => setSelected({ id: photo.id, index })}
            accessibilityActions={
              readOnly
                ? []
                : [{ name: "remove", label: t("media__remove_photo", { index: index + 1 }) }]
            }
            onAccessibilityAction={(event) => {
              if (!readOnly && event.nativeEvent.actionName === "remove")
                setSelected({ id: photo.id, index });
            }}
          >
            <MediaImage mediaId={photo.media_id} size={readOnly ? 44 : 112} />
          </Pressable>
        ))}
        {!readOnly && state.photos.length < 4 ? (
          <Pressable
            disabled={state.busy}
            className="size-28 items-center justify-center rounded-xl bg-default active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={t("media__add_photos")}
            onPress={() => setAdding(true)}
          >
            <Plus size={24} color={muted} />
            <Text className="text-caption text-muted">{t("media__add_photos")}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <ActionSheet
        title={t("media__add_photos")}
        isOpen={adding}
        onOpenChange={setAdding}
        actions={[
          {
            key: "camera",
            icon: Camera,
            label: t("body__photo_take"),
            onPress: () => void state.pick(true),
          },
          {
            key: "library",
            icon: ImageIcon,
            label: t("body__photo_choose"),
            onPress: () => void state.pick(),
          },
        ]}
      />
      <ActionSheet
        title={t("media__open_photo", { index: (selected?.index ?? 0) + 1 })}
        isOpen={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        actions={
          selected
            ? [
                {
                  key: "remove",
                  icon: Trash,
                  label: t("media__remove_photo", { index: selected.index + 1 }),
                  tone: "danger",
                  onPress: () => setRemoving(selected.id),
                },
              ]
            : []
        }
      />
      <ConfirmSheet
        isOpen={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t("media__remove_photo_confirm")}
        confirmLabel={t("media__remove")}
        cancelLabel={t("common__cancel")}
        destructive
        onConfirm={() => {
          if (removing) void state.remove(removing);
          setRemoving(null);
        }}
      />
      {viewing !== null && state.photos.length ? (
        <MediaViewer
          mediaIds={state.photos.map((photo) => photo.media_id)}
          index={Math.min(viewing, state.photos.length - 1)}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </View>
  );
}
