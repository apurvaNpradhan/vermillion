import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@workspace/ui/components/card";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { MailCheckIcon } from "lucide-react";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { useRequestDeletion } from "../use-account-actions";

import { isDeleteConfirmationValid } from "@workspace/client/is-delete-confirmation-valid";
import { useCurrentUser } from "../use-current-user";

/** Typed confirmation first, then an emailed link: nothing is deleted until the link is followed. */
export function DeleteAccountSection() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const [typed, setTyped] = useState("");
  const { requestDeletion, isPending, isSuccess } = useRequestDeletion();

  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />}>{t("settings__delete_title")}</CardTitle>
        <CardDescription>{t("settings__delete_body")}</CardDescription>
      </CardHeader>
      <CardPanel>
        {isSuccess ? (
          <Alert variant="success">
            <MailCheckIcon />
            <AlertDescription>{t("settings__delete_sent")}</AlertDescription>
          </Alert>
        ) : (
          <form
            className="flex max-w-sm flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (isDeleteConfirmationValid(typed, user?.email))
                requestDeletion({ callbackURL: "/?account=deleted" });
            }}
          >
            <Field>
              <FieldLabel>
                {t("settings__delete_confirm_label", { email: user?.email ?? "" })}
              </FieldLabel>
              <Input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Button
              type="submit"
              variant="destructive"
              className="self-start"
              loading={isPending}
              disabled={!isDeleteConfirmationValid(typed, user?.email)}
            >
              {t("settings__delete_action")}
            </Button>
          </form>
        )}
      </CardPanel>
    </Card>
  );
}
