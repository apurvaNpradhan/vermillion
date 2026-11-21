import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { useReveal } from "./privacy/use-reveal";
import { useThemeColor } from "heroui-native";
import { DotsThreeVertical, Eye, EyeSlash, Trash } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { PROGRESS_POSES, groupPhotosByDate, type ProgressPose } from "@workspace/shared";
import type { WatchedPhoto } from "@workspace/sync";

import { MediaViewer, MediaImageBatch, useMediaImageBatch } from "@/media";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { ConfirmSheet } from "@/platform/ui/confirm-sheet";
import { BodyState } from "../body-state";
import { Page } from "@/platform/ui/page";
import { SyncBanner } from "@/sync";

import { CheckInSheet } from "@/body/measurements/check-in-sheet";
import { formatCalendarDate } from "./local-date";
import { poseLabels } from "./pose-labels";
import { PrivatePhoto } from "./privacy/private-photo";
import { useHidePhotos } from "./privacy/use-hide-photos";
import { usePhotoActions } from "./capture/use-photo-actions";
import { useProgressPhotos } from "./use-progress-photos";

const GAP = 8;
const COLUMNS = 3;
const SIDE = 16;

type Viewing = { photo: WatchedPhoto };
type GalleryRow = {
  id: string;
  date: string;
  photos: WatchedPhoto[];
  first: boolean;
  count: number;
};

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
  const reveal = useReveal(hide.hidden);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const files = useMediaImageBatch(visibleIds);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [menu, setMenu] = useState(false);
  const [checkIn, setCheckIn] = useState(false);
  const [target, setTarget] = useState<WatchedPhoto | null>(null);
  const [deleting, setDeleting] = useState<WatchedPhoto | null>(null);

  const days = useMemo(() => groupPhotosByDate(state.photos), [state.photos]);
  const tile = Math.floor((width - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const galleryRows = useMemo(
    () =>
      days.flatMap((day) => {
        const rows: GalleryRow[] = [];
        for (let offset = 0; offset < day.photos.length; offset += COLUMNS) {
          rows.push({
            id: `${day.date}-${offset}`,
            date: day.date,
            photos: day.photos.slice(offset, offset + COLUMNS),
            first: offset === 0,
            count: day.photos.length,
          });
        }
        return rows;
      }),
    [days],
  );
  const poseName = (value: ProgressPose) => t(poseLabels[value]);

  return (
    <Page
      back
      title={t("body__photos_title")}
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("body__photos_options")}
          onPress={() => setMenu(true)}
          className="h-11 w-11 items-center justify-center"
        >
          <DotsThreeVertical size={24} color={ink} />
        </Pressable>
      }
    >
      {({ header, contentContainerStyle, ...scroll }) => (
        <MediaImageBatch value={files}>
          <AnimatedLegendList
            {...scroll}
            recycleItems={false}
            data={state.loading || state.failed ? [] : galleryRows}
            keyExtractor={(item) => item.id}
            estimatedItemSize={200}
            onEndReached={state.loadMore}
            onEndReachedThreshold={0.5}
            onViewableItemsChanged={({ viewableItems }) =>
              setVisibleIds((current) => {
                const ids = viewableItems.flatMap(({ item }) =>
                  item.photos.map((photo) => photo.media_id),
                );
                return current.join("|") === ids.join("|") ? current : ids;
              })
            }
            contentContainerStyle={{ ...contentContainerStyle, paddingHorizontal: SIDE }}
            ListHeaderComponent={
              <View className="gap-6 pb-6">
                {header}
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
              </View>
            }
            ListEmptyComponent={
              <BodyState
                loading={state.loading}
                failed={state.failed}
                retry={state.retry}
                empty={
                  pose === null
                    ? t("body__photos_empty")
                    : t("body__photos_empty_pose", { pose: poseName(pose) })
                }
              />
            }
            renderItem={({ item: day }) => (
              <View className="gap-3 pb-3">
                {day.first ? (
                  <View className="flex-row items-baseline justify-between">
                    <Text
                      accessibilityRole="header"
                      className="text-title-md font-semibold text-foreground"
                    >
                      {formatCalendarDate(day.date, i18n.language)}
                    </Text>
                    <Text className="font-normal text-caption text-muted">
                      {t("body__photo_count", { count: day.count })}
                    </Text>
                  </View>
                ) : null}
                <View className="flex-row flex-wrap" style={{ gap: GAP }}>
                  {day.photos.map((photo) => {
                    const hidden = reveal.hidden(photo.id);
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
                        onPress={() => (hidden ? reveal.reveal(photo.id) : setViewing({ photo }))}
                        onLongPress={() => setTarget(photo)}
                      />
                    );
                  })}
                </View>
              </View>
            )}
          />
          {viewing && !reveal.hidden(viewing.photo.id) ? (
            <MediaViewer
              mediaIds={[viewing.photo.media_id]}
              index={0}
              captions={[
                `${poseName(viewing.photo.pose)} · ${formatCalendarDate(viewing.photo.local_date, i18n.language)}`,
              ]}
              onIndexChange={() => undefined}
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
                  setViewing(null);
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
        </MediaImageBatch>
      )}
    </Page>
  );
}
