import { INVITE_STATES, type InviteState } from "@workspace/shared";
import { useState } from "react";

import {
  columnsFor,
  ConfirmAction,
  DataTable,
  formatDate,
  PageTitle,
  Pager,
  SearchBox,
  SelectField,
} from "@/admin";
import { useT, type SiteKey } from "@/platform/i18n";
import { Badge } from "@/platform/ui/badge";
import { Button } from "@/platform/ui/button";
import { Input } from "@/platform/ui/input";

import { ACCESS_PAGE, useAccessActions, useInvites, type AccessSearch } from "../use-access";

type Row = ReturnType<typeof useInvites>["invites"][number];
const column = columnsFor<Row>();

const STATE_KEYS: Record<InviteState, SiteKey> = {
  requested: "access__state_requested",
  invited: "access__state_invited",
  redeemed: "access__state_redeemed",
  expired: "access__state_expired",
  revoked: "access__state_revoked",
};

/** Requests and invites by state; approve, invite directly, resend and revoke. */
export function AccessPage({
  search,
  onSearch,
}: {
  search: AccessSearch;
  onSearch: (next: AccessSearch) => void;
}) {
  const t = useT();
  const { invites, total, loading } = useInvites(search);
  const { approve, resend, revoke, invite, inviting } = useAccessActions();
  const [email, setEmail] = useState("");
  const columns = column.columns([
    column.accessor("email", { header: t("access__email") }),
    column.accessor("state", {
      header: t("access__state"),
      cell: (c) => <Badge variant="outline">{t(STATE_KEYS[c.getValue()])}</Badge>,
    }),
    column.accessor("requestedAt", {
      header: t("access__requested"),
      cell: (c) => formatDate(c.getValue()),
    }),
    column.accessor("invitedAt", {
      header: t("access__invited"),
      cell: (c) => formatDate(c.getValue()),
    }),
    column.accessor("expiresAt", {
      header: t("access__expires"),
      cell: (c) => formatDate(c.getValue()),
    }),
    column.display({
      id: "actions",
      header: "",
      cell: (c) => {
        const row = c.row.original;
        return (
          <div className="flex gap-2">
            {row.state === "requested" ? (
              <Button size="sm" onClick={() => void approve(row.id)}>
                {t("access__approve")}
              </Button>
            ) : null}
            {row.state === "invited" || row.state === "expired" ? (
              <Button size="sm" variant="outline" onClick={() => void resend(row.id)}>
                {t("access__resend")}
              </Button>
            ) : null}
            {row.state !== "redeemed" && row.state !== "revoked" ? (
              <ConfirmAction
                trigger={
                  <Button size="sm" variant="destructive-outline">
                    {t("access__revoke")}
                  </Button>
                }
                title={t("access__revoke_title", { email: row.email })}
                body={t("access__revoke_body")}
                action={t("access__revoke")}
                onConfirm={async () => void (await revoke(row.id))}
              />
            ) : null}
          </div>
        );
      },
    }),
  ]);
  return (
    <>
      <PageTitle title={t("admin__nav_access")} />
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (event) => {
          event.preventDefault();
          await invite(email.trim());
          setEmail("");
        }}
      >
        <Input
          type="email"
          required
          aria-label={t("access__invite_email")}
          placeholder={t("access__invite_email")}
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          className="sm:max-w-xs"
        />
        <Button type="submit" loading={inviting}>
          {t("access__invite")}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <SearchBox
          value={search.search ?? ""}
          onChange={(value) => onSearch({ ...search, page: 1, search: value || undefined })}
        />
        <SelectField
          id="filter-state"
          value={search.state ?? ""}
          onChange={(value) =>
            onSearch({ ...search, page: 1, state: INVITE_STATES.find((state) => state === value) })
          }
          options={[
            { value: "", label: t("admin__filter_any") },
            ...INVITE_STATES.map((value) => ({ value, label: t(STATE_KEYS[value]) })),
          ]}
        />
      </div>
      <DataTable columns={columns} data={invites} loading={loading} />
      <Pager
        page={search.page}
        limit={ACCESS_PAGE}
        total={total}
        onPage={(page) => onSearch({ ...search, page })}
      />
    </>
  );
}
