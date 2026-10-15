"use client";

import { ServiceIcon } from "@/components/service-icon";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import {
  bookingStatuses,
  formatRange,
  groupBookings,
  statusLabels,
  type BookingFilters,
} from "../logic";
import type { BookingClient, BookingRow } from "../types";
import { BookingForm } from "./booking-form";
import { BookingsTable } from "./bookings-table";
import { RescheduleForm } from "./reschedule-form";
import { formatKg } from "@/lib/format";
import { serviceLabels } from "../logic";

// SMS bookings arrive from outside the page; pick them up without a reload.
const REFRESH_MS = 15_000;

const statusItems = [
  { value: "all" as const, label: "All" },
  ...bookingStatuses.map((value) => ({ value, label: statusLabels[value] })),
];
const initialFilters: BookingFilters = {
  service: "all",
  status: "all",
  search: "",
};

/** Bookings list, filters and the staff booking sheet, laid out like the reference frame. */
export function BookingsView({
  bookings,
  clients,
  range,
  today,
}: {
  bookings: BookingRow[] | null;
  clients: BookingClient[];
  range: { from: string; to: string };
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useState(initialFilters);
  const [creating, setCreating] = useState(false);
  const [rescheduling, setRescheduling] = useState<BookingRow | null>(null);
  const groups = bookings ? groupBookings(bookings, filters) : [];
  const period = formatRange(range.from, range.to);
  const refresh = () => startTransition(() => router.refresh());
  const filtered = filters.status !== "all" || filters.search.trim() !== "";
  useAutoRefresh(REFRESH_MS);

  return (
    <section className="flex min-w-0 flex-col gap-6 font-sans [--font-sans:var(--font-geist-sans)]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-sm text-muted-foreground">
            Upcoming drying and milling slots · every booking confirms instantly
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>New booking</Button>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <Tabs
          value={filters.service}
          onValueChange={(service) =>
            setFilters((previous) => ({ ...previous, service }))
          }
        >
          <TabsList aria-label="Service">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="drying">
              <ServiceIcon kind="drying" />
              Drying
            </TabsTrigger>
            <TabsTrigger value="milling">
              <ServiceIcon kind="milling" />
              Milling
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Field className="w-56">
          <FieldLabel htmlFor="bookings-dates">Dates</FieldLabel>
          <DateRangePicker
            id="bookings-dates"
            value={range}
            disabled={pending}
            onChange={(next) => {
              if (!next?.from || !next.to) return;
              const params = new URLSearchParams({
                from: next.from,
                to: next.to,
              });
              startTransition(() => router.replace(`${pathname}?${params}`));
            }}
          />
        </Field>
        <Field className="w-48">
          <FieldLabel htmlFor="bookings-status">Status</FieldLabel>
          <Select
            items={statusItems}
            value={filters.status}
            onValueChange={(status) => {
              if (status) setFilters((previous) => ({ ...previous, status }));
            }}
          >
            <SelectTrigger id="bookings-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {statusItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="min-w-48 flex-1">
          <FieldLabel htmlFor="bookings-search">Search</FieldLabel>
          <Input
            id="bookings-search"
            placeholder="Code, phone or name"
            value={filters.search}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                search: event.target.value,
              }))
            }
          />
        </Field>
      </div>
      {bookings === null ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Bookings couldn&apos;t load</EmptyTitle>
            <EmptyDescription>
              Try again. Your date range, search and status filters have been
              kept.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" disabled={pending} onClick={refresh}>
            {pending ? "Retrying…" : "Retry"}
          </Button>
        </Empty>
      ) : groups.length ? (
        <BookingsTable
          groups={groups}
          clients={clients}
          onReschedule={setRescheduling}
        />
      ) : filtered ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No matching bookings</EmptyTitle>
            <EmptyDescription>
              No bookings match this search and status in {period}. Clear
              filters to keep browsing this period.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            onClick={() =>
              setFilters((previous) => ({
                ...previous,
                status: "all",
                search: "",
              }))
            }
          >
            Clear filters
          </Button>
        </Empty>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No bookings yet</EmptyTitle>
            <EmptyDescription>
              Bookings appear here when clients reserve drying or milling. Your
              selected period is {period}.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" disabled={pending} onClick={refresh}>
            {pending ? "Refreshing…" : "Refresh bookings"}
          </Button>
        </Empty>
      )}
      <Sheet
        open={rescheduling !== null}
        onOpenChange={(open) => {
          if (!open) setRescheduling(null);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Reschedule booking {rescheduling?.ref}</SheetTitle>
            <SheetDescription>
              {rescheduling
                ? `${rescheduling.client.name} · ${serviceLabels[rescheduling.service]} · ${formatKg(rescheduling.est_kg)}. Confirms instantly and texts the client and booker. Replaces any pending proposal.`
                : null}
            </SheetDescription>
          </SheetHeader>
          {rescheduling ? (
            <RescheduleForm
              key={rescheduling.id}
              booking={rescheduling}
              today={today}
              onSaved={() => setRescheduling(null)}
              onCancel={() => setRescheduling(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New booking</SheetTitle>
            <SheetDescription>
              Confirms instantly with a 6-character ref, even on a full day.
            </SheetDescription>
          </SheetHeader>
          {creating ? (
            <BookingForm
              clients={clients}
              today={today}
              onSaved={() => setCreating(false)}
              onCancel={() => setCreating(false)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
