import { createRestReconciler } from "../rest-reconciler";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { usePreferences } from "@/preferences";

import {
  cancelRestNotification,
  installRestNotifications,
  setRestSoundEnabled,
  scheduleRestNotification,
  scheduledRestIds,
} from "../rest-notification";
import { refreshRestPermission, useRestPermission } from "../rest-permission-store";
import { REST_NOTIFICATION_PREFIX, planRestSchedule } from "../rest-schedule";
import { useActiveSessions } from "../use-active-sessions";
import { useInstallId } from "../use-install-id";

/**
 * Keeps the scheduled Rest notifications in step with the stored Rests (the source of truth): when
 * the app opens, on every change of a Session, and when the permission changes. A notification
 * fires even with the app killed because it is scheduled with the system; a Rest that was skipped,
 * moved, finished or taken over by another device is cancelled here. Mount once, in the signed-in
 * app.
 */
export function RestNotificationHost() {
  const { t } = useTranslation();
  const { sessions, loading } = useActiveSessions();
  const installId = useInstallId();
  const permission = useRestPermission();
  const reconciler = useRef(createRestReconciler());
  const known = useRef(new Map<string, number>());
  const soundOn = usePreferences().preferences.ui.restSound;
  const scheduledWithSound = useRef(soundOn);
  setRestSoundEnabled(soundOn);
  // A scheduled notification keeps the sound it was made with, so a changed setting reschedules all.
  if (scheduledWithSound.current !== soundOn) {
    scheduledWithSound.current = soundOn;
    known.current.clear();
  }

  // Once: the channel and how notifications show in the foreground, then ask the system how it stands.
  const channelName = t("session__rest_channel");
  useEffect(() => {
    void installRestNotifications(channelName);
    void refreshRestPermission();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refreshRestPermission();
    });
    return () => subscription.remove();
  }, [channelName]);

  const body = (title: string) => t("session__rest_over_body", { title });
  const heading = t("session__rest_over_title");
  useEffect(() => {
    if (loading || installId === null || permission === "unknown") return;
    const jobSound = soundOn;
    void reconciler.current
      .enqueue(async (current) => {
        const plan = planRestSchedule({
          sessions: sessions.map((session) => ({
            id: session.id,
            title: session.title,
            restEndsAt: session.restEndsAt,
            owned: session.deviceId === installId,
          })),
          scheduledIds: await scheduledRestIds(),
          known: known.current,
          now: Date.now(),
          granted: permission === "granted",
        });
        if (!current()) return;
        for (const id of plan.cancel) {
          await cancelRestNotification(id);
          known.current.delete(id.slice(REST_NOTIFICATION_PREFIX.length));
          if (!current()) return;
        }
        for (const entry of plan.schedule) {
          await scheduleRestNotification(entry.sessionId, entry.endsAt, {
            title: heading,
            body: body(entry.title),
          });
          // Even an obsolete job must record what the system now holds for the next plan, unless
          // the sound setting changed meanwhile: then it holds the old sound and must be redone.
          if (scheduledWithSound.current === jobSound) {
            known.current.set(entry.sessionId, entry.endsAt);
          } else {
            known.current.delete(entry.sessionId);
          }
          if (!current()) return;
        }
      })
      .catch(() => undefined);
    return () => {
      reconciler.current.invalidate();
    };
    // `body` and `heading` only change with the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, loading, installId, permission, heading, soundOn]);

  return null;
}
