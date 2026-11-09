import { Link } from "@tanstack/react-router";
import { useSession } from "@/auth";
import { Button } from "@workspace/ui/components/button";

import { useTranslation } from "@/platform/i18n";

import { UserMenu } from "./user-menu";

/**
 * The session-dependent part of the public navbar. The server renders the
 * signed-out links; once the session loads in the browser this swaps to the
 * account menu, so public pages stay cacheable and never wait on the API.
 */
export function SessionSlot() {
  const { t } = useTranslation();
  const { session } = useSession();
  if (session) return <UserMenu name={session.user.name} email={session.user.email} />;
  return (
    <Button size="sm" render={<Link to="/login" />}>
      {t("nav__sign_in")}
    </Button>
  );
}
