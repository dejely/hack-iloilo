"use client";

import { ServiceIcon, isServiceIconKind } from "@/components/service-icon";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { InfoIcon } from "@/components/hint-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  MiniCalendar,
  MiniCalendarDay,
  MiniCalendarDays,
  MiniCalendarNavigation,
} from "@/components/kibo-ui/mini-calendar";
import { addDays } from "@/lib/dates";
import { formatTonnes } from "@/lib/format";
import { cn } from "cn";
import {
  dayLabel,
  expectedKg,
  plantStatus,
  plantStatusTones,
  type PlantStatus,
} from "../logic";
import type { DayPool, Pool } from "../types";
import {
  DryerDrawing,
  MillDrawing,
  PlantDefs,
  SiloDrawing,
} from "./plant-drawings";
import "./plant-view.css";

const pools: Pool[] = ["dryer", "storage", "mill"];

const names: Record<Pool, string> = {
  dryer: "Dryers",
  storage: "Storage",
  mill: "Mill",
};

const per: Record<Pool, string> = {
  dryer: "/ day",
  storage: "held",
  mill: "/ day",
};

const statusWords: Record<Exclude<PlantStatus, "ok">, string> = {
  over: "over capacity",
  near: "near full",
  idle: "idle",
};

const weekday = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
});
const dayOfMonth = (date: string) => Number(date.slice(8));

/** Days the calendar shows at a time; it pages by this many. */
const WEEK = 7;

const maxDate = (a: string, b: string) => (a > b ? a : b);

// The calendar works in local `Date`s; the page in `YYYY-MM-DD`.
const toDate = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toIso = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const firmKg = (d: DayPool) => d.load.confirmed.mid + d.load.offer.mid;

