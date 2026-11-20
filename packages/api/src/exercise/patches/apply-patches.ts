import { createHash } from "node:crypto";

import type { Database, Transaction } from "@workspace/db";
import { log } from "@workspace/logger";
import { compareVersions, hasValidDetails, hasValidSecondaryMuscles } from "@workspace/shared";
import { eq, inArray, isNull, sql } from "drizzle-orm";

import { readSetting } from "../../platform/settings/settings";
import { exerciseTypeLocked } from "../operations/exercise-type-locked";
import { catalogRowValues } from "../operations/seed-catalog";
import { exercise, referenceImport } from "../tables";
import { bundledPatches } from "./bundled-patches";
import {
  CatalogPatchError,
  parsePatchFile,
  type PatchChange,
  type PatchFile,
  type PatchFill,
} from "./patch-file";

/** A patch file as the server holds it: its name (`NNNN-<name>.json`) and its text. */
export type PatchSource = { name: string; text: string };

export type PatchOutcome = {
  file: string;
  status: "applied" | "unchanged" | "waiting";
  inserted: number;
  /** Rows that had at least one empty field filled. */
  filled: number;
  /** Changes applied. */
  changed: number;
  /** Changes whose `from` no longer matched (or whose exercise type is locked): `id:field`. */
  skippedChanges: string[];
  /** Rows whose detail fills were dropped with a skipped change. */
  skippedFills: string[];
};

/** Serialises two servers applying patches at once (a rolling deploy overlaps them). */
const PATCH_LOCK_KEYS = [0x65786572, 2] as const;
const BATCH = 200;
const KEY_PREFIX = "patch:";

type Row = typeof exercise.$inferSelect;
type Values = Pick<
  Row,
  | "title"
  | "primaryMuscle"
  | "secondaryMuscles"
  | "primaryDetail"
  | "secondaryDetail"
  | "equipment"
  | "exerciseType"
  | "rank"
  | "searchTerms"
  | "aka"
  | "instructions"
  | "videoKey"
  | "thumbnailKey"
>;

