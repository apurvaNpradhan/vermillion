import type { SessionClock } from "@workspace/shared";
import type { SetStartResult } from "@workspace/sync";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { useAppToast } from "@/platform/ui/use-app-toast";

import { useSessionStore } from "@/session/store/session-store-context";
import { sameDay } from "@/session/lifecycle/save-time";
import { DateSheet } from "@/session/lifecycle/save-time-sheets";
import { useActiveSeconds } from "@/session/shared/use-active-seconds";
import { SheetShell } from "@/session/shared/sheet-shell";
import { formatElapsed } from "@/session/timer/clock";
import { START_PROBLEM_KEYS, latestStartMs } from "./clock-view";

/** One sheet is given time to close before the next opens: two never show at once. */
const HAND_OVER_MS = 280;

/** The duration in large tabular figures; the one leaf here that re-renders every second. */
function BigClock({ clock }: { clock: SessionClock }) {
  const seconds = useActiveSeconds(clock);
  return (
    <Text
      accessibilityRole="timer"
      className="text-center font-semibold text-display-lg text-foreground"
      style={{ fontVariant: ["tabular-nums"] }}
    >
      {formatElapsed(seconds)}
    </Text>
  );
}

/**
 * The workout clock, opened from the header: the time trained (large), when the workout started
 * (tap to change it) and Pause or Resume. Pausing stops the clock, the Rest and running set
 * timers; the start is never in the future nor after the first logged set.
 */
export function ClockSheet({
  isOpen,
  onOpenChange,
  startedAt,
  pausedAt,
  pausedMs,
  firstTickedAt,
  onTogglePause,
  onSetStart,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  startedAt: string;
  pausedAt: string | null;
  pausedMs: number;
  firstTickedAt: string | null;
  onTogglePause: () => Promise<void>;
  /** Null when the write failed (already shown to the user). */
  onSetStart: (startedAt: string) => Promise<SetStartResult | null>;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useAppToast();
  const preview = useSessionStore((state) => state.pending.find((write) => write.clock)?.clock);
  const clock = preview ?? { startedAt, pausedAt, pausedMs };
  const paused = clock.pausedAt !== null;

  const [editing, setEditing] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [draft, setDraft] = useState(() => new Date(startedAt));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((run: () => void) => {
    timers.current.push(setTimeout(run, HAND_OVER_MS));
  }, []);
  useEffect(() => {
    const held = timers.current;
    return () => held.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    if (!isOpen) {
      setEditing(false);
      setDateOpen(false);
    }
  }, [isOpen]);

  const openStart = () => {
    setDraft(new Date(startedAt));
    setEditing(true);
    later(() => setDateOpen(true));
  };
  const closeStart = async (open: boolean) => {
    if (open) return;
    setDateOpen(false);
    later(() => setEditing(false));
    if (draft.getTime() === Date.parse(startedAt)) return;
    const result = await onSetStart(draft.toISOString());
    if (result && !result.ok) {
      toast.show({ variant: "danger", label: t(START_PROBLEM_KEYS[result.problem]) });
    }
  };

  const started = new Date(startedAt);
  const time = new Intl.DateTimeFormat(i18n.language, { hour: "numeric", minute: "2-digit" });
  const startedText = sameDay(started, new Date())
    ? t("session__clock_started", { time: time.format(started) })
    : t("session__clock_started_on", {
        date: new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" }).format(
          started,
        ),
        time: time.format(started),
      });
  const now = new Date();
  const upper = new Date(
    latestStartMs({ nowMs: now.getTime(), firstTickedAt, pausedAt: clock.pausedAt }),
  );

  return (
    <>
      <SheetShell
        isOpen={isOpen && !editing}
        onOpenChange={(open) => {
          if (!editing) onOpenChange(open);
        }}
        title={t("session__clock_title")}
        description={t("session__clock_hint")}
      >
        <View className="items-center gap-1 py-2">
          <BigClock clock={clock} />
          {paused ? (
            <Text className="font-medium text-label text-muted">{t("session__paused_label")}</Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${startedText}. ${t("session__clock_edit_start")}`}
          onPress={openStart}
          className="min-h-11 items-center justify-center rounded-xl bg-surface px-4 active:opacity-60"
        >
          <Text className="font-normal text-body text-foreground">{startedText}</Text>
        </Pressable>
        <Button
          variant="primary"
          isDisabled={preview !== undefined}
          onPress={() => void onTogglePause()}
        >
          <Button.Label>
            {t(paused ? "session__clock_resume" : "session__clock_pause")}
          </Button.Label>
        </Button>
      </SheetShell>
      <DateSheet
        isOpen={isOpen && editing && dateOpen}
        onOpenChange={(open) => void closeStart(open)}
        startedAt={draft}
        now={now}
        language={i18n.language}
        latest={upper}
        onChange={setDraft}
      />
    </>
  );
}
