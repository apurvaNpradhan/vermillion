import type { ActiveSession } from "@workspace/sync";
import { useRouter } from "expo-router";
import { Barbell, CaretUp } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useReserveAboveBar } from "@/platform/navigation/tab-action";
import { TAB_BAR_HEIGHT, useTabBarBottom } from "@/platform/navigation/tab-bar-metrics";
import { useSubtleColor } from "@/platform/theme";
import { FloatingSurface } from "@/platform/ui/floating-surface";

import { elapsedSeconds, formatElapsed } from "../clock";
import { currentExercise } from "../resume";
import { useActiveSessions } from "../use-active-sessions";
import { useNow } from "../use-now";
import { useSession } from "../use-session";
import { SessionsSheet } from "./sessions-sheet";

const HEIGHT = 52;
const GAP = 8;
const SIDE = 16;

/**
 * Above the tab pill on every tab while a Session is active: its title, the clock and the exercise
 * being worked on. Tapping it opens the Session. With more than one active Session (two started
 * offline) it reads "2 sessions in progress" and opens the chooser.
 */
export function ResumeBar() {
  const { sessions } = useActiveSessions();
  const [chooser, setChooser] = useState(false);
  useReserveAboveBar(sessions.length > 0 ? HEIGHT + GAP : 0);
  const router = useRouter();
  const open = (id: string) => router.push({ pathname: "/session/[id]", params: { id } });
  const only = sessions.length === 1 ? sessions[0] : undefined;
  if (sessions.length === 0) return null;
  return (
    <>
      {only ? (
        <Strip>
          <SingleSession session={only} onOpen={() => open(only.id)} />
        </Strip>
      ) : (
        <Strip>
          <ManySessions count={sessions.length} onOpen={() => setChooser(true)} />
        </Strip>
      )}
      <SessionsSheet
        sessions={sessions}
        isOpen={chooser}
        onOpenChange={setChooser}
        onResume={(id) => {
          setChooser(false);
          open(id);
        }}
      />
    </>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  const bottom = useTabBarBottom();
  return (
    <Animated.View
      entering={FadeIn.duration(140).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(100).reduceMotion(ReduceMotion.System)}
      className="absolute"
      style={{ left: SIDE, right: SIDE, bottom: bottom + TAB_BAR_HEIGHT + GAP, height: HEIGHT }}
    >
      <FloatingSurface radius={HEIGHT / 2} style={{ height: HEIGHT }}>
        {children}
      </FloatingSurface>
    </Animated.View>
  );
}

function Clock({ startedAt }: { startedAt: string }) {
  const now = useNow();
  return <>{formatElapsed(elapsedSeconds(startedAt, now))}</>;
}

function SingleSession({ session, onOpen }: { session: ActiveSession; onOpen: () => void }) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const state = useSession(session.id);
  const current = state.status === "ready" ? currentExercise(state.session.exercises) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("session__resume_label", { title: session.title })}
      onPress={() => {
        haptic.tick();
        onOpen();
      }}
      className="h-full flex-row items-center gap-3 px-4"
    >
      <Barbell size={20} color={subtle} weight="fill" />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-medium text-label text-foreground">
          {session.title}
        </Text>
        <Text
          numberOfLines={1}
          className="text-caption text-muted"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          <Clock startedAt={session.startedAt} />
          {current ? ` · ${current.title}` : ""}
        </Text>
      </View>
      <CaretUp size={16} color={subtle} weight="bold" />
    </Pressable>
  );
}

function ManySessions({ count, onOpen }: { count: number; onOpen: () => void }) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.tick();
        onOpen();
      }}
      className="h-full flex-row items-center gap-3 px-4"
    >
      <Barbell size={20} color={subtle} weight="fill" />
      <Text numberOfLines={1} className="min-w-0 flex-1 font-medium text-label text-foreground">
        {t("session__many_in_progress", { count })}
      </Text>
      <CaretUp size={16} color={subtle} weight="bold" />
    </Pressable>
  );
}
