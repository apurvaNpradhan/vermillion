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

/** The notification's state for a Session this device owns and has not finished; null otherwise. */
async function snapshotOf(session: SessionDetail, installId: string | null, options: Options) {
  if (session.finishedAt !== null || session.deviceId !== installId) return null;
  const local = await openLocalData();
  if (local.status !== "ready") throw new Error("Local storage unavailable");
  const db = local.database;
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
    url: `${appConfig.scheme}:///session/${session.id}/timer`,
    t: i18n.t.bind(i18n),
  });
  return { db, session, installId, ghosts, state };
}

/** A headless action reads the Session itself: no screen is mounted to share one with it. */
async function snapshot(sessionId: string, options: Options) {
  const local = await openLocalData();
  if (local.status !== "ready") throw new Error("Local storage unavailable");
  const db = local.database;
  const installId = await readInstallId(db);
  const session = parseSessionDetail(
    await db.getAll(SESSION_DETAIL_SQL, [sessionId]),
    await db.getAll(SESSION_LAST_NOTES_SQL, [sessionId]),
  );
  return session ? snapshotOf(session, installId, options) : null;
}

/** Serialize UI watches and headless actions in the same JS runtime. */
function enqueue(run: () => Promise<void>) {
  queue = queue.catch(() => undefined).then(run);
  return queue;
}
/** The native chip is updated at most this often; the latest state always follows. */
const LIVE_INTERVAL_MS = 1000;
let lastRunAt = 0;
let trailing: ReturnType<typeof setTimeout> | null = null;
let pending: (() => Promise<void>) | null = null;

function apply(
  input: { session: SessionDetail; installId: string | null; granted: boolean } | null,
  options: Options,
) {
  return enqueue(async () => {
    if (!workoutLive) return;
    const current = input?.granted
      ? await snapshotOf(input.session, input.installId, options)
      : null;
    if (!current) {
      workoutLive.dismiss();
      held = "";
      return;
    }
    const key = JSON.stringify(current.state);
    if (key !== held) {
      workoutLive.update(current.state);
      held = key;
    }
  });
}

/**
 * Shows the Live notification for a Session the screens already watch (`null` dismisses it).
 * Updates are throttled to one a second with a trailing call, so a burst of set writes costs one
 * rebuild; dismissing is immediate. `granted` is the cached notification permission.
 */
export function refreshWorkoutLive(
  input: { session: SessionDetail; installId: string | null; granted: boolean } | null,
  options: Options,
) {
  if (!input) {
    if (trailing) clearTimeout(trailing);
    trailing = null;
    pending = null;
    return apply(null, options);
  }
  const run = () => {
    lastRunAt = Date.now();
    return apply(input, options);
  };
  const wait = LIVE_INTERVAL_MS - (Date.now() - lastRunAt);
  if (wait <= 0 && !trailing) return run();
  pending = run;
  trailing ??= setTimeout(
    () => {
      trailing = null;
      const next = pending;
      pending = null;
      void next?.().catch(() => undefined);
    },
    Math.max(wait, 0),
  );
  return Promise.resolve();
}

export function workoutLiveAction(data: { state: string; action: string }) {
  return enqueue(async () => {
    let failed: ReturnType<typeof workoutLiveState> | null = null;
    try {
      const request = workoutLivePayloadSchema.parse(JSON.parse(data.state));
      failed = request;
      const action = z.enum(["skip", "nudge", "done"]).parse(data.action);
      const current = await snapshot(request.sessionId, request.options);
      if (!current || (await getNotificationPermission()) !== "granted") {
        workoutLive?.dismiss();
        held = "";
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
        session.rest &&
        session.rest.setId === request.restSetId &&
        Date.parse(session.rest.endsAt) > Date.now()
      ) {
        if (action === "skip") {
          await clearRest(db, session.id, installId);
          markRestEnded(session.id);
        } else await adjustRest(db, session.id, 15, installId);
      }
      const after = await snapshot(session.id, request.options);
      if (!after) {
        workoutLive?.dismiss();
        held = "";
        return;
      }
      // Show the new state first; the alert reconcile below is slower.
      workoutLive?.update(after.state);
      held = JSON.stringify(after.state);
      await installRestNotifications(i18n.t("session__rest_channel"));
      setRestSoundEnabled(request.options.soundOn);
      await cancelRestNotification(restNotificationId(session.id));
      if (after.session.rest && Date.parse(after.session.rest.endsAt) > Date.now()) {
        await scheduleRestNotification(session.id, Date.parse(after.session.rest.endsAt), {
          title: i18n.t("session__rest_over_title"),
          body: i18n.t("session__rest_over_body", { title: session.title }),
        });
      }
    } catch {
      if (failed) {
        workoutLive?.update({
          ...failed,
          text: failed.openToContinue,
          restOver: failed.openToContinue,
        });
        held = "";
      }
    }
  });
}
