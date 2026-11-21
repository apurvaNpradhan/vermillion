import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

/** A stable, quiet space for Body's initial load, retry, and first reading. */
export function BodyState({
  loading = false,
  failed = false,
  retry,
  empty,
  children,
}: {
  loading?: boolean;
  failed?: boolean;
  retry?: () => void;
  empty?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View className="min-h-64 justify-center gap-4 rounded-2xl bg-surface p-5">
      {failed ? (
        <>
          <Text accessibilityRole="alert" className="font-normal text-center text-body text-muted">
            {t("body__load_error")}
          </Text>
          {retry ? (
            <Button variant="secondary" onPress={retry}>
              <Button.Label>{t("training__retry")}</Button.Label>
            </Button>
          ) : null}
        </>
      ) : loading ? null : (
        <>
          <Text className="font-normal text-center text-body text-muted">{empty}</Text>
          {children}
        </>
      )}
    </View>
  );
}
