// M4. Booking: Future drying and milling slots. See TRD.md.
// Pure functions only: no I/O and no imports from other modules. Unit-test here.

import { addDays } from "@/lib/dates";
import { formatKg } from "@/lib/format";
import type { StatusTone } from "@/lib/status";
import type { Booking, BookingRow, BookingStatus, Service } from "./types";

export const services = ["drying", "milling"] as const;
export const bookingStatuses = [
  "confirmed",
  "reschedule_proposed",
  "arrived",
  "cancelled",
  "no_show",
] as const;
export const serviceLabels: Record<Service, string> = {
  drying: "Drying",
  milling: "Milling",
};
export const statusLabels: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  reschedule_proposed: "Reschedule proposed",
  arrived: "Arrived",
  cancelled: "Cancelled",
  no_show: "No-show",
};
export const statusTones: Record<BookingStatus, StatusTone> = {
  confirmed: "info",
  reschedule_proposed: "warning",
  arrived: "success",
  cancelled: "neutral",
  no_show: "danger",
};
export const MAX_FLEX_DAYS = 7;
// TODO(M3): confirm IRPC's sack weight.
export const SACK_KG = 50;

/** Follow-up questions for a free-text booking missing these values. GSM-7. */
export const bookingAsk: Record<string, string> = {
  amount: "Pila ka kilo (ukon sako) ang palay mo?",
  unit: "Pila ka kilo (ukon sako) ang palay mo?",
  dayMonth: "San-o ka maabot? I-text ang adlaw/bulan, pareho sang 20/10.",
  service: "Pa-dry (DRY) ukon pa-galing (MILL)?",
};

/** Most kg one SMS booking or offer may name; more is a typo or a test. */
export const MAX_SMS_KG = 200_000;

// English, Hiligaynon and Tagalog, as texted: "pa-dry", "pagaling", "kiskis".
const DRYING_WORDS = new Set(
  "dry drying dryer bulad bilad uga tuyo".split(" "),
);
const MILLING_WORDS = new Set(
  "mill milling miller galing giling kiskis kiskisan".split(" "),
);

/** Service words a booking text may start with instead of BOOK. */
export const SERVICE_KEYWORDS = (
  "DRY DRYING PADRY BULAD PABULAD IPABULAD PAUGA " +
  "MILL MILLING GALING PAGALING PAGGALING IPAGALING GILING PAGILING " +
  "PAGGILING KISKIS PAKISKIS"
).split(" ");

/** The service a word names: "DRY", "pa-galing", "ipabulad". */
export function serviceOf(word: string): Service | undefined {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  const stems = ["ipa", "pag", "pa", "i"]
    .filter((prefix) => w.startsWith(prefix))
    .map((prefix) => w.slice(prefix.length));
  for (const stem of [w, ...stems]) {
    if (DRYING_WORDS.has(stem)) return "drying";
    if (MILLING_WORDS.has(stem)) return "milling";
  }
  return undefined;
}

type Unit = "kg" | "sacks" | "tons";
const unitOf = (word: string): Unit | undefined =>
  /^(kgs?|kilos?|kls?|kilograms?)$/.test(word)
    ? "kg"
    : /^(sacks?|sakos?|sx|bags?|kabans?|cavans?|cabans?)$/.test(word)
      ? "sacks"
      : /^(tons?|tonnes?|tonelada|toneladas)$/.test(word)
        ? "tons"
        : undefined;

/** Thousands with commas ("1,000") or plain digits, with an optional decimal. */
const AMOUNT = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?([a-z]*)$/;

/**
 * An amount at `tokens[i]` with its unit, as a suffix ("20sako") or the next
 * word ("20 sako", "20 ka sako"). `used` counts the tokens it took.
 */
function readAmount(
  tokens: readonly string[],
  i: number,
): { value: number; unit?: Unit; used: number } | null {
  const match = AMOUNT.exec(tokens[i].toLowerCase());
  if (!match) return null;
  const value = Number(`${match[1].replace(/,/g, "")}.${match[2] ?? 0}`);
  if (!(value > 0)) return null;
  if (match[3]) {
    const unit = unitOf(match[3]);
    return unit ? { value, unit, used: 1 } : null;
  }
  const skip = tokens[i + 1]?.toLowerCase() === "ka" ? 1 : 0;
  const unit = unitOf(tokens[i + 1 + skip]?.toLowerCase() ?? "");
  return unit ? { value, unit, used: 2 + skip } : { value, used: 1 };
}

