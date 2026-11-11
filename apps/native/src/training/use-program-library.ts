import { useRouter } from "expo-router";
import { useCallback } from "react";

import type { useActiveRun } from "./use-active-program";
import { useProgramActions } from "./use-program-actions";
import { usePrograms } from "./use-programs";

/** The overview and complete program list share the same open, copy and delete behavior. */
export function useProgramLibrary(
  active: Pick<ReturnType<typeof useActiveRun>, "runProgramId" | "activate" | "stop">,
) {
  const list = usePrograms();
  const actions = useProgramActions();
  const router = useRouter();
  const { runProgramId, activate, stop } = active;
  const open = useCallback(
    (id: string) => router.push({ pathname: "/train/program/[id]", params: { id } }),
    [router],
  );
  const duplicate = useCallback(
    async (program: { id: string; title: string }) => {
      const copy = await actions.duplicate(program.id, program.title);
      if (copy) open(copy);
    },
    [actions, open],
  );
  const remove = useCallback(
    (id: string, title: string) => void actions.remove(id, title),
    [actions],
  );
  return { ...list, activeId: runProgramId, activate, stop, open, duplicate, remove };
}
