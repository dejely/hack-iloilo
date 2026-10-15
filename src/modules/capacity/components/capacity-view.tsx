"use client";

import { ServiceIcon, isServiceIconKind } from "@/components/service-icon";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { InfoIcon } from "@/components/hint-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, formatTonnes } from "@/lib/format";
import { cn } from "cn";
import {
  dayLabel,
  expectedKg,
  headline,
  idleStretches,
  poolDays,
  shortDay,
  sources,
} from "../logic";
import type { DayPool, Pool } from "../types";
import { CapacityCalendar } from "./capacity-calendar";
import { DayBadge } from "./day-badge";
import {
  formatRange,
  LoadChart,
  loadConfig,
  shownSources,
  sourceLabels,
} from "./load-chart";
import { PlantView } from "./plant-view";

const pools: Pool[] = ["dryer", "storage", "mill"];

/** The plant view, then one tab per pool. */
type Tab = "plant" | Pool;
const tabs: Tab[] = ["plant", ...pools];

const poolNames: Record<Pool, string> = {
  dryer: "Dryer",
  storage: "Storage",
  mill: "Mill",
};

const tabNames: Record<Tab, string> = { plant: "Plant", ...poolNames };

/** Electricity per kg over the window, in centavos. */
export type Electricity = { minorPerKg: number; daysRun: number };

/** A booking as the day panel lists it. */
export type PanelBooking = {
  id: string;
  ref: string;
  service: "drying" | "milling";
  client: string;
  estKg: number;
  flexDays: number;
  reschedule: boolean;
};

/** An accepted offer as the day panel lists it, by harvest date. */
export type PanelOffer = {
  id: string;
  ref: string;
  client: string;
  variety: string | null;
  estKg: number;
};

const plainTonnes = (kg: number) =>
  (kg / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 });

