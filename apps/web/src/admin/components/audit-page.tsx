import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@workspace/shared";

import { useT } from "@/platform/i18n";

import { AUDIT_PAGE, useAuditLog, type AuditFilters } from "../use-admin";
import { columnsFor, DataTable, Pager } from "./data-table";
import { formatDateTime, PageTitle, SelectField } from "./fields";

type Entry = ReturnType<typeof useAuditLog>["entries"][number];
const column = columnsFor<Entry>();

/** The record of admin writes, filtered by action and target (story 8). */
export function AuditPage({
  filters,
  onFilters,
}: {
  filters: AuditFilters;
  onFilters: (next: AuditFilters) => void;
}) {
  const t = useT();
  const { entries, total, loading } = useAuditLog(filters);
  const columns = column.columns([
    column.accessor("createdAt", {
      header: t("admin__col_when"),
      cell: (c) => formatDateTime(c.getValue()),
    }),
    column.accessor("actorEmail", {
      header: t("admin__col_actor"),
      cell: (c) => c.getValue() ?? c.row.original.actorUserId,
    }),
    column.accessor("action", { header: t("admin__col_action") }),
    column.accessor("targetType", { header: t("admin__col_target_type") }),
    column.accessor("targetId", {
      header: t("admin__col_target"),
      cell: (c) => <code className="text-xs">{c.getValue()}</code>,
    }),
    column.accessor("ip", { header: t("admin__col_ip"), cell: (c) => c.getValue() ?? "—" }),
    column.accessor((row) => JSON.stringify(row.detail), {
      id: "detail",
      header: t("admin__col_detail"),
      cell: (c) => <code className="text-xs">{c.getValue()}</code>,
    }),
  ]);
  const any = { value: "", label: t("admin__filter_any") };
  return (
    <>
      <PageTitle title={t("admin__nav_audit")} />
      <div className="flex flex-wrap gap-2">
        <SelectField
          id="audit-action"
          value={filters.action ?? ""}
          onChange={(value) =>
            onFilters({
              ...filters,
              page: 1,
              action: AUDIT_ACTIONS.find((action) => action === value),
            })
          }
          options={[any, ...AUDIT_ACTIONS.map((value) => ({ value, label: value }))]}
        />
        <SelectField
          id="audit-target"
          value={filters.targetType ?? ""}
          onChange={(value) =>
            onFilters({
              ...filters,
              page: 1,
              targetType: AUDIT_TARGET_TYPES.find((type) => type === value),
            })
          }
          options={[any, ...AUDIT_TARGET_TYPES.map((value) => ({ value, label: value }))]}
        />
      </div>
      <DataTable columns={columns} data={entries} loading={loading} />
      <Pager
        page={filters.page}
        limit={AUDIT_PAGE}
        total={total}
        onPage={(page) => onFilters({ ...filters, page })}
      />
    </>
  );
}
