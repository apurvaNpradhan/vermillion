import {
  checkCsvSize,
  createCsvReader,
  createExerciseMatcher,
  createHistoryBuilder,
  createImportClock,
  detectDelimiter,
  deviceTimeZone,
  HistoryCsvError,
  planSession,
  type HistoryBuilder,
  type LibraryEntry,
  type PlannedImportSession,
  type WeightUnit,
} from "@workspace/shared";
import {
  adoptLegacyImportReceipt,
  batchImportSessions,
  createCustomExercise,
  importSessionBatch,
  importSessionCost,
  newImportBatchId,
  phaseOwner,
  readImportFingerprints,
  readImportReceipt,
  readMatchingLibrary,
  undoImportChunk,
  watchImportedSessions,
  type ImportReceipt,
} from "@workspace/sync";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePickExercises } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { deviceStorage } from "@/platform/storage";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { usePreferences } from "@/preferences";
import { useLocalData, useSyncValue } from "@/sync";

import {
  NEW_EXERCISE_PREFIX,
  applyRememberedMappings,
  collectNames,
  createResolver,
  matchNames,
  newExerciseInput,
  type NameMatch,
  type Resolution,
} from "./import-names";
import { readMapping, saveMapping } from "./mapping-storage";

const READ_SLICE = 1500;
const PLAN_SLICE = 100;
const DAY_MS = 86_400_000;
const LEGACY_RECEIPT_KEY = "history-import-last";

export type FailReason =
  | HistoryCsvError["reason"]
  | "unreadable"
  | "unknown_format"
  | "invalid_rows"
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
  omittedSets: number;
  omittedExercises: number;
  oversized: number;
  /** Custom exercises the import would create. */
  creating: number;
};

type Loaded = {
  fileName: string;
  builder: HistoryBuilder;
  matches: NameMatch[];
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
  omittedSets: 0,
  omittedExercises: 0,
  oversized: 0,
  creating: 0,
};

/**
 * The history import (Strong and Hevy CSV): pick a file, read it in slices, match exercise names
 * to the library, preview what would be written, write it in batches, and undo it. Everything
 * works on the local database, so it needs no connection; the sessions upload as usual.
 */
