// M9. Capacity: Load against capacity per day and pool. See TRD.md.
// Pure functions only: no I/O and no imports from other modules. Unit-test here.

import { addDays, daysBetween } from "@/lib/dates";
import type { StatusTone } from "@/lib/status";
import type { DayPool, Pool, Range, Source } from "./types";

export const sources = ["confirmed", "offer", "forecast"] as const;

/** Days the capacity page shows, today included. */
export const WINDOW_DAYS = 21;

const ZERO: Range = { low: 0, mid: 0, high: 0 };

/** A firm amount: low, mid and high are the same. */
export const exact = (kg: number): Range => ({ low: kg, mid: kg, high: kg });

/** Every date from `from` to `to`, both included. */
export function dateRange(from: string, to: string): string[] {
  const n = daysBetween(from, to);
  return Array.from({ length: Math.max(n + 1, 0) }, (_, i) => addDays(from, i));
}

/**
 * One pool on one day. Overload uses firm load only (confirmed + offer, mid),
 * so a forecast alone never triggers it. Idle uses the sum of highs.
 */
export function dayPool(input: {
  date: string;
  pool: Pool;
  load?: Partial<Record<Source, Range>>;
  capacityKg: number;
  idleThresholdPct: number;
}): DayPool {
  const load = {
    confirmed: input.load?.confirmed ?? ZERO,
    offer: input.load?.offer ?? ZERO,
    forecast: input.load?.forecast ?? ZERO,
  };
  const firm = load.confirmed.mid + load.offer.mid;
  const overflowKg = Math.max(firm - input.capacityKg, 0);
  const highs = load.confirmed.high + load.offer.high + load.forecast.high;
  return {
    date: input.date,
    pool: input.pool,
    load,
    capacityKg: input.capacityKg,
    overloaded: overflowKg > 0,
    overflowKg,
    idle: highs < (input.idleThresholdPct / 100) * input.capacityKg,
  };
}

/** What arrives or is booked on one day, before projecting the pools. */
export type DayInput = {
  date: string;
  /** Confirmed drying bookings (custom palay), kg. */
  dryingKg: number;
  /** Confirmed milling bookings, kg. */
  millingKg: number;
  /** Accepted sell offers by harvest date (IRPC-bought), kg. */
  offerKg: number;
  /** Forecast arrivals (IRPC-bought), kg. */
  forecast: Range;
};

/** Facility figures the projection reads. */
export type PoolSettings = {
  dryerKgPerDay: number;
  millKgPerDay: number;
  storageCapacityKg: number;
  /** Dried kg per wet kg, in percent. */
  dryYieldPct: number;
  idleThresholdPct: number;
};

/** Sums kg per date and lays the sums over every date in `[from, to]`. */
export function dayInputs(input: {
  from: string;
  to: string;
  drying: { date: string; kg: number }[];
  milling: { date: string; kg: number }[];
  offers: { date: string; kg: number }[];
  forecast: { date: string; kgLow: number; kgMid: number; kgHigh: number }[];
}): DayInput[] {
  const sum = (rows: { date: string; kg: number }[]) => {
    const byDate = new Map<string, number>();
    for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.kg);
    return byDate;
  };
  const drying = sum(input.drying);
  const milling = sum(input.milling);
  const offers = sum(input.offers);
  const forecast = new Map(input.forecast.map((f) => [f.date, f]));
  return dateRange(input.from, input.to).map((date) => {
    const f = forecast.get(date);
    return {
      date,
      dryingKg: drying.get(date) ?? 0,
      millingKg: milling.get(date) ?? 0,
      offerKg: offers.get(date) ?? 0,
      forecast: f ? { low: f.kgLow, mid: f.kgMid, high: f.kgHigh } : ZERO,
    };
  });
}

type Layer = { source: Source; kg: number };
type SimDay = {
  stock: Record<Source, number>;
  milled: Record<Source, number>;
};

const bySource = (): Record<Source, number> => ({
  confirmed: 0,
  offer: 0,
  forecast: 0,
});

/**
 * Storage and IRPC milling day by day for one forecast scenario (kg per day).
 * IRPC palay is dried in the dryer room bookings leave, offers before forecast,
 * then stored at `dryYieldPct`. The mill takes IRPC stock, oldest first, in
 * the room milling bookings leave, from what was stored by the day before.
 * Starting stock is labelled `confirmed`: it is already in storage.
 */
