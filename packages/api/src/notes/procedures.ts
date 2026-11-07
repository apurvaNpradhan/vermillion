import { openapi } from "@orpc/openapi";
import { z } from "zod";

import { authed } from "../platform/orpc/base";
import { rateLimit } from "../platform/orpc/rate-limit";
import { createNote } from "./operations/create-note";
import { deleteNote } from "./operations/delete-note";
import { getNote } from "./operations/get-note";
import { listNotes } from "./operations/list-notes";
import { BODY_MAX, noteSchema, TITLE_MAX } from "./operations/note";
import { updateNote } from "./operations/update-note";

const title = z.string().trim().min(1).max(TITLE_MAX);
const body = z.string().max(BODY_MAX);
const noteId = z.object({ id: z.uuid() });

const notesApi = authed.meta(openapi({ tags: ["Notes"] }));

const list = notesApi
  .meta(
    openapi({
      method: "GET",
      path: "/notes",
      summary: "List notes",
      description: "Your notes, in storage order.",
    }),
  )
  .output(z.array(noteSchema))
  .handler(({ context }) => listNotes(context.services.db, context.userId));

const get = notesApi
  .meta(
    openapi({
      method: "GET",
      path: "/notes/{id}",
      summary: "Get a note",
      description: "A note owned by someone else answers 404, not 403.",
    }),
  )
  .input(noteId)
  .output(noteSchema)
  .handler(async ({ context, input, errors }) => {
    const note = await getNote(context.services.db, context.userId, input.id);
    if (!note) throw errors.NOT_FOUND();
    return note;
  });

const create = notesApi
  .meta(openapi({ method: "POST", path: "/notes", summary: "Create a note", successStatus: 201 }))
  .use(rateLimit({ name: "notes.create", windowMs: 60_000, max: 60 }))
  .input(z.object({ title, body: body.default("") }))
  .output(noteSchema)
  .handler(({ context, input }) => createNote(context.services.db, context.userId, input));

const update = notesApi
  .meta(
    openapi({
      method: "PATCH",
      path: "/notes/{id}",
      summary: "Update a note",
      description: "Send only the fields to change.",
    }),
  )
  .use(rateLimit({ name: "notes.update", windowMs: 60_000, max: 120 }))
  .input(noteId.extend({ title: title.optional(), body: body.optional() }))
  .output(noteSchema)
  .handler(async ({ context, input, errors }) => {
    const { id, ...patch } = input;
    const note = await updateNote(context.services.db, context.userId, id, patch);
    if (!note) throw errors.NOT_FOUND();
    return note;
  });

const remove = notesApi
  .meta(openapi({ method: "DELETE", path: "/notes/{id}", summary: "Delete a note" }))
  .use(rateLimit({ name: "notes.delete", windowMs: 60_000, max: 60 }))
  .input(noteId)
  .output(z.object({ success: z.literal(true) }))
  .handler(async ({ context, input, errors }) => {
    if (!(await deleteNote(context.services.db, context.userId, input.id)))
      throw errors.NOT_FOUND();
    return { success: true as const };
  });

export const notesRouter = { list, get, create, update, delete: remove };
