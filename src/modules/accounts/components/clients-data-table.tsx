"use client";

import { Fragment, useMemo } from "react";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buyerTypeLabels, kindLabels, type ClientGroup } from "../logic";
import { features, type DirectoryRow } from "./clients-table-model";
import type { Client, Municipality } from "../types";

const columnHelper = createColumnHelper<typeof features, DirectoryRow>();
const pageSizes = [10, 20, 50, 100].map((value) => ({
  value,
  label: String(value),
}));

/** Shadcn data table with pagination that retains co-op context across pages. */
export function ClientsDataTable({
  groups,
  municipalities,
  onEdit,
}: {
  groups: ClientGroup[];
  municipalities: Municipality[];
  onEdit: (client: Client) => void;
}) {
  const data = useMemo(() => {
    const names = new Map(
      municipalities.map((place) => [place.id, place.name]),
    );
    return groups.flatMap((group) =>
      group.clients.map((client) => ({
        ...client,
        coop: group.coop,
        municipality: client.municipality_id
          ? (names.get(client.municipality_id) ?? "—")
          : "—",
        coopName: client.coop_id ? (group.coop?.name ?? "—") : "—",
      })),
    );
  }, [groups, municipalities]);
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: "Name",
          cell: ({ row }) => (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Edit ${row.original.name}`}
              onClick={() => onEdit(row.original)}
              className="h-auto justify-start px-0 text-left whitespace-normal"
            >
              {row.original.name}
            </Button>
          ),
        }),
        columnHelper.accessor("phone", { header: "Phone" }),
        columnHelper.accessor("municipality", { header: "Municipality" }),
        columnHelper.accessor("coopName", {
          header: "Co-op",
          cell: ({ getValue }) => (
            <span className="block max-w-40 whitespace-normal">
              {getValue()}
            </span>
          ),
        }),
        columnHelper.accessor("kind", {
          header: "Kind",
          cell: ({ row, getValue }) => (
            <span className="flex flex-wrap gap-1">
              <Badge variant="secondary">{kindLabels[getValue()]}</Badge>
              {row.original.buyer_type ? (
                <Badge variant="outline">
                  {buyerTypeLabels[row.original.buyer_type]}
                </Badge>
              ) : null}
            </span>
          ),
        }),
        columnHelper.display({
          id: "joinedVia",
          header: "Joined via",
          cell: () => (
            <span aria-label="Registration source not recorded">—</span>
          ),
        }),
      ]),
    [onEdit],
  );
  const table = useTable({
    features,
    data,
    columns,
    getRowId: (row) => row.id,
    defaultColumn: { sortFn: "alphanumeric", sortDescFirst: false },
    enableMultiSort: false,
  });
  const rows = table.getRowModel().rows;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="max-h-120 min-w-0 overflow-auto rounded-lg border">
        <Table className="min-w-2xl">
          <TableHeader className="sticky top-0 bg-background">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`Sort by ${header.column.columnDef.header}`}
                      >
                        <table.FlexRender header={header} />
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp data-icon="inline-end" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown data-icon="inline-end" />
                        ) : (
                          <ArrowUpDown
                            data-icon="inline-end"
                            className="text-muted-foreground"
                          />
                        )}
                      </Button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row, index) => (
                <Fragment key={row.id}>
                  {row.original.coop &&
                  row.original.id !== row.original.coop.id &&
                  rows[index - 1]?.original.coop?.id !==
                    row.original.coop.id ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="bg-muted">
                        {row.original.coop.name}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  <TableRow>
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                </Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="clients-page-size" className="text-sm">
            Rows per page
          </label>
          <Select
            items={pageSizes}
            value={table.state.pagination.pageSize}
            onValueChange={(value) => {
              if (value) table.setPageSize(value);
            }}
          >
            <SelectTrigger id="clients-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {pageSizes.map((size) => (
                  <SelectItem key={size.value} value={size.value}>
                    {size.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Page {table.state.pagination.pageIndex + 1} of{" "}
            {Math.max(1, table.getPageCount())}
          </p>
          <Button
            variant="outline"
            size="sm"
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Next page"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