/** An amount in whole kg: code converts sacks and tons, never the AI. */
export const toKg = (value: number, unit: Unit = "kg"): number =>
  Math.round(value * { kg: 1, sacks: SACK_KG, tons: 1000 }[unit]);

/**
 * Reads a plain follow-up reply to `bookingAsk` without AI: "1000" (kg, as
 * asked), "20 sako", "2 tons", "20/10", "pa-galing". A number is an amount
 * only with a unit or as the whole reply, so "sa Oct 20" isn't 20 kg. Null
 * when nothing is recognised.
 */
export function readBookingReply(text: string): {
  amount?: number;
  unit?: "kg" | "sacks";
  dayMonth?: string;
  service?: Service;
} | null {
  const tokens = text
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9%]+$/g, ""))
    .filter(Boolean);
  const read: NonNullable<ReturnType<typeof readBookingReply>> = {};

  const dayMonth = tokens.find((t) => /^\d{1,2}\/\d{1,2}$/.test(t));
  if (dayMonth) read.dayMonth = dayMonth;

  const unit = tokens.map(unitOf).find(Boolean);
  for (let i = 0; i < tokens.length && read.amount === undefined; i++) {
    if (tokens[i] === dayMonth) continue;
    const amount = readAmount(tokens, i);
    if (!amount || (!amount.unit && tokens.length > 1)) continue;
    // Tons go back as kg; the reading only knows kg and sacks.
    read.unit = amount.unit === "sacks" ? "sacks" : "kg";
    read.amount =
      amount.unit === "tons" ? toKg(amount.value, "tons") : amount.value;
  }
  if (read.amount === undefined && unit && unit !== "tons") read.unit = unit;

  // "dry kag mill" names both, so leave the service to ask.
  const named = new Set(tokens.map(serviceOf).filter(Boolean));
  if (named.size === 1) read.service = [...named][0];

  return Object.keys(read).length ? read : null;
}

/** Follow-up question for a free-text cancel without a ref. GSM-7. */
export const cancelAsk: Record<string, string> = {
  ref: "Ano ang 6-letra nga ref sang booking? Pareho sang K7P2QX.",
};

/** An AI-read booking amount in kg: code converts sacks, never the AI. */
export function bookingFromAi<
  T extends { amount: number; unit: "kg" | "sacks" },
>({
  amount,
  unit,
  ...rest
}: T): Omit<T, "amount" | "unit"> & { estKg: number } {
  return {
    ...rest,
    estKg: toKg(amount, unit),
  };
}

/** Shared move validation; `today` is the Manila calendar date supplied by the caller. */
export function validateMove(
  date: string,
  flexDays: number,
  today: string,
): string | null {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return "Choose a valid date.";
  if (date < today) return "Choose today or a later date.";
  if (!Number.isInteger(flexDays) || flexDays < 0 || flexDays > MAX_FLEX_DAYS)
    return `Flex days must be a whole number from 0 to ${MAX_FLEX_DAYS}.`;
  return null;
}
/** Days shown by default on the bookings page, today included. */
export const DEFAULT_RANGE_DAYS = 16;

export function defaultRange(today: string): { from: string; to: string } {
  return { from: today, to: addDays(today, DEFAULT_RANGE_DAYS) };
}

export type BookingFilters = {
  service: Service | "all";
  status: BookingStatus | "all";
  search: string;
};
export type BookingGroup = {
  date: string;
  service: Service;
  count: number;
  totalKg: number;
  rows: BookingRow[];
};

function matchesSearch(row: BookingRow, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  if (row.ref.toLowerCase().includes(query)) return true;
  if (row.client.name.toLowerCase().includes(query)) return true;
  if (!/^[+\d\s()-]+$/.test(query)) return false;
  const digits = query.replace(/\D/g, "");
  if (!digits) return false;
  // `0917…` and `+63917…` find the same E.164 phone.
  const phone = digits.startsWith("0") ? `63${digits.slice(1)}` : digits;
  return [row.client.phone, row.booked_by_phone].some((value) =>
    value.replace(/\D/g, "").includes(phone),
  );
}

/** Filtered bookings grouped by scheduled day and service, with day totals. */
export function groupBookings(
  rows: BookingRow[],
  filters: BookingFilters,
): BookingGroup[] {
  const groups = new Map<string, BookingGroup>();
  for (const row of rows) {
    if (filters.service !== "all" && row.service !== filters.service) continue;
    if (filters.status !== "all" && row.status !== filters.status) continue;
    if (!matchesSearch(row, filters.search)) continue;
    const key = `${row.scheduled_date}|${row.service}`;
    const group = groups.get(key) ?? {
      date: row.scheduled_date,
      service: row.service,
      count: 0,
      totalKg: 0,
      rows: [],
    };
    group.count += 1;
    group.totalKg += row.est_kg;
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.service.localeCompare(b.service),
  );
}

