// M6. Gate and Batches: Queue, batch record, dispatch. See TRD.md.
// Pure functions only: no I/O and no imports from other modules. Unit-test here.

import { formatKg, formatMoneySms } from "@/lib/format";
import { daysBetween, splitManila } from "@/lib/dates";
import type { StatusTone } from "@/lib/status";
import type {
  Batch,
  BatchOwnership,
  BookingStatus,
  BuyerType,
  Dispatch,
  OfferStatus,
  QueueEntry,
  QueueRow,
  RefKind,
  Service,
} from "./types";

export const services = ["drying", "milling"] as const;
export const ownerships = ["custom", "irpc"] as const;
export const serviceLabels: Record<Service, string> = {
  drying: "Drying",
  milling: "Milling",
};
export const ownershipLabels: Record<BatchOwnership, string> = {
  custom: "Custom service",
  irpc: "Selling to IRPC",
};

type WaitingEntry = Pick<
  QueueEntry,
  "id" | "facility_id" | "service" | "status" | "checked_in_at"
> & {
  client: { phone: string };
};

const waitingOrder = (
  a: Pick<QueueEntry, "id" | "checked_in_at">,
  b: Pick<QueueEntry, "id" | "checked_in_at">,
) =>
  Date.parse(a.checked_in_at) - Date.parse(b.checked_in_at) ||
  a.id.localeCompare(b.id);

/** The next N entries in this facility's service line, after the start was saved. */
export function nextInLineTexts(
  rows: WaitingEntry[],
  facilityId: string,
  service: Service,
  count: number,
): { phone: string; body: string }[] {
  return rows
    .filter(
      (row) =>
        row.facility_id === facilityId &&
        row.service === service &&
        row.status === "waiting",
    )
    .sort(waitingOrder)
    .slice(0, Math.max(0, count))
    .map((row, index) => ({
      phone: row.client.phone,
      body: `IRPC: Your turn for ${serviceLabels[service].toLowerCase()} is near. You are ${index + 1} in the waiting line. Please be ready.`,
    }));
}

/** Receipt notification from persisted values, never an official receipt. */
export function dispatchText(input: {
  batchNo: string;
  ownership: BatchOwnership;
  kg: number;
  priceMinorPerKg: number;
  orRef: string | null;
}): string {
  const base = `IRPC: Nabaton / Collected: ${formatKg(input.kg)}. Batch ${input.batchNo}.`;
  if (input.ownership === "custom") return `${base} Salamat!`;
  const ref = input.orRef?.trim();
  return `${base} Presyo / Price: ${formatMoneySms(input.priceMinorPerKg)}/kg. Total: ${formatMoneySms(input.kg * input.priceMinorPerKg)}.${ref ? ` OR ${ref}.` : ""} Salamat!`;
}

export const stageLabels: Record<Batch["stage"], string> = {
  received: "Received",
  drying: "Drying",
  stored: "Stored",
  milling: "Milling",
  milled: "Milled",
  dispatched: "Dispatched",
};
export const stageTones: Record<Batch["stage"], StatusTone> = {
  received: "neutral",
  drying: "info",
  stored: "info",
  milling: "info",
  milled: "info",
  dispatched: "success",
};

/** A weight check the client answers by SMS or in person. */
export type WeightStatus = "pending" | "confirmed" | "disputed";
export const weightStatusLabels: Record<WeightStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  disputed: "Disputed, re-weigh",
};
export const weightStatusTones: Record<WeightStatus, StatusTone> = {
  pending: "warning",
  confirmed: "success",
  disputed: "danger",
};

/** What staff do to move a batch through drying and milling. */
export type BatchAction =
  | "start_drying"
  | "finish_drying"
  | "skip_drying"
  | "start_milling"
  | "finish_milling";

/** Each action applies at one stage and leads to exactly one next stage. */
const transitions: Record<
  BatchAction,
  { from: Batch["stage"]; to: Batch["stage"] }
> = {
  start_drying: { from: "received", to: "drying" },
  skip_drying: { from: "received", to: "stored" },
  finish_drying: { from: "drying", to: "stored" },
  start_milling: { from: "stored", to: "milling" },
  finish_milling: { from: "milling", to: "milled" },
};

/**
 * The stage a batch moves to, or throws if the action doesn't apply to its
 * current stage. Stages only move forward: `received → drying → stored →
 * milling → milled`, with dry palay skipping straight to `stored`.
 */
export function nextStage(
  batch: Pick<Batch, "stage">,
  action: BatchAction,
): Batch["stage"] {
  const transition = transitions[action];
  if (transition.from !== batch.stage)
    throw new Error(
      `Cannot ${action} a batch that is ${batch.stage}; it must be ${transition.from}.`,
    );
  return transition.to;
}

