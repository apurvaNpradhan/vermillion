import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { appConfig } from "@/platform/app-config";
import { Screen } from "@/platform/ui/screen";

/** Centered column shared by every auth screen. */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Screen withTopInset>
      <View className="mx-auto w-full max-w-sm flex-1 justify-center gap-6 py-6">
        <Text className="text-center font-semibold text-foreground text-lg">
          {appConfig.displayName}
        </Text>
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-semibold text-2xl text-foreground">
            {title}
          </Text>
          {description ? <Text className="text-muted">{description}</Text> : null}
        </View>
        <View className="gap-4">{children}</View>
        {footer ? <View className="items-center gap-2">{footer}</View> : null}
      </View>
    </Screen>
  );
}
