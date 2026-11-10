import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import Animated from "react-native-reanimated";
import { sessionStartAllowed } from "@workspace/shared";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { Page } from "@/platform/ui/page";
import { useWorkouts } from "@/training";
import { useFinishSession } from "../use-finish-session";

export function LogPastScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const library = useWorkouts(true);
  const actions = useFinishSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const form = useForm({
    defaultValues: { startedAt: new Date().toISOString() },
    onSubmit: async ({ value }) => {
      const parsed = Date.parse(value.startedAt);
      if (!Number.isFinite(parsed) || !sessionStartAllowed(new Date(parsed).toISOString())) {
        setInvalid(true);
        return;
      }
      setBusy(true);
      const id = await actions.logPast(selected, new Date(parsed).toISOString());
      setBusy(false);
      if (id) router.replace({ pathname: "/session/[id]", params: { id } });
    },
  });
  return (
    <Page title={t("session__log_past")} back>
      {({ header, contentContainerStyle, ...scroll }) => (
        <Animated.ScrollView
          {...scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ ...contentContainerStyle, paddingHorizontal: 16, gap: 16 }}
        >
          {header}
          <Button
            variant={selected === null ? "secondary" : "ghost"}
            onPress={() => setSelected(null)}
          >
            <Button.Label>{t("session__start_empty")}</Button.Label>
          </Button>
          {library.workouts.map((workout) => (
            <Button
              key={workout.id}
              variant={selected === workout.id ? "secondary" : "ghost"}
              onPress={() => setSelected(workout.id)}
            >
              <Button.Label>{workout.title ?? t("session__source_workout")}</Button.Label>
            </Button>
          ))}
          <form.Field name="startedAt">
            {(field) => (
              <Field
                label={t("session__edit_start")}
                description={t("session__date_hint")}
                value={field.state.value}
                onChangeText={field.handleChange}
                autoCapitalize="none"
              />
            )}
          </form.Field>
          {invalid ? (
            <Text className="text-body text-danger">{t("session__invalid_summary")}</Text>
          ) : null}
          <Button isDisabled={busy} onPress={() => void form.handleSubmit()}>
            <Button.Label>{t("session__log_past")}</Button.Label>
          </Button>
        </Animated.ScrollView>
      )}
    </Page>
  );
}