/** A dispatch is a sale of IRPC rice, or a custom owner collecting their own. */
export type DispatchMode = "sale" | "pickup";

/** IRPC-owned rice is sold to buyers; custom batches are picked up by their owner. */
export function dispatchMode(ownership: BatchOwnership): DispatchMode {
  return ownership === "irpc" ? "sale" : "pickup";
}

/**
 * Kilograms a batch can dispatch: the milled rice once it's milled, otherwise
 * the dried palay a custom owner picks up once it is `stored`. IRPC palay isn't
 * dispatchable until milled. A custom batch's dried weight is only dispatchable
 * at `stored` (dried, not in the mill) or `dispatched` (already picked up), so
 * staff can't pick up dried palay mid-milling. `startMilling` refuses a batch
 * that already has dispatches, so a dried pickup never mixes with later rice.
 */
export function dispatchableKg(
  batch: Pick<Batch, "ownership" | "stage" | "rice_kg" | "dried_kg">,
): number {
  if (batch.rice_kg != null) return batch.rice_kg;
  if (
    batch.ownership === "custom" &&
    batch.dried_kg != null &&
    (batch.stage === "stored" || batch.stage === "dispatched")
  )
    return batch.dried_kg;
  return 0;
}

/** Total kilograms already dispatched from a batch. */
export function dispatchedKg(
  dispatches: readonly Pick<Dispatch, "kg">[],
): number {
  return dispatches.reduce((sum, d) => sum + d.kg, 0);
}

/** Kilograms still available to dispatch, never negative. */
export function remainingKg(dispatchable: number, dispatched: number): number {
  return Math.max(0, dispatchable - dispatched);
}

/** Kg dispatched per buyer type; `null` collects buyers with no type set yet. */
export function kgByBuyerType(
  dispatches: readonly { kg: number; buyerType: BuyerType | null }[],
): Map<BuyerType | null, number> {
  const kg = new Map<BuyerType | null, number>();
  for (const d of dispatches)
    kg.set(d.buyerType, (kg.get(d.buyerType) ?? 0) + d.kg);
  return kg;
}

/** A real `YYYY-MM-DD` calendar date. */
function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

/**
 * The dispatch summary's period from `?from=&to=`, both inclusive. This month
 * so far when either is missing or invalid, or `from` is after `to`.
 */
export function dispatchPeriod(
  from: unknown,
  to: unknown,
  today: string,
): { from: string; to: string } {
  if (isDate(from) && isDate(to) && from <= to) return { from, to };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** A batch is fully dispatched once all of its dispatchable kg have left. */
export function isFullyDispatched(
  dispatchable: number,
  dispatched: number,
): boolean {
  return dispatchable > 0 && dispatched >= dispatchable;
}

/** Milling recovery as a percent (rice ÷ mill-in), or null before milling. */
export function recoveryPct(
  riceKg: number | null,
  millInKg: number | null,
): number | null {
  if (!riceKg || !millInKg) return null;
  return Math.round((riceKg / millInKg) * 1000) / 10;
}

/** `YYMMDD-NNN` from a Manila `YYYY-MM-DD` date and the day's sequence. */
export function batchNo(date: string, seq: number): string {
  const [y, m, d] = date.split("-");
  return `${y.slice(2)}${m}${d}-${String(seq).padStart(3, "0")}`;
}

/** `YYMMDD-` prefix shared by a day's batch numbers. */
export function batchPrefix(date: string): string {
  return batchNo(date, 0).slice(0, 7);
}

/**
 * The next batch number today from the numbers already issued. Compared as
 * numbers, since `-1000` sorts before `-999` as text.
 */
export function nextBatchNo(today: string, issued: string[]): string {
  const prefix = batchPrefix(today);
  const seqs = issued
    .filter((no) => no.startsWith(prefix))
    .map((no) => Number(no.slice(prefix.length)))
    .filter(Number.isInteger);
  return batchNo(today, Math.max(0, ...seqs) + 1);
}

/** Offers are IRPC-bought, bookings are custom; otherwise what the encoder chose. */
export function batchOwnership(
  entry: Pick<QueueEntry, "offer_id" | "booking_id" | "ownership">,
): BatchOwnership {
  if (entry.offer_id) return "irpc";
  if (entry.booking_id) return "custom";
  return entry.ownership ?? "custom";
}

export type QueueLine = { serving: QueueRow[]; waiting: QueueRow[] };

/** One line per service: serving by start time, waiting first come first served. */
export function queueLines(rows: QueueRow[]): Record<Service, QueueLine> {
  const lines: Record<Service, QueueLine> = {
    drying: { serving: [], waiting: [] },
    milling: { serving: [], waiting: [] },
  };
  for (const row of rows) {
    if (row.status === "serving") lines[row.service].serving.push(row);
    else if (row.status === "waiting") lines[row.service].waiting.push(row);
  }
  for (const line of Object.values(lines)) {
    line.serving.sort((a, b) =>
      (a.started_at ?? "").localeCompare(b.started_at ?? ""),
    );
    line.waiting.sort(waitingOrder);
  }
  return lines;
}

/** A client's place in one service line: being served, or 1-based among those waiting. */
export type QueuePosition =
  | { service: Service; serving: true }
  | { service: Service; serving: false; position: number };

/** Where the client stands in each line they're in; being served wins over waiting. */
export function queuePositions(
  lines: Record<Service, QueueLine>,
  clientId: string,
): QueuePosition[] {
  const positions: QueuePosition[] = [];
  for (const service of services) {
    const line = lines[service];
    if (line.serving.some((r) => r.client_id === clientId)) {
      positions.push({ service, serving: true });
      continue;
    }
    const index = line.waiting.findIndex((r) => r.client_id === clientId);
    if (index >= 0)
      positions.push({ service, serving: false, position: index + 1 });
  }
  return positions;
}

export const NOT_IN_LINE_REPLY =
  "IRPC: Wala ka pa sa linya. Mag-check in sa gate pag-abot mo.";

/** `IRPC: Drying: #3 ka sa linya. Milling: ikaw na ang ginaserbisyuhan subong.` */
export function queueStatusReply(positions: QueuePosition[]): string {
  if (!positions.length) return NOT_IN_LINE_REPLY;
  const parts = positions.map(
    (p) =>
      `${serviceLabels[p.service]}: ${p.serving ? "ikaw na ang ginaserbisyuhan subong" : `#${p.position} ka sa linya`}.`,
  );
  return `IRPC: ${parts.join(" ")}`;
}

/** Whole minutes waited, never negative. */
export function waitMinutes(since: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(since)) / 60_000));
}

