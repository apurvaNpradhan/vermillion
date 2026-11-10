import type { ActiveSession } from "@workspace/sync";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { elapsedSeconds, formatElapsed } from "../clock";
import { useNow } from "../use-now";
import { useSessionActions } from "../use-session-actions";
import { SheetShell } from "./sheet-shell";

function Elapsed({ startedAt }: { startedAt: string }) {
  const now = useNow();
  return <>{formatElapsed(elapsedSeconds(startedAt, now))}</>;
}

/**
 * Two Sessions started offline are both here: resume, finish or discard each. Nothing is ever
 * deleted automatically (ADR 0038). A Session with no ticked set cannot be finished, only discarded.
 */
export function SessionsSheet({
  sessions,
  isOpen,
  onOpenChange,
  onResume,
}: {
  sessions: readonly ActiveSession[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onResume: (id: string) => void;
}) {
  const { t } = useTranslation();
  const actions = useSessionActions();
  return (
    <SheetShell
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("session__many_in_progress", { count: sessions.length })}
      description={t("session__many_hint")}
    >
      <View className="gap-3">
        {sessions.map((session) => (
          <View key={session.id} className="gap-3 rounded-2xl bg-surface p-3">
            <View className="gap-0.5">
              <Text numberOfLines={1} className="font-medium text-body text-foreground">
                {session.title}
              </Text>
              <Text className="text-caption text-muted" style={{ fontVariant: ["tabular-nums"] }}>
                <Elapsed startedAt={session.startedAt} />
                {` · ${t("session__progress_sets", { done: session.tickedSets, total: session.totalSets })}`}
              </Text>
            </View>
            <View className="flex-row gap-2">
              <Button className="flex-1" variant="primary" onPress={() => onResume(session.id)}>
                <Button.Label>{t("session__resume")}</Button.Label>
              </Button>
              {session.tickedSets > 0 ? (
                <Button
                  className="flex-1"
                  variant="secondary"
                  onPress={() => void actions.finish(session.id, {})}
                >
                  <Button.Label>{t("session__finish")}</Button.Label>
                </Button>
              ) : null}
              <Button
                className="flex-1"
                variant="danger-soft"
                onPress={() => void actions.discard(session.id, session.title)}
              >
                <Button.Label>{t("session__discard")}</Button.Label>
              </Button>
            </View>
          </View>
        ))}
      </View>
    </SheetShell>
  );
}
