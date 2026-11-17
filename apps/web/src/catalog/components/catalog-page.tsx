import {
  EQUIPMENT,
  EQUIPMENT_KEYS,
  EXERCISE_TYPE_KEYS,
  EXERCISE_TYPES,
  MUSCLE_GROUP_KEYS,
  MUSCLE_GROUPS,
} from "@workspace/shared";

import {
  columnsFor,
  ConfirmAction,
  DataTable,
  EditSheet,
  formatDate,
  PageTitle,
  Pager,
  SearchBox,
  SelectField,
} from "@/admin";
import { useT, type SiteKey } from "@/platform/i18n";
import { Badge } from "@/platform/ui/badge";
import { Button } from "@/platform/ui/button";

import {
  CATALOG_PAGE,
  downloadCatalogExport,
  useCatalogActions,
  useCatalogList,
  type CatalogSearch,
} from "../use-catalog";
import { CatalogForm } from "./catalog-form";

type Row = ReturnType<typeof useCatalogList>["rows"][number];
const column = columnsFor<Row>();

/** The catalog: search, filters and paging in the URL; add and edit in a side sheet. */
export function CatalogPage({
  search,
  onSearch,
  editing,
  onEdit,
}: {
  search: CatalogSearch;
  onSearch: (next: CatalogSearch) => void;
  editing: string | null;
  onEdit: (id: string | null) => void;
}) {
  const t = useT();
  const { rows, total, loading } = useCatalogList(search);
  const { retire, restore } = useCatalogActions();
  const label = (keys: Record<string, SiteKey>, value: string) => {
    const key = keys[value];
    return key ? t(key) : value;
  };
  const columns = column.columns([
    column.accessor("thumbnailUrl", {
      header: "",
      cell: (c) => {
        const url = c.getValue();
        return url ? (
          <img src={url} alt="" className="size-9 rounded-md bg-surface-control object-cover" />
        ) : null;
      },
    }),
    column.accessor("title", { header: t("catalog__title") }),
    column.accessor("primaryMuscle", {
      header: t("catalog__primary"),
      cell: (c) => label(MUSCLE_GROUP_KEYS, c.getValue()),
    }),
    column.accessor("equipment", {
      header: t("catalog__equipment"),
      cell: (c) => label(EQUIPMENT_KEYS, c.getValue()),
    }),
    column.accessor("exerciseType", {
      header: t("catalog__type"),
      cell: (c) => label(EXERCISE_TYPE_KEYS, c.getValue()),
    }),
    column.accessor("retired", {
      header: t("catalog__state"),
      cell: (c) => (c.getValue() ? <Badge variant="outline">{t("catalog__retired")}</Badge> : null),
    }),
    column.accessor("updatedAt", {
      header: t("catalog__updated"),
      cell: (c) => formatDate(c.getValue()),
    }),
    column.display({
      id: "actions",
      header: "",
      cell: (c) => {
        const row = c.row.original;
        return (
          <span onClick={(event) => event.stopPropagation()}>
            {row.retired ? (
              <Button size="sm" variant="outline" onClick={() => void restore(row.id)}>
                {t("catalog__restore")}
              </Button>
            ) : (
              <ConfirmAction
                trigger={
                  <Button size="sm" variant="destructive-outline">
                    {t("catalog__retire")}
                  </Button>
                }
                title={t("catalog__retire_title", { title: row.title })}
                body={t("catalog__retire_body")}
                action={t("catalog__retire")}
                onConfirm={async () => void (await retire(row.id))}
              />
            )}
          </span>
        );
      },
    }),
  ]);
  const any = { value: "", label: t("admin__filter_any") };
  return (
    <>
      <PageTitle title={t("admin__nav_catalog")}>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void downloadCatalogExport()}>
            {t("catalog__export")}
          </Button>
          <Button onClick={() => onEdit("new")}>{t("catalog__add")}</Button>
        </div>
      </PageTitle>
      <div className="flex flex-wrap gap-2">
        <SearchBox
          value={search.search ?? ""}
          onChange={(value) => onSearch({ ...search, page: 1, search: value || undefined })}
        />
        <SelectField
          id="filter-muscle"
          value={search.primaryMuscle ?? ""}
          onChange={(value) =>
            onSearch({ ...search, page: 1, primaryMuscle: MUSCLE_GROUPS.find((m) => m === value) })
          }
          options={[
            any,
            ...MUSCLE_GROUPS.map((value) => ({ value, label: t(MUSCLE_GROUP_KEYS[value]) })),
          ]}
        />
        <SelectField
          id="filter-equipment"
          value={search.equipment ?? ""}
          onChange={(value) =>
            onSearch({ ...search, page: 1, equipment: EQUIPMENT.find((e) => e === value) })
          }
          options={[any, ...EQUIPMENT.map((value) => ({ value, label: t(EQUIPMENT_KEYS[value]) }))]}
        />
        <SelectField
          id="filter-type"
          value={search.exerciseType ?? ""}
          onChange={(value) =>
            onSearch({ ...search, page: 1, exerciseType: EXERCISE_TYPES.find((e) => e === value) })
          }
          options={[
            any,
            ...EXERCISE_TYPES.map((value) => ({ value, label: t(EXERCISE_TYPE_KEYS[value]) })),
          ]}
        />
        <SelectField
          id="filter-retired"
          value={search.retired}
          onChange={(value) =>
            onSearch({
              ...search,
              page: 1,
              retired: value === "retired" || value === "all" ? value : "live",
            })
          }
          options={[
            { value: "live", label: t("catalog__filter_live") },
            { value: "retired", label: t("catalog__filter_retired") },
            { value: "all", label: t("catalog__filter_all") },
          ]}
        />
      </div>
      <DataTable columns={columns} data={rows} loading={loading} onOpen={(row) => onEdit(row.id)} />
      <Pager
        page={search.page}
        limit={CATALOG_PAGE}
        total={total}
        onPage={(page) => onSearch({ ...search, page })}
      />
      <EditSheet
        open={editing !== null}
        onClose={() => onEdit(null)}
        title={editing === "new" ? t("catalog__add") : t("catalog__edit")}
      >
        {editing !== null ? (
          <CatalogForm id={editing === "new" ? null : editing} onDone={() => onEdit(null)} />
        ) : null}
      </EditSheet>
    </>
  );
}
