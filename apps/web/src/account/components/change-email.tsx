import { useForm } from "@tanstack/react-form";
import { OTP_LENGTH } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { OTPField, OTPFieldInput } from "@workspace/ui/components/otp-field";
import { toastManager } from "@workspace/ui/components/toast";
import { useMemo, useState } from "react";
import { z } from "zod";

import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";

import { useChangeEmail } from "../use-change-email";

const SLOTS = Array.from({ length: OTP_LENGTH }, (_, slot) => slot);

/** The address, read-only, with a two-step change: new address, then the code sent to it. */
export function ChangeEmail({ email }: { email: string }) {
  const { t } = useTranslation();
  const { requestChange, confirmChange } = useChangeEmail();
  const [editing, setEditing] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const schema = useMemo(() => z.object({ email: z.email(t("auth__error_email_invalid")) }), [t]);
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFailure(null);
      const newEmail = value.email.trim();
      const error = await requestChange(newEmail);
      if (error) {
        setFailure(t(error));
        return;
      }
      setPendingEmail(newEmail);
    },
  });

  function close() {
    setEditing(false);
    setPendingEmail(null);
    setCode("");
    setFailure(null);
    form.reset();
  }

  async function confirm(otp: string) {
    if (!pendingEmail || checking) return;
    setChecking(true);
    setFailure(null);
    const error = await confirmChange(pendingEmail, otp);
    setChecking(false);
    if (error) {
      setCode("");
      setFailure(t(error));
      return;
    }
    toastManager.add({ type: "success", title: t("settings__email_changed") });
    close();
  }

  if (!editing) {
    return (
      <Field>
        <FieldLabel>{t("auth__email")}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input value={email} readOnly disabled />
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            {t("settings__email_change")}
          </Button>
        </div>
      </Field>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      {pendingEmail ? (
        <>
          <p className="text-body text-muted-foreground">
            {t("settings__email_code_hint", { email: pendingEmail })}
          </p>
          <Field>
            <FieldLabel className="sr-only">{t("auth__code_label")}</FieldLabel>
            <OTPField
              length={OTP_LENGTH}
              value={code}
              disabled={checking}
              onValueChange={setCode}
              onValueComplete={(otp) => void confirm(otp)}
            >
              {SLOTS.map((slot) => (
                <OTPFieldInput
                  key={slot}
                  autoFocus={slot === 0}
                  {...(slot > 0
                    ? {
                        "aria-label": t("auth__code_digit", {
                          current: slot + 1,
                          total: OTP_LENGTH,
                        }),
                      }
                    : {})}
                  aria-invalid={failure ? true : undefined}
                />
              ))}
            </OTPField>
          </Field>
        </>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <p className="text-body text-muted-foreground">{t("settings__email_hint")}</p>
          <form.Field name="email">
            {(field) => (
              <TextField
                field={field}
                label={t("settings__email_new")}
                type="email"
                autoComplete="email"
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" className="self-start" loading={isSubmitting}>
                {t("auth__send_code")}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
      {failure ? (
        <p role="alert" className="text-label text-destructive-foreground">
          {failure}
        </p>
      ) : null}
      <Button type="button" variant="ghost" className="self-start" onClick={close}>
        {t("common__cancel")}
      </Button>
    </div>
  );
}
