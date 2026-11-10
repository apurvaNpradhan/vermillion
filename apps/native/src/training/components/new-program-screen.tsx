import { TRAINING_LIMITS } from "@workspace/shared";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { useHideTabBar } from "@/platform/navigation/tab-action";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";

import { useProgramActions } from "../use-program-actions";
import { SheetFrame } from "./sheet-frame";

/** New program: a title and nothing else; the Program screen takes over to build the Rotation. */
export function NewProgramScreen({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** The Program exists: open it in place of this sheet. */
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const actions = useProgramActions();
  useHideTabBar(true);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = title.trim() !== "" && !busy;

  const create = async () => {
    if (!ready) return;
    setBusy(true);
    const id = await actions.create(title);
    setBusy(false);
    if (id) onCreated(id);
  };

  return (
    <SheetFrame title={t("training__new_program")} onClose={onClose}>
      <Field
        label={t("training__name_label")}
        value={title}
        onChangeText={setTitle}
        placeholder={t("training__program_name_placeholder")}
        maxLength={TRAINING_LIMITS.titleMax}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void create()}
      />
      <Button variant="primary" isDisabled={!ready} onPress={() => void create()}>
        <Button.Label>{t("training__create")}</Button.Label>
      </Button>
    </SheetFrame>
  );
}
