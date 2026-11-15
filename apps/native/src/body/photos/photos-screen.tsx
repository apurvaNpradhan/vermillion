import { useThemeColor } from "heroui-native";
import { Camera, DotsThreeVertical, Eye, EyeSlash, Trash } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { PROGRESS_POSES, groupPhotosByDate, type ProgressPose } from "@workspace/shared";
import type { WatchedPhoto } from "@workspace/sync";

import { MediaViewer } from "@/media";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { ConfirmSheet } from "@/platform/ui/confirm-sheet";
import { EmptyState } from "@/platform/ui/empty-state";
import { ScrollPage } from "@/platform/ui/page";
import { SyncBanner } from "@/sync";

import { CheckInSheet } from "../check-in-sheet";
import { formatCalendarDate } from "./local-date";
import { poseLabels } from "./pose-labels";
import { PrivatePhoto } from "./private-photo";
import { useHidePhotos } from "./use-hide-photos";
import { usePhotoActions } from "./use-photo-actions";
import { useProgressPhotos } from "./use-progress-photos";

const GAP = 8;
const COLUMNS = 3;
const SIDE = 16;

type Viewing = { date: string; index: number };

/**
 * The private gallery (ADR 0041): progress photos grouped by date with a pose filter, a Compare
 * action and a Check-in action. While Hide photos is on a thumbnail is blurred until tapped (the
 * reveal lasts while the page is open); a shown thumbnail opens the viewer on its day. A long
 * press offers Delete.
 */
export function PhotosScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const ink = useThemeColor("foreground");
  const { width } = useWindowDimensions();
  const [pose, setPose] = useState<ProgressPose | null>(null);
  const state = useProgressPhotos(pose);
  const hide = useHidePhotos();
  const actions = usePhotoActions();
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [menu, setMenu] = useState(false);
  const [checkIn, setCheckIn] = useState(false);
  const [target, setTarget] = useState<WatchedPhoto | null>(null);
  const [deleting, setDeleting] = useState<WatchedPhoto | null>(null);

  const days = useMemo(() => groupPhotosByDate(state.photos), [state.photos]);
  const tile = Math.floor((width - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const viewingDay = viewing ? days.find((day) => day.date === viewing.date) : undefined;
  const poseName = (value: ProgressPose) => t(poseLabels[value]);

  const reveal = (id: string) => setRevealed((current) => new Set(current).add(id));

  return (
    <ScrollPage
      back
      title={t("body__photos_title")}
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("body__photos_options")}
          onPress={() => setMenu(true)}
          className="h-11 w-11 items-center justify-center"
        >
          <DotsThreeVertical size={22} weight="bold" color={ink} />
        </Pressable>
      }
    >
      <SyncBanner />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button onPress={() => setCheckIn(true)}>
            <Button.Label>{t("body__check_in")}</Button.Label>
          </Button>
        </View>
        <View className="flex-1">
          <Button variant="secondary" onPress={() => router.push("/body/compare")}>
            <Button.Label>{t("body__compare")}</Button.Label>
          </Button>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {([null, ...PROGRESS_POSES] as const).map((value) => {
          const selected = value === pose;
          const name = value === null ? t("body__pose_all") : poseName(value);
          return (
            <Button
              key={value ?? "all"}
              size="sm"
              variant={selected ? "secondary" : "tertiary"}
              accessibilityLabel={t("body__pose_filter", { pose: name })}
              accessibilityState={{ selected }}
              onPress={() => setPose(value)}
            >
              <Button.Label>{name}</Button.Label>
            </Button>
          );
        })}
      </ScrollView>
      {state.failed ? (
        <Button onPress={state.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : state.loading ? (
        <Text className="text-body text-muted">{t("common__loading")}</Text>
      ) : days.length === 0 ? (
        <EmptyState
          icon={Camera}
          title={t(pose === null ? "body__photos_empty" : "body__photos_empty_hint")}
          action={{ label: t("body__check_in"), onPress: () => setCheckIn(true) }}
        />
      ) : (
        days.map((day) => (
          <View key={day.date} className="gap-3">
            <View className="flex-row items-baseline justify-between">
              <Text
                accessibilityRole="header"
                className="text-title-md font-semibold text-foreground"
              >
                {formatCalendarDate(day.date, i18n.language)}
              </Text>
              <Text className="text-caption text-muted">
                {t("body__photo_count", { count: day.photos.length })}
              </Text>
            </View>
            <View className="flex-row flex-wrap" style={{ gap: GAP }}>
              {day.photos.map((photo, index) => {
                const hidden = hide.hidden && !revealed.has(photo.id);
                const date = formatCalendarDate(photo.local_date, i18n.language);
                return (
                  <PrivatePhoto
                    key={photo.id}
                    mediaId={photo.media_id}
                    width={tile}
                    height={Math.round((tile * 4) / 3)}
                    hidden={hidden}
                    label={t("body__photo_tile", { pose: poseName(photo.pose), date })}
                    hiddenLabel={t("body__photo_hidden")}
                    onPress={() =>
                      hidden ? reveal(photo.id) : setViewing({ date: day.date, index })
                    }
                    onLongPress={() => setTarget(photo)}
                  />
                );
              })}
            </View>
          </View>
        ))
      )}
      {viewing && viewingDay ? (
        <MediaViewer
          mediaIds={viewingDay.photos.map((photo) => photo.media_id)}
          captions={viewingDay.photos.map(
            (photo) =>
              `${poseName(photo.pose)} · ${formatCalendarDate(photo.local_date, i18n.language)}`,
          )}
          index={viewing.index}
          onIndexChange={(index) => setViewing({ date: viewing.date, index })}
          onClose={() => setViewing(null)}
        />
      ) : null}
      <ActionSheet
        title={t("body__photos_options")}
        isOpen={menu}
        onOpenChange={setMenu}
        actions={[
          {
            key: "hide",
            label: t(hide.hidden ? "body__photos_show" : "body__photos_hide"),
            icon: hide.hidden ? Eye : EyeSlash,
            onPress: () => {
              hide.set(!hide.hidden);
              // Showing everything is the reader's choice; hiding again re-blurs every thumbnail.
              setRevealed(new Set());
            },
          },
        ]}
      />
      <ActionSheet
        title={t("body__photo_delete")}
        isOpen={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        actions={[
          {
            key: "delete",
            label: t("body__photo_delete"),
            icon: Trash,
            tone: "danger",
            // After the sheet has closed (it clears `target`), so the photo is kept here.
            onPress: () => setDeleting(target),
          },
        ]}
      />
      <ConfirmSheet
        isOpen={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("body__photo_delete_confirm")}
        description={t("body__photo_delete_hint")}
        confirmLabel={t("body__photo_delete")}
        cancelLabel={t("common__cancel")}
        destructive
        onConfirm={() => {
          if (deleting) void actions.remove(deleting);
          setDeleting(null);
        }}
      />
      {checkIn ? <CheckInSheet onClose={() => setCheckIn(false)} /> : null}
    </ScrollPage>
  );
}
