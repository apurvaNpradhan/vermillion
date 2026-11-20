import { isNetworkError } from "@workspace/client/network-error";
import {
  createCsvReader,
  createDuplicateFinder,
  createExerciseMatcher,
  createHistoryBuilder,
  detectDelimiter,
  planSession,
  wallClockToIso,
  type ImportFormat,
  type LibraryEntry,
  type ParsedHistory,
  type PlannedImportSession,
  type WeightUnit,
} from "@workspace/shared";
import {
  createCustomExercise,
  importSessionBatch,
  newImportBatchId,
  readKnownSessions,
  readMatchingLibrary,
  undoImportChunk,
  watchImportedSessions,
} from "@workspace/sync";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePickExercises } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { usePreferences } from "@/preferences";
import { useLocalData, useSyncValue } from "@/sync";

import { batchSessions, countSets } from "./import-batches";
import {
  NEW_EXERCISE_PREFIX,
  collectNames,
  createResolver,
  matchNames,
  newExerciseInput,
  type NameMatch,
  type NameUse,
  type Resolution,
} from "./import-names";
import type { ImportReceipt } from "./import-receipt";
import { clearReceipt, readReceipt, saveReceipt } from "./receipt-storage";

const READ_SLICE = 1500;
const PLAN_SLICE = 100;
const WRITE_SESSIONS = 25;
const WRITE_SETS = 600;
const UNDO_SESSIONS = 50;
/** A day each way around the file's dates when looking for Sessions already in the app. */
const KNOWN_MARGIN_MS = 86_400_000;

export type FailReason =
  | "unreadable"
  | "unknown_format"
  | "empty"
  | "import_failed"
  | "undo_failed";

export type ImportStep =
  | { kind: "idle" }
  | { kind: "reading"; progress: number }
  | { kind: "preview" }
  | { kind: "importing"; progress: number }
  | { kind: "undoing"; progress: number }
  | { kind: "done" }
  | { kind: "failed"; reason: FailReason };

/** What the preview says the import would do with the current choices. */
export type ImportSummary = {
  planning: boolean;
  /** Workouts that would be written. */
  sessions: number;
  sets: number;
  /** Workouts already in the app, skipped. */
  duplicates: number;
  /** Workouts with no usable set, or outside the last 10 years. */
  skippedOther: number;
  /** Custom exercises the import would create. */
  creating: number;
};

type Loaded = {
  fileName: string;
  history: ParsedHistory;
  matches: NameMatch[];
  library: Map<string, LibraryEntry>;
  from: string | null;
  to: string | null;
};

export type UnmatchedExercise = {
  key: string;
  name: string;
  sets: number;
  sessions: number;
  resolution: Resolution;
};

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const EMPTY_SUMMARY: ImportSummary = {
  planning: true,
  sessions: 0,
  sets: 0,
  duplicates: 0,
  skippedOther: 0,
  creating: 0,
};

/**
 * The history import (Strong and Hevy CSV): pick a file, read it in slices, match exercise names
 * to the library, preview what would be written, write it in batches, and undo it. Everything
 * works on the local database, so it needs no connection; the sessions upload as usual.
 */
