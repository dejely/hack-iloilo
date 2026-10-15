// M10. Prescriptions: Suggested actions computed from capacity. See TRD.md.
// Pure functions only: no I/O and no imports from other modules. Unit-test here.

import { addDays, daysBetween } from "@/lib/dates";
import { formatMoney, formatMoneySms, formatTonnes } from "@/lib/format";
import type {
  FillIdlePrescription,
  MillFullLoadsPrescription,
  Move,
  MoveBookingsPrescription,
  Recipient,
  StoreMillLaterPrescription,
  Suggestion,
} from "./types";

/** 53-bit hash (cyrb53) as hex: stable across runs and machines. */
export function hashKey(value: unknown): string {
  const str = JSON.stringify(value);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const monthDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

/** `Oct 20` from a `YYYY-MM-DD` calendar date. */
export function shortDay(date: string): string {
  return monthDay.format(new Date(`${date}T00:00:00Z`));
}

/**
 * `Oct 22` or `Oct 22–23` / `Oct 30–Nov 2` for a set of dates. Pass `-` as
 * the dash for SMS, since `–` is not GSM-7.
 */
export function daySpan(dates: string[], dash = "–"): string {
  const sorted = [...new Set(dates)].sort();
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) return "";
  if (first === last) return shortDay(first);
  const [m1] = shortDay(first).split(" ");
  const [m2, d2] = shortDay(last).split(" ");
  return `${shortDay(first)}${dash}${m1 === m2 ? d2 : `${m2} ${d2}`}`;
}

/** `Oct 19, Oct 21–23`: runs of consecutive days as spans. */
export function dayList(dates: string[]): string {
  const runs: string[][] = [];
  for (const date of [...new Set(dates)].sort()) {
    const run = runs.at(-1);
    if (run && addDays(run.at(-1)!, 1) === date) run.push(date);
    else runs.push([date]);
  }
  return runs.map((run) => daySpan(run)).join(", ");
}

/** Dryer capacity and firm load (confirmed + offer) on one day. */
export type DryerDay = { date: string; capacityKg: number; firmKg: number };

/** An open drying booking, as the move rule reads it. */
export type OpenBooking = {
  id: string;
  ref: string;
  client: string;
  kg: number;
  scheduledDate: string;
  preferredDate: string;
  flexDays: number;
  status: "confirmed" | "reschedule_proposed";
  /** Where an earlier accepted card proposed to move it. */
  proposedDate: string | null;
};

/**
 * For each overloaded dryer day, moves flexible confirmed bookings, largest
 * first, to the nearest day within their flex window (around the preferred
 * date, not before `today`) that has room, until the overflow clears. Ties go
 * to the later day, since palay is rarely ready early. Bookings already asked
 * to move count on their proposed day (`incomingKg`), so the overflow can
 * be above what the capacity chart shows. Days with nothing to move get no card.
 */
