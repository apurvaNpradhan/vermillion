import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { Text, View } from "react-native";

import { FlowStep, stepPosition } from "@/auth";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { Field } from "@/platform/ui/field";
import { FormError } from "@/platform/ui/form-error";
import { usePreferences } from "@/preferences";

import { parseBody, type BodyDraft, type BodyField } from "../body-input";
import { prefsFailureOf, type PrefsFailure } from "../prefs-failure";

const EMPTY: BodyDraft = { heightCm: "", feet: "", inches: "", weight: "" };

/**
 * Height and bodyweight in the units just chosen; either may stay empty and the whole step can be
 * skipped. The bodyweight is the preference the app uses until the first weigh-in is logged.
 */
export function BodyStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { preferences, setUiAsync } = usePreferences();
  const { weightUnit, lengthUnit } = preferences.ui;
  const [invalid, setInvalid] = useState<readonly BodyField[]>([]);
  const [failure, setFailure] = useState<PrefsFailure | null>(null);

  const form = useForm({
    defaultValues: EMPTY,
    onSubmit: async ({ value }) => {
      setFailure(null);
      const parsed = parseBody(value, { weightUnit, lengthUnit });
      setInvalid(parsed.ok ? [] : parsed.invalid);
      if (!parsed.ok) return;
      const { heightCm, bodyweightKg } = parsed.values;
      if (heightCm === null && bodyweightKg === null) return onDone();
      try {
        await setUiAsync({
          ...(heightCm === null ? {} : { heightCm }),
          ...(bodyweightKg === null ? {} : { bodyweightKg }),
        });
        haptic.confirm();
        onDone();
      } catch (error) {
        setFailure(error instanceof Error ? prefsFailureOf(error) : "onboarding__prefs_failed");
      }
    },
  });
  const unit = (label: string) => <Text className="font-normal text-body text-muted">{label}</Text>;
  const heightError = invalid.includes("height") ? t("body__invalid_height") : undefined;

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <FlowStep
          leading="none"
          position={stepPosition("get-started", "body")}
          title={t("onboarding__body_title")}
          subtitle={t("onboarding__body_body")}
          action={{
            label: t("onboarding__continue"),
            onPress: () => void form.handleSubmit(),
            loading: isSubmitting,
          }}
          secondary={{ label: t("onboarding__skip"), onPress: onDone, disabled: isSubmitting }}
        >
          <FormError message={failure ? t(failure) : null} />
          {lengthUnit === "cm" ? (
            <form.Field name="heightCm">
              {(field) => (
                <Field
                  label={t("body__height")}
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  maxLength={5}
                  end={unit(t("onboarding__units_cm_short"))}
                  error={heightError}
                />
              )}
            </form.Field>
          ) : (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <form.Field name="feet">
                  {(field) => (
                    <Field
                      label={t("body__height")}
                      accessibilityLabel={t("onboarding__body_feet")}
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      keyboardType="number-pad"
                      maxLength={1}
                      end={unit(t("onboarding__units_ft_short"))}
                      error={heightError}
                    />
                  )}
                </form.Field>
              </View>
              <View className="flex-1">
                <form.Field name="inches">
                  {(field) => (
                    <Field
                      // An empty label keeps the two inputs on one line.
                      label=" "
                      accessibilityLabel={t("onboarding__body_inches")}
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      keyboardType="decimal-pad"
                      maxLength={4}
                      end={unit(t("onboarding__units_in_short"))}
                    />
                  )}
                </form.Field>
              </View>
            </View>
          )}
          <form.Field name="weight">
            {(field) => (
              <Field
                label={t("onboarding__body_weight")}
                value={field.state.value}
                onChangeText={field.handleChange}
                keyboardType="decimal-pad"
                returnKeyType="done"
                maxLength={6}
                onSubmitEditing={() => void form.handleSubmit()}
                end={unit(t(weightUnit === "lb" ? "training__unit_lb" : "training__unit_kg"))}
                error={
                  invalid.includes("weight")
                    ? t(
                        weightUnit === "lb"
                          ? "onboarding__body_weight_lb"
                          : "onboarding__body_weight_kg",
                      )
                    : undefined
                }
              />
            )}
          </form.Field>
        </FlowStep>
      )}
    </form.Subscribe>
  );
}
