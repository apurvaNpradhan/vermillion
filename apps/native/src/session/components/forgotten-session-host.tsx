import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { finishTimeOf, forgottenSession, lastActivity } from "../forgotten";
import { useActiveSessions } from "../use-active-sessions";
import { useSessionActions } from "../use-session-actions";
import { SheetShell } from "./sheet-shell";

const HOUR = 60 * 60 * 1000;

/**
 * When the app comes to the foreground and the active Session's last tick is more than 3 hours
 * old, asks what to do: finish it at the last tick plus its rest, keep going, or discard it.
 * Nothing finishes in the background. Mount once, inside the signed-in app.
 */
export function ForgottenSessionHost() {
  const { t, i18n } = useTranslation();
  const { sessions, loading } = useActiveSessions();
  const actions = useSessionActions();
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const snoozed = useRef(new Map<string, number>());
  const latest = useRef(sessions);
  useEffect(() => {
    latest.current = sessions;
  });

  const check = () => {
    const found = forgottenSession(latest.current, Date.now(), snoozed.current);
    setCandidateId((current) => (current === null ? (found?.id ?? null) : current));
  };
  // When the app opens or the sessions first load, and every time it comes back to the front.
  useEffect(() => {
    if (!loading && AppState.currentState === "active") check();
  }, [loading, sessions]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") check();
    });
    return () => subscription.remove();
  }, []);

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
