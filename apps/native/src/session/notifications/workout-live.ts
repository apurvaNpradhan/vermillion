import { Linking } from "react-native";
import { z } from "zod";
import {
  EXERCISE_HISTORY_SQL,
  SESSION_DETAIL_SQL,
  SESSION_LAST_NOTES_SQL,
  parseFinishedSessions,
  parseSessionDetail,
  readInstallId,
  type SessionDetail,
  type TrainingDatabase,
  clearRest,
  adjustRest,
  tickSet,
} from "@workspace/sync";
import type { Ghosts } from "@workspace/shared";
import { workoutLive } from "../../../modules/workout-live";
import { appConfig } from "@/platform/app-config";
import { i18n } from "@/platform/i18n";
import { openLocalData } from "@/platform/local-database";
import { blocksOf } from "@/session/logging/blocks";
import { currentAction, orderedSets } from "@/session/logging/current-action";
import { loggingGhosts } from "@/session/logging/logging-ghosts";
import { restAfterTick } from "@/session/rest/rest-rules";
import { markRestEnded, restEndedAt } from "@/session/rest/rest-ended";
import {
  cancelRestNotification,
  installRestNotifications,
  scheduleRestNotification,
  setRestSoundEnabled,
  setRestVibrationEnabled,
} from "./rest-notification";
import { restNotificationId } from "@/session/rest/rest-schedule";
import { getNotificationPermission } from "@/platform/notifications/permission";
import {
  workoutLivePayloadSchema,
  liveOptionsSchema,
  workoutLiveState,
} from "./workout-live-state";

type Options = z.infer<typeof liveOptionsSchema>;
let queue = Promise.resolve();
let held = "";

/** Builds the notification from an already validated Session and the current exercise's history. */
async function snapshotOf(db: TrainingDatabase, session: SessionDetail, options: Options) {
  const ghosts = new Map<string, Ghosts>();
  // Only the current set's values are shown or logged, so only its exercise needs its history.
  const first = orderedSets(session.exercises).find((item) => item.set.completedAt === null);
  for (const exercise of first ? [first.exercise] : []) {
    const history = parseFinishedSessions(
      await db.getAll(EXERCISE_HISTORY_SQL, [exercise.exerciseId, exercise.exerciseId]),
    );
    exercise.sets.forEach((set, index) =>
      ghosts.set(set.id, loggingGhosts(exercise, index, history, options)),
    );
  }
  const state = workoutLiveState({
    session,
    ghostsFor: (id) => ghosts.get(id) ?? {},
    now: Date.now(),
    restEndedAt: restEndedAt(session.id),
    unit: options.weightUnit,
    options,
    url: `${appConfig.scheme}:///session/${session.id}`,
    t: i18n.t.bind(i18n),
  });
  return { session, ghosts, state };
}

/** A headless action reads the Session itself: no screen is mounted to share one with it. */
async function snapshot(sessionId: string, options: Options) {
  const local = await openLocalData();
  if (local.status !== "ready") throw new Error("Local storage unavailable");
  const db = local.database;
  const installId = await readInstallId(db);
  const session = await db.readTransaction(async (tx) =>
    parseSessionDetail(
      await tx.getAll(SESSION_DETAIL_SQL, [sessionId]),
      await tx.getAll(SESSION_LAST_NOTES_SQL, [sessionId]),
    ),
  );
  if (!session || session.finishedAt !== null || session.deviceId !== installId) return null;
  return { db, installId, ...(await snapshotOf(db, session, options)) };
}

/** Serialize UI watches and headless actions in the same JS runtime. */
function enqueue(run: () => Promise<void>) {
  queue = queue.catch(() => undefined).then(run);
  return queue;
}
const LIVE_INTERVAL_MS = 1000;
let lastUpdateAt = -Infinity;
let generation = 0;
let trailing: ReturnType<typeof setTimeout> | null = null;
let pending: { session: SessionDetail; options: Options } | null = null;
let refreshing = false;

const updateDelay = () => Math.max(0, LIVE_INTERVAL_MS - (performance.now() - lastUpdateAt));

function post(state: ReturnType<typeof workoutLiveState>, current: number) {
  if (!workoutLive || current !== generation) return;
  const key = JSON.stringify(state);
  if (key === held) return;
  workoutLive.update(state);
  lastUpdateAt = performance.now();
  held = key;
}

function clearTrailing() {
  if (trailing !== null) clearTimeout(trailing);
  trailing = null;
}