/**
 * Who made the booking: staff at the gate, the client by SMS, or someone
 * booking `FOR` the client (named when their phone belongs to a client).
 */
export function bookedByLabel(
  row: BookingRow,
  namesByPhone: ReadonlyMap<string, string> = new Map(),
): string {
  if (row.channel === "staff") return "Staff · walk-in";
  if (row.booked_by_phone === row.client.phone) return "Self · SMS";
  return `${namesByPhone.get(row.booked_by_phone) ?? row.booked_by_phone} · FOR`;
}

/** Ownership for SMS and /book/track: only the client or whoever booked for them. */
export const isClientOrBooker = (
  booking: Pick<Booking, "booked_by_phone">,
  clientPhone: string,
  phone: string,
) => phone === clientPhone || phone === booking.booked_by_phone;

/** A typed ref as stored: uppercase, without spaces or dashes (`k7p-2qx` → `K7P2QX`). */
export function cleanRef(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Failed /book/track lookups a phone may make per window before it is locked out. */
export const TRACK_MAX_FAILURES = 5;
export const TRACK_WINDOW_MINUTES = 15;

export function isTrackLocked(recentFailures: number): boolean {
  return recentFailures >= TRACK_MAX_FAILURES;
}

/** Only confirmed bookings cancel; by SMS only the client or booker may. */
export function canCancel(
  booking: Pick<Booking, "status" | "booked_by_phone">,
  clientPhone: string,
  byPhone?: string,
): "ok" | "forbidden" | "not_cancellable" {
  if (byPhone !== undefined && !isClientOrBooker(booking, clientPhone, byPhone))
    return "forbidden";
  return booking.status === "confirmed" ? "ok" : "not_cancellable";
}

/**
 * Open bookings (`confirmed` or `reschedule_proposed`) move to a new date; by
 * SMS only the client or booker may.
 */
export function canMove(
  booking: Pick<Booking, "status" | "booked_by_phone">,
  clientPhone: string,
  byPhone?: string,
): "ok" | "forbidden" | "not_movable" {
  if (byPhone !== undefined && !isClientOrBooker(booking, clientPhone, byPhone))
    return "forbidden";
  return booking.status === "confirmed" ||
    booking.status === "reschedule_proposed"
    ? "ok"
    : "not_movable";
}

/**
 * The date a reschedule answer leaves the booking on: YES takes the proposed
 * date, NO keeps the scheduled one. Only the client or booker may answer.
 */
export function rescheduleAnswer(
  booking: Pick<
    Booking,
    "status" | "booked_by_phone" | "scheduled_date" | "proposed_date"
  >,
  clientPhone: string,
  byPhone: string,
  yes: boolean,
):
  | { status: "forbidden" }
  | { status: "not_open" }
  | { status: "ok"; date: string } {
  if (!isClientOrBooker(booking, clientPhone, byPhone))
    return { status: "forbidden" };
  if (booking.status !== "reschedule_proposed" || !booking.proposed_date)
    return { status: "not_open" };
  return {
    status: "ok",
    date: yes ? booking.proposed_date : booking.scheduled_date,
  };
}

// Calendar dates are rendered at UTC midnight so the host time zone never shifts them.
const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const shortFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** `Tue, Oct 20` */
export function formatDay(date: string): string {
  return dayFormat.format(utc(date));
}

/** `Oct 20` */
export function formatShortDate(date: string): string {
  return shortFormat.format(utc(date));
}

/** `Oct 15 – 31`, `Oct 25 – Nov 10` */
export function formatRange(from: string, to: string): string {
  return shortFormat.formatRange(utc(from), utc(to));
}

/** SMS replies in Hiligaynon, filled with `fillTemplate`. GSM-7. */
export const bookingSms = {
  confirmed:
    "IRPC: Confirmed na ang booking mo. Code {ref}: {service}, {kg} kg sa {date}. Para i-cancel: CANCEL {ref}.",
  rescheduleQuestion:
    "IRPC: Puno na ang {date}. Puwede namon i-saylo ang {service} booking mo {ref} ({kg} kg) sa {newDate}? Reply YES {ref} ukon NO {ref}.",
  rescheduleMoved: "IRPC: Na-saylo na ang booking {ref} sa {date}. Salamat!",
  rescheduleKept: "IRPC: Sige, ang booking {ref} sa {date} gihapon.",
  moved:
    "IRPC: Na-saylo na ang booking {ref} sa {date}: {service}, {kg} kg. Para i-cancel: CANCEL {ref}.",
  cancelled: "IRPC: Na-cancel na ang booking {ref}.",
  notFound: "IRPC: Wala sang booking nga may code {ref}.",
  notCancellable:
    "IRPC: Indi na ma-cancel ang booking {ref}. Ang confirmed nga booking lang ang ma-cancel.",
  notMovable:
    "IRPC: Indi na ma-saylo ang booking {ref}. Ang booking nga wala pa natabo lang ang ma-saylo.",
  notWaiting: "IRPC: Ang booking {ref} wala na nagahulat sang sabat.",
  invalidMove:
    "IRPC: Indi ma-saylo ang booking {ref}. Ang petsa dapat subong ukon sa masunod, kag ang flex 0 tubtob 7 ka adlaw lang. Pareho: MOVE {ref} 25/10 +2",
  invalidDate:
    "IRPC: Indi husto ang petsa. Palihog i-text ang adlaw subong ukon sa masunod, sa day/month, pareho sang 25/10.",
} as const;

// "+2", "±2", "+-2", "+/-2", "+2days", "+2 adlaw" is split, so the number only.
const FLEX_ARG = /^(?:[±+]|\+-|\+\/-)(\d+)(?:d|days?|adlaw)?$/i;

/** A ref as texted: "k7p2qx", "K7P-2QX", or split as "K7P 2QX". */
export function readRef(args: readonly string[]): string | null {
  const candidates = [...args.map(cleanRef), cleanRef(args.join(""))];
  return candidates.filter((t) => /^[A-Z0-9]{6}$/.test(t)).at(-1) ?? null;
}

// Words people add to a booking: "BOOK DRY 1000 kg sa 20/10 po".
const BOOKING_FILLER = new Set("ka sa on at po palay ko ang".split(" "));

/** Strict keyword arguments; invalid shapes are rejected by the SMS schema. */
const weekdayDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});

