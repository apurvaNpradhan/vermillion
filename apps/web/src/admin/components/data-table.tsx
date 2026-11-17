import {
  createColumnHelper,
  flexRender,
  tableFeatures,
  useTable,
  type ColumnHelper,
  type RowData,
} from "@tanstack/react-table";

import { useT } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/platform/ui/table";

/** The admin's tables need the core only: paging, search and filters live in the URL. */
const features = tableFeatures({});
type Features = typeof features;

/** What `columnsFor<Row>().columns([...])` returns: columns of mixed value types. */
export type AdminColumns<Row extends RowData> = ReturnType<ColumnHelper<Features, Row>["columns"]>;

/** A typed column helper for one row shape. */
export function columnsFor<Row extends RowData>() {
  return createColumnHelper<Features, Row>();
}

/** A dense table; a row with `onOpen` opens on click (the edit sheet). */
export function DataTable<Row extends RowData>({
  columns,
  data,
  onOpen,
  loading,
}: {
  columns: AdminColumns<Row>;
  data: Row[];
  onOpen?: (row: Row) => void;
  loading: boolean;
}) {
  const t = useT();
  const table = useTable({ features, columns, data });
  return (
    <div className="overflow-x-auto rounded-xl bg-surface">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={onOpen ? "cursor-pointer" : undefined}
              onClick={onOpen ? () => onOpen(row.original) : undefined}
            >
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-8 text-center text-text-muted">
                {loading ? t("admin__loading") : t("admin__empty")}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

/** Previous / next with the position, driven by the page in the URL. */
export function Pager({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useT();
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-text-muted">
      <span className="numeric">{t("admin__page_of", { page, pages, total })}</span>
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t("admin__previous")}
      </Button>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t("admin__next")}
      </Button>
    </div>
  );
}
