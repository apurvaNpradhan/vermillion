import { ShareComposer } from "@/share";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { useSessionShare } from "./use-session-share";

/** The Share composer for one Session (route `share/session/[id]`). */
export function SessionShareScreen({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const share = useSessionShare(id);
  if (share.status === "ready") {
    return (
      <ShareComposer
        kind="session"
        title={t("share__title_session")}
        templates={share.templates}
        toggles={share.toggles}
        photo={share.photo}
        linkSource={{ target: { kind: "session", id }, weights: "weights" }}
      />
    );
  }
  if (share.status === "loading") return <View className="flex-1 bg-background" />;
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Text className="font-normal text-center text-body text-muted">
        {t("session__load_failed")}
      </Text>
      {share.status === "error" ? (
        <Button onPress={share.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : null}
      <Button variant="secondary" onPress={onClose}>
        <Button.Label>{t("share__close")}</Button.Label>
      </Button>
    </View>
  );
}
