import { isNetworkError } from "@workspace/client/network-error";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { Fingerprint, PencilSimple, Trash } from "phosphor-react-native";
import { useState } from "react";
import { Alert as NativeAlert, Text } from "react-native";

import { useLocale, useTranslation } from "@/platform/i18n";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { FormError } from "@/platform/ui/form-error";
import { ListRow, ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";
import { SkeletonList } from "@/platform/ui/skeleton";

import type { PasskeyRow } from "../passkey-logic";
import { passkeysSupported } from "../passkey-prompt";
import { useRegisterPasskey } from "../use-passkey-ceremonies";
import { usePasskeys } from "../use-passkeys";
import { RenameSheet } from "./rename-sheet";

/** Settings > Profile > Passkeys: list, add, rename and delete the account's passkeys. */
export function PasskeysScreen() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const { locale } = useLocale();
  const { passkeys, isPending, isError, isOffline, reload, rename, remove } = usePasskeys();
  const { register } = useRegisterPasskey();
  const [adding, setAdding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [selected, setSelected] = useState<PasskeyRow | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const supported = passkeysSupported();

  const label = (row: PasskeyRow) => row.name ?? t("passkeys__unnamed");
  const formatDate = (date: Date | null) =>
    date ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date) : undefined;

  async function add() {
    setFailure(null);
    setAdding(true);
    const outcome = await register();
    setAdding(false);
    if (outcome.status === "done") toast.show({ variant: "success", label: t("passkeys__added") });
    if (outcome.status === "error") setFailure(t(outcome.messageKey));
  }

  function confirmDelete(row: PasskeyRow) {
    NativeAlert.alert(
      t("passkeys__delete_title"),
      t("passkeys__delete_body", { name: label(row) }),
      [
        { text: t("common__cancel"), style: "cancel" },
        {
          text: t("common__delete"),
          style: "destructive",
          onPress: () =>
            void remove(row.id).then(
              () => toast.show({ variant: "success", label: t("passkeys__deleted") }),
              (error: Error) =>
                setFailure(t(isNetworkError(error) ? "errors__offline" : "passkeys__error_failed")),
            ),
        },
      ],
    );
  }

  async function saveName(name: string) {
    if (!selected) return;
    setRenaming(true);
    try {
      await rename({ id: selected.id, name });
      setRenameOpen(false);
      toast.show({ variant: "success", label: t("passkeys__renamed") });
    } catch (error) {
      setFailure(
        t(
          error instanceof Error && isNetworkError(error)
            ? "errors__offline"
            : "passkeys__error_failed",
        ),
      );
      setRenameOpen(false);
    } finally {
      setRenaming(false);
    }
  }

  return (
    <ScrollPage title={t("passkeys__title")} back>
      <Text className="text-center text-body text-muted">{t("passkeys__hint")}</Text>
      <FormError message={failure} />
      {isPending ? (
        <SkeletonList count={2} label={t("common__loading")} />
      ) : isError ? (
        <EmptyState
          icon={Fingerprint}
          title={t(isOffline ? "errors__offline" : "passkeys__error_load")}
          action={{ label: t("sync__rejected_send"), onPress: () => void reload() }}
        />
      ) : passkeys.length === 0 ? (
        <Text className="text-center text-body text-muted">{t("passkeys__empty")}</Text>
      ) : (
        <ListSection>
          {passkeys.map((row) => (
            <ListRow
              key={row.id}
              icon={Fingerprint}
              title={label(row)}
              value={formatDate(row.createdAt)}
              accessory="none"
              accessibilityHint={t("passkeys__row_hint")}
              onPress={() => {
                setSelected(row);
                setMenuOpen(true);
              }}
            />
          ))}
        </ListSection>
      )}
      {supported ? (
        <Button variant="primary" isDisabled={adding} onPress={() => void add()}>
          <Button.Label>{t("passkeys__add")}</Button.Label>
        </Button>
      ) : (
        <Text className="text-center text-caption text-muted">
          {t("passkeys__error_unsupported")}
        </Text>
      )}
      <ActionSheet
        title={selected ? label(selected) : ""}
        isOpen={menuOpen}
        onOpenChange={setMenuOpen}
        actions={
          selected
            ? [
                {
                  key: "rename",
                  label: t("passkeys__rename"),
                  icon: PencilSimple,
                  onPress: () => setRenameOpen(true),
                },
                {
                  key: "delete",
                  label: t("common__delete"),
                  icon: Trash,
                  tone: "danger",
                  onPress: () => confirmDelete(selected),
                },
              ]
            : []
        }
      />
      <RenameSheet
        isOpen={renameOpen}
        initialName={selected?.name ?? ""}
        saving={renaming}
        onOpenChange={setRenameOpen}
        onSave={(name) => void saveName(name)}
      />
    </ScrollPage>
  );
}
