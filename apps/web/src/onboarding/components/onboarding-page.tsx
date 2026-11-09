import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { onboardingSteps } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { useMemo } from "react";
import { z } from "zod";

import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";
import { safeReturnLocation } from "@/platform/navigation";

import { useOnboarding, useSaveName } from "../use-onboarding";
import { OnboardingProgress } from "./progress";

/** Account first: one question per screen, the way into the app until every required step is done. */
export function OnboardingPage({ redirect }: { redirect?: string | undefined }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { steps } = useOnboarding();
  const { saveName } = useSaveName();

  const schema = useMemo(
    () => z.object({ name: z.string().trim().min(1, t("auth__error_name_required")).max(200) }),
    [t],
  );
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await saveName(value.name.trim());
      await router.navigate({ href: safeReturnLocation(redirect) });
    },
  });

  // Today the name is the only step. A new step adds its own screen and renders by `steps[0].id`.
  const total = onboardingSteps.filter((step) => step.required).length;
  const current = total - steps.length + 1;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 p-4">
      <OnboardingProgress
        current={Math.min(current, total)}
        total={total}
        label={t("onboarding__progress", { current: Math.min(current, total), total })}
      />
      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-title-xl">{t("onboarding__name_title")}</h1>
          <p className="text-body text-muted-foreground">{t("onboarding__name_body")}</p>
        </div>
        <form.Field name="name">
          {(field) => (
            <TextField
              field={field}
              label={t("auth__name")}
              autoComplete="given-name"
              placeholder={t("auth__name_placeholder")}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" loading={isSubmitting}>
              {t("onboarding__continue")}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </main>
  );
}
