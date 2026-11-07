import type { LocalNote, NotePatch, NoteValues } from "./store";

/**
 * An open edit form (ADR 0019). `baseline` is what each field held when the user started editing
 * it; `values` is what the form shows. Intent is the difference between the two, never a
 * comparison with the newest replicated row.
 */
export type NoteDraft = {
  baseline: NoteValues;
  values: NoteValues;
  /** The note was deleted (here or on another device) while the form was open. */
  deleted: boolean;
};

const FIELDS = ["title", "body"] as const;
type Field = (typeof FIELDS)[number];

export function startDraft(note: NoteValues): NoteDraft {
  const values = { title: note.title, body: note.body };
  return { baseline: { ...values }, values, deleted: false };
}

export function editDraft(draft: NoteDraft, field: Field, value: string): NoteDraft {
  return { ...draft, values: { ...draft.values, [field]: value } };
}

/** The fields the user changed since the edit started: exactly what an update may send. */
export function draftPatch(draft: NoteDraft): NotePatch {
  return {
    ...(draft.values.title !== draft.baseline.title ? { title: draft.values.title } : {}),
    ...(draft.values.body !== draft.baseline.body ? { body: draft.values.body } : {}),
  };
}

export function isDraftDirty(draft: NoteDraft): boolean {
  return Object.keys(draftPatch(draft)).length > 0;
}

/**
 * The saved row changed while the form is open. Untouched fields follow the row (and their
 * baseline moves with them); edited fields keep the user's text and the original baseline, so a
 * later save still sends only what the user changed. `null` means the row is gone.
 */
export function applyLatest(draft: NoteDraft, latest: LocalNote | null): NoteDraft {
  if (latest === null) return { ...draft, deleted: true };
  const baseline = { ...draft.baseline };
  const values = { ...draft.values };
  for (const field of FIELDS) {
    if (draft.values[field] === draft.baseline[field]) {
      baseline[field] = latest[field];
      values[field] = latest[field];
    }
  }
  return { baseline, values, deleted: false };
}