export function dismissWorkoutLive() {
  generation += 1;
  clearTrailing();
  pending = null;
  workoutLive?.dismiss();
  held = "";
}

/** Uses the latest input when the queue and native update interval both allow a refresh. */
export function resumeWorkoutLiveRefresh() {
  if (!pending || refreshing) return;
  clearTrailing();
  const delay = updateDelay();
  if (delay > 0) {
    trailing = setTimeout(() => {
      trailing = null;
      resumeWorkoutLiveRefresh();
    }, Math.ceil(delay));
    return;
  }
  refreshing = true;
  void enqueue(async () => {
    // A headless action may have updated the notification while this job waited in the queue.
    if (updateDelay() > 0 || !pending) return;
    const { session, options } = pending;
    pending = null;
    const current = generation;
    const local = await openLocalData();
    if (local.status !== "ready" || current !== generation) return;
    const { state } = await snapshotOf(local.database, session, options);
    post(state, current);
  })
    .catch(() => undefined)
    .finally(() => {
      refreshing = false;
      resumeWorkoutLiveRefresh();
    });
}

/** Receives the shared Session after the host checks ownership and cached permission. */
export function refreshWorkoutLive(session: SessionDetail, options: Options) {
  if (!workoutLive) return;
  pending = { session, options };
  if (trailing === null) resumeWorkoutLiveRefresh();
}

/** Keep the headless task alive until its update can post, even with the app in the background. */
async function postActionState(state: ReturnType<typeof workoutLiveState>, current: number) {
  const delay = updateDelay();
  if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, Math.ceil(delay)));
  post(state, current);
}

export function workoutLiveAction(data: { state: string; action: string }) {
  const generationAtDispatch = generation;
  return enqueue(async () => {
    let failed: ReturnType<typeof workoutLiveState> | null = null;
    try {
      const request = workoutLivePayloadSchema.parse(JSON.parse(data.state));
      failed = request;
      const action = z.enum(["skip", "nudge", "done"]).parse(data.action);
      let options = request.options;
      // Prefer newer preferences from the host. The action reads fresh rows itself.
      if (pending?.session.id === request.sessionId) {
        options = pending.options;
        pending = null;
        clearTrailing();
      }
      const current = await snapshot(request.sessionId, options);
      if (!current || (await getNotificationPermission()) !== "granted") {
        if (generationAtDispatch === generation) dismissWorkoutLive();
        return;
      }
      failed = current.state;
      const { db, session, installId, ghosts } = current;
      if (!installId) throw new Error("No install identity");
      if (action === "done") {
        const next = currentAction({
          session,
          ghostsFor: (id) => ghosts.get(id) ?? {},
          now: Date.now(),
        }).current;
        if (next && next.setId === request.setId) {
          const block = blocksOf(session.exercises).find((item) =>
            item.members.some((exercise) => exercise.id === next.exerciseRowId),
          );
          const result = await tickSet(
            db,
            next.setId,
            ghosts.get(next.setId) ?? {},
            installId,
            block ? restAfterTick(block, next.exerciseRowId, next.setId) : null,
          );
          if (!result.ok) await Linking.openURL(current.state.url);
        }
      } else if (
        session.pausedAt === null &&
        session.rest &&
        session.rest.setId === request.restSetId &&
        Date.parse(session.rest.endsAt) > Date.now()
      ) {
        if (action === "skip") {
          await clearRest(db, session.id, installId);
          markRestEnded(session.id);
        } else await adjustRest(db, session.id, 15, installId);
      }
      const after = await snapshot(session.id, options);
      if (!after) {
        if (generationAtDispatch === generation) dismissWorkoutLive();
        return;
      }
      // Show the new state first; the alert reconcile below is slower.
      await postActionState(after.state, generationAtDispatch);
      await installRestNotifications(i18n.t("session__rest_channel"));
      setRestSoundEnabled(options.soundOn);
      setRestVibrationEnabled(options.vibrate);
      await cancelRestNotification(restNotificationId(session.id));
      const restEndsAt = after.state.restEndsAtMs;
      if (restEndsAt !== null && restEndsAt > Date.now()) {
        await scheduleRestNotification(session.id, restEndsAt, {
          title: i18n.t("session__rest_over_title"),
          body: i18n.t("session__rest_over_body", { title: session.title }),
        });
      }
    } catch {
      if (failed) {
        await postActionState(
          { ...failed, text: failed.openToContinue, restOver: failed.openToContinue },
          generationAtDispatch,
        );
      }
    }
  });
}
