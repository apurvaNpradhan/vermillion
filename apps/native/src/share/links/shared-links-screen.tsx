import { Link as LinkIcon } from "phosphor-react-native";
import { useState } from "react";
import { Share, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { EmptyState } from "@/platform/ui/empty-state";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { ListRow, ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";
import { Button } from "@/platform/ui/button";
import { useAppToast } from "@/platform/ui/use-app-toast";

import { displayLink, spacedCode } from "./link-display";
import { linkFor } from "./link-url";
import { useSharedLinks } from "./use-shared-links";

/** "Shared links": every live link the user made, to open or turn off. */
export function SharedLinksScreen() {
  const { t, i18n } = useTranslation();
  const { toast } = useAppToast();
  const shared = useSharedLinks();
  const [target, setTarget] = useState<string | null>(null);
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(value));

  return (
    <>
      <ConfirmationDialog
        isOpen={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={t("share__revoke_title")}
        description={t("share__revoke_body")}
        cancelLabel={t("common__cancel")}
        confirmLabel={t("share__revoke_confirm")}
        destructive
        onConfirm={() => {
          const code = target;
          setTarget(null);
          if (!code) return;
          void shared.revoke(code).then((ok) => {
            if (ok) haptic.confirm();
            toast.show(
              ok
                ? { label: t("share__revoked") }
                : { variant: "danger", label: t("share__revoke_failed") },
            );
          });
        }}
      />
      <ScrollPage title={t("share__links_title")} back>
        <Text className="font-normal text-body text-muted">{t("share__links_hint")}</Text>
        {shared.links === null ? (
          shared.isError ? (
            <View className="items-center gap-3 py-6">
              <Text className="font-normal text-center text-body text-muted">
                {t("share__links_load_failed")}
              </Text>
              <Button variant="secondary" onPress={shared.refetch}>
                <Button.Label>{t("training__retry")}</Button.Label>
              </Button>
            </View>
          ) : null
        ) : shared.links.length === 0 ? (
          <EmptyState icon={LinkIcon} title={t("share__links_empty")} />
        ) : (
          <ListSection>
            {shared.links.map((link) => (
              <ListRow
                key={link.code}
                icon={LinkIcon}
                title={link.title ?? t("training__workout")}
                description={`${displayLink(linkFor(link.kind, link.code))} · ${spacedCode(link.code)} · ${date(link.createdAt)}`}
                accessory="none"
                accessibilityHint={t("share__links_row_hint")}
                onPress={() =>
                  void Share.share({
                    message: t("share__link_message", { url: linkFor(link.kind, link.code) }),
                  }).catch(() => undefined)
                }
                trailing={
                  <Button
                    variant="ghost"
                    size="sm"
                    accessibilityLabel={t("share__revoke_named", { title: link.title ?? "" })}
                    onPress={() => setTarget(link.code)}
                  >
                    <Button.Label>{t("share__revoke")}</Button.Label>
                  </Button>
                }
              />
            ))}
          </ListSection>
        )}
      </ScrollPage>
    </>
  );
}
