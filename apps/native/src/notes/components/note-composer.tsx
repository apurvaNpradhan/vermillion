import {
  NOTE_BODY_MAX,
  NOTE_TITLE_MAX,
  applyLatest,
  draftPatch,
  editDraft,
  isDraftDirty,
  startDraft,
  type LocalNote,
  type NotePatch,
  type NoteValues,
} from "@workspace/sync";
import { Alert, Spinner, useThemeColor } from "heroui-native";
import { X } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { BackHandler, Alert as NativeAlert, Pressable, Text, TextInput, View } from "react-native";
import {
  KeyboardStickyView,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  SlideInDown,
  SlideOutDown,
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useHideTabBar } from "@/platform/navigation/tab-action";
import { Button } from "@/platform/ui/button";

import { useLiveNote } from "../use-notes";

/** What the composer is open for: a new note, or editing one from the list. */
export type NoteComposerTarget = { kind: "new" } | { kind: "edit"; note: LocalNote };

const EMPTY: NoteValues = { title: "", body: "" };
// motion-base in, motion-fast out; the keyboard sets the pace for a new note.
const ENTER = SlideInDown.duration(220).reduceMotion(ReduceMotion.System);
const EXIT = SlideOutDown.duration(160).reduceMotion(ReduceMotion.System);
const BACKDROP_IN = FadeIn.duration(150).reduceMotion(ReduceMotion.System);
const BACKDROP_OUT = FadeOut.duration(150).reduceMotion(ReduceMotion.System);
// A third-party view: Uniwind classes do not reach it.
const STICKY = { position: "absolute", left: 0, right: 0, bottom: 0 } as const;

/**
 * Writing a note, the way Hevy or Lyft compose: for a new note the title is focused the moment
 * the composer opens, so the keyboard starts at once, and the panel rides on top of it frame by
 * frame (`KeyboardStickyView`) instead of a sheet animating first and the keyboard after.
 * Editing opens without the keyboard. Closing with unsaved text asks first (ADR 0019 for edits).
 */
export function NoteComposer({
  target,
  onClose,
  onCreate,
  onSave,
}: {
  target: NoteComposerTarget | null;
  onClose: () => void;
  onCreate: (values: NoteValues) => Promise<void>;
  onSave: (input: { id: string } & NotePatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [dirty, setDirty] = useState(false);
  useHideTabBar(target !== null);

  const close = () => {
    setDirty(false);
    onClose();
  };
  const requestClose = () => {
    if (!dirty) {
      close();
      return;
    }
    NativeAlert.alert(t("notes__discard_title"), t("notes__discard_body"), [
      { text: t("notes__keep_editing"), style: "cancel" },
      { text: t("notes__discard_changes"), style: "destructive", onPress: close },
    ]);
  };

  // Android back closes the composer (asking first when there is unsaved text).
  const open = target !== null;
  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      requestCloseRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [open]);

  if (!target) return null;
  return (
    <View className="absolute inset-0" accessibilityViewIsModal>
      <Animated.View entering={BACKDROP_IN} exiting={BACKDROP_OUT} className="absolute inset-0">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common__close")}
          onPress={requestClose}
          className="flex-1 bg-backdrop"
        />
      </Animated.View>
      <KeyboardStickyView style={STICKY}>
        <Animated.View entering={ENTER} exiting={EXIT}>
          <NoteEditor
            // A new key per opening, so each one starts a fresh draft.
            key={target.kind === "edit" ? target.note.id : "new"}
            note={target.kind === "edit" ? target.note : null}
            onDirtyChange={setDirty}
            onCancel={requestClose}
            onDone={close}
            onCreate={onCreate}
            onSave={onSave}
          />
        </Animated.View>
      </KeyboardStickyView>
    </View>
  );
}

function NoteEditor({
  note,
  onDirtyChange,
  onCancel,
  onDone,
  onCreate,
  onSave,
}: {
  note: LocalNote | null;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onDone: () => void;
  onCreate: (values: NoteValues) => Promise<void>;
  onSave: (input: { id: string } & NotePatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [muted, foreground] = useThemeColor(["muted", "foreground"]);
  const live = useLiveNote(note?.id ?? null);
  const [draft, setDraft] = useState(() => startDraft(note ?? EMPTY));
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<TextInput>(null);
  const dirty = isDraftDirty(draft);
  const keyboard = useReanimatedKeyboardAnimation();

  useEffect(() => {
    if (note && live !== undefined) setDraft((current) => applyLatest(current, live));
  }, [note, live]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // Over the home indicator when the keyboard is down; snug on the keyboard when it is up.
  const padStyle = useAnimatedStyle(() => ({
    paddingBottom: interpolate(keyboard.progress.value, [0, 1], [insets.bottom + 12, 12]),
  }));

  async function run(action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
      haptic.confirm();
      onDone();
    } catch {
      // The global handler reports the error; keep the text for another try.
    } finally {
      setSaving(false);
    }
  }

  const values = { title: draft.values.title.trim(), body: draft.values.body };
  const titleBlank = values.title === "";

  function save() {
    if (!note || draft.deleted) {
      void run(() => onCreate(values));
      return;
    }
    const patch = draftPatch(draft);
    const trimmed = patch.title === undefined ? patch : { ...patch, title: patch.title.trim() };
    void run(() =>
      Object.keys(trimmed).length === 0 ? Promise.resolve() : onSave({ id: note.id, ...trimmed }),
    );
  }

  return (
    <Animated.View
      className="gap-3 rounded-t-[28px] border-t border-separator bg-overlay px-5 pt-4 shadow-overlay"
      style={padStyle}
    >
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="font-semibold text-title-lg text-foreground">
          {note ? t("notes__edit_title") : t("notes__new")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common__close")}
          onPress={onCancel}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full bg-default"
        >
          <X size={16} color={foreground} weight="bold" />
        </Pressable>
      </View>

      {draft.deleted ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t("notes__deleted_title")}</Alert.Title>
            <Alert.Description>{t("notes__deleted_body")}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <View className="gap-1 rounded-2xl bg-default px-4 py-3">
        <TextInput
          // Focused on mount for a new note, so the keyboard opens with the composer.
          autoFocus={note === null}
          accessibilityLabel={t("notes__field_title")}
          placeholder={t("notes__field_title")}
          placeholderTextColor={muted}
          value={draft.values.title}
          onChangeText={(value) => setDraft(editDraft(draft, "title", value))}
          maxLength={NOTE_TITLE_MAX}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => bodyRef.current?.focus()}
          className="py-1 font-semibold text-title-md text-foreground"
        />
        <TextInput
          ref={bodyRef}
          accessibilityLabel={t("notes__field_body")}
          placeholder={t("notes__body_placeholder")}
          placeholderTextColor={muted}
          value={draft.values.body}
          onChangeText={(value) => setDraft(editDraft(draft, "body", value))}
          maxLength={NOTE_BODY_MAX}
          multiline
          textAlignVertical="top"
          className="max-h-48 min-h-24 py-1 text-body-lg text-foreground"
        />
      </View>

      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-caption tabular-nums text-muted">
          {t("notes__characters", { length: draft.values.body.length, max: NOTE_BODY_MAX })}
        </Text>
        <Button
          isDisabled={saving || titleBlank || (note !== null && !draft.deleted && !dirty)}
          onPress={save}
        >
          {saving ? <Spinner size="sm" /> : null}
          <Button.Label>
            {note === null
              ? t("notes__add")
              : draft.deleted
                ? t("notes__save_as_new")
                : t("common__save")}
          </Button.Label>
        </Button>
      </View>
    </Animated.View>
  );
}
