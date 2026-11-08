import { NOTE_BODY_MAX, NOTE_TITLE_MAX } from "@workspace/shared";

/** Field caps of a note. Postgres CHECK constraints and the zod schemas both use them. */
export const TITLE_MAX = NOTE_TITLE_MAX;
export const BODY_MAX = NOTE_BODY_MAX;
