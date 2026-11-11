import { AnimatedLegendList } from "@legendapp/list/reanimated";
import type { ProgramSummary } from "@workspace/sync";
import { useRouter } from "expo-router";
import { ListNumbers } from "phosphor-react-native";
import { useCallback } from "react";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page } from "@/platform/ui/page";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { SyncBanner } from "@/sync";

import { useActiveRun } from "../use-active-program";
import { useProgramLibrary } from "../use-program-library";
import { ProgramRow } from "./program-row";
import { TrainingListState } from "./training-list-state";

const NO_PROGRAMS: ProgramSummary[] = [];
const programKey = (program: ProgramSummary) => program.id;

/** The complete library behind the overview's two-program preview. */
export function ProgramsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const active = useActiveRun();
  const list = useProgramLibrary(active);
  const { open, duplicate, remove } = list;
  // One ready state: the list and the active marker appear together.
  const status = list.status === "list" && active.loading ? "loading" : list.status;
  const renderProgram = useCallback(
    ({ item, index }: { item: ProgramSummary; index: number }) => (
      <View
        className={`mx-4 overflow-hidden border-x border-b border-border ${index === 0 ? "rounded-t-2xl border-t" : ""} ${index === list.programs.length - 1 ? "rounded-b-2xl" : ""}`}
      >
        <ProgramRow
          program={item}
          activeId={list.activeId}
          onActivate={list.activate}
          onStop={list.stop}
          onOpen={open}
          onDuplicate={duplicate}
          onDelete={remove}
        />
      </View>
    ),
    [open, duplicate, remove, list.programs.length, list.activeId, list.activate, list.stop],
  );
  return (
    <SwipeGroup>
      <Page
        title={t("training__programs")}
        back
        actions={
          <Button
            variant="primary"
            className="rounded-full"
            onPress={() => router.push("/train/new-program")}
          >
            <Button.Label>{t("training__new_program")}</Button.Label>
          </Button>
        }
      >
        {({ header, contentContainerStyle, ...scroll }) => (
          <AnimatedLegendList
            recycleItems={false}
            {...scroll}
            className="flex-1"
            contentContainerStyle={contentContainerStyle}
            data={status === "list" ? list.programs : NO_PROGRAMS}
            keyExtractor={programKey}
            estimatedItemSize={88}
            extraData={renderProgram}
            renderItem={renderProgram}
            ListHeaderComponent={
              <View className="gap-6 px-4 pb-4">
                {header}
                <SyncBanner />
                <TrainingListState status={status} onRetry={list.retry} />
              </View>
            }
            ListEmptyComponent={
              status === "empty" ? (
                <EmptyState icon={ListNumbers} title={t("training__no_programs")} />
              ) : null
            }
          />
        )}
      </Page>
    </SwipeGroup>
  );
}
