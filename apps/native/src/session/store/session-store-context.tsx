import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";

import type { SessionState, SessionStore } from "./session-store";

const SessionStoreContext = createContext<SessionStore | null>(null);

/** Gives the components of one live Session its store (made per mounted session, never global). */
export function SessionStoreProvider({
  store,
  children,
}: {
  store: SessionStore;
  children: ReactNode;
}) {
  return <SessionStoreContext.Provider value={store}>{children}</SessionStoreContext.Provider>;
}

/** The store itself, for handlers that read `getState()` when an event fires. */
export function useSessionStoreApi(): SessionStore {
  const store = useContext(SessionStoreContext);
  if (!store) throw new Error("SessionStoreProvider is missing");
  return store;
}

/** One value from the store. Return primitives or stored objects, or wrap in `useShallow`. */
export function useSessionStore<Selected>(selector: (state: SessionState) => Selected): Selected {
  return useStore(useSessionStoreApi(), selector);
}