export function moveBookings(input: {
  days: DryerDay[];
  bookings: OpenBooking[];
  today: string;
}): Omit<MoveBookingsPrescription, "decision">[] {
  const room = new Map(
    input.days.map((d) => [d.date, d.capacityKg - d.firmKg]),
  );
  const shift = (date: string | null, kg: number) => {
    const r = date === null ? undefined : room.get(date);
    if (date !== null && r !== undefined) room.set(date, r + kg);
  };
  const incoming = new Map<string, number>();
  for (const b of input.bookings) {
    if (b.status !== "reschedule_proposed" || !b.proposedDate) continue;
    shift(b.scheduledDate, b.kg);
    shift(b.proposedDate, -b.kg);
    incoming.set(b.proposedDate, (incoming.get(b.proposedDate) ?? 0) + b.kg);
  }

  const out: Omit<MoveBookingsPrescription, "decision">[] = [];
  for (const day of [...input.days].sort((a, b) =>
    a.date.localeCompare(b.date),
  )) {
    const overflowKg = -(room.get(day.date) ?? 0);
    if (overflowKg <= 0) continue;
    const candidates = input.bookings
      .filter(
        (b) =>
          b.status === "confirmed" &&
          b.flexDays > 0 &&
          b.scheduledDate === day.date,
      )
      .sort((a, b) => b.kg - a.kg || a.ref.localeCompare(b.ref));

    const moves: Move[] = [];
    let left = overflowKg;
    for (const b of candidates) {
      if (left <= 0) break;
      const to = nearestWithRoom(b, room, input.today);
      if (!to) continue;
      shift(to, -b.kg);
      shift(day.date, b.kg);
      left -= b.kg;
      moves.push({
        bookingId: b.id,
        ref: b.ref,
        client: b.client,
        from: day.date,
        to,
        kg: b.kg,
      });
    }
    if (!moves.length) continue;

    const remainderKg = Math.max(left, 0);
    const movedKg = moves.reduce((sum, m) => sum + m.kg, 0);
    const incomingKg = incoming.get(day.date) ?? 0;
    out.push({
      kind: "move_bookings",
      key: hashKey([
        "move_bookings",
        day.date,
        overflowKg,
        moves.map((m) => [m.bookingId, m.to, m.kg]),
      ]),
      title: `${shortDay(day.date)} is ${formatTonnes(overflowKg)} over`,
      facts: {
        day: shortDay(day.date),
        overflow: formatTonnes(overflowKg),
        bookings_moved: moves.length,
        moved: formatTonnes(movedKg),
        new_days: daySpan(moves.map((m) => m.to)),
        remainder: formatTonnes(remainderKg),
        ...(incomingKg && {
          already_asked_to_move_here: formatTonnes(incomingKg),
        }),
      },
      date: day.date,
      moves,
      remainderKg,
      incomingKg,
    });
  }
  return out;
}

/** Nearest day in the booking's flex window with room for all of it. */
function nearestWithRoom(
  b: OpenBooking,
  room: Map<string, number>,
  today: string,
): string | null {
  const lo = addDays(b.preferredDate, -b.flexDays);
  const hi = addDays(b.preferredDate, b.flexDays);
  const reach = Math.max(
    Math.abs(daysBetween(b.scheduledDate, lo)),
    Math.abs(daysBetween(b.scheduledDate, hi)),
  );
  for (let dist = 1; dist <= reach; dist++) {
    for (const date of [
      addDays(b.scheduledDate, dist),
      addDays(b.scheduledDate, -dist),
    ]) {
      if (date < lo || date > hi || date < today) continue;
      if ((room.get(date) ?? -1) >= b.kg) return date;
    }
  }
  return null;
}

/** Today's rates, in centavos per kg, for the idle-day text. */
export type Rates = {
  dryingMinorPerKg: number;
  millingMinorPerKg: number;
  buyBaseMinorPerKg: number;
  /** MC the buying base is quoted at, percent. */
  buyReferenceMc: number;
};

/** The text sent before an idle stretch: GSM-7, well under 320 characters. */
export function idleDraft(from: string, to: string, rates: Rates): string {
  const ddmm = `${from.slice(8, 10)}/${from.slice(5, 7)}`;
  return (
    `IRPC: May bakante ang dryer namon sa ${daySpan([from, to], "-")}. ` +
    `Drying ${formatMoneySms(rates.dryingMinorPerKg)}/kg, milling ${formatMoneySms(rates.millingMinorPerKg)}/kg. ` +
    `Nagabakal man kami palay sa ${formatMoneySms(rates.buyBaseMinorPerKg)}/kg (${rates.buyReferenceMc}% MC). ` +
    `Para mag-book, i-text BOOK DRY <kg> <dd/mm>, pareho sang BOOK DRY 5000 ${ddmm}.`
  );
}

/** A client the idle-day rule may text. */
export type Candidate = Recipient & {
  kind: string;
  hasOpenBooking: boolean;
};

/**
 * For each idle dryer stretch still ahead (from tomorrow), texts farmers and
 * co-ops with no open booking, by past volume, then municipality, then name.
 * One card per stretch; none without recipients.
 */
