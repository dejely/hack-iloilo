"use client";

import { StatusBadge } from "@/components/status-badge";
import { ServiceLabel } from "@/components/service-icon";
import { Fragment, useMemo, useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InfoIcon } from "@/components/hint-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKg, formatTonnes } from "@/lib/format";
import { cancelBookingByStaff } from "../actions";
import {
  bookedByLabel,
  formatDay,
  formatShortDate,
  serviceLabels,
  statusLabels,
  statusTones,
  type BookingGroup,
} from "../logic";
import type { BookingClient, BookingRow } from "../types";

/** Rows shown per day before `+ N more`. */
const GROUP_PREVIEW = 6;
const COLUMNS = 6;
const kgFormat = new Intl.NumberFormat("en-US");

export function BookingsTable({
  groups,
  clients,
  onReschedule,
}: {
  groups: BookingGroup[];
  clients: BookingClient[];
  onReschedule: (booking: BookingRow) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = useState<BookingRow | null>(null);
  const [pending, startTransition] = useTransition();
  const namesByPhone = useMemo(
    () => new Map(clients.map((client) => [client.phone, client.name])),
    [clients],
  );
  const showService = new Set(groups.map((group) => group.service)).size > 1;

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted [&_th]:text-xs [&_th]:font-bold [&_th]:tracking-wide [&_th]:uppercase">
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Client
                  <InfoIcon text="Below the name: who booked. Self is the client by SMS, Staff is a walk-in, and FOR is someone booking for them." />
                </span>
              </TableHead>
              <TableHead className="text-right">Est. kg</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Date
                  <InfoIcon text="± days: how far the booking can move if the day fills up." />
                </span>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const key = `${group.date}|${group.service}`;
              const open = expanded.has(key);
              const rows = open
                ? group.rows
                : group.rows.slice(0, GROUP_PREVIEW);
              const hidden = group.rows.length - rows.length;
              return (
                <Fragment key={key}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={COLUMNS} className="font-medium">
                      <ServiceLabel kind={group.service}>
                        {[
                          formatDay(group.date),
                          showService ? serviceLabels[group.service] : null,
                          `${group.count} ${group.count === 1 ? "booking" : "bookings"}`,
                          formatTonnes(group.totalKg),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </ServiceLabel>
                      <span className="sr-only">
                        {" "}
                        ({formatKg(group.totalKg)})
                      </span>
                    </TableCell>
                  </TableRow>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono">{row.ref}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{row.client.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {bookedByLabel(row, namesByPhone)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {kgFormat.format(row.est_kg)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatShortDate(row.scheduled_date)}
                        {row.flex_days ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ±{row.flex_days} d
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={statusTones[row.status]}>
                          {statusLabels[row.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.status === "confirmed" ||
                        row.status === "reschedule_proposed" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Actions for booking ${row.ref}`}
                                />
                              }
                            >
                              <MoreHorizontal />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => onReschedule(row)}
                              >
                                Reschedule
                              </DropdownMenuItem>
                              {row.status === "confirmed" ? (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setCancelling(row)}
                                >
                                  Cancel
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {hidden > 0 ? (
                    <TableRow>
                      <TableCell />
                      <TableCell colSpan={COLUMNS - 1}>
                        <Button
                          variant="link"
                          size="sm"
                          className="px-0"
                          onClick={() =>
                            setExpanded((previous) =>
                              new Set(previous).add(key),
                            )
                          }
                        >
                          + {hidden} more
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <AlertDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setCancelling(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancel booking {cancelling?.ref}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling
                ? `${cancelling.client.name} · ${serviceLabels[cancelling.service].toLowerCase()} · ${formatKg(cancelling.est_kg)} on ${formatDay(cancelling.scheduled_date)}. This frees the slot and can't be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              Keep booking
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (!cancelling) return;
                const { ref } = cancelling;
                startTransition(async () => {
                  try {
                    const result = await cancelBookingByStaff(ref);
                    if (result.status === "error") toast.error(result.message);
                    else toast.success(`Booking ${ref} cancelled.`);
                  } catch {
                    toast.error(
                      "Unable to cancel the booking. Please try again.",
                    );
                  } finally {
                    setCancelling(null);
                  }
                });
              }}
            >
              {pending ? "Cancelling…" : "Cancel booking"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
