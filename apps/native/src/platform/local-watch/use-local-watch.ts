import { useCallback, useEffect, useState } from "react";

import { useLocalData } from "@/sync";

type LocalDatabase = Extract<
  NonNullable<ReturnType<typeof useLocalData>>,
  { status: "ready" }
>["database"];

/** Owns subscription cleanup, retry and identity, so an old query cannot paint a new account. */
export function useLocalWatch<T>(
  subscribe: (
    database: LocalDatabase,
    onValue: (value: T) => void,
    onError: () => void,
  ) => () => void,
) {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    database: LocalDatabase;
    subscribe: typeof subscribe;
    attempt: number;
    value: T | undefined;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (!database) return;
    let active = true;
    const stop = subscribe(
      database,
      (value) => {
        if (active) setResult({ database, subscribe, attempt, value, failed: false });
      },
      () => {
        if (active) setResult({ database, subscribe, attempt, value: undefined, failed: true });
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [database, subscribe, attempt]);
  const current =
    result?.database === database && result?.subscribe === subscribe && result?.attempt === attempt
      ? result
      : null;
  const failed = local?.status === "unavailable" || (current?.failed ?? false);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { value: current?.value, failed, loading: !failed && current === null, retry };
}