export function useHistoryImport() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const writeScope = useSyncValue((snapshot) => snapshot?.writeScope ?? "");
  const { preferences } = usePreferences();
  const pickExercises = usePickExercises("session");
  const database = local?.status === "ready" ? local.database : null;

  const [step, setStep] = useState<ImportStep>({ kind: "idle" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [unit, setUnit] = useState<WeightUnit>(preferences.ui.weightUnit);
  const [unitFromFile, setUnitFromFile] = useState(false);
  const [resolutions, setResolutions] = useState<ReadonlyMap<string, Resolution>>(new Map());
  const [summary, setSummary] = useState<ImportSummary>(EMPTY_SUMMARY);
  const [receipt, setReceipt] = useState<ImportReceipt | null>(() => readReceipt());
  const planned = useRef<PlannedImportSession[]>([]);
  const planRun = useRef(0);
  const busy = useRef(false);

  // ---- Planning: what the file would write, given the unit and the choices ----

  useEffect(() => {
    if (!loaded || step.kind !== "preview" || !database) return;
    planRun.current += 1;
    const run = planRun.current;
    setSummary((previous) => ({ ...previous, planning: true }));
    void (async () => {
      const resolve = createResolver(loaded.matches, resolutions);
      const sessions = loaded.history.sessions;
      const first = loaded.from ? Date.parse(loaded.from) : Date.now();
      const last = loaded.to ? Date.parse(loaded.to) : Date.now();
      const known = await readKnownSessions(database, {
        from: new Date(first - KNOWN_MARGIN_MS).toISOString(),
        to: new Date(last + KNOWN_MARGIN_MS).toISOString(),
      });
      const isDuplicate = createDuplicateFinder(known);
      const fallbackTitle = t("import__untitled");
      const next: PlannedImportSession[] = [];
      let duplicates = 0;
      let skippedOther = 0;
      for (let at = 0; at < sessions.length; at += PLAN_SLICE) {
        if (run !== planRun.current) return;
        for (const imported of sessions.slice(at, at + PLAN_SLICE)) {
          const outcome = planSession(imported, resolve, unit, fallbackTitle);
          if (outcome.kind !== "planned") skippedOther += 1;
          else if (isDuplicate(outcome.session)) duplicates += 1;
          else next.push(outcome.session);
        }
        await yieldToUi();
      }
      if (run !== planRun.current) return;
      planned.current = next;
      const creating = new Set(
        next.flatMap((session) =>
          session.exercises
            .filter((entry) => entry.exerciseId.startsWith(NEW_EXERCISE_PREFIX))
            .map((entry) => entry.exerciseId),
        ),
      );
      setSummary({
        planning: false,
        sessions: next.length,
        sets: countSets(next),
        duplicates,
        skippedOther,
        creating: creating.size,
      });
    })().catch(() => {
      if (run === planRun.current) setStep({ kind: "failed", reason: "unreadable" });
    });
  }, [loaded, unit, resolutions, step.kind, database, t]);

  // ---- Choosing and reading a file ----

  const pickFile = useCallback(async () => {
    if (busy.current || !database) return;
    busy.current = true;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/csv", "text/plain", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      const asset = picked.canceled ? undefined : picked.assets[0];
      if (!asset) return;
      setStep({ kind: "reading", progress: 0 });
      await yieldToUi();
      const text = await new File(asset.uri).text();
      const delimiter = detectDelimiter(text.replace(/^﻿/u, ""));
      const reader = createCsvReader(text, delimiter);
      const [header] = reader.readRows(1);
      const created = header ? createHistoryBuilder(header, delimiter) : null;
      if (!created?.ok) {
        setStep({ kind: "failed", reason: header ? "unknown_format" : "empty" });
        return;
      }
      const { builder } = created;
      while (!reader.done()) {
        builder.addRows(reader.readRows(READ_SLICE));
        setStep({ kind: "reading", progress: reader.progress() });
        await yieldToUi();
      }
      const history = builder.finish();
      if (history.sessions.length === 0) {
        setStep({ kind: "failed", reason: "empty" });
        return;
      }
      const libraryEntries = await readMatchingLibrary(database);
      const library = new Map(libraryEntries.map((entry) => [entry.id, entry]));
      const matches = matchNames(
        collectNames(history.sessions),
        createExerciseMatcher(libraryEntries),
        library,
      );
      const firstSession = history.sessions[0];
      const lastSession = history.sessions.at(-1);
      setLoaded({
        fileName: asset.name,
        history,
        matches,
        library,
        from: firstSession ? wallClockToIso(firstSession.start) : null,
        to: lastSession ? wallClockToIso(lastSession.start) : null,
      });
      setUnit(history.weightUnit ?? preferences.ui.weightUnit);
      setUnitFromFile(history.weightUnit !== null);
      setResolutions(new Map());
      setSummary(EMPTY_SUMMARY);
      setStep({ kind: "preview" });
    } catch {
      setStep({ kind: "failed", reason: "unreadable" });
    } finally {
      busy.current = false;
    }
  }, [database, preferences.ui.weightUnit]);

  // ---- Matching names ----

  const unmatched = useMemo<UnmatchedExercise[]>(
    () =>
      (loaded?.matches ?? [])
        .filter((match) => match.matched === null)
        .map(({ use }) => ({
          key: use.key,
          name: use.name,
          sets: use.sets,
          sessions: use.sessions,
          resolution: resolutions.get(use.key) ?? { kind: "create" },
        })),
    [loaded, resolutions],
  );
  const matchedCount = (loaded?.matches.length ?? 0) - unmatched.length;

  const setResolution = useCallback((key: string, resolution: Resolution) => {
    setResolutions((previous) => new Map(previous).set(key, resolution));
  }, []);

  /** Maps one name from the file to an exercise the user picks from the library. */
  const mapName = useCallback(
    async (key: string) => {
      if (!database || !loaded) return;
      const ids = await pickExercises({ max: 1 });
      const id = ids?.[0];
      if (!id) return;
      let entry = loaded.library.get(id);
      if (!entry) {
        // Created from inside the picker: it is not in the list read when the file was opened.
        const fresh = await readMatchingLibrary(database);
        entry = fresh.find((candidate) => candidate.id === id);
        for (const candidate of fresh) loaded.library.set(candidate.id, candidate);
      }
      if (!entry) return;
      setResolution(key, {
        kind: "mapped",
        target: { exerciseId: entry.id, title: entry.title, type: entry.exerciseType },
      });
    },
    [database, loaded, pickExercises, setResolution],
  );

  // ---- Writing ----

  const startImport = useCallback(async () => {
    if (busy.current || !database || !loaded || summary.planning) return;
    busy.current = true;
    const batchId = newImportBatchId();
    let written = { sessions: 0, sets: 0 };
    let created = 0;
    try {
      setStep({ kind: "importing", progress: 0 });
      await yieldToUi();
      const uses = new Map(loaded.matches.map((match) => [match.use.key, match.use]));
      const realIds = new Map<string, string>();
      const needed = new Set(
        planned.current.flatMap((session) =>
          session.exercises
            .filter((entry) => entry.exerciseId.startsWith(NEW_EXERCISE_PREFIX))
            .map((entry) => entry.exerciseId),
        ),
      );
      for (const placeholder of needed) {
        const use: NameUse | undefined = uses.get(placeholder.slice(NEW_EXERCISE_PREFIX.length));
        if (!use) continue;
        realIds.set(
          placeholder,
          await createCustomExercise(database, newExerciseInput(use), writeScope),
        );
        created += 1;
      }
      const sessions = planned.current.map((session) => ({
        ...session,
        exercises: session.exercises.map((entry) => ({
          ...entry,
          exerciseId: realIds.get(entry.exerciseId) ?? entry.exerciseId,
        })),
      }));
      const batches = batchSessions(sessions, WRITE_SESSIONS, WRITE_SETS);
      for (const batch of batches) {
        const result = await importSessionBatch(database, batchId, batch, writeScope);
        written = {
          sessions: written.sessions + result.sessions,
          sets: written.sets + result.sets,
        };
        setStep({ kind: "importing", progress: written.sessions / Math.max(sessions.length, 1) });
        await yieldToUi();
      }
      finishImport(batchId, written, created);
    } catch (error) {
      if (!(error instanceof Error && isNetworkError(error))) {
        // Whole Sessions already written stay; the receipt says how many, and Undo removes them.
        if (written.sessions > 0 || created > 0) finishImport(batchId, written, created);
      }
      setStep({ kind: "failed", reason: "import_failed" });
    } finally {
      busy.current = false;
    }

    function finishImport(id: string, counts: { sessions: number; sets: number }, made: number) {
      const next: ImportReceipt = {
        batchId: id,
        importedAt: new Date().toISOString(),
        format: loaded?.history.format ?? "strong",
        sessions: counts.sessions,
        sets: counts.sets,
        createdExercises: made,
        skippedDuplicates: summary.duplicates,
        skippedOther: summary.skippedOther,
        from: loaded?.from ?? null,
        to: loaded?.to ?? null,
      };
      saveReceipt(next);
      setReceipt(next);
      // The file's rows are no longer needed; free them before the receipt shows.
      planned.current = [];
      setLoaded(null);
      setStep({ kind: "done" });
    }
  }, [database, loaded, summary, writeScope]);

  // ---- The receipt and Undo ----

  const watchBatch = useCallback(
    (
      db: Parameters<typeof watchImportedSessions>[0],
      onValue: Parameters<typeof watchImportedSessions>[2],
      onError: () => void,
    ) => (receipt ? watchImportedSessions(db, receipt.batchId, onValue, onError) : () => undefined),
    [receipt],
  );
  const imported = useLocalWatch(watchBatch).value ?? null;

  const undo = useCallback(async () => {
    if (busy.current || !database || !receipt) return;
    busy.current = true;
    const total = Math.max(imported?.sessions ?? receipt.sessions, 1);
    let removed = 0;
    try {
      setStep({ kind: "undoing", progress: 0 });
      for (;;) {
        const chunk = await undoImportChunk(database, receipt.batchId, UNDO_SESSIONS, writeScope);
        removed += chunk.deleted;
        setStep({ kind: "undoing", progress: Math.min(removed / total, 1) });
        await yieldToUi();
        if (chunk.remaining === 0 || chunk.deleted === 0) break;
      }
      clearReceipt();
      setReceipt(null);
      setLoaded(null);
      setStep({ kind: "idle" });
      toast.show({ variant: "success", label: t("import__undone", { count: removed }) });
    } catch {
      setStep({ kind: "failed", reason: "undo_failed" });
    } finally {
      busy.current = false;
    }
  }, [database, imported, receipt, t, toast, writeScope]);

  const reset = useCallback(() => {
    planRun.current += 1;
    setLoaded(null);
    setStep({ kind: "idle" });
  }, []);

  /** The saved receipt when its Sessions are still in the app; a stale one is not offered. */
  const lastImport = receipt && (imported === null || imported.sessions > 0) ? receipt : null;

  return {
    ready: database !== null,
    step,
    file: loaded
      ? {
          name: loaded.fileName,
          format: loaded.history.format satisfies ImportFormat,
          from: loaded.from,
          to: loaded.to,
          workouts: loaded.history.sessions.length,
          unreadableRows: loaded.history.skippedRows,
        }
      : null,
    unit,
    unitFromFile,
    setUnit,
    summary,
    matchedCount,
    unmatched,
    pickFile,
    mapName,
    setResolution,
    startImport,
    receipt: lastImport,
    liveSessions: imported?.sessions ?? null,
    undo,
    reset,
  };
}