function simulate(
  days: DayInput[],
  startStockKg: number,
  forecastKg: (d: DayInput) => number,
  s: PoolSettings,
): SimDay[] {
  const layers: Layer[] = startStockKg
    ? [{ source: "confirmed", kg: startStockKg }]
    : [];
  return days.map((d) => {
    const milled = bySource();
    let millFree = Math.max(s.millKgPerDay - d.millingKg, 0);
    while (millFree > 0 && layers.length) {
      const take = Math.min(layers[0].kg, millFree);
      milled[layers[0].source] += take;
      millFree -= take;
      layers[0].kg -= take;
      if (layers[0].kg === 0) layers.shift();
    }

    const dryerFree = Math.max(s.dryerKgPerDay - d.dryingKg, 0);
    const offerWet = Math.min(d.offerKg, dryerFree);
    const forecastWet = Math.min(forecastKg(d), dryerFree - offerWet);
    const dried = (kg: number) => Math.floor((kg * s.dryYieldPct) / 100);
    for (const [source, kg] of [
      ["offer", dried(offerWet)],
      ["forecast", dried(forecastWet)],
    ] as const) {
      if (kg > 0) layers.push({ source, kg });
    }

    const stock = bySource();
    for (const l of layers) stock[l.source] += l.kg;
    return { stock, milled };
  });
}

const total = (r: Record<Source, number>) => r.confirmed + r.offer + r.forecast;

/**
 * Dryer, storage and mill per day, in date order and that pool order.
 * - Dryer: drying bookings, accepted offers and the forecast.
 * - Storage: starting stock (confirmed), dried offers and dried forecast.
 * - Mill: milling bookings plus IRPC stock milled, by where the stock came from.
 * Firm figures come from a run without the forecast, so the forecast only
 * ever adds its own range on top and never makes a day overloaded.
 */
export function projectPools(input: {
  days: DayInput[];
  startStockKg: number;
  settings: PoolSettings;
}): DayPool[] {
  const { days, startStockKg, settings: s } = input;
  const firm = simulate(days, startStockKg, () => 0, s);
  const runs = {
    low: simulate(days, startStockKg, (d) => d.forecast.low, s),
    mid: simulate(days, startStockKg, (d) => d.forecast.mid, s),
    high: simulate(days, startStockKg, (d) => d.forecast.high, s),
  };
  const extra = (i: number, of: (day: SimDay) => number): Range => ({
    low: of(runs.low[i]) - of(firm[i]),
    mid: of(runs.mid[i]) - of(firm[i]),
    high: of(runs.high[i]) - of(firm[i]),
  });
  const idleThresholdPct = s.idleThresholdPct;

  return days.flatMap((d, i) => [
    dayPool({
      date: d.date,
      pool: "dryer",
      load: {
        confirmed: exact(d.dryingKg),
        offer: exact(d.offerKg),
        forecast: d.forecast,
      },
      capacityKg: s.dryerKgPerDay,
      idleThresholdPct,
    }),
    dayPool({
      date: d.date,
      pool: "storage",
      load: {
        confirmed: exact(firm[i].stock.confirmed),
        offer: exact(firm[i].stock.offer),
        forecast: extra(i, (r) => total(r.stock)),
      },
      capacityKg: s.storageCapacityKg,
      idleThresholdPct,
    }),
    dayPool({
      date: d.date,
      pool: "mill",
      load: {
        confirmed: exact(d.millingKg + firm[i].milled.confirmed),
        offer: exact(firm[i].milled.offer),
        forecast: extra(i, (r) => total(r.milled)),
      },
      capacityKg: s.millKgPerDay,
      idleThresholdPct,
    }),
  ]);
}

/** An active dryer, as the electricity basis reads it. */
export type DryerMachine = {
  capacityKg: number;
  cycleHours: number;
  kw: number;
};

/**
 * kWh to dry `kg` in one day. Dryers run whole cycles, so a part load costs a
 * full cycle; loads go to the largest dryers first, each up to the cycles its
 * hours allow.
 */
