import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Input } from "@workspace/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { useEffect, useState } from "react";

import { useCurrentUser } from "@/account";
import { useTranslation } from "@/platform/i18n";

import { ADMIN_PAGE_SIZE, useAdminUsers } from "../use-admin-users";

type AdminUser = ReturnType<typeof useAdminUsers>["users"][number];
type PendingAction = { kind: "ban" | "remove"; user: AdminUser } | null;

function useDebounced(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function AdminUsersPage() {
  const { t } = useTranslation();
  const { user: me } = useCurrentUser();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim(), 300);
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<PendingAction>(null);
  const { users, total, isLoading, ban, unban, remove } = useAdminUsers({ search, page });
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  useEffect(() => setPage(1), [search]);

  async function confirm() {
    if (!pending) return;
    if (pending.kind === "ban") await ban(pending.user.id);
    else await remove(pending.user.id);
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-xl">{t("admin__users_title")}</h1>
        <Input
          type="search"
          className="max-w-xs"
          aria-label={t("admin__search_label")}
          placeholder={t("admin__search_placeholder")}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </div>

      <Table variant="card">
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin__col_name")}</TableHead>
            <TableHead>{t("admin__col_email")}</TableHead>
            <TableHead>{t("admin__col_status")}</TableHead>
            <TableHead className="text-end">{t("admin__col_actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                {isLoading ? t("common__loading") : t("admin__empty")}
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => {
              const isSelf = user.id === me?.id;
              return (
                <TableRow key={user.id} data-testid="admin-user-row">
                  <TableCell>
                    {user.name}
                    {user.role === "admin" ? (
                      <Badge variant="outline" className="ms-2">
                        {t("admin__role_admin")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {user.banned ? (
                      <Badge variant="error">{t("admin__status_banned")}</Badge>
                    ) : user.emailVerified ? (
                      <Badge variant="success">{t("admin__status_active")}</Badge>
                    ) : (
                      <Badge variant="warning">{t("admin__status_unverified")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    {isSelf ? (
                      <span className="text-muted-foreground text-xs">{t("admin__you")}</span>
                    ) : (
                      <div className="flex justify-end gap-2">
                        {user.banned ? (
                          <Button size="sm" variant="outline" onClick={() => void unban(user.id)}>
                            {t("admin__unban")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPending({ kind: "ban", user })}
                          >
                            {t("admin__ban")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive-outline"
                          onClick={() => setPending({ kind: "remove", user })}
                        >
                          {t("common__delete")}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <span>{t("admin__total", { count: total })}</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t("common__previous")}
          </Button>
          <span>{t("admin__page", { page, pages })}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t("common__next")}
          </Button>
        </div>
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "ban"
                ? t("admin__ban_title", { email: pending.user.email })
                : t("admin__delete_title", { email: pending?.user.email ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "ban" ? t("admin__ban_body") : t("admin__delete_body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common__cancel")}
            </AlertDialogClose>
            <Button variant="destructive" onClick={() => void confirm()}>
              {pending?.kind === "ban" ? t("admin__ban") : t("common__delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