/**
 * "mag-book sang drying para sa 1,000 kg sa Mon, Oct 19, puwede 2 ka adlaw
 * nga mas temprano ukon mas ulihi", completing `aiConfirmText`.
 * Falls back to `dayMonth` when the day can't be resolved (e.g. 31/02).
 */
export function describeBookingRequest({
  service,
  estKg,
  dayMonth,
  date,
  flexDays,
}: {
  service: (typeof services)[number];
  estKg: number;
  dayMonth: string;
  date: string | null;
  flexDays: number;
}): string {
  const day = date
    ? weekdayDate.format(new Date(`${date}T00:00:00Z`))
    : dayMonth;
  const flex = flexDays
    ? `, puwede ${flexDays} ka adlaw nga mas temprano ukon mas ulihi`
    : "";
  return `mag-book sang ${service} para sa ${formatKg(estKg)} sa ${day}${flex}`;
}

export function parseBookingArgs(args: string[]): unknown {
  // Each part is told apart by its shape, so any order reads.
  let service: Service | undefined;
  let estKg: number | undefined;
  let dayMonth: string | undefined;
  let flexDays: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    const named = serviceOf(token);
    const flex = FLEX_ARG.exec(token);
    const amount = readAmount(args, i);
    if (named) {
      if (service && service !== named) return null;
      service = named;
    } else if (/^\d{1,2}\/\d{1,2}$/.test(token)) {
      if (dayMonth) return null;
      dayMonth = token;
    } else if (flex) {
      if (flexDays !== undefined) return null;
      flexDays = Number(flex[1]);
    } else if (amount && estKg === undefined) {
      // Kg are whole; "1.5 sako" or "2.5 tons" convert to whole kg.
      if ((amount.unit ?? "kg") === "kg" && !Number.isInteger(amount.value))
        return null;
      estKg = toKg(amount.value, amount.unit);
      i += amount.used - 1;
    } else if (!BOOKING_FILLER.has(token.toLowerCase())) return null;
  }
  return { service, estKg, dayMonth, flexDays: flexDays ?? 0 };
}

/** `MOVE <ref> <dd/mm> [±<days>]`; without flex days the booking keeps its own. */
export function parseMoveArgs(args: string[]): unknown {
  if (args.length < 2 || args.length > 3) return null;
  const [ref, dayMonth, flex] = args;
  const flexMatch = flex === undefined ? null : FLEX_ARG.exec(flex);
  if (flex !== undefined && !flexMatch) return null;
  return {
    ref: cleanRef(ref),
    dayMonth,
    ...(flexMatch && { flexDays: Number(flexMatch[1]) }),
  };
}
