import { isDeleteConfirmationValid } from "@workspace/client/is-delete-confirmation-valid";
import { Input, Label, Spinner, TextField } from "heroui-native";
import { useState } from "react";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";
import { rememberDeletionRequest } from "@/sync";
import { useRequestDeletion } from "../use-account-actions";
import { Notice } from "@/platform/ui/notice";

import { useCurrentUser } from "../use-current-user";
import { Button } from "@/platform/ui/button";
import { Card } from "@/platform/ui/card";

/**
 * Deletion from inside the app (store rule). Typed confirmation first, then an
 * emailed link: nothing is deleted until the link is followed, which
 * then opens the app at the account-deleted screen (a deep link in the app's scheme).
 */
export function DeleteAccountSection() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const [typed, setTyped] = useState("");
  const { requestDeletion, isPending, isSuccess } = useRequestDeletion();

  return (
    <Card>
      <Card.Body className="gap-4">
        {isSuccess ? (
          <Notice status="success" message={t("settings__delete_sent")} />
        ) : (
          <>
            <TextField>
              <Label>{t("settings__delete_confirm_label", { email: user?.email ?? "" })}</Label>
              <Input
                value={typed}
                onChangeText={setTyped}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </TextField>
            <Button
              variant="danger-soft"
              isDisabled={isPending || !isDeleteConfirmationValid(typed, user?.email)}
              onPress={() => {
                if (user) rememberDeletionRequest(user.id);
                requestDeletion({ callbackURL: `${appConfig.scheme}://confirm-deletion` });
              }}
            >
              {isPending ? <Spinner size="sm" /> : null}
              <Button.Label>{t("settings__delete_action")}</Button.Label>
            </Button>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
