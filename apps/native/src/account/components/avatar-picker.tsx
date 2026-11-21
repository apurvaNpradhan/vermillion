import { Spinner, useThemeColor } from "heroui-native";
import { useRouter } from "expo-router";
import { Camera, Image as ImageIcon, Trash, Eye } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { MediaImage, MediaViewer } from "@/media";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { useAvatar } from "../use-avatar";
import { initials } from "./account-summary";
import { useCurrentUser } from "../use-current-user";
import { NeedsConnection } from "@/platform/ui/needs-connection";
import { useIsOnline } from "@/platform/network";

export function AvatarPicker({ showIdentity = true }: { showIdentity?: boolean }) {
  const avatar = useAvatar();
  const online = useIsOnline();
  const { user } = useCurrentUser();
  const { t } = useTranslation();
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const openSheet = () => {
    haptic.tick();
    setSheetOpen(true);
  };
  const actions = [
    {
      key: "choose",
      icon: ImageIcon,
      label: t("media__choose_photo"),
      onPress: () => void avatar.pick(),
    },
    {
      key: "camera",
      icon: Camera,
      label: t("media__take_photo"),
      onPress: () => void avatar.pick(true),
    },
    ...(avatar.id
      ? [
          {
            key: "view",
            icon: Eye,
            label: t("media__view_photo"),
            onPress: () => setViewing(true),
          },
          {
            key: "remove",
            icon: Trash,
            label: t("media__remove"),
            tone: "danger" as const,
            onPress: () => void avatar.remove(),
          },
        ]
      : []),
  ];

  return (
    <View className="items-center gap-3 py-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("media__profile_photo_change")}
        accessibilityState={{ disabled: avatar.busy || !online }}
        disabled={avatar.busy || !online}
        onPress={openSheet}
        className="size-24 items-center justify-center rounded-full active:opacity-80"
      >
        <MediaImage
          mediaId={avatar.id}
          size={96}
          rounded="rounded-full"
          fallback={
            <View className="size-24 items-center justify-center rounded-full bg-default">
              <Text className="font-semibold text-title-xl text-foreground">
                {user ? initials(user.name) : ""}
              </Text>
            </View>
          }
        />
        <View className="absolute bottom-0 right-0 size-8 items-center justify-center rounded-full bg-surface">
          <Camera size={20} color={foreground} weight="regular" />
        </View>
        {avatar.busy ? (
          <View className="absolute inset-0 items-center justify-center rounded-full bg-background/70">
            <Spinner size="sm" />
          </View>
        ) : null}
      </Pressable>
      <NeedsConnection />
      {showIdentity ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings__open_profile", { name: user?.name ?? "" })}
          onPress={() => router.navigate("/settings/profile")}
          className="items-center gap-0.5 active:opacity-80"
        >
          <Text className="font-semibold text-title-md text-foreground">{user?.name ?? " "}</Text>
          <Text className="font-normal text-caption text-muted">{user?.email ?? " "}</Text>
        </Pressable>
      ) : null}
      <ActionSheet
        title={t("media__profile_photo")}
        actions={actions}
        isOpen={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      {viewing && avatar.id ? (
        <MediaViewer
          mediaIds={[avatar.id]}
          index={0}
          onIndexChange={() => undefined}
          onClose={() => setViewing(false)}
        />
      ) : null}
    </View>
  );
}
