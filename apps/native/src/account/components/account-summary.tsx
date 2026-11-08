import { Avatar, cn, useThemeColor } from "heroui-native";
import { useRouter } from "expo-router";
import { CaretRight } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { useCurrentUser } from "../use-current-user";

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
export function AccountAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const { user } = useCurrentUser();
  const text = user ? initials(user.name) : "";
  return (
    <Avatar size={size} color="default" alt={user?.name ?? ""}>
      <Avatar.Fallback>{text || undefined}</Avatar.Fallback>
    </Avatar>
  );
}

/**
 * Avatar, name and email in one row that opens the profile. Used as the card at the top of
 * settings and as the header of the tab bar's menu.
 */
export function AccountSummary({ variant = "row" }: { variant?: "row" | "card" }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useCurrentUser();
  const muted = useThemeColor("muted");
  const card = variant === "card";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("settings__open_profile", { name: user?.name ?? "" })}
      onPress={() => router.navigate("/settings/profile")}
      className={cn(
        "flex-row items-center gap-3 active:opacity-80",
        card ? "rounded-2xl border border-border bg-surface p-4" : "rounded-2xl px-2 py-1.5",
      )}
    >
      <AccountAvatar size={card ? "lg" : "md"} />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="font-semibold text-title-md text-foreground">
          {user?.name ?? " "}
        </Text>
        <Text numberOfLines={1} className="text-caption text-muted">
          {user?.email ?? " "}
        </Text>
      </View>
      <CaretRight size={16} color={muted} />
    </Pressable>
  );
}
