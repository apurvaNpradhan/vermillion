import { Link } from "@tanstack/react-router";
import { useSignOut } from "@/auth";
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@workspace/ui/components/menu";

import { useTranslation } from "@/platform/i18n";
import { useSignOutConfirmation } from "@/sync";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Account menu for a signed-in user. */
export function UserMenu({ name, email }: { name: string; email: string }) {
  const { t } = useTranslation();
  const signOut = useSignOut();
  const confirmation = useSignOutConfirmation(() => signOut.mutate());
  return (
    <>
      <Menu>
        <MenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={t("nav__account_menu")} />}
        >
          <Avatar className="size-7">
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
        </MenuTrigger>
        <MenuPopup align="end">
          <div className="px-2 py-1.5 text-sm">
            <p className="font-medium">{name}</p>
            <p className="text-muted-foreground text-xs">{email}</p>
          </div>
          <MenuSeparator />
          <MenuItem render={<Link to="/app" />}>{t("nav__dashboard")}</MenuItem>
          <MenuItem render={<Link to="/settings" />}>{t("nav__settings")}</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => void confirmation.request()}>{t("nav__sign_out")}</MenuItem>
        </MenuPopup>
      </Menu>
      {confirmation.dialog}
    </>
  );
}
