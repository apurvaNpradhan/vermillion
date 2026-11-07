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
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" render={<Link to="/login" />}>
        {t("nav__sign_in")}
      </Button>
      <Button size="sm" render={<Link to="/sign-up" />}>
        {t("nav__sign_up")}
      </Button>
    </div>
  );
}
