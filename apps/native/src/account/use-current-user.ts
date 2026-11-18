import { useSession } from "@/auth";

/**
 * The signed-in user's name and email, from the session the device remembers: no request, so it
 * shows at once and offline. A profile or email change refreshes the session.
 */
export function useCurrentUser() {
  const { session, isPending } = useSession();
  const user = session
    ? { id: session.user.id, name: session.user.name, email: session.user.email }
    : null;
  return { user, isPending };
}
