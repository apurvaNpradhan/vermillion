import { watchSessionPage, watchRecordHistory, type FinishedSession } from "@workspace/sync";
import { useCallback, useRef } from "react";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

const PAGE_SIZE = 50;
const FIRST = { startedAt: "9999-01-01T00:00:00.000Z", id: "~" };

/** Live cursor pages, with no global lifetime cap. */
export function useSessionHistory() {
  const more = useRef<() => void>(() => undefined);
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchSessionPage>[0],
      onValue: (value: { sessions: FinishedSession[]; hasMore: boolean }) => void,
      onError: () => void,
    ) => {
      const pages: FinishedSession[][] = [];
      const stops: (() => void)[] = [];
      const keys: string[] = [];
      let requested = 1;
      let active = true;
      const emit = () => {
        if (!active) return;
        onValue({
          sessions: pages.flatMap((page) => page.slice(0, PAGE_SIZE)),
          hasMore: (pages.at(-1)?.length ?? 0) > PAGE_SIZE,
        });
      };
      const open = (index: number, cursor: typeof FIRST) => {
        const key = `${cursor.startedAt}|${cursor.id}`;
        if (keys[index] === key) return;
        stops.splice(index).forEach((stop) => stop());
        keys.splice(index);
        pages.splice(index);
        keys[index] = key;
        stops[index] = watchSessionPage(database, cursor, PAGE_SIZE + 1, {
          onSessions: (rows) => {
            if (!active || keys[index] !== key) return;
            pages[index] = rows;
            const last = rows[PAGE_SIZE - 1];
            if (requested > index + 1 && rows.length > PAGE_SIZE && last)
              open(index + 1, { startedAt: last.started_at, id: last.id });
            else if (rows.length <= PAGE_SIZE) {
              stops.splice(index + 1).forEach((stop) => stop());
              pages.splice(index + 1);
              keys.splice(index + 1);
            }
            emit();
          },
          onError,
        });
      };
      more.current = () => {
        const page = pages.at(-1);
        const last = page?.[PAGE_SIZE - 1];
        if (!page || page.length <= PAGE_SIZE || !last || pages.length !== keys.length) return;
        requested = pages.length + 1;
        open(pages.length, { startedAt: last.started_at, id: last.id });
      };
      open(0, FIRST);
      return () => {
        active = false;
        more.current = () => undefined;
        stops.forEach((stop) => stop());
      };
    },
    [],
  );
  const state = useLocalWatch(subscribe);
  const loadMore = useCallback(() => more.current(), []);
  return {
    sessions: state.value?.sessions ?? [],
    loading: state.loading,
    failed: state.failed,
    retry: state.retry,
    hasMore: state.value?.hasMore ?? false,
    loadMore,
  };
}

/** Record flags must never use the paginated browsing history. */
export function useRecordHistory(exerciseIds: readonly string[]) {
  const key = [...new Set(exerciseIds)].sort().join("|");
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchRecordHistory>[0],
      onValue: (value: FinishedSession[]) => void,
      onError: () => void,
    ) => watchRecordHistory(database, key ? key.split("|") : [], { onSessions: onValue, onError }),
    [key],
  );
  const state = useLocalWatch(subscribe);
  return {
    sessions: state.value ?? [],
    loading: state.loading,
    failed: state.failed,
    retry: state.retry,
  };
}
