import { useState } from "react";

import {
  columnsFor,
  ConfirmAction,
  DataTable,
  EditSheet,
  formatDate,
  formatDateTime,
  PageTitle,
  Pager,
  SearchBox,
  SelectField,
} from "@/admin";
import { useT } from "@/platform/i18n";
import { Badge } from "@/platform/ui/badge";
import { Button } from "@/platform/ui/button";
import { Input } from "@/platform/ui/input";

import {
  USERS_PAGE,
  useAccountView,
  useUserActions,
  useUsersList,
  type UsersSearch,
} from "../use-users";

type Row = ReturnType<typeof useUsersList>["users"][number];
const column = columnsFor<Row>();

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-hairline border-b py-2 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-end text-text-primary">{value}</dd>
    </div>
  );
}

/** The account view: identity, sign-in facts, ban state, counts. No training data. */
function AccountView({ userId, onDeleted }: { userId: string; onDeleted: () => void }) {
  const t = useT();
  const { account } = useAccountView(userId);
  const { ban, unban, revoke, remove } = useUserActions();
  const [reason, setReason] = useState("");
  if (!account) return <p className="text-text-muted">{t("admin__loading")}</p>;
  const isAdmin = account.role === "admin";
  return (
    <div className="flex flex-col gap-4">
      <dl>
        <Fact label={t("users__email")} value={account.email} />
        <Fact label={t("users__name")} value={account.name} />
        <Fact label={t("users__created")} value={formatDate(account.createdAt)} />
        <Fact label={t("users__last_sign_in")} value={formatDateTime(account.lastSignInAt)} />
        <Fact label={t("users__method")} value={account.lastSignInMethod ?? "—"} />
        <Fact label={t("users__app_version")} value={account.lastSeenAppVersion ?? "—"} />
        <Fact
          label={t("users__ban")}
          value={
            account.banned
              ? t("users__banned_because", { reason: account.banReason ?? "" })
              : t("users__not_banned")
          }
        />
        <Fact label={t("users__programs")} value={String(account.counts.programs)} />
        <Fact label={t("users__sessions")} value={String(account.counts.sessions)} />
        <Fact label={t("users__custom")} value={String(account.counts.customExercises)} />
        <Fact label={t("users__media")} value={String(account.counts.media)} />
      </dl>
      {isAdmin ? <p className="text-sm text-text-muted">{t("users__admin_protected")}</p> : null}
      {!isAdmin ? (
        <div className="flex flex-col gap-2">
          {account.banned ? (
            <Button variant="outline" onClick={() => void unban(account.id)}>
              {t("users__unban")}
            </Button>
          ) : (
            <>
              <Input
                aria-label={t("users__ban_reason")}
                placeholder={t("users__ban_reason")}
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
              />
              <ConfirmAction
                trigger={
                  <Button variant="destructive-outline" disabled={!reason.trim()}>
                    {t("users__ban_action")}
                  </Button>
                }
                title={t("users__ban_title", { email: account.email })}
                body={t("users__ban_body")}
                action={t("users__ban_action")}
                onConfirm={async () =>
                  void (await ban({ userId: account.id, reason: reason.trim() }))
                }
              />
            </>
          )}
          <ConfirmAction
            trigger={<Button variant="outline">{t("users__revoke")}</Button>}
            title={t("users__revoke_title")}
            body={t("users__revoke_body", { email: account.email })}
            action={t("users__revoke")}
            onConfirm={async () => void (await revoke(account.id))}
          />
          <ConfirmAction
            trigger={<Button variant="destructive">{t("users__delete")}</Button>}
            title={t("users__delete_title")}
            body={t("users__delete_body", { email: account.email })}
            action={t("users__delete")}
            typed={account.email}
            onConfirm={async () => {
              await remove({ userId: account.id, email: account.email });
              onDeleted();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function UsersPage({
  search,
  onSearch,
  open,
  onOpen,
}: {
  search: UsersSearch;
  onSearch: (next: UsersSearch) => void;
  open: string | null;
  onOpen: (id: string | null) => void;
}) {
  const t = useT();
  const { users, total, loading } = useUsersList(search);
  const columns = column.columns([
    column.accessor("email", { header: t("users__email") }),
    column.accessor("name", { header: t("users__name") }),
    column.accessor("createdAt", {
      header: t("users__created"),
      cell: (c) => formatDate(c.getValue()),
    }),
    column.accessor("lastSignInAt", {
      header: t("users__last_sign_in"),
      cell: (c) => formatDate(c.getValue()),
    }),
    column.accessor("lastSeenAppVersion", {
      header: t("users__app_version"),
      cell: (c) => c.getValue() ?? "—",
    }),
    column.accessor("banned", {
      header: "",
      cell: (c) => (c.getValue() ? <Badge variant="outline">{t("users__banned")}</Badge> : null),
    }),
  ]);
  return (
    <>
      <PageTitle title={t("admin__nav_users")} />
      <div className="flex flex-wrap gap-2">
        <SearchBox
          value={search.search ?? ""}
          onChange={(value) => onSearch({ ...search, page: 1, search: value || undefined })}
        />
        <SelectField
          id="filter-banned"
          value={search.banned === undefined ? "" : String(search.banned)}
          onChange={(value) =>
            onSearch({ ...search, page: 1, banned: value === "" ? undefined : value === "true" })
          }
          options={[
            { value: "", label: t("admin__filter_any") },
            { value: "true", label: t("users__banned") },
            { value: "false", label: t("users__not_banned") },
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        onOpen={(row) => onOpen(row.id)}
      />
      <Pager
        page={search.page}
        limit={USERS_PAGE}
        total={total}
        onPage={(page) => onSearch({ ...search, page })}
      />
      <EditSheet open={open !== null} onClose={() => onOpen(null)} title={t("users__account")}>
        {open ? <AccountView userId={open} onDeleted={() => onOpen(null)} /> : null}
      </EditSheet>
    </>
  );
}
