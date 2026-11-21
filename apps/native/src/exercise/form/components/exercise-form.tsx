import { Image } from "expo-image";
import { useExerciseImage } from "../../use-exercise-image";
import { MediaImage } from "@/media";
import {
  EQUIPMENT,
  EQUIPMENT_KEYS,
  EXERCISE_INSTRUCTIONS_MAX,
  EXERCISE_TITLE_MAX,
  MUSCLE_GROUP_KEYS,
  detailsOf,
} from "@workspace/shared";
import type { ExerciseDetail } from "@workspace/sync";
import { useNavigation, usePreventRemove } from "expo-router";
import { Spinner, useThemeColor } from "heroui-native";
import { CaretDown, CaretUp, Info, X } from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useHideTabBar } from "@/platform/navigation/tab-action";
import { Button } from "@/platform/ui/button";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { EmptyState } from "@/platform/ui/empty-state";
import { Field } from "@/platform/ui/field";

import { ChoiceCell, ChoiceGrid, EquipmentIcon } from "../../components/choice-grid";
import { useExercise } from "../../detail/use-exercise";
import { useExerciseActions } from "../../use-exercise-actions";
import { useExerciseTypeLocked } from "../../use-exercise-type-locked";
import {
  applyLatestExercise,
  editExerciseDraft,
  emptyExerciseValues,
  exerciseDraftPatch,
  isExerciseDraftDirty,
  startExerciseDraft,
  toggleDetail,
  toggleSecondary,
  validateExerciseForm,
  type ExerciseDraft,
  type ExerciseFormValues,
  shouldBlockLeaving,
} from "../exercise-draft";
import { formValuesOf } from "../form-values";
import { DetailPicker } from "./detail-picker";
import { PrimaryMusclePicker, SecondaryMusclePicker } from "./muscle-picker";
import { TypePicker } from "./type-picker";

/** Height reserved at the bottom for the pinned Save button. */
const FOOTER = 88;

/** What the form is open for: a new exercise (maybe named from a search), or one to edit. */
export type ExerciseFormTarget = { kind: "new"; title: string } | { kind: "edit"; id: string };

/**
 * The create and edit form, shown as a sheet over the library. An edit sends only the fields the
 * user changed (ADR 0019); closing with unsaved changes asks first. The route chooses what it is
 * open for and what happens once it has saved or been closed.
 */
export function ExerciseFormScreen({
  target,
  onClose,
  onCreated,
}: {
  target: ExerciseFormTarget;
  onClose: () => void;
  /** A new exercise was saved on the device; called with its id just before `onClose`. */
  onCreated?: (id: string) => void;
}) {
  useHideTabBar(true);
  if (target.kind === "new") {
    return (
      <ExerciseForm saved={null} title={target.title} onClose={onClose} onCreated={onCreated} />
    );
  }
  return <EditExercise id={target.id} onClose={onClose} />;
}

