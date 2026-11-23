import { pauseExpiresAt } from "@workspace/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { finishTimeOf, forgottenSession, lastActivity } from "./forgotten";
import { expiredPauses } from "./pause-expiry";
import { useActiveSessions } from "./use-active-sessions";
import { useSessionActions } from "@/session/screen/use-session-actions";
import { useInstallId } from "@/session/shared/use-install-id";
import { SheetShell } from "@/session/shared/sheet-shell";

const HOUR = 60 * 60 * 1000;

/**
 * When the app comes to the foreground and the active Session's last tick is more than 3 hours
 * old, asks what to do: finish it at the last tick plus its rest, keep going, or discard it.
 * Nothing finishes in the background. A pause left running for 4 hours is ended the same way:
 * at the deadline in the foreground, or where it ran out when the app comes back. Mount once,
 * inside the signed-in app.
 */
export function ForgottenSessionHost() {
  const { t, i18n } = useTranslation();
  const { sessions, loading } = useActiveSessions();
  const actions = useSessionActions();
  const installId = useInstallId();
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const snoozed = useRef(new Map<string, number>());
  const latest = useRef(sessions);
  // The foreground listener lives for the whole mount: it reads the newest of these.
  const owner = useRef({ installId, resume: actions.resume });
  useEffect(() => {
    latest.current = sessions;
    owner.current = { installId, resume: actions.resume };
  });

  const check = useCallback(() => {
    const { installId: mine, resume } = owner.current;
    const now = Date.now();
    if (mine !== null) {
      for (const { id, resumeAt } of expiredPauses(latest.current, now, mine)) {
        void resume(id, resumeAt);
      }
    }
    const running = latest.current.filter((session) => session.pausedAt === null);
    const found = forgottenSession(running, now, snoozed.current);
    setCandidateId((current) =>
      running.some((session) => session.id === current) ? current : (found?.id ?? null),
    );
  }, []);
  // When the app opens or the sessions first load, and every time it comes back to the front.
  useEffect(() => {
    if (loading) return;
    const now = Date.now();
    if (AppState.currentState === "active") check();
    const next = Math.min(
      ...sessions.flatMap((session) => {
        if (session.deviceId !== installId || session.pausedAt === null) return [];
        const expiry = pauseExpiresAt(session.pausedAt);
        return expiry > now ? [expiry] : [];
      }),
    );
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(
      () => {
        if (AppState.currentState === "active") check();
      },
      next - now + 1,
    );
    return () => clearTimeout(timer);
  }, [check, installId, loading, sessions]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") check();
    });
    return () => subscription.remove();
  }, [check]);

  const candidate = sessions.find((session) => session.id === candidateId) ?? null;
  const dismiss = () => {
    if (candidateId !== null) snoozed.current.set(candidateId, Date.now());
    setCandidateId(null);
  };
  const hours = candidate
    ? Math.max(1, Math.floor((Date.now() - lastActivity(candidate)) / HOUR))
    : 0;
  const finishAt = candidate ? finishTimeOf(candidate) : null;

  return (
    <SheetShell
      isOpen={candidate !== null}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      title={t("session__forgotten_title")}
      description={
        candidate
          ? t("session__forgotten_body", { title: candidate.title, count: hours })
          : undefined
      }
    >
      <View className="gap-2">
        {candidate && finishAt && candidate.tickedSets > 0 ? (
          <Button
            variant="primary"
            onPress={() => {
              setCandidateId(null);
              void actions.finish(candidate.id, { finishedAt: finishAt });
            }}
          >
            <Button.Label>
              {t("session__forgotten_finish", {
                time: new Date(finishAt).toLocaleTimeString(i18n.language, {
                  hour: "numeric",
                  minute: "2-digit",
                }),
              })}
            </Button.Label>
          </Button>
        ) : null}
        <Button variant="secondary" onPress={dismiss}>
          <Button.Label>{t("session__forgotten_keep")}</Button.Label>
        </Button>
        {candidate ? (
          <Button
            variant="danger-soft"
            onPress={() => {
              setCandidateId(null);
              void actions.discard(candidate.id, candidate.title);
            }}
          >
            <Button.Label>{t("session__discard")}</Button.Label>
          </Button>
        ) : null}
      </View>
    </SheetShell>
  );
}
