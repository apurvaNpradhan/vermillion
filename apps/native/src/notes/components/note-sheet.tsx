import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
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
import { Alert, BottomSheet, Spinner, useThemeColor } from "heroui-native";
import { X } from "phosphor-react-native";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Alert as NativeAlert, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

import { useLiveNote } from "../use-notes";

const TextInput = withUniwind(BottomSheetTextInput);

/** What the sheet is open for: a new note, or editing one from the list. */
export type NoteSheetTarget = { kind: "new" } | { kind: "edit"; note: LocalNote };

const EMPTY: NoteValues = { title: "", body: "" };

/**
 * One sheet for writing a note, new or existing (ADR 0019 for editing). Borderless title and
 * body fields, the sheet rising with the keyboard so Save stays above it. Closing with unsaved
 * text asks first; swiping the sheet down is turned off while there is any.
 */
export function NoteSheet({
  target,
  onClose,
  onCreate,
  onSave,
}: {
  target: NoteSheetTarget | null;
  onClose: () => void;
  onCreate: (values: NoteValues) => Promise<void>;
  onSave: (input: { id: string } & NotePatch) => Promise<void>;
}) {
  const { bottom } = useSafeAreaInsets();
  const [dirty, setDirty] = useState(false);
  const [opened, setOpened] = useState(false);
  // The last target stays rendered while the sheet slides away, instead of blanking mid-close.
  const [shown, setShown] = useState(target);
  if (target !== null && target !== shown) setShown(target);
  const { t } = useTranslation();

  // Closing clears `dirty` first, so the sheet's own close event does not ask a second time.
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

  return (
    <BottomSheet
      isOpen={target !== null}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay isCloseOnPress={false} onPress={requestClose} />
        <BottomSheet.Content
          animationConfigs={SHEET_SPRING}
          onChange={(index) => setOpened(index >= 0)}
          enablePanDownToClose={!dirty}
          // "interactive" follows the keyboard on both platforms; "extend" never moved on Android.
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-3 px-5 pt-1"
          contentContainerProps={{ style: { paddingBottom: bottom + 12 } }}
        >
          {shown ? (
            <NoteEditor
              opened={opened}
              // A new key per opening, so each one starts a fresh draft.
              key={shown.kind === "edit" ? shown.note.id : "new"}
              note={shown.kind === "edit" ? shown.note : null}
              onDirtyChange={setDirty}
              onCancel={requestClose}
              onDone={close}
              onCreate={onCreate}
              onSave={onSave}
            />
          ) : null}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function NoteEditor({
  note,
  opened,
  onDirtyChange,
  onCancel,
  onDone,
  onCreate,
  onSave,
}: {
  note: LocalNote | null;
  /** The sheet has finished opening. */
  opened: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onDone: () => void;
  onCreate: (values: NoteValues) => Promise<void>;
  onSave: (input: { id: string } & NotePatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [muted, foreground] = useThemeColor(["muted", "foreground"]);
  const live = useLiveNote(note?.id ?? null);
  const [draft, setDraft] = useState(() => startDraft(note ?? EMPTY));
  const [saving, setSaving] = useState(false);
  const dirty = isDraftDirty(draft);
  const titleRef = useRef<ComponentRef<typeof BottomSheetTextInput>>(null);

  // A new note starts in the title once the sheet has risen: a keyboard that opens while the
  // sheet is still mounting covers it instead of lifting it.
  useEffect(() => {
    if (!note && opened) titleRef.current?.focus();
  }, [note, opened]);

  useEffect(() => {
    if (note && live !== undefined) setDraft((current) => applyLatest(current, live));
  }, [note, live]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

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
    <>
      <View className="flex-row items-center justify-between">
        <BottomSheet.Title className="font-semibold text-title-lg">
          {note ? t("notes__edit_title") : t("notes__new")}
        </BottomSheet.Title>
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
          accessibilityLabel={t("notes__field_title")}
          placeholder={t("notes__field_title")}
          placeholderTextColor={muted}
          value={draft.values.title}
          onChangeText={(value) => setDraft(editDraft(draft, "title", value))}
          maxLength={NOTE_TITLE_MAX}
          ref={titleRef}
          returnKeyType="next"
          submitBehavior="submit"
          className="py-1 font-semibold text-title-md text-foreground"
        />
        <TextInput
          accessibilityLabel={t("notes__field_body")}
          placeholder={t("notes__body_placeholder")}
          placeholderTextColor={muted}
          value={draft.values.body}
          onChangeText={(value) => setDraft(editDraft(draft, "body", value))}
          maxLength={NOTE_BODY_MAX}
          multiline
          textAlignVertical="top"
          className="max-h-60 min-h-28 py-1 text-body-lg text-foreground"
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
    </>
  );
}
