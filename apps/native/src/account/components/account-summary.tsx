import { Avatar, useThemeColor } from "heroui-native";
import { usePathname, useRouter } from "expo-router";
import { CaretRight } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { useCurrentUser } from "../use-current-user";
import { ANCHORED } from "@/platform/navigation/anchored";

/** Up to two initials from a display name, for the avatar fallback. */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "");
  return letters.length > 1 ? `${letters[0]}${letters.at(-1)}` : (letters[0] ?? "");
}

/** The user's initials in a neutral circle; a person icon until the profile has loaded. */
function AccountAvatar() {
  const { user } = useCurrentUser();
  const text = user ? initials(user.name) : "";
  return (
    <Avatar size="md" color="default" alt={user?.name ?? ""}>
      <Avatar.Fallback>{text || undefined}</Avatar.Fallback>
    </Avatar>
  );
}

/**
 * The tab menu's account row with a shortcut to Profile.
 */
export function AccountSummary({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const muted = useThemeColor("muted");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("settings__open_profile", { name: user?.name ?? "" })}
      onPress={() => {
        onOpen();
        if (pathname === "/settings/profile") return;
        if (pathname.startsWith("/settings/")) router.dismissTo("/settings");
        router.navigate("/settings/profile", ANCHORED);
      }}
      className="flex-row items-center gap-3 rounded-2xl px-2 py-1.5 active:opacity-80"
    >
      <AccountAvatar />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="font-semibold text-title-md text-foreground">
          {user?.name ?? " "}
        </Text>
        <Text numberOfLines={1} className="text-caption text-muted">
          {user?.email ?? " "}
        </Text>
      </View>
      <CaretRight size={20} color={muted} />
    </Pressable>
  );
}