export function fillIdle(input: {
  stretches: { from: string; to: string }[];
  candidates: Candidate[];
  rates: Rates;
  today: string;
}): Omit<FillIdlePrescription, "decision">[] {
  const recipients: Recipient[] = input.candidates
    .filter(
      (c) => (c.kind === "farmer" || c.kind === "coop") && !c.hasOpenBooking,
    )
    .sort(
      (a, b) =>
        b.pastKg - a.pastKg ||
        (a.municipality ?? "\uffff").localeCompare(
          b.municipality ?? "\uffff",
        ) ||
        a.name.localeCompare(b.name),
    )
    .map(({ clientId, name, phone, municipality, pastKg }) => ({
      clientId,
      name,
      phone,
      municipality,
      pastKg,
    }));
  if (!recipients.length) return [];

  const tomorrow = addDays(input.today, 1);
  return input.stretches.flatMap((s) => {
    const from = s.from < tomorrow ? tomorrow : s.from;
    if (from > s.to) return [];
    const days = daysBetween(from, s.to) + 1;
    const message = idleDraft(from, s.to, input.rates);
    return [
      {
        kind: "fill_idle" as const,
        key: hashKey([
          "fill_idle",
          from,
          s.to,
          recipients.map((r) => r.clientId),
          message,
        ]),
        title: `${daySpan([from, s.to])} ${days === 1 ? "is" : "are"} idle`,
        facts: {
          days: daySpan([from, s.to]),
          idle_days: days,
          recipients: recipients.length,
          municipalities: municipalitySummary(recipients),
        },
        from,
        to: s.to,
        recipients,
        message,
      },
    ];
  });
}