/** `25 min`, `1 h 5 min`, `2 h` */
export function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** How the client reached the gate, for the queue row: the ref when there is one. */
export function arrivalLabel(
  entry: Pick<QueueEntry, "booking_id" | "offer_id"> &
    Partial<Pick<QueueRow, "booking" | "offer">>,
): string {
  if (entry.booking_id) return entry.booking?.ref ?? "Booking";
  if (entry.offer_id) return entry.offer?.ref ?? "Offer";
  return "Walk-in";
}

export const REF_LENGTH = 6;
export const refKindLabels: Record<RefKind, string> = {
  booking: "Booking",
  offer: "Offer",
};

/** `k7p-2qx ` → `K7P2QX`: refs are typed by hand, so drop case, spaces and dashes. */
export function normalizeRef(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const bookingBlocked: Record<
  Exclude<BookingStatus, "confirmed" | "reschedule_proposed">,
  string
> = {
  arrived: "This booking has already checked in.",
  cancelled: "This booking was cancelled.",
  no_show: "This booking was marked as a no-show.",
};

const offerBlocked: Record<Exclude<OfferStatus, "accepted">, string> = {
  offered: "This offer hasn't been accepted yet.",
  declined: "This offer was declined.",
  arrived: "This offer has already checked in.",
  withdrawn: "This offer was withdrawn.",
};

/**
 * Why a booking or offer can't check in, or null when it can. Only
 * `confirmed`/`reschedule_proposed` bookings and `accepted` offers may.
 */
export function refCheckInError(
  record:
    | { kind: "booking"; status: BookingStatus }
    | { kind: "offer"; status: OfferStatus },
): string | null {
  if (record.kind === "booking")
    return record.status === "confirmed" ||
      record.status === "reschedule_proposed"
      ? null
      : bookingBlocked[record.status];
  return record.status === "accepted" ? null : offerBlocked[record.status];
}

/** Bookings keep their service and are custom; offers are palay IRPC buys and dry first. */
export function refLine(
  record: { kind: "booking"; service: Service } | { kind: "offer" },
): { service: Service; ownership: BatchOwnership } {
  return record.kind === "booking"
    ? { service: record.service, ownership: "custom" }
    : { service: "drying", ownership: "irpc" };
}

/** `+639163393390` → `0916•••3390` */
export function maskPhone(phone: string): string {
  const local = phone.startsWith("+63") ? `0${phone.slice(3)}` : phone;
  return local.length > 8 ? `${local.slice(0, 4)}•••${local.slice(-4)}` : local;
}

// Calendar dates are rendered at UTC midnight so the host time zone never shifts them.
const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** `Thu, Oct 15` from a `YYYY-MM-DD` calendar date. */
export function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`));
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** How a booking's scheduled day or an offer's harvest day sits against today. */
export function recordDateNote(
  kind: RefKind,
  date: string,
  today: string,
): string {
  if (kind === "offer") return "Harvest date shown";
  const offset = daysBetween(today, date);
  if (offset === 0) return "Scheduled for today";
  return offset > 0
    ? `Arrived ${days(offset)} early`
    : `Arrived ${days(-offset)} late`;
}

export type WeightStage = "receiving" | "drying";
export type WeightMeasurements = { kg: number; mc: number; bags?: number };
export function weightConfirmationText(input: {
  batchNo: string;
  stage: WeightStage;
  measurements: WeightMeasurements;
  ref: string;
  readyForPickup?: boolean;
  purchase?: {
    paid_kg: number;
    price_minor_per_kg: number;
    total_minor: number;
  };
}): string {
  const { batchNo, stage, measurements: m, ref, purchase } = input;
  const label =
    stage === "receiving"
      ? `Nabaton / Received: ${m.bags} bags,`
      : "Na-dry / Dried:";
  const price = purchase
    ? ` Paid: ${formatKg(purchase.paid_kg)} at ${formatMoneySms(purchase.price_minor_per_kg)}/kg. Total: ${formatMoneySms(purchase.total_minor)}.`
    : "";
  return `IRPC: Batch ${batchNo}. ${label} ${formatKg(m.kg)}, MC ${m.mc}%.${price}${input.readyForPickup ? " Ready / Pwede na kuhaon sa IRPC, Amamaros, Pototan." : ""} Sakto ang timbang / Weight correct? YES ${ref} / NO ${ref}.`;
}
export function weightAnswerText(yes: boolean): string {
  return yes
    ? "IRPC: Salamat. Timbang nakumpirma / Weight confirmed."
    : "IRPC: Timbang ginakontra / Weight disputed. Staff will check and re-weigh.";
}

export function pickupText(input: {
  batchNo: string;
  stage: "drying" | "milling";
  kg: number;
  byproducts?: { bran_kg?: number | null; husk_kg?: number | null };
}): string {
  const product = input.stage === "drying" ? "dried palay" : "rice";
  const bran = input.byproducts?.bran_kg;
  const husk = input.byproducts?.husk_kg;
  return `IRPC: Pwede na kuhaon / Ready for pickup. Batch ${input.batchNo}: ${formatKg(input.kg)} ${product}${bran != null ? `, ${formatKg(bran)} darak/bran` : ""}${husk != null ? `, ${formatKg(husk)} ipa/husk` : ""}. Pick up at IRPC, Amamaros, Pototan.`;
}

/** IRPC-owned rice still on hand: what's left to dispatch across IRPC batches. */
export function riceStockKg(
  batches: readonly (Pick<
    Batch,
    "ownership" | "stage" | "rice_kg" | "dried_kg"
  > & { dispatches: readonly Pick<Dispatch, "kg">[] })[],
): number {
  return batches
    .filter((b) => b.ownership === "irpc")
    .reduce(
      (sum, b) =>
        sum + remainingKg(dispatchableKg(b), dispatchedKg(b.dispatches)),
      0,
    );
}

/** `261015007`, ` 261015-007 ` → `261015-007`: batch nos are typed by hand. */
export function normalizeBatchNo(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length > 6
    ? `${digits.slice(0, 6)}-${digits.slice(6)}`
    : digits;
}

/** `261015-007` → `2026-10-15`: the Manila day the batch was opened at receiving. */
export function batchNoDate(no: string): string {
  return `20${no.slice(0, 2)}-${no.slice(2, 4)}-${no.slice(4, 6)}`;
}

/** Stages a batch went through, as Manila dates; stages it skipped are left out. */
export function traceSteps(batch: {
  batchNo: string;
  dryEnd: string | null;
  millEnd: string | null;
}): { label: string; date: string }[] {
  const steps = [
    { label: "Dried", at: batch.dryEnd },
    { label: "Milled", at: batch.millEnd },
  ];
  return [
    { label: "Received", date: batchNoDate(batch.batchNo) },
    ...steps.flatMap(({ label, at }) =>
      at ? [{ label, date: splitManila(at).date }] : [],
    ),
  ];
}

/**
 * Where a batch came from, safe to show the public (Data Privacy Act): a co-op
 * by name, a co-op member as their co-op, anyone else by municipality only.
 */
export function traceOrigin(client: {
  kind: string;
  name: string;
  coopName: string | null;
  municipality: string | null;
}): string | null {
  if (client.kind === "coop") return client.name;
  if (client.coopName) return client.coopName;
  return client.municipality ? `${client.municipality} farmers` : null;
}