const span = (from: string, to: string) =>
  from === to ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`;

/** Capacity page: plant view and pool tabs, headline tiles, stacked load chart, day grid and day panel. */
export function CapacityView({
  days: allDays,
  bookings,
  offers,
  idleThresholdPct,
  electricity,
  range,
  today,
  suggestions,
}: {
  /** Every pool, as `capacityByDay` returns it. */
  days: DayPool[] | null;
  bookings: Record<string, PanelBooking[]>;
  offers: Record<string, PanelOffer[]>;
  idleThresholdPct: number;
  /** Window electricity cost; undefined for non-managers. */
  electricity?: Electricity | null;
  range: { from: string; to: string };
  today: string;
  /** Suggested actions per date, shown in the day panel (M10). */
  suggestions?: Record<string, React.ReactNode>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("plant");
  const [selected, setSelected] = useState<string | null>(null);
  const pool = tab === "plant" ? null : tab;
  const days = allDays && pool && poolDays(allDays, pool);
  const selectedDays = allDays?.filter((d) => d.date === selected) ?? [];

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Capacity</h1>
          <p className="text-sm text-muted-foreground">
            {range.from === today && "Today, "}
            {span(range.from, range.to)}
          </p>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList aria-label="View">
            {tabs.map((t) => (
              <TabsTrigger key={t} value={t}>
                {isServiceIconKind(t) ? <ServiceIcon kind={t} /> : null}
                {tabNames[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      {allDays === null ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Capacity couldn&apos;t load</EmptyTitle>
            <EmptyDescription>
              Check the connection and try again.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
          >
            {pending ? "Retrying…" : "Retry"}
          </Button>
        </Empty>
      ) : !pool || !days ? (
        <PlantView
          days={allDays}
          today={today}
          onDetails={setSelected}
          onOpenPool={setTab}
        />
      ) : (
        <>
          <Headline
            pool={pool}
            days={days}
            idleThresholdPct={idleThresholdPct}
            electricity={electricity}
          />

          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <h2 className="flex-1 font-semibold">{poolNames[pool]} load</h2>
                {shownSources(days).map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <span
                      className="size-3 shrink-0"
                      style={{ background: loadConfig(pool)[s].color }}
                    />
                    {loadConfig(pool)[s].label}
                  </span>
                ))}
              </div>
              <LoadChart
                pool={pool}
                days={days}
                today={today}
                onSelect={setSelected}
              />
              <IdleNote days={days} />
            </CardContent>
          </Card>

          <Card className="py-0">
            <CapacityCalendar
              days={days}
              today={today}
              onSelect={setSelected}
            />
          </Card>
        </>
      )}

      <Sheet
        open={selectedDays.length > 0}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent>
          {selected && selectedDays.length > 0 && (
            <DayPanel
              date={selected}
              days={selectedDays}
              bookings={bookings[selected] ?? []}
              offers={offers[selected] ?? []}
              suggestions={suggestions?.[selected]}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function Headline({
  pool,
  days,
  idleThresholdPct,
  electricity,
}: {
  pool: Pool;
  days: DayPool[];
  idleThresholdPct: number;
  electricity?: Electricity | null;
}) {
  const h = headline(days);
  const first = h.overloaded[0];
  return (
    <div
      className={cn(
        "grid gap-5 sm:grid-cols-3",
        electricity !== undefined && "sm:grid-cols-2 xl:grid-cols-4",
      )}
    >
      <Tile
        label={`${poolNames[pool]} use`}
        info="Expected load over capacity for these weeks: bookings and offers plus the harvest forecast."
        value={h.utilizationPct === null ? "—" : `${h.utilizationPct}%`}
        note={`${plainTonnes(h.expectedKg)} of ${formatTonnes(h.capacityKg)}`}
      />
      <Tile
        label="Overloaded days"
        value={String(h.overloaded.length)}
        note={
          first
            ? `Next: ${shortDay(first.date)}, ${formatTonnes(first.overflowKg)} over`
            : "None"
        }
      />
      <Tile
        label="Idle days"
        value={String(h.idleDays)}
        note={`Under ${idleThresholdPct}% full`}
      />
      {electricity !== undefined && (
        <Tile
          label="Electricity"
          value={
            electricity ? `${formatMoney(electricity.minorPerKg)}/kg` : "—"
          }
          note={
            electricity
              ? `Dried or milled, incl. base load, ${electricity.daysRun} ${electricity.daysRun === 1 ? "day" : "days"} running`
              : "Nothing to dry or mill"
          }
        />
      )}
    </div>
  );
}

function Tile({
  label,
  info,
  value,
  note,
}: {
  label: string;
  info?: string;
  value: string;
  note: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <span className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
          {label}
          {info ? <InfoIcon text={info} /> : null}
        </span>
        <span className="text-4xl font-bold tracking-tight tabular-nums">
          {value}
        </span>
        <span className="text-sm text-muted-foreground">{note}</span>
      </CardContent>
    </Card>
  );
}

/** Idle stretches in words, under the chart. */
function IdleNote({ days }: { days: DayPool[] }) {
  const stretches = idleStretches(days);
  if (!stretches.length) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Idle:{" "}
      {stretches
        .map(
          (s) =>
            `${span(s.from, s.to)} (${s.days} ${s.days === 1 ? "day" : "days"})`,
        )
        .join(", ")}
    </p>
  );
}

function DayPanel({
  date,
  days,
  bookings,
  offers,
  suggestions,
}: {
  date: string;
  /** This date in every pool. */
  days: DayPool[];
  bookings: PanelBooking[];
  offers: PanelOffer[];
  suggestions?: React.ReactNode;
}) {
  const overloaded = days.filter((d) => d.overloaded);
  return (
    <>
      <SheetHeader>
        <SheetTitle>{dayLabel(date)}</SheetTitle>
        <SheetDescription>
          {overloaded.length
            ? overloaded
                .map(
                  (d) =>
                    `${poolNames[d.pool]} ${formatTonnes(d.overflowKg)} over`,
                )
                .join(" · ")
            : "Within capacity"}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Load</h3>
          <ul className="divide-y rounded-lg border">
            {days.map((d) => (
              <li key={d.pool} className="flex flex-col gap-1.5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{poolNames[d.pool]}</span>
                  <DayBadge day={d} />
                </div>
                <span className="text-sm tabular-nums">
                  {formatTonnes(expectedKg(d))} of {formatTonnes(d.capacityKg)}
                </span>
                {sources.map(
                  (s) =>
                    d.load[s].high > 0 && (
                      <span
                        key={s}
                        className="flex justify-between gap-3 text-xs text-muted-foreground"
                      >
                        {sourceLabels[d.pool][s]}
                        <span className="tabular-nums">
                          {formatRange(d.load[s])}
                        </span>
                      </span>
                    ),
                )}
              </li>
            ))}
          </ul>
        </section>
        {(["drying", "milling"] as const).map((service) => (
          <BookingList
            key={service}
            title={
              service === "drying" ? "Drying bookings" : "Milling bookings"
            }
            bookings={bookings.filter((b) => b.service === service)}
          />
        ))}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            Accepted offers harvesting ({offers.length})
          </h3>
          {offers.length ? (
            <ul className="divide-y rounded-lg border">
              {offers.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{o.client}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.ref}
                      {o.variety && ` · ${o.variety}`}
                    </span>
                  </div>
                  <span className="shrink-0 tabular-nums">
                    {formatTonnes(o.estKg)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No offers.</p>
          )}
        </section>
        {suggestions}
      </div>
    </>
  );
}

function BookingList({
  title,
  bookings,
}: {
  title: string;
  bookings: PanelBooking[];
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {title} ({bookings.length})
      </h3>
      {bookings.length ? (
        <ul className="divide-y rounded-lg border">
          {bookings.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{b.client}</span>
                <span className="text-xs text-muted-foreground">
                  {b.ref} ·{" "}
                  {b.flexDays
                    ? `can move ${b.flexDays} ${b.flexDays === 1 ? "day" : "days"}`
                    : "fixed date"}
                  {b.reschedule && " · asked to move"}
                </span>
              </div>
              <span className="shrink-0 tabular-nums">
                {formatTonnes(b.estKg)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No bookings.</p>
      )}
    </section>
  );
}
