import { Linking } from "react-native";
import { z } from "zod";
import {
  EXERCISE_HISTORY_SQL,
  SESSION_DETAIL_SQL,
  parseFinishedSessions,
  parseSessionDetail,
  readInstallId,
  clearRest,
  adjustRest,
  tickSet,
} from "@workspace/sync";
import type { Ghosts } from "@workspace/shared";
import { workoutLive } from "../../modules/workout-live";
import { appConfig } from "@/platform/app-config";
import { i18n } from "@/platform/i18n";
import { openLocalData } from "@/platform/local-database";
import { blocksOf } from "./blocks";
import { currentAction } from "./current-action";
import { loggingGhosts } from "./logging-ghosts";
import { restAfterTick } from "./rest-rules";
import {
  cancelRestNotification,
  getRestPermission,
  installRestNotifications,
  scheduleRestNotification,
  setRestSoundEnabled,
} from "./rest-notification";
import { restNotificationId } from "./rest-schedule";
import {
  workoutLivePayloadSchema,
  liveOptionsSchema,
  workoutLiveState,
} from "./workout-live-state";

type Options = z.infer<typeof liveOptionsSchema>;
let queue = Promise.resolve();
let held = "";
const restEnds = new Map<string, { end: string | null; endedAt: number | null }>();

async function snapshot(sessionId: string, options: Options) {
  const local = await openLocalData();
  if (local.status !== "ready") throw new Error("Local storage unavailable");
  const db = local.database;
  const installId = await readInstallId(db);
  const session = parseSessionDetail(await db.getAll(SESSION_DETAIL_SQL, [sessionId]));
  if (!session || session.finishedAt !== null || session.deviceId !== installId) return null;
  const ghosts = new Map<string, Ghosts>();
  for (const exercise of session.exercises) {
    const history = parseFinishedSessions(
      await db.getAll(EXERCISE_HISTORY_SQL, [exercise.exerciseId, exercise.exerciseId]),
    );
    exercise.sets.forEach((set, index) =>
      ghosts.set(set.id, loggingGhosts(exercise, index, history, options)),
    );
  }
  const before = restEnds.get(session.id);
  const end = session.rest?.endsAt ?? null;
  const endedAt = before?.end && !end ? Date.now() : (before?.endedAt ?? null);
  restEnds.set(session.id, { end, endedAt });
  const state = workoutLiveState({
    session,
    ghostsFor: (id) => ghosts.get(id) ?? {},
    now: Date.now(),
    restEndedAt: endedAt,
    unit: options.weightUnit,
    options,
    url: `${appConfig.scheme}:///session/${session.id}/timer`,
    t: i18n.t.bind(i18n),
  });
  return { db, session, installId, ghosts, state };
}

/** Serialize UI watches and headless actions in the same JS runtime. */
function enqueue(run: () => Promise<void>) {
  queue = queue.catch(() => undefined).then(run);
  return queue;
}
export function refreshWorkoutLive(sessionId: string | null, options: Options) {
  return enqueue(async () => {
    if (!workoutLive) return;
    const current =
      sessionId && (await getRestPermission()) === "granted"
        ? await snapshot(sessionId, options)
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

export function workoutLiveAction(data: { state: string; action: string }) {
  return enqueue(async () => {
    let failed: ReturnType<typeof workoutLiveState> | null = null;
    try {
      const request = workoutLivePayloadSchema.parse(JSON.parse(data.state));
      failed = request;
      const action = z.enum(["skip", "nudge", "done"]).parse(data.action);
      const current = await snapshot(request.sessionId, request.options);
      if (!current || (await getRestPermission()) !== "granted") {
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
        if (action === "skip") await clearRest(db, session.id, installId);
        else await adjustRest(db, session.id, 15, installId);
      }
      const after = await snapshot(session.id, request.options);
      if (!after) {
        workoutLive?.dismiss();
        held = "";
        return;
      }
      await installRestNotifications(i18n.t("session__rest_channel"));
      setRestSoundEnabled(request.options.soundOn);
      await cancelRestNotification(restNotificationId(session.id));
      if (after.session.rest && Date.parse(after.session.rest.endsAt) > Date.now()) {
        await scheduleRestNotification(session.id, Date.parse(after.session.rest.endsAt), {
          title: i18n.t("session__rest_over_title"),
          body: i18n.t("session__rest_over_body", { title: session.title }),
        });
      }
      workoutLive?.update(after.state);
      held = JSON.stringify(after.state);
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