export function useHistoryImport() {
  const { t } = useTranslation();
  const local = useLocalData();
  const userId = useSyncValue((snapshot) => (snapshot ? phaseOwner(snapshot.phase) : null));
  const writeScope = useSyncValue((snapshot) => snapshot?.writeScope ?? "");
  const { preferences } = usePreferences();
  const pickExercises = usePickExercises("session");
  const database = local?.status === "ready" ? local.database : null;

  const [step, setStep] = useState<ImportStep>({ kind: "idle" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [unit, setUnit] = useState<WeightUnit>(preferences.ui.weightUnit);
  const [timeZone, setTimeZone] = useState(deviceTimeZone);
  const [dayFirst, setDayFirst] = useState(true);
  const [resolutions, setResolutions] = useState<ReadonlyMap<string, Resolution>>(new Map());
  const [summary, setSummary] = useState<ImportSummary>(EMPTY_SUMMARY);
  const [receiptState, setReceiptState] = useState<{
    userId: string;
    value: ImportReceipt | null;
  } | null>(null);
  const receipt = receiptState?.userId === userId ? receiptState.value : null;
  const cancelled = useRef(false);
  const [cancelling, setCancelling] = useState(false);
  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );
  const timeZoneValid = useMemo(() => createImportClock(timeZone.trim()) !== null, [timeZone]);
  const history = useMemo(
    () =>
      loaded && timeZoneValid
        ? loaded.builder.finish({ dayFirst, timeZone: timeZone.trim() })
        : null,
    [loaded, dayFirst, timeZone, timeZoneValid],
  );
  const from = history?.sessions[0]?.startedAt ?? null;
  const to = history?.sessions.at(-1)?.startedAt ?? null;

  useEffect(() => {
    if (!database || !userId || !writeScope) return;
    let current = true;
    void readImportReceipt(database, userId)
      .then(async (saved) => {
        if (saved || !current) return saved;
        const legacy = deviceStorage.get(LEGACY_RECEIPT_KEY);
        if (!legacy) return null;
        const receipt = await adoptLegacyImportReceipt(database, userId, writeScope, legacy);
        if (receipt?.legacy) deviceStorage.set(LEGACY_RECEIPT_KEY, null);
        return receipt;
      })
      .then((value) => {
        if (current) setReceiptState({ userId, value });
      })
      .catch(() => {
        if (current) setReceiptState({ userId, value: null });
      });
    return () => {
      current = false;
    };
  }, [database, userId, writeScope]);
  const planned = useRef<PlannedImportSession[]>([]);
  const planRun = useRef(0);
  const busy = useRef(false);

  // ---- Planning: what the file would write, given the unit and the choices ----

  useEffect(() => {
    if (!loaded || !history || step.kind !== "preview" || !database) return;
    planRun.current += 1;
    const run = planRun.current;
    setSummary((previous) => ({ ...previous, planning: true }));
    void (async () => {
      const resolve = createResolver(loaded.matches, resolutions);
      const sessions = history.sessions;
      const known =
        from && to
          ? await readImportFingerprints(database, {
              // The stream may serialize timestamps differently from the local ISO strings.
              from: new Date(Date.parse(from) - DAY_MS).toISOString(),
              to: new Date(Date.parse(to) + DAY_MS).toISOString(),
            })
          : new Set<string>();
      const fallbackTitle = t("import__untitled");
      const next: PlannedImportSession[] = [];
      let duplicates = 0;
      let skippedOther = 0;
      let omittedSets = 0;
      let omittedExercises = 0;
      let oversized = 0;
      let sets = 0;
      for (let at = 0; at < sessions.length; at += PLAN_SLICE) {
        if (run !== planRun.current) return;
        for (const imported of sessions.slice(at, at + PLAN_SLICE)) {
          const outcome = planSession(imported, resolve, unit, fallbackTitle);
          if (outcome.kind === "planned" && known.has(outcome.session.fingerprint)) {
            duplicates += 1;
            continue;
          }
          if (outcome.kind !== "out_of_range") {
            omittedSets += outcome.omittedSets;
            omittedExercises += outcome.omittedExercises;
          }
          if (outcome.kind !== "planned") skippedOther += 1;
          else if (!importSessionCost(outcome.session)) oversized += 1;
          else {
            known.add(outcome.session.fingerprint);
            next.push(outcome.session);
            for (const exercise of outcome.session.exercises) sets += exercise.sets.length;
          }
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
        sets,
        duplicates,
        skippedOther,
        omittedSets,
        omittedExercises,
        oversized,
        creating: creating.size,
      });
    })().catch(() => {
      if (run === planRun.current) setStep({ kind: "failed", reason: "unreadable" });
    });
    return () => {
      planRun.current += 1;
    };
  }, [loaded, history, from, to, unit, resolutions, step.kind, database, t]);

  // ---- Choosing and reading a file ----

  const pickFile = useCallback(async () => {
    if (busy.current || !database || !userId) return;
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
      const file = new File(asset.uri);
      if (asset.size !== undefined) checkCsvSize(asset.size);
      const size = file.info().size;
      if (size === null || size === undefined) throw new Error("File size unavailable");
      checkCsvSize(size);
      const text = await file.text();
      const delimiter = detectDelimiter(text.replace(/^﻿/u, ""));
      const reader = createCsvReader(text, delimiter);
      const [header] = reader.readRows(1);
      const created = header ? createHistoryBuilder(header) : null;
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
      // UTC preserves all valid wall clocks for name matching, including those in a DST gap.
      const source = builder.finish({ timeZone: "UTC" });
      if (source.sessions.length === 0) {
        setStep({ kind: "failed", reason: source.skippedRows > 0 ? "invalid_rows" : "empty" });
        return;
      }
      const entries = await readMatchingLibrary(database);
      const library = new Map(entries.map((entry) => [entry.id, entry]));
      const remembered = applyRememberedMappings(
        matchNames(collectNames(source.sessions), createExerciseMatcher(entries), library),
        library,
        (key) => readMapping(userId, builder.format, key),
      );
      setLoaded({ fileName: asset.name, builder, matches: remembered.matches });
      setUnit(source.weightUnit ?? preferences.ui.weightUnit);
      setDayFirst(source.dayFirst);
      setTimeZone(deviceTimeZone());
      setResolutions(remembered.resolutions);
      setSummary(EMPTY_SUMMARY);
      setStep({ kind: "preview" });
    } catch (error) {
      setStep({
        kind: "failed",
        reason: error instanceof HistoryCsvError ? error.reason : "unreadable",
      });
    } finally {
      busy.current = false;
    }
  }, [database, preferences.ui.weightUnit, userId]);

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

  const setResolution = useCallback(
    (key: string, resolution: Resolution) => {
      if (!userId || !loaded) return;
      saveMapping(
        userId,
        loaded.builder.format,
        key,
        resolution.kind === "mapped" ? resolution.target.exerciseId : null,
      );
      setSummary((previous) => ({ ...previous, planning: true }));
      setResolutions((previous) => new Map(previous).set(key, resolution));
    },
    [userId, loaded],
  );

  const mapName = useCallback(
    async (key: string) => {
      if (!database || !loaded) return;
      const ids = await pickExercises({ max: 1 });
      const id = ids?.[0];
      if (!id) return;
      const library = await readMatchingLibrary(database);
      const entry: LibraryEntry | undefined = library.find((candidate) => candidate.id === id);
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
    if (busy.current || !database || !userId || !loaded || !history || summary.planning) return;
    busy.current = true;
    cancelled.current = false;
    setCancelling(false);
    const batchId = newImportBatchId();
    let next: ImportReceipt = {
      batchId,
      importedAt: new Date().toISOString(),
      format: history.format,
      sessions: 0,
      sets: 0,
      createdExercises: 0,
      skippedDuplicates: summary.duplicates,
      skippedOther: summary.skippedOther,
      omittedSets: summary.omittedSets,
      omittedExercises: summary.omittedExercises,
      oversized: summary.oversized,
      from: null,
      to: null,
      complete: false,
      undoStarted: false,
    };
    try {
      setStep({ kind: "importing", progress: 0 });
      await yieldToUi();
      const uses = new Map(loaded.matches.map((match) => [match.use.key, match.use]));
      const realIds = new Map<string, string>();
      const batches = batchImportSessions(planned.current);
      let processed = 0;
      const total = planned.current.length;
      let createdExercises = 0;
      let duplicates = summary.duplicates;
      for (const batch of batches) {
        if (cancelled.current) break;
        // Create only the exercises this batch needs, so a cancelled import leaves fewer extras.
        for (const session of batch) {
          for (const exercise of session.exercises) {
            const id = exercise.exerciseId;
            if (!id.startsWith(NEW_EXERCISE_PREFIX) || realIds.has(id)) continue;
            const use = uses.get(id.slice(NEW_EXERCISE_PREFIX.length));
            if (!use) throw new Error("Missing imported exercise");
            realIds.set(
              id,
              await createCustomExercise(database, newExerciseInput(use), writeScope),
            );
            createdExercises += 1;
          }
        }
        const sessions = batch.map((session) => ({
          ...session,
          exercises: session.exercises.map((entry) => ({
            ...entry,
            exerciseId: realIds.get(entry.exerciseId) ?? entry.exerciseId,
          })),
        }));
        const result = await importSessionBatch(database, batchId, sessions, writeScope, {
          ...next,
          createdExercises,
          skippedDuplicates: duplicates,
          complete: processed + batch.length === total,
        });
        duplicates += result.duplicates;
        if (result.receipt) {
          next = result.receipt;
          setReceiptState({ userId, value: next });
        }
        processed += batch.length;
        setStep({ kind: "importing", progress: processed / Math.max(total, 1) });
        await yieldToUi();
      }
      planned.current = [];
      setLoaded(null);
      setStep({ kind: next.sessions > 0 ? "done" : "idle" });
    } catch {
      setStep({ kind: "failed", reason: "import_failed" });
    } finally {
      busy.current = false;
    }
  }, [database, history, loaded, summary, userId, writeScope]);

  // ---- The receipt and Undo ----

  const receiptBatchId = receipt?.batchId;
  const [keptPage, setKeptPage] = useState<{ batchId: string; offset: number } | null>(null);
  const keptOffset = keptPage?.batchId === receiptBatchId ? (keptPage?.offset ?? 0) : 0;
  const watchBatch = useCallback(
    (
      db: Parameters<typeof watchImportedSessions>[0],
      onValue: Parameters<typeof watchImportedSessions>[2],
      onError: () => void,
    ) =>
      receiptBatchId
        ? watchImportedSessions(db, receiptBatchId, onValue, onError, keptOffset)
        : () => undefined,
    [receiptBatchId, keptOffset],
  );
  const imported = useLocalWatch(watchBatch).value ?? null;

  const undo = useCallback(async () => {
    if (busy.current || !database || !userId || !receipt || receipt.legacy) return;
    busy.current = true;
    const total = Math.max(imported?.sessions ?? receipt.sessions, 1);
    let scanned = 0;
    try {
      setKeptPage(null);
      setStep({ kind: "undoing", progress: 0 });
      let cursor: string | null = "";
      while (cursor !== null) {
        const chunk = await undoImportChunk(database, receipt.batchId, cursor, writeScope);
        scanned += chunk.scanned;
        cursor = chunk.cursor;
        setStep({ kind: "undoing", progress: Math.min(scanned / total, 1) });
        await yieldToUi();
      }
      setReceiptState({ userId, value: { ...receipt, undoStarted: true } });
      setLoaded(null);
      setStep({ kind: "idle" });
    } catch {
      const saved = await readImportReceipt(database, userId).catch(() => receipt);
      setReceiptState({ userId, value: saved });
      setStep({ kind: "failed", reason: "undo_failed" });
    } finally {
      busy.current = false;
    }
  }, [database, imported, receipt, userId, writeScope]);

  const reset = useCallback(() => {
    planRun.current += 1;
    setLoaded(null);
    setStep({ kind: "idle" });
  }, []);

  /** The saved receipt when its Sessions are still in the app; a stale one is not offered. */
  const lastImport = receipt && (imported === null || imported.sessions > 0) ? receipt : null;

  return {
    ready:
      database !== null &&
      userId !== null &&
      receiptState?.userId === userId &&
      (receipt === null || (imported !== null && imported.pending === 0)),
    step,
    file: loaded
      ? {
          name: loaded.fileName,
          format: loaded.builder.format,
          from,
          to,
          workouts: history?.sessions.length ?? 0,
          unreadableRows: history?.skippedRows ?? 0,
          ambiguousDates: history?.ambiguousDates ?? false,
          gaps: history?.gaps ?? 0,
          overlaps: history?.overlaps ?? 0,
        }
      : null,
    unit,
    unitFromFile: !history?.sessions.some((session) =>
      session.exercises.some((exercise) =>
        exercise.sets.some((set) => set.weight !== null && !set.weightUnit),
      ),
    ),
    setUnit: (value: WeightUnit) => {
      if (value === unit) return;
      setSummary((previous) => ({ ...previous, planning: true }));
      setUnit(value);
    },
    timeZone,
    timeZoneValid,
    setTimeZone: (value: string) => {
      if (value === timeZone) return;
      setSummary((previous) => ({ ...previous, planning: true }));
      setTimeZone(value);
    },
    dayFirst,
    setDayFirst: (value: boolean) => {
      if (value === dayFirst) return;
      setSummary((previous) => ({ ...previous, planning: true }));
      setDayFirst(value);
    },
    summary,
    matchedCount,
    unmatched,
    pickFile,
    mapName,
    setResolution,
    startImport,
    cancelImport: () => {
      cancelled.current = true;
      setCancelling(true);
    },
    cancelling,
    receipt: lastImport,
    imported,
    keptOffset,
    changeKeptPage: (delta: number) => {
      if (receiptBatchId)
        setKeptPage({ batchId: receiptBatchId, offset: Math.max(keptOffset + delta, 0) });
    },
    undo,
    reset,
  };
}
