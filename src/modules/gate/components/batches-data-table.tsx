"use client";

import {
  ServiceIcon,
  ServiceLabel,
  isServiceIconKind,
} from "@/components/service-icon";
import { useMemo } from "react";
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { InfoIcon } from "@/components/hint-icons";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKg } from "@/lib/format";
import { serviceLabels, stageLabels, stageTones } from "../logic";
import type { BatchListRow } from "../types";
import { BatchLink } from "./batch-link";

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});

type Row = BatchListRow & {
  clientName: string;
  line: string;
  /** The latest weight the batch has recorded. */
  kg: number | null;
};

const columnHelper = createColumnHelper<typeof features, Row>();

const day = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

/** Hints for headers that need explaining, by column id. */
const columnInfo: Record<string, string> = {
  ownership:
    "Custom: the client pays a fee to dry or mill their own palay. Selling to IRPC: IRPC buys the palay.",
  kg: "The latest weight recorded: rice after milling, else dried, else received.",
};

const columns = columnHelper.columns([
  columnHelper.accessor("batch_no", {
    header: "Batch",
    cell: ({ row }) => (
      <BatchLink id={row.original.id} batchNo={row.original.batch_no} />
    ),
  }),
  columnHelper.accessor("clientName", { header: "Client" }),
  columnHelper.accessor("line", {
    header: "Line",
    cell: ({ row, getValue }) =>
      row.original.entry ? (
        <ServiceLabel kind={row.original.entry.service}>
          {getValue()}
        </ServiceLabel>
      ) : (
        getValue()
      ),
  }),
  columnHelper.accessor("ownership", {
    header: "Ownership",
    cell: ({ getValue }) => (getValue() === "irpc" ? "IRPC" : "Custom"),
  }),
  columnHelper.accessor("stage", {
    header: "Stage",
    cell: ({ row, getValue }) => {
      const stage = getValue();
      return (
        <span className="flex flex-wrap items-center gap-1">
          <StatusBadge
            tone={stageTones[stage]}
            icon={
              isServiceIconKind(stage) ? (
                <ServiceIcon kind={stage} />
              ) : undefined
            }
          >
            {stageLabels[stage]}
          </StatusBadge>
          {row.original.confirmations.some((c) => c.status === "disputed") ? (
            <StatusBadge tone="danger">Weight disputed</StatusBadge>
          ) : null}
        </span>
      );
    },
  }),
  columnHelper.accessor("kg", {
    header: "Weight",
    sortFn: "basic",
    cell: ({ getValue }) => {
      const kg = getValue();
      return kg ? formatKg(kg) : "—";
    },
  }),
  columnHelper.accessor("created_at", {
    header: "Opened",
    sortFn: "basic",
    cell: ({ getValue }) => day.format(new Date(getValue())),
  }),
]);

/** Sortable, paginated batch records. */
export function BatchesDataTable({ batches }: { batches: BatchListRow[] }) {
  const data = useMemo(
    () =>
      batches.map((batch) => ({
        ...batch,
        clientName: batch.client.name,
        line: batch.entry ? serviceLabels[batch.entry.service] : "—",
        kg: batch.rice_kg ?? batch.dried_kg ?? batch.net_kg,
      })),
    [batches],
  );
  const table = useTable({
    features,
    data,
    columns,
    getRowId: (row) => row.id,
    defaultColumn: { sortFn: "alphanumeric", sortDescFirst: false },
    enableMultiSort: false,
    initialState: {
      sorting: [{ id: "created_at", desc: true }],
      pagination: { pageIndex: 0, pageSize: 20 },
    },
  });
  const rows = table.getRowModel().rows;
  const right = (id: string) => id === "kg";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0 overflow-auto rounded-lg border">
        <Table className="min-w-2xl">
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const SortIcon =
                    sorted === "asc"
                      ? ArrowUp
                      : sorted === "desc"
                        ? ArrowDown
                        : ArrowUpDown;
                  return (
                    <TableHead
                      key={header.id}
                      className={right(header.column.id) ? "text-right" : ""}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-mx-2 text-xs font-bold tracking-wide uppercase"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          <SortIcon
                            data-icon="inline-end"
                            className={sorted ? "" : "text-muted-foreground"}
                          />
                        </Button>
                        {columnInfo[header.column.id] ? (
                          <InfoIcon text={columnInfo[header.column.id]} />
                        ) : null}
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={right(cell.column.id) ? "text-right" : ""}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Page {table.state.pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