export function dryingKwh(
  kg: number,
  dryers: DryerMachine[],
  hoursPerDay: number,
): number {
  let left = kg;
  let kwh = 0;
  for (const m of [...dryers].sort((a, b) => b.capacityKg - a.capacityKg)) {
    for (
      let c = Math.floor(hoursPerDay / m.cycleHours);
      c > 0 && left > 0;
      c--
    ) {
      kwh += m.kw * m.cycleHours;
      left -= m.capacityKg;
    }
  }
  return kwh;
}

/**
 * Inputs for `electricityPerKg` over the window: dryer kWh in whole cycles,
 * mill kWh by hours run, the kg they handle and the days either runs.
 */
export function electricityBasis(input: {
  days: DayPool[];
  dryers: DryerMachine[];
  /** Rated kW of active mills. */
  millKw: number;
  hoursPerDay: number;
}): { machineKwh: number; kg: number; daysRun: number } {
  let machineKwh = 0;
  let kg = 0;
  const run = new Set<string>();
  for (const d of input.days) {
    if (d.pool === "storage" || d.capacityKg <= 0) continue;
    const handled = Math.min(expectedKg(d), d.capacityKg);
    if (handled <= 0) continue;
    machineKwh +=
      d.pool === "dryer"
        ? dryingKwh(handled, input.dryers, input.hoursPerDay)
        : input.millKw * input.hoursPerDay * (handled / d.capacityKg);
    kg += handled;
    run.add(d.date);
  }
  return { machineKwh, kg, daysRun: run.size };
}

/** Days of one pool, in date order. */
export function poolDays(days: DayPool[], pool: Pool): DayPool[] {
  return days.filter((d) => d.pool === pool);
}

const weekday = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** `Thu, Oct 15` from a `YYYY-MM-DD` calendar date. */
export function dayLabel(date: string): string {
  return weekday.format(new Date(`${date}T00:00:00Z`));
}

const monthDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

/** `Oct 15` from a `YYYY-MM-DD` calendar date. */
export function shortDay(date: string): string {
  return monthDay.format(new Date(`${date}T00:00:00Z`));
}

/** Mid load across all sources. */
export function expectedKg(day: DayPool): number {
  return sources.reduce((sum, s) => sum + day.load[s].mid, 0);
}

/** Runs of consecutive idle days, in date order. */
export function idleStretches(
  days: DayPool[],
): { from: string; to: string; days: number }[] {
  const out: { from: string; to: string; days: number }[] = [];
  for (const d of days) {
    const last = out.at(-1);
    if (!d.idle) continue;
    if (last && addDays(last.to, 1) === d.date) {
      last.to = d.date;
      last.days++;
    } else {
      out.push({ from: d.date, to: d.date, days: 1 });
    }
  }
  return out;
}

/** Headline figures over the window. */
export function headline(days: DayPool[]): {
  expectedKg: number;
  capacityKg: number;
  /** Whole percent, or null with no capacity. */
  utilizationPct: number | null;
  overloaded: DayPool[];
  idleDays: number;
} {
  const expected = days.reduce((sum, d) => sum + expectedKg(d), 0);
  const capacity = days.reduce((sum, d) => sum + d.capacityKg, 0);
  return {
    expectedKg: expected,
    capacityKg: capacity,
    utilizationPct: capacity ? Math.round((expected / capacity) * 100) : null,
    overloaded: days.filter((d) => d.overloaded),
    idleDays: days.filter((d) => d.idle).length,
  };
}

/** One pool's state on the plant view. */
export type PlantStatus = "over" | "near" | "ok" | "idle";

export const plantStatusTones: Record<PlantStatus, StatusTone> = {
  over: "danger",
  near: "warning",
  ok: "success",
  idle: "neutral",
};

/** Expected load at or above this share of capacity is near full. */
export const NEAR_FULL = 0.85;

/** Overloaded first, then idle, then near full at `NEAR_FULL` of capacity. */
export function plantStatus(day: DayPool): PlantStatus {
  if (day.overloaded) return "over";
  if (day.idle) return "idle";
  if (day.capacityKg && expectedKg(day) / day.capacityKg >= NEAR_FULL) {
    return "near";
  }
  return "ok";
}