/** `Dumangas 5, Pototan 3, 2 more` by recipient count. */
export function municipalitySummary(recipients: Recipient[], top = 3): string {
  const counts = new Map<string, number>();
  for (const r of recipients) {
    const m = r.municipality ?? "No municipality";
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const sorted = [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const shown = sorted.slice(0, top).map(([m, n]) => `${m} ${n}`);
  const more = sorted.length - top;
  return more > 0 ? `${shown.join(", ")}, ${more} more` : shown.join(", ");
}

/** One mill day: capacity, milling bookings and IRPC palay planned on it, kg. */
export type MillDay = {
  date: string;
  capacityKg: number;
  bookedKg: number;
  irpcKg: number;
};

/**
 * Compares milling IRPC's stored palay on the days the plan spreads it over
 * against full loads (about ⌈kg ÷ daily capacity⌉ days). Palay can't be
 * milled before the plan has it in storage, so stock builds up and the mill
 * runs once a full day's room (after milling bookings) is waiting, clearing
 * the rest on the plan's last day. `perKg` prices a run of `daysRun` days
 * with M7 `electricityPerKg`. A card only when it saves.
 */
export function millFullLoads(input: {
  days: MillDay[];
  perKg: (run: { kg: number; daysRun: number }) => number;
}): Omit<MillFullLoadsPrescription, "decision">[] {
  const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
  const spread = days.filter((d) => d.irpcKg > 0);
  const kg = spread.reduce((sum, d) => sum + d.irpcKg, 0);
  if (spread.length < 2) return [];

  const last = spread.at(-1)!.date;
  const fullDates: string[] = [];
  let waiting = 0;
  for (const d of days) {
    if (d.date > last) break;
    waiting += d.irpcKg;
    const room = d.capacityKg - d.bookedKg;
    if (room <= 0 || waiting <= 0) continue;
    if (waiting < room && d.date < last) continue;
    waiting -= Math.min(room, waiting);
    fullDates.push(d.date);
  }
  if (waiting > 0 || fullDates.length >= spread.length) return [];

  const spreadDates = spread.map((d) => d.date);
  const spreadMinorPerKg = input.perKg({ kg, daysRun: spreadDates.length });
  const fullMinorPerKg = input.perKg({ kg, daysRun: fullDates.length });
  const saving = spreadMinorPerKg - fullMinorPerKg;
  if (saving <= 0) return [];

  return [
    {
      kind: "mill_full_loads",
      key: hashKey([
        "mill_full_loads",
        kg,
        spreadDates,
        fullDates,
        spreadMinorPerKg,
        fullMinorPerKg,
      ]),
      title: `Mill ${formatTonnes(kg)} in ${fullDates.length} full ${fullDates.length === 1 ? "day" : "days"}, not ${spreadDates.length}`,
      facts: {
        stock: formatTonnes(kg),
        full_days: fullDates.length,
        full_dates: dayList(fullDates),
        full_per_kg: formatMoney(fullMinorPerKg),
        spread_days: spreadDates.length,
        spread_dates: dayList(spreadDates),
        spread_per_kg: formatMoney(spreadMinorPerKg),
        saving_per_kg: formatMoney(saving),
      },
      kg,
      spreadDates,
      fullDates,
      spreadMinorPerKg,
      fullMinorPerKg,
    },
  ];
}

/** One pool on one day: capacity and firm load (confirmed + offer), kg. */
export type PoolDay = {
  date: string;
  capacityKg: number;
  firmKg: number;
  idle: boolean;
};

/**
 * For each overloaded mill day, stores the overflow and mills it on the
 * nearest idle mill days after it, as long as storage has room every day it
 * waits. Reports any remainder. Days with nothing to move get no card.
 */
export function storeMillLater(input: {
  mill: PoolDay[];
  storage: PoolDay[];
}): Omit<StoreMillLaterPrescription, "decision">[] {
  const mill = [...input.mill].sort((a, b) => a.date.localeCompare(b.date));
  const millRoom = new Map(mill.map((d) => [d.date, d.capacityKg - d.firmKg]));
  const storeRoom = new Map(
    input.storage.map((d) => [d.date, d.capacityKg - d.firmKg]),
  );

  const out: Omit<StoreMillLaterPrescription, "decision">[] = [];
  for (const day of mill) {
    const overflowKg = day.firmKg - day.capacityKg;
    if (overflowKg <= 0) continue;
    const millDays: { date: string; kg: number }[] = [];
    let left = overflowKg;
    for (const t of mill) {
      if (left <= 0) break;
      if (t.date <= day.date || !t.idle) continue;
      // It waits in storage from the overloaded day until the day before.
      const waits = mill
        .filter((w) => w.date >= day.date && w.date < t.date)
        .map((w) => w.date);
      const kg = Math.min(
        left,
        millRoom.get(t.date) ?? 0,
        ...waits.map((w) => storeRoom.get(w) ?? 0),
      );
      if (kg <= 0) continue;
      left -= kg;
      millRoom.set(t.date, (millRoom.get(t.date) ?? 0) - kg);
      for (const w of waits) storeRoom.set(w, (storeRoom.get(w) ?? 0) - kg);
      millDays.push({ date: t.date, kg });
    }
    if (!millDays.length) continue;

    const storedKg = overflowKg - left;
    out.push({
      kind: "store_mill_later",
      key: hashKey([
        "store_mill_later",
        day.date,
        overflowKg,
        millDays.map((m) => [m.date, m.kg]),
      ]),
      title: `Mill is ${formatTonnes(overflowKg)} over on ${shortDay(day.date)}`,
      facts: {
        day: shortDay(day.date),
        overflow: formatTonnes(overflowKg),
        stored: formatTonnes(storedKg),
        mill_days: dayList(millDays.map((m) => m.date)),
        remainder: formatTonnes(left),
      },
      date: day.date,
      millDays,
      remainderKg: left,
    });
  }
  return out;
}

/**
 * The card's one-line note: what to do, from its facts only. Anything left
 * over shows as its own badge, so the note leaves it out.
 */
export function templateNote(p: Suggestion): string {
  const f = p.facts;
  switch (p.kind) {
    case "move_bookings": {
      const n = Number(f.bookings_moved);
      return `Move ${n} flexible ${n === 1 ? "booking" : "bookings"} to ${f.new_days}.`;
    }
    case "mill_full_loads": {
      const n = Number(f.spread_days) - Number(f.full_days);
      return `${n} fewer base-load ${n === 1 ? "day" : "days"}, saves ${f.saving_per_kg}/kg.`;
    }
    case "store_mill_later":
      return `Store ${f.stored} dried, mill on ${f.mill_days}.`;
    case "fill_idle": {
      const n = Number(f.recipients);
      return `Text prices to ${n} ${n === 1 ? "client" : "clients"} with no booking.`;
    }
  }
}