/** Dryers, storage and mill on one day, drawn as the plant, with a day strip. */
export function PlantView({
  days,
  today,
  onDetails,
  onOpenPool,
}: {
  /** Every pool, as `capacityByDay` returns it. */
  days: DayPool[];
  today: string;
  onDetails: (date: string) => void;
  /** Opens that pool's tab. */
  onOpenPool: (pool: Pool) => void;
}) {
  const dates = [...new Set(days.map((d) => d.date))];
  const first = dates[0] ?? today;
  const last = dates.at(-1) ?? today;
  const lastWeek = maxDate(addDays(last, 1 - WEEK), first);
  const clampWeek = (date: string) =>
    date < first ? first : date > lastWeek ? lastWeek : date;
  const [selected, setSelected] = useState(first);
  const [weekStart, setWeekStart] = useState(first);
  const byDate = (date: string) =>
    Object.fromEntries(
      days.filter((d) => d.date === date).map((d) => [d.pool, d]),
    ) as Partial<Record<Pool, DayPool>>;
  const day = byDate(selected);
  const flagged = pools.flatMap((p) => {
    const d = day[p];
    const s = d && plantStatus(d);
    return s && s !== "ok" ? [{ pool: p, status: s }] : [];
  });

  return (
    <div
      // `w-0 min-w-full`: fills the page without widening it (the layout's main has no `min-w-0`).
      className={cn(
        "plant-view",
        "flex min-h-0 w-0 min-w-full flex-1 flex-col gap-3 sm:gap-4",
      )}
    >
      <PlantDefs />

      <MiniCalendar
        aria-label="Pick a day"
        days={WEEK}
        value={toDate(selected)}
        onValueChange={(d) => d && setSelected(toIso(d))}
        startDate={toDate(weekStart)}
        onStartDateChange={(d) => d && setWeekStart(clampWeek(toIso(d)))}
        className="w-fit max-w-full [scrollbar-width:none] self-center overflow-x-auto bg-card"
      >
        <MiniCalendarNavigation
          direction="prev"
          aria-label="Previous week"
          disabled={weekStart === first}
        />
        <MiniCalendarDays>
          {(date) => {
            const iso = toIso(date);
            const pips = byDate(iso);
            const inWindow = iso >= first && iso <= last;
            return (
              <MiniCalendarDay
                key={iso}
                date={date}
                disabled={!inWindow}
                aria-label={dayLabel(iso)}
                aria-pressed={iso === selected}
                className="gap-1"
              >
                <span className="text-[10px] font-medium tracking-wider uppercase opacity-70">
                  {iso === today
                    ? "Today"
                    : weekday.format(new Date(`${iso}T00:00:00Z`))}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {dayOfMonth(iso)}
                </span>
                <span className="flex gap-0.5">
                  {pools.map((p) => {
                    const d = pips[p];
                    return (
                      <i
                        key={p}
                        data-s={d ? plantStatus(d) : "idle"}
                        className="size-1.5 rounded-[2px] bg-(--s)"
                      />
                    );
                  })}
                </span>
              </MiniCalendarDay>
            );
          }}
        </MiniCalendarDays>
        <MiniCalendarNavigation
          direction="next"
          aria-label="Next week"
          disabled={weekStart === lastWeek}
        />
      </MiniCalendar>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {flagged.length ? (
            flagged.map((x) => (
              <Chip key={x.pool} status={x.status}>
                {names[x.pool]} {statusWords[x.status]}
              </Chip>
            ))
          ) : (
            <Chip status="ok">All pools within capacity</Chip>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => onDetails(selected)}>
          Bookings and offers
        </Button>
      </div>

      {/* Fills the rest of the screen: one swipeable card at a time on phones, all three from lg. */}
      <div className="-mx-4 flex min-h-0 flex-1 snap-x snap-mandatory [scrollbar-width:none] gap-2.5 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:overflow-visible lg:px-0">
        {pools.map((p, i) => (
          <PoolUnit
            key={p}
            pool={p}
            day={day[p]}
            arrow={i > 0}
            onOpen={() => onOpenPool(p)}
          />
        ))}
      </div>

      <Legend />
    </div>
  );
}

function PoolUnit({
  pool,
  day,
  arrow,
  onOpen,
}: {
  pool: Pool;
  day?: DayPool;
  arrow: boolean;
  onOpen: () => void;
}) {
  if (!day) return null;
  const status = plantStatus(day);
  const firm = firmKg(day);
  const forecast = day.load.forecast.mid;
  const level = day.capacityKg ? expectedKg(day) / day.capacityKg : 0;
  const drawing = {
    dryer: <DryerDrawing level={level} overKg={day.overflowKg} />,
    storage: <SiloDrawing level={level} overKg={day.overflowKg} />,
    mill: <MillDrawing level={level} />,
  }[pool];
  return (
    <>
      {arrow && <FlowArrow />}
      <Card
        data-s={status}
        className={cn(
          "plant-unit group relative w-[85%] min-w-0 shrink-0 cursor-pointer snap-center transition-shadow hover:ring-foreground/25 has-focus-visible:ring-2 has-focus-visible:ring-ring lg:w-auto",
          status === "over" &&
            "ring-[color-mix(in_oklch,var(--destructive)_60%,var(--border))]",
        )}
      >
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">
              {/* Stretched over the card, so the whole card opens the tab. */}
              <button
                type="button"
                onClick={onOpen}
                className="flex items-center gap-1 outline-none after:absolute after:inset-0 after:z-10"
              >
                {isServiceIconKind(pool) ? (
                  <ServiceIcon kind={pool} className="size-4 text-primary" />
                ) : null}
                {names[pool]}
                <ArrowUpRight
                  aria-hidden
                  className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-has-focus-visible:opacity-100"
                />
              </button>
            </h3>
            <span className="rounded-md border px-1.5 font-mono text-xs text-muted-foreground">
              {formatTonnes(day.capacityKg)} {per[pool]}
            </span>
          </div>
          <div className="plant-sheet min-h-10 flex-1">{drawing}</div>
          <LoadBar day={day} />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="tabular-nums">
              <span className="text-xl font-semibold">
                {formatTonnes(firm)}
              </span>
              <span className="text-sm text-muted-foreground">
                {forecast > 0 && ` + ${formatTonnes(forecast)} forecast`} of{" "}
                {formatTonnes(day.capacityKg)}
              </span>
              {/* Above the card's stretched link, so it can be tapped. */}
              <span className="relative z-20 ml-1 inline-flex align-middle">
                <InfoIcon text="The big figure is firm: bookings and offers. Forecast is palay the harvest forecast expects that isn't booked yet." />
              </span>
            </div>
            <Chip status={status}>
              {status === "over"
                ? `${formatTonnes(day.overflowKg)} over`
                : { near: "Near full", ok: "Normal", idle: "Idle" }[status]}
            </Chip>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/** Dashed arrow whose dashes flow from one pool to the next. */
function FlowArrow() {
  return (
    <svg
      viewBox="0 0 22 12"
      aria-hidden
      className="h-3 w-5.5 shrink-0 self-center justify-self-center text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path className="plant-flow" d="M1 6 H17" strokeDasharray="2 3" />
      <path d="M14 2 L20 6 L14 10" />
    </svg>
  );
}

/** Firm load, then forecast, against capacity; a zone past the end shows up to +50% over. */
function LoadBar({ day }: { day: DayPool }) {
  const cap = day.capacityKg || 1;
  const firm = firmKg(day);
  const total = firm + day.load.forecast.mid;
  const firmIn = Math.min(firm, cap);
  const forecastIn = Math.max(Math.min(total, cap) - firmIn, 0);
  const zone = cap * 0.5;
  const pct = (kg: number) => `${(Math.min(kg, cap) * 100) / cap}%`;
  const overPct = (kg: number) =>
    `${Math.min(Math.max(kg - cap, 0) / zone, 1) * 100}%`;
  return (
    <div className="grid h-4 grid-cols-[1fr_22%] gap-0.5" aria-hidden>
      <div className="relative overflow-hidden rounded-l bg-muted">
        <div
          className="absolute inset-y-0 left-0 bg-(--s) transition-[width] duration-300"
          style={{ width: pct(firmIn) }}
        />
        <div
          className={cn(
            "plant-forecast",
            "absolute inset-y-0 transition-all duration-300",
          )}
          style={{ left: pct(firmIn), width: pct(forecastIn) }}
        />
        <div className={cn("plant-segments", "absolute inset-0")} />
      </div>
      <div className="relative overflow-hidden rounded-r border border-l-2 border-dashed [border-left-style:solid] border-l-foreground">
        <div
          className={cn("plant-over-forecast", "absolute inset-y-0 left-0")}
          style={{ width: overPct(total) }}
        />
        <div
          className={cn("plant-over-firm", "absolute inset-y-0 left-0")}
          style={{ width: overPct(firm) }}
        />
      </div>
    </div>
  );
}

function Chip({
  status,
  children,
}: {
  status: PlantStatus;
  children: React.ReactNode;
}) {
  return <StatusBadge tone={plantStatusTones[status]}>{children}</StatusBadge>;
}

function Legend() {
  const items: [string, string][] = [
    ["bg-success", "Firm (bookings, accepted offers)"],
    ["plant-forecast", "Forecast"],
    [
      "border border-dashed border-l-2 border-l-foreground [border-left-style:solid]",
      "Over capacity",
    ],
    ["bg-warning", "Near full"],
    ["bg-muted-foreground/50", "Idle"],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground max-sm:hidden">
      {items.map(([swatch, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <i
            data-s="idle"
            className={cn("inline-block h-2.5 w-4 rounded-[2px]", swatch)}
          />
          {label}
        </span>
      ))}
    </div>
  );
}