function valuesOf(row: Row): Values {
  return {
    title: row.title,
    primaryMuscle: row.primaryMuscle,
    secondaryMuscles: [...row.secondaryMuscles],
    primaryDetail: [...row.primaryDetail],
    secondaryDetail: [...row.secondaryDetail],
    equipment: row.equipment,
    exerciseType: row.exerciseType,
    rank: row.rank,
    searchTerms: row.searchTerms,
    aka: row.aka,
    instructions: row.instructions,
    videoKey: row.videoKey,
    thumbnailKey: row.thumbnailKey,
  };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

/** Applies one change when the row still holds `from`; false when it does not. */
function applyChange(next: Values, change: PatchChange): boolean {
  switch (change.field) {
    case "equipment":
      if (next.equipment !== change.from) return false;
      next.equipment = change.to;
      return true;
    case "primary_muscle":
      if (next.primaryMuscle !== change.from) return false;
      next.primaryMuscle = change.to;
      return true;
    case "secondary_muscles":
      if (!sameSet(next.secondaryMuscles, change.from)) return false;
      next.secondaryMuscles = change.to;
      return true;
    case "rank":
      if (next.rank !== change.from) return false;
      next.rank = change.to;
      return true;
    case "exercise_type":
      if (next.exerciseType !== change.from) return false;
      next.exerciseType = change.to;
      return true;
    case "title":
      if (next.title !== change.from) return false;
      next.title = change.to;
      return true;
    case "thumbnail_key":
      if (next.thumbnailKey !== change.from) return false;
      next.thumbnailKey = change.to;
      return true;
    case "video_key":
      if (next.videoKey !== change.from) return false;
      next.videoKey = change.to;
      return true;
  }
}

const isEmptyText = (value: string | null) => value === null || value === "";

/** Fills the empty fields among the muscle ones (groups and details); true if any was set. */
function fillMuscles(next: Values, fill: PatchFill): boolean {
  let any = false;
  if (fill.secondary_muscles && next.secondaryMuscles.length === 0) {
    next.secondaryMuscles = fill.secondary_muscles;
    any = true;
  }
  if (fill.primary_detail && next.primaryDetail.length === 0) {
    next.primaryDetail = fill.primary_detail;
    any = true;
  }
  if (fill.secondary_detail && next.secondaryDetail.length === 0) {
    next.secondaryDetail = fill.secondary_detail;
    any = true;
  }
  return any;
}

/** Fills the other empty fields (`null`, `''` or `rank = 0`); true if any was set. */
function fillPlain(next: Values, fill: PatchFill): boolean {
  let any = false;
  if (fill.rank !== undefined && next.rank === 0) {
    next.rank = fill.rank;
    any = true;
  }
  if (fill.search_terms !== undefined && isEmptyText(next.searchTerms)) {
    next.searchTerms = fill.search_terms;
    any = true;
  }
  if (fill.aka !== undefined && isEmptyText(next.aka)) {
    next.aka = fill.aka;
    any = true;
  }
  if (fill.instructions !== undefined && isEmptyText(next.instructions)) {
    next.instructions = fill.instructions;
    any = true;
  }
  if (fill.thumbnail_key !== undefined && isEmptyText(next.thumbnailKey)) {
    next.thumbnailKey = fill.thumbnail_key;
    any = true;
  }
  if (fill.video_key !== undefined && isEmptyText(next.videoKey)) {
    next.videoKey = fill.video_key;
    any = true;
  }
  return any;
}

function musclesValid(values: Values): boolean {
  const rule = {
    primary_muscle: values.primaryMuscle,
    secondary_muscles: values.secondaryMuscles,
    primary_detail: values.primaryDetail,
    secondary_detail: values.secondaryDetail,
  };
  return hasValidSecondaryMuscles(rule) && hasValidDetails(rule);
}

type Planned = { id: string; next: Values; changed: number; filled: boolean };

type Plan = {
  inserts: ReturnType<typeof catalogRowValues>[];
  updates: Planned[];
  skippedChanges: string[];
  skippedFills: string[];
};

function fingerprintOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Validates one file against the database and works out what to write, without writing. Throws a
 * `CatalogPatchError` for anything wrong with the file, so a bad file writes nothing.
 */
async function plan(tx: Transaction, name: string, file: PatchFile): Promise<Plan> {
  const fail = (message: string): never => {
    throw new CatalogPatchError(`patch ${name}: ${message}`);
  };
  const catalog = await tx.select().from(exercise).where(isNull(exercise.userId));
  const byId = new Map(catalog.map((row) => [row.id, row]));

  // Inserts: new ids, valid rows.
  const insertIds = file.insert.map((row) => row.id);
  if (new Set(insertIds).size !== insertIds.length) fail("duplicate ids in insert");
  if (insertIds.length > 0) {
    const taken = await tx
      .select({ id: exercise.id })
      .from(exercise)
      .where(inArray(exercise.id, insertIds));
    if (taken.length > 0) fail(`insert id already exists: ${taken[0]?.id}`);
  }
  for (const row of file.insert) {
    if (!hasValidSecondaryMuscles(row)) fail(`insert ${row.id}: bad secondary muscles`);
    if (!hasValidDetails(row)) fail(`insert ${row.id}: bad muscle details`);
    if (row.video_key !== null && row.thumbnail_key === null) {
      fail(`insert ${row.id}: a video without a thumbnail`);
    }
  }

  // Fills and changes: existing catalog rows only.
  for (const entry of [...file.fill, ...file.change]) {
    if (!byId.has(entry.id)) fail(`${entry.id} is not a catalog exercise`);
  }
  const touched = [...new Set([...file.change.map((c) => c.id), ...file.fill.map((f) => f.id)])];

  const skippedChanges: string[] = [];
  const skippedFills: string[] = [];
  const updates: Planned[] = [];
  for (const id of touched) {
    const current = byId.get(id);
    if (!current) continue;
    const next = valuesOf(current);
    let changed = 0;
    let skippedHere = false;
    for (const change of file.change.filter((entry) => entry.id === id)) {
      const locked =
        change.field === "exercise_type" &&
        next.exerciseType === change.from &&
        (await exerciseTypeLocked(tx, id));
      if (!locked && applyChange(next, change)) {
        changed += 1;
      } else {
        skippedChanges.push(`${id}:${change.field}`);
        skippedHere = true;
      }
    }
    if (!musclesValid(next)) fail(`${id}: the changes leave bad muscles or details`);

    let filled = false;
    for (const fill of file.fill.filter((entry) => entry.id === id)) {
      const trial = { ...next, secondaryMuscles: [...next.secondaryMuscles] };
      if (fillMuscles(trial, fill)) {
        if (musclesValid(trial)) {
          Object.assign(next, trial);
          filled = true;
        } else if (skippedHere) {
          // The fill was written for the changed value; leave it with the skipped change.
          skippedFills.push(id);
        } else {
          fail(`${id}: the fill leaves bad muscles or details`);
        }
      }
      if (fillPlain(next, fill)) filled = true;
    }
    if (next.videoKey !== null && next.thumbnailKey === null) {
      fail(`${id}: a video without a thumbnail`);
    }
    if (changed > 0 || filled) updates.push({ id, next, changed, filled });
  }

  // Titles stay unique: exactly across the catalog, ignoring case among live rows.
  const finalTitle = new Map(catalog.map((row) => [row.id, row.title]));
  const live = new Set(catalog.filter((row) => row.retiredAt === null).map((row) => row.id));
  for (const update of updates) finalTitle.set(update.id, update.next.title);
  for (const row of file.insert) {
    finalTitle.set(row.id, row.title);
    if (!row.retired) live.add(row.id);
  }
  const exact = new Set<string>();
  const lower = new Set<string>();
  for (const [id, title] of finalTitle) {
    if (exact.has(title)) fail(`the title "${title}" would repeat`);
    exact.add(title);
    if (!live.has(id)) continue;
    if (lower.has(title.toLowerCase())) fail(`the title "${title}" would repeat`);
    lower.add(title.toLowerCase());
  }

  const now = new Date();
  return {
    inserts: file.insert.map((row) => catalogRowValues(row, now)),
    updates,
    skippedChanges,
    skippedFills: [...new Set(skippedFills)],
  };
}

export type ApplyPatchesOptions = {
  /** Hold a file that needs a newer app than `minimum_app_version` until the minimum reaches it. */
  gate: boolean;
  /** The patch files in name order; the server passes the bundled ones. */
  files: readonly PatchSource[];
};

/**
 * Applies Catalog patches (ADR 0050) in name order. A file already recorded in `reference_import`
 * (`patch:<name>`, its SHA-256) is skipped; a recorded file whose bytes changed is an error, since
 * an applied patch is immutable. Each file is one transaction: validate, insert, fill, change,
 * record, so a bad file writes nothing. With the gate on, a file needing an app version above the
 * minimum waits, and so does every file after it (a later one may depend on it).
 */
export async function applyCatalogPatches(
  db: Database,
  options: ApplyPatchesOptions,
): Promise<PatchOutcome[]> {
  const files = options.files.toSorted((a, b) => a.name.localeCompare(b.name));
  const outcomes: PatchOutcome[] = [];
  let waiting = false;
  for (const source of files) {
    const outcome = waiting
      ? emptyOutcome(source.name, "waiting")
      : await applyOne(db, source, options.gate);
    if (outcome.status === "waiting") waiting = true;
    outcomes.push(outcome);
    if (outcome.status === "waiting") {
      log.info({ action: "exercise.catalog.patch_waiting", file: source.name });
    } else if (outcome.status === "applied") {
      log.info({
        action: "exercise.catalog.patch",
        file: outcome.file,
        inserted: outcome.inserted,
        filled: outcome.filled,
        changed: outcome.changed,
        skippedChanges: outcome.skippedChanges,
        skippedFills: outcome.skippedFills,
      });
    }
  }
  return outcomes;
}

function emptyOutcome(file: string, status: PatchOutcome["status"]): PatchOutcome {
  return {
    file,
    status,
    inserted: 0,
    filled: 0,
    changed: 0,
    skippedChanges: [],
    skippedFills: [],
  };
}

async function applyOne(db: Database, source: PatchSource, gate: boolean): Promise<PatchOutcome> {
  const fingerprint = fingerprintOf(source.text);
  const key = `${KEY_PREFIX}${source.name}`;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${PATCH_LOCK_KEYS[0]}, ${PATCH_LOCK_KEYS[1]})`,
    );
    const [recorded] = await tx
      .select({ fingerprint: referenceImport.fingerprint })
      .from(referenceImport)
      .where(eq(referenceImport.catalog, key))
      .limit(1);
    if (recorded) {
      if (recorded.fingerprint !== fingerprint) {
        throw new CatalogPatchError(
          `patch ${source.name} changed after it was applied; write a new patch file instead`,
        );
      }
      return emptyOutcome(source.name, "unchanged");
    }

    const file = parsePatchFile(source.name, source.text);
    if (gate && file.requires_app_version) {
      const minimum = await readSetting(tx, "minimum_app_version");
      const reached =
        minimum !== null && (compareVersions(minimum, file.requires_app_version) ?? -1) >= 0;
      if (!reached) return emptyOutcome(source.name, "waiting");
    }

    const planned = await plan(tx, source.name, file);
    for (let offset = 0; offset < planned.inserts.length; offset += BATCH) {
      await tx.insert(exercise).values(planned.inserts.slice(offset, offset + BATCH));
    }
    const now = new Date();
    for (const update of planned.updates) {
      await tx
        .update(exercise)
        .set({ ...update.next, updatedAt: now })
        .where(eq(exercise.id, update.id));
    }
    await tx.insert(referenceImport).values({ catalog: key, fingerprint, importedAt: now });
    return {
      file: source.name,
      status: "applied",
      inserted: planned.inserts.length,
      filled: planned.updates.filter((update) => update.filled).length,
      changed: planned.updates.reduce((total, update) => total + update.changed, 0),
      skippedChanges: planned.skippedChanges,
      skippedFills: planned.skippedFills,
    };
  });
}

/**
 * The server's entry: the committed patches (or `files`, which tests pass), after the seed and after a minimum-version change.
 * A refused patch is logged and never stops the server or the release procedure.
 */
export async function applyBundledPatches(
  db: Database,
  options: { gate: boolean; files?: readonly PatchSource[] | undefined },
): Promise<void> {
  try {
    await applyCatalogPatches(db, { gate: options.gate, files: options.files ?? bundledPatches() });
  } catch (error) {
    log.error({
      action: "exercise.catalog.patch_failed",
      message: error instanceof Error ? error.message : "Catalog patch failed",
    });
  }
}