function EditExercise({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const state = useExercise(id);
  if (state.status === "loading") {
    return (
      <FormFrame title={t("exercise__edit_title")} onClose={onClose}>
        {null}
      </FormFrame>
    );
  }
  // Only the user's own exercises can be edited; the catalog is read-only.
  if (state.status !== "ready" || !state.exercise.isCustom) {
    return (
      <FormFrame title={t("exercise__edit_title")} onClose={onClose}>
        <EmptyState icon={Info} title={t("exercise__detail_missing")} />
      </FormFrame>
    );
  }
  return <ExerciseForm saved={state.exercise} title="" onClose={onClose} />;
}

/** The sheet's header (close button and title) over scrolling content. */
function FormFrame({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-4"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: footer ? FOOTER + insets.bottom + 24 : insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={FOOTER + 16}
      >
        <View className="h-11 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common__close")}
            onPress={onClose}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full bg-default"
          >
            <X size={20} color={foreground} />
          </Pressable>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="flex-1 px-3 text-center font-semibold text-title-md text-foreground"
          >
            {title}
          </Text>
          <View className="h-11 w-11" />
        </View>
        {children}
      </KeyboardAwareScrollView>
      {/* Content scrolls under the status bar; this keeps its icons on the canvas. */}
      <View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 bg-background"
        style={{ height: insets.top }}
      />
      {footer ? (
        // A third-party view: Uniwind classes do not reach its style, so the pinning is inline.
        <KeyboardStickyView
          offset={{ closed: 0, opened: insets.bottom }}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
        >
          <View className="bg-background px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
            {footer}
          </View>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}

function ExerciseForm({
  saved,
  title,
  onClose,
  onCreated,
}: {
  /** The exercise being edited, or null for a new one. A later change to it reaches the draft. */
  saved: ExerciseDetail | null;
  /** The name a new exercise starts with (from "Create ‹query›"). */
  title: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const id = saved?.id ?? null;
  const initial = useMemo(
    () => (saved ? formValuesOf(saved) : emptyExerciseValues(title)),
    [saved, title],
  );
  const navigation = useNavigation();
  const actions = useExerciseActions();
  const image = useExerciseImage();
  const typeLocked = useExerciseTypeLocked(id);
  const [draft, setDraft] = useState<ExerciseDraft>(() => startExerciseDraft(initial));
  const [detailsOpen, setDetailsOpen] = useState(
    () =>
      initial.secondaryMuscles.length > 0 ||
      initial.secondaryDetail.length > 0 ||
      initial.notes.trim() !== "" ||
      saved?.imageMediaId != null,
  );
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const createdId = useRef<string | null>(null);
  const [done, setDone] = useState(false);
  const dirty = isExerciseDraftDirty(draft) || image.dirty;

  // The saved row changed while the form was open: untouched fields follow it.
  useEffect(() => {
    if (id !== null) setDraft((current) => applyLatestExercise(current, initial));
  }, [id, initial]);

  // Back, the swipe and the close button all ask before dropping unsaved changes.
  // Discarding must lift the block before the held navigation is replayed: the form is still
  // dirty, so replaying it while the block is on would just ask again.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const heldAction = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  usePreventRemove(shouldBlockLeaving({ dirty, saving, done, discarded }), ({ data }) => {
    heldAction.current = data.action;
    setConfirmOpen(true);
  });
  useEffect(() => {
    if (!discarded || heldAction.current === null) return;
    navigation.dispatch(heldAction.current);
    heldAction.current = null;
  }, [discarded, navigation]);
  useEffect(() => {
    if (done) onClose();
  }, [done, onClose]);

  const result = useMemo(() => validateExerciseForm(draft.values), [draft.values]);
  const errors = attempted && !result.ok ? result.errors : {};
  const set = <F extends keyof ExerciseFormValues>(field: F, value: ExerciseFormValues[F]) =>
    setDraft((current) => editExerciseDraft(current, field, value));

  async function save() {
    setAttempted(true);
    if (!result.ok) {
      if (result.errors.notes) setDetailsOpen(true);
      haptic.tick();
      return;
    }
    setSaving(true);
    try {
      if (id === null) {
        // Await first: `onCreated?.(await ...)` would skip the create when no callback is given.
        if (createdId.current) await actions.update(createdId.current, result.input);
        const newId = createdId.current ?? (await actions.create(result.input));
        createdId.current = newId;
        await image.save(newId);
        onCreated?.(newId);
      } else {
        await actions.update(id, exerciseDraftPatch(draft));
        await image.save(id);
      }
      haptic.confirm();
      setDone(true);
    } catch {
      // The action has shown the error; keep the values for another try.
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("exercise__discard_title")}
        description={t("exercise__discard_body")}
        cancelLabel={t("exercise__keep_editing")}
        confirmLabel={t("exercise__discard_changes")}
        onConfirm={() => setDiscarded(true)}
      />
      <FormFrame
        title={t(id === null ? "exercise__new" : "exercise__edit_title")}
        onClose={() => navigation.goBack()}
        footer={
          <Button
            variant="primary"
            size="lg"
            className="h-14 rounded-xl"
            isDisabled={saving || image.busy || (id !== null && !dirty)}
            accessibilityState={{ busy: saving }}
            onPress={() => void save()}
          >
            {saving ? <Spinner size="sm" /> : null}
            <Button.Label className="text-body-lg font-semibold">
              {t(id === null ? "exercise__create" : "common__save")}
            </Button.Label>
          </Button>
        }
      >
        <Field
          label={t("exercise__field_name")}
          value={draft.values.title}
          onChangeText={(value) => set("title", value)}
          maxLength={EXERCISE_TITLE_MAX + 20}
          autoCapitalize="sentences"
          returnKeyType="done"
          error={errors.title ? t(errors.title) : undefined}
        />

        <Section
          title={t("exercise__section_equipment")}
          error={errors.equipment ? t(errors.equipment) : undefined}
        >
          <ChoiceGrid
            items={EQUIPMENT}
            render={(kind) => (
              <ChoiceCell
                key={kind}
                radio
                label={t(EQUIPMENT_KEYS[kind])}
                selected={draft.values.equipment === kind}
                onPress={() => set("equipment", kind)}
                icon={<EquipmentIcon kind={kind} />}
              />
            )}
          />
        </Section>

        <Section
          title={t("exercise__field_primary")}
          error={errors.primaryMuscle ? t(errors.primaryMuscle) : undefined}
        >
          <PrimaryMusclePicker
            value={draft.values.primaryMuscle}
            onChange={(muscle) => set("primaryMuscle", muscle)}
          />
        </Section>

        {draft.values.primaryMuscle !== null && detailsOf(draft.values.primaryMuscle).length > 0 ? (
          <Section
            title={t("exercise__field_detail")}
            hint={t("exercise__field_detail_hint")}
            error={errors.primaryDetail ? t(errors.primaryDetail) : undefined}
          >
            <DetailPicker
              group={draft.values.primaryMuscle}
              value={draft.values.primaryDetail}
              onToggle={(detail) =>
                set("primaryDetail", toggleDetail(draft.values.primaryDetail, detail))
              }
            />
          </Section>
        ) : null}

        <Section title={t("exercise__field_log")}>
          <TypePicker
            value={draft.values.exerciseType}
            locked={typeLocked}
            onChange={(type) => set("exerciseType", type)}
          />
        </Section>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsOpen }}
          onPress={() => setDetailsOpen((open) => !open)}
          className="min-h-12 flex-row items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 active:bg-default"
        >
          <Text className="text-label font-medium text-foreground">
            {t("exercise__more_details")}
          </Text>
          <DetailsCaret expanded={detailsOpen} />
        </Pressable>
        {detailsOpen ? (
          <View className="gap-6">
            <View className="flex-row flex-wrap items-center gap-2">
              {image.previewUri ? (
                <Image
                  source={{ uri: image.previewUri }}
                  style={{ width: 64, height: 64 }}
                  contentFit="cover"
                />
              ) : (
                <MediaImage
                  mediaId={image.removed ? null : (saved?.imageMediaId ?? null)}
                  size={64}
                />
              )}
              <Button variant="secondary" isDisabled={image.busy} onPress={() => void image.pick()}>
                <Button.Label>{t("media__exercise_image")}</Button.Label>
              </Button>
              {image.previewUri || (!image.removed && saved?.imageMediaId) ? (
                <Button variant="danger-soft" onPress={image.remove}>
                  <Button.Label>{t("media__remove")}</Button.Label>
                </Button>
              ) : null}
              {image.dirty ? (
                <Text className="font-normal text-caption text-muted">
                  {t("media__photo_changed")}
                </Text>
              ) : null}
            </View>
            <Section
              title={t("exercise__field_secondary")}
              hint={t("exercise__field_secondary_hint")}
            >
              <SecondaryMusclePicker
                primary={draft.values.primaryMuscle}
                value={draft.values.secondaryMuscles}
                onToggle={(muscle) =>
                  set("secondaryMuscles", toggleSecondary(draft.values.secondaryMuscles, muscle))
                }
              />
            </Section>

            {draft.values.secondaryMuscles.flatMap((group) =>
              detailsOf(group).length === 0
                ? []
                : [
                    <Section
                      key={group}
                      title={t("exercise__field_detail_group", {
                        group: t(MUSCLE_GROUP_KEYS[group]),
                      })}
                    >
                      <DetailPicker
                        group={group}
                        value={draft.values.secondaryDetail}
                        onToggle={(detail) =>
                          set("secondaryDetail", toggleDetail(draft.values.secondaryDetail, detail))
                        }
                      />
                    </Section>,
                  ],
            )}

            <Field
              label={t("exercise__field_notes")}
              description={t("exercise__field_notes_hint")}
              value={draft.values.notes}
              onChangeText={(value) => set("notes", value)}
              maxLength={EXERCISE_INSTRUCTIONS_MAX + 100}
              multiline
              textAlignVertical="top"
              className="min-h-28"
              error={errors.notes ? t(errors.notes) : undefined}
            />
          </View>
        ) : null}
      </FormFrame>
    </>
  );
}

function Section({
  title,
  hint,
  error,
  children,
}: {
  title: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-label font-medium text-foreground">
          {title}
        </Text>
        {hint ? <Text className="font-normal text-caption text-muted">{hint}</Text> : null}
      </View>
      {children}
      {error ? (
        <Text accessibilityRole="alert" className="font-normal text-caption text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function DetailsCaret({ expanded }: { expanded: boolean }) {
  const foreground = useThemeColor("foreground");
  const Icon = expanded ? CaretUp : CaretDown;
  return <Icon size={20} color={foreground} />;
}
