import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { isHidden } from "./is-hidden";

/** Reveals last only until blur or a change to the privacy setting. */
export function useReveal(hide: boolean) {
  const [state, setState] = useState({ hide, ids: new Set<string>() });
  if (state.hide !== hide) setState({ hide, ids: new Set() });
  useFocusEffect(useCallback(() => () => setState({ hide, ids: new Set() }), [hide]));
  return {
    hidden: (id: string) => isHidden(hide, state.hide === hide && state.ids.has(id)),
    reveal: (id: string) => setState((current) => ({ hide, ids: new Set(current.ids).add(id) })),
  };
}
