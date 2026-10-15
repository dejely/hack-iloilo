// M6. Gate and Batches: Queue, batch record, dispatch. See TRD.md.
// Server-side reads. May call other modules' queries.

import "server-only";
import { revalidatePath } from "next/cache";
import { newRef } from "@/lib/ref";
import type { Json } from "@/lib/supabase/database.types";
import { addDays, joinManila, todayManila } from "@/lib/dates";
import { db } from "@/lib/supabase/admin";
import {
  findOrRegisterByPhone,
  registerClientRecord,
} from "@/modules/accounts/queries";
import type { ClientKind } from "@/modules/accounts/types";
import {
  findByRef,
  markArrived,
  unmarkArrived,
} from "@/modules/booking/queries";
import {
  createPurchase,
  findOfferByRef,
  markOfferArrived,
  unmarkOfferArrived,
} from "@/modules/buying/queries";
import { currentFacility } from "@/modules/setup/queries";
import { PromptRefusal, type SmsPrompt } from "@/modules/sms/registry";
import type { CommandContext } from "@/modules/sms/registry";
import { send } from "@/modules/sms/queries";
import {
  pickupText,
  weightConfirmationText,
  weightAnswerText,
  type WeightStage,
  type BatchAction,
  batchOwnership,
  batchPrefix,
  nextBatchNo,
  nextStage,
  nextInLineTexts,
  dispatchText,
  kgByBuyerType,
  normalizeRef,
  queueLines,
  queuePositions,
  type QueuePosition,
  queueStatusReply,
  REF_LENGTH,
  refCheckInError,
  refKindLabels,
  refLine,
  dispatchableKg,
  dispatchedKg,
  remainingKg,
  riceStockKg,
  traceOrigin,
  traceSteps,
} from "./logic";
import type {
  Batch,
  BatchListRow,
  BatchOwnership,
  BatchSummary,
  BatchTrail,
  BuyerType,
  Dispatch,
  PublicTrail,
  QueueEntry,
  QueueRow,
  RefKind,
  RefPreview,
  Service,
} from "./types";
export { municipalities } from "@/modules/accounts/queries";
export type { Batch, BatchListRow, QueueEntry, QueueRow } from "./types";

const BATCH_NO_ATTEMPTS = 5;

/** The entry is no longer in the state the action expects (another staff member moved it). */
export class GateError extends Error {
  constructor(
    public reason:
      | "not_found"
      | "not_waiting"
      | "not_serving"
      | "stale_stage"
      | "ref_not_found"
      | "ref_not_eligible"
      | "not_dispatchable"
      | "over_dispatch"
      | "already_dispatched",
    message: string,
  ) {
    super(message);
  }
}

export type CheckInParams =
  { bookingRef: string } | { offerRef: string } | PhoneCheckIn;

type PhoneCheckIn = (
  | { phone: string }
  | {
      walkIn: {
        name: string;
        phone: string;
        kind: ClientKind;
        municipality_id: string | null;
      };
    }
) & {
  service: Service;
  ownership: BatchOwnership;
  estKg?: number | null;
};

type NewEntry = Pick<
  QueueEntry,
  | "facility_id"
  | "service"
  | "client_id"
  | "ownership"
  | "est_kg"
  | "booking_id"
  | "offer_id"
>;

async function addToLine(entry: NewEntry): Promise<QueueEntry> {
  const { data, error } = await db()
    .from("queue_entries")
    .insert({ ...entry, status: "waiting" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Adds a client to the back of a service line. A booking or offer ref fills in
 * the client, service and ownership and marks the record `arrived`. Unknown
 * phones are registered; existing clients keep their details.
 */
export async function checkIn(input: CheckInParams): Promise<QueueEntry> {
  if ("bookingRef" in input) return checkInBooking(input.bookingRef);
  if ("offerRef" in input) return checkInOffer(input.offerRef);
  const client =
    "walkIn" in input
      ? (
          await registerClientRecord(input.walkIn.phone, {
            name: input.walkIn.name,
            kind: input.walkIn.kind,
            municipality_id: input.walkIn.municipality_id,
          })
        ).client
      : await findOrRegisterByPhone(input.phone);
  const facility = await currentFacility();
  return addToLine({
    facility_id: facility.id,
    service: input.service,
    client_id: client.id,
    ownership: input.ownership,
    est_kg: input.estKg ?? null,
    booking_id: null,
    offer_id: null,
  });
}

function notFound(kind: RefKind | null, ref: string): GateError {
  const what = kind
    ? `${refKindLabels[kind].toLowerCase()}`
    : "booking or offer";
  return new GateError("ref_not_found", `No ${what} has code ${ref}.`);
}

async function checkInBooking(input: string): Promise<QueueEntry> {
  const ref = normalizeRef(input);
  const booking = ref.length === REF_LENGTH ? await findByRef(ref) : null;
  if (!booking) throw notFound("booking", ref);
  const problem = refCheckInError({ kind: "booking", status: booking.status });
  if (problem) throw new GateError("ref_not_eligible", problem);
  // The conditional update is the lock: a second check-in of the same ref finds it arrived.
  if (!(await markArrived(booking.id)))
    throw new GateError(
      "ref_not_eligible",
      "This booking has already checked in.",
    );
  try {
    return await addToLine({
      facility_id: booking.facility_id,
      client_id: booking.client_id,
      est_kg: booking.est_kg,
      booking_id: booking.id,
      offer_id: null,
      ...refLine({ kind: "booking", service: booking.service }),
    });
  } catch (cause) {
    await unmarkArrived(booking.id, booking.status);
    throw cause;
  }
}

async function checkInOffer(input: string): Promise<QueueEntry> {
  const ref = normalizeRef(input);
  const offer = ref.length === REF_LENGTH ? await findOfferByRef(ref) : null;
  if (!offer) throw notFound("offer", ref);
  const problem = refCheckInError({ kind: "offer", status: offer.status });
  if (problem) throw new GateError("ref_not_eligible", problem);
  if (!(await markOfferArrived(offer.id)))
    throw new GateError(
      "ref_not_eligible",
      "This offer has already checked in.",
    );
  try {
    return await addToLine({
      facility_id: offer.facility_id,
      client_id: offer.client_id,
      est_kg: offer.est_kg,
      booking_id: null,
      offer_id: offer.id,
      ...refLine({ kind: "offer" }),
    });
  } catch (cause) {
    await unmarkOfferArrived(offer.id);
    throw cause;
  }
}

/**
 * What a booking or offer ref would check in, looking up bookings first, then
 * offers. Throws a `GateError` when the ref is unknown or can't check in.
 */
export async function refPreview(input: string): Promise<RefPreview> {
  const ref = normalizeRef(input);
  if (ref.length !== REF_LENGTH) throw notFound(null, ref);
  const booking = await findByRef(ref);
  const offer = booking ? null : await findOfferByRef(ref);
  const record = booking
    ? {
        kind: "booking" as const,
        problem: refCheckInError({ kind: "booking", status: booking.status }),
        line: refLine({ kind: "booking", service: booking.service }),
        clientId: booking.client_id,
        estKg: booking.est_kg,
        date: booking.scheduled_date,
      }
    : offer
      ? {
          kind: "offer" as const,
          problem: refCheckInError({ kind: "offer", status: offer.status }),
          line: refLine({ kind: "offer" }),
          clientId: offer.client_id,
          estKg: offer.est_kg,
          date: offer.harvest_date,
        }
      : null;
  if (!record) throw notFound(null, ref);
  if (record.problem) throw new GateError("ref_not_eligible", record.problem);
  const { data: client, error } = await db()
    .from("clients")
    .select("name, kind, phone")
    .eq("id", record.clientId)
    .single();
  if (error) throw error;
  return {
    kind: record.kind,
    ref,
    client,
    ...record.line,
    estKg: record.estKg,
    date: record.date,
  };
}

async function issuedToday(today: string): Promise<string[]> {
  const { data, error } = await db()
    .from("batches")
    .select("batch_no")
    .like("batch_no", `${batchPrefix(today)}%`);
  if (error) throw error;
  return data.map((row) => row.batch_no);
}

/** Marks the entry serving and opens its batch at stage `received`. */
export async function start(entryId: string): Promise<Batch> {
  const { data: entry, error } = await db()
    .from("queue_entries")
    .update({ status: "serving", started_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("status", "waiting")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!entry)
    throw new GateError(
      "not_waiting",
      "This client is no longer waiting. Refresh the queue.",
    );
  try {
    const today = todayManila();
    for (let attempt = 1; ; attempt++) {
      const { data: batch, error: batchError } = await db()
        .from("batches")
        .insert({
          facility_id: entry.facility_id,
          batch_no: nextBatchNo(today, await issuedToday(today)),
          queue_entry_id: entry.id,
          client_id: entry.client_id,
          ownership: batchOwnership(entry),
          stage: "received",
        })
        .select()
        .single();
      // Another start took the same number; count again.
      if (batchError?.code === "23505" && attempt < BATCH_NO_ATTEMPTS) continue;
      if (batchError) throw batchError;
      await notifyNextWaiting(entry);
      return batch;
    }
  } catch (cause) {
    // Put the client back in line so the start can be retried.
    await db()
      .from("queue_entries")
      .update({ status: "waiting", started_at: null })
      .eq("id", entry.id)
      .eq("status", "serving");
    throw cause;
  }
}

/** Notification reads and sends must never put a successfully started entry back in line. */
async function notifyNextWaiting(entry: QueueEntry): Promise<void> {
  try {
    const { data: facility, error: facilityError } = await db()
      .from("facilities")
      .select("notify_ahead_n")
      .eq("id", entry.facility_id)
      .single();
    if (facilityError) throw facilityError;
    if (facility.notify_ahead_n === 0) return;
    const { data: waiting, error } = await db()
      .from("queue_entries")
      .select(
        "id, facility_id, service, status, checked_in_at, client:clients(phone)",
      )
      .eq("facility_id", entry.facility_id)
      .eq("service", entry.service)
      .eq("status", "waiting")
      .order("checked_in_at")
      .order("id")
      .limit(facility.notify_ahead_n);
    if (error) throw error;
    for (const text of nextInLineTexts(
      waiting,
      entry.facility_id,
      entry.service,
      facility.notify_ahead_n,
    )) {
      try {
        await send(text.phone, text.body);
      } catch (error) {
        console.error("Unable to send next-in-line text", error);
      }
    }
  } catch (error) {
    console.error("Unable to notify the waiting line", error);
  }
}

async function move(
  entryId: string,
  from: "waiting" | "serving",
  update: Partial<QueueEntry>,
): Promise<QueueEntry> {
  const { data, error } = await db()
    .from("queue_entries")
    .update(update)
    .eq("id", entryId)
    .eq("status", from)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new GateError(
      from === "waiting" ? "not_waiting" : "not_serving",
      `This client is no longer ${from}. Refresh the queue.`,
    );
  return data;
}

export function finish(entryId: string): Promise<QueueEntry> {
  return move(entryId, "serving", {
    status: "done",
    finished_at: new Date().toISOString(),
  });
}

export function markLeft(entryId: string): Promise<QueueEntry> {
  return move(entryId, "waiting", {
    status: "left",
    finished_at: new Date().toISOString(),
  });
}

/** `STATUS` reply: the sender's place in each line. `FOR` is ignored. */
export async function queueStatusBySms(
  _args: unknown,
  ctx: CommandContext,
): Promise<string> {
  return queueStatusReply(await clientQueuePositions(ctx.client.id));
}

/** The client's place in each line, as `STATUS` and /book/track report it. */
export async function clientQueuePositions(
  clientId: string,
): Promise<QueuePosition[]> {
  return queuePositions(queueLines(await liveQueue()), clientId);
}

/** Everyone waiting or being served, with their client and open batch. */
export async function liveQueue(): Promise<QueueRow[]> {
  const facility = await currentFacility();
  const { data, error } = await db()
    .from("queue_entries")
    .select(
      "*, client:clients(name, phone, kind), batch:batches(id, batch_no), booking:bookings(ref), offer:sell_offers(ref)",
    )
    .eq("facility_id", facility.id)
    .in("status", ["waiting", "serving"])
    .order("checked_in_at");
  if (error) throw error;
  return data;
}

export async function batchSummary(id: string): Promise<BatchSummary | null> {
  const { data, error } = await db()
    .from("batches")
    .select(
      "*, client:clients(name, phone, kind), entry:queue_entries(service, started_at, est_kg), variety:varieties(code, name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Fills a batch's Receiving Report fields while it is still `received`, without
 * advancing the stage. Guarded on `received` so a page that has moved on can't
 * rewrite the receiving after drying has started. The IRPC pricing happens in
 * the buying module off these saved fields (see `createPurchase`).
 */
export async function recordReceiving(
  batchId: string,
  fields: {
    bags: number;
    net_kg: number;
    variety_id: string | null;
    mc: number;
    damaged_pct: number;
    immature_pct: number;
    foreign_pct: number;
  },
): Promise<Batch> {
  const { batch, promptRef } = await recordMeasurement(
    batchId,
    "receiving",
    fields,
  );
  // A new measurement request includes the purchase details in a single text.
  // Unchanged measurements retain confirmation and ordinary price-change texts.
  const purchase =
    batch.ownership === "irpc"
      ? await createPurchase(batchId, { notify: !promptRef })
      : undefined;
  if (promptRef)
    await sendWeightRequest(batch, "receiving", promptRef, purchase);
  return batch;
}

/**
 * Moves a batch forward one stage, writing the stage's fields. Guarded on the
 * expected current stage so a stale page can't skip or repeat a step.
 */
async function advance(
  batchId: string,
  from: Batch["stage"],
  action: BatchAction,
  fields: Partial<Batch>,
): Promise<Batch> {
  const { data, error } = await db()
    .from("batches")
    .update({ ...fields, stage: nextStage({ stage: from }, action) })
    .eq("id", batchId)
    .eq("stage", from)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new GateError(
      "stale_stage",
      "This batch has moved on. Refresh the page.",
    );
  return data;
}

export function startDrying(
  batchId: string,
  fields: { dryer_id: string; dry_start: string },
): Promise<Batch> {
  return advance(batchId, "received", "start_drying", fields);
}

export async function finishDrying(
  batchId: string,
  fields: {
    dry_end: string;
    mc_out: number;
    dried_kg: number;
    ready_for_pickup?: boolean;
  },
): Promise<Batch> {
  const { batch, promptRef } = await recordMeasurement(
    batchId,
    "drying",
    fields,
  );
  if (promptRef) await sendWeightRequest(batch, "drying", promptRef);
  if (batch.ownership === "custom" && batch.pickup_after_drying)
    await notifyPickup(batch, false);
  return batch;
}

export function skipDrying(batchId: string): Promise<Batch> {
  return advance(batchId, "received", "skip_drying", {});
}

export async function startMilling(
  batchId: string,
  fields: { mill_id: string; mill_start: string },
): Promise<Batch> {
  // A batch that has already dispatched dried palay can't be milled — that
  // would mix a pickup with later rice against the same batch.
  const { data: dispatched, error } = await db()
    .from("dispatches")
    .select("id")
    .eq("batch_id", batchId)
    .limit(1);
  if (error) throw error;
  if (dispatched.length > 0)
    throw new GateError(
      "already_dispatched",
      "This batch has dispatches and can no longer be milled.",
    );
  return advance(batchId, "stored", "start_milling", fields);
}

export async function finishMilling(
  batchId: string,
  fields: {
    mill_end: string;
    mill_in_kg: number;
    rice_kg: number;
    byproducts: { bran_kg: number | null; husk_kg: number | null };
  },
): Promise<Batch> {
  const batch = await advance(batchId, "milling", "finish_milling", fields);
  if (batch.ownership === "custom") await notifyPickup(batch, true);
  return batch;
}

/**
 * Kg of IRPC-owned palay sitting in storage now: dried weight, or net weight
 * when drying was skipped. A current snapshot; `date` is for the caller's
 * context (capacity, #34) and is only meaningful for today.
 */
// `date` is part of the published contract (capacity, #34); the snapshot is
// always "now", so the argument is accepted but not read.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function storageStockOn(date: string): Promise<number> {
  const facility = await currentFacility();
  const { data, error } = await db()
    .from("batches")
    .select("dried_kg, net_kg")
    .eq("facility_id", facility.id)
    .eq("ownership", "irpc")
    .eq("stage", "stored");
  if (error) throw error;
  return data.reduce((sum, b) => sum + (b.dried_kg ?? b.net_kg ?? 0), 0);
}

/** Net kg received at the gate per client, all time (M10 ranks by it). */
export async function receivedKgByClient(): Promise<Map<string, number>> {
  const facility = await currentFacility();
  const { data, error } = await db()
    .from("batches")
    .select("client_id, net_kg")
    .eq("facility_id", facility.id)
    .not("net_kg", "is", null);
  if (error) throw error;
  const kg = new Map<string, number>();
  for (const b of data)
    kg.set(b.client_id, (kg.get(b.client_id) ?? 0) + (b.net_kg ?? 0));
  return kg;
}

/**
 * Batches for the list page, newest first, optionally one stage only and only
 * those with a dispatch to a buyer of `buyerType`.
 */
export async function listBatches(
  stage?: Batch["stage"],
  buyerType?: BuyerType,
): Promise<BatchListRow[]> {
  const facility = await currentFacility();
  let query = db()
    .from("batches")
    .select(
      "id, batch_no, ownership, stage, net_kg, dried_kg, rice_kg, created_at, client:clients(name), entry:queue_entries(service), confirmations:batch_weight_confirmations(status)",
    )
    .eq("facility_id", facility.id)
    .order("batch_no", { ascending: false });
  if (stage) query = query.eq("stage", stage);
  if (buyerType) {
    const { data: sold, error } = await db()
      .from("dispatches")
      .select("batch_id, buyer:clients!inner(buyer_type)")
      .eq("buyer.buyer_type", buyerType);
    if (error) throw error;
    query = query.in("id", [...new Set(sold.map((d) => d.batch_id))]);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Kg dispatched to buyers per buyer type, Manila dates `from` to `to`
 * inclusive. Owner pickups are left out: they go to farmers, not buyers.
 */
export async function dispatchedKgByBuyerType(
  from: string,
  to: string,
): Promise<Map<BuyerType | null, number>> {
  const facility = await currentFacility();
  const { data, error } = await db()
    .from("dispatches")
    .select(
      "kg, buyer:clients!inner(kind, buyer_type), batch:batches!inner(facility_id)",
    )
    .eq("batch.facility_id", facility.id)
    .eq("buyer.kind", "buyer")
    .gte("dispatched_at", joinManila(from, "00:00"))
    .lt("dispatched_at", joinManila(addDays(to, 1), "00:00"));
  if (error) throw error;
  return kgByBuyerType(
    data.map((d) => ({ kg: d.kg, buyerType: d.buyer.buyer_type })),
  );
}

/** Buyers (IRPC's clients that buy rice), for the dispatch picker. */
export async function listBuyers(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db()
    .from("clients")
    .select("id, name")
    .eq("kind", "buyer")
    .order("name");
  if (error) throw error;
  return data;
}

/** A batch with its origin and every dispatch, oldest first, for the trail. */
export async function batchTrail(id: string): Promise<BatchTrail | null> {
  const { data, error } = await db()
    .from("batches")
    .select(
      "*, client:clients(name, phone, kind, municipality:municipalities(name)), entry:queue_entries(service, started_at), dispatches(*, buyer:clients(name, buyer_type))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  data.dispatches.sort((a, b) =>
    a.dispatched_at.localeCompare(b.dispatched_at),
  );
  return data as BatchTrail;
}

/** Kg of IRPC-owned rice not yet dispatched, for the public /buy page. */
export async function riceStock(): Promise<number> {
  const facility = await currentFacility();
  const { data, error } = await db()
    .from("batches")
    .select("ownership, stage, rice_kg, dried_kg, dispatches(kg)")
    .eq("facility_id", facility.id)
    .eq("ownership", "irpc")
    .not("rice_kg", "is", null);
  if (error) throw error;
  return riceStockKg(data);
}

/** IRPC batches with rice left to sell, oldest first, for recording a rice pickup. */
export async function riceBatchesForSale(): Promise<
  { id: string; batchNo: string; remainingKg: number }[]
> {
  const facility = await currentFacility();
  const { data, error } = await db()
    .from("batches")
    .select("id, batch_no, ownership, stage, rice_kg, dried_kg, dispatches(kg)")
    .eq("facility_id", facility.id)
    .eq("ownership", "irpc")
    .not("rice_kg", "is", null)
    .order("batch_no");
  if (error) throw error;
  return data
    .map((b) => ({
      id: b.id,
      batchNo: b.batch_no,
      remainingKg: remainingKg(dispatchableKg(b), dispatchedKg(b.dispatches)),
    }))
    .filter((b) => b.remainingKg > 0);
}

/**
 * A sold batch's origin and dates by batch no., for buyers. Only IRPC-owned
 * batches with a dispatch: a farmer's custom-milled rice stays private. Never
 * reads names or phones.
 */
export async function publicBatchTrail(
  batchNo: string,
): Promise<PublicTrail | null> {
  const { data, error } = await db()
    .from("batches")
    .select(
      "batch_no, dry_end, mill_end, variety:varieties(name), client:clients(kind, name, coop:coop_id(name), municipality:municipalities(name)), dispatches!inner(id)",
    )
    .eq("batch_no", batchNo)
    .eq("ownership", "irpc")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    batchNo: data.batch_no,
    origin: traceOrigin({
      kind: data.client.kind,
      name: data.client.name,
      coopName: data.client.coop?.name ?? null,
      municipality: data.client.municipality?.name ?? null,
    }),
    variety: data.variety?.name ?? null,
    steps: traceSteps({
      batchNo: data.batch_no,
      dryEnd: data.dry_end,
      millEnd: data.mill_end,
    }),
  };
}

/**
 * Records a dispatch from a batch — a sale to a buyer or a pickup by the owner
 * — after checking the kg against what's left. Flips the batch to `dispatched`
 * once every dispatchable kg has gone, then texts the recipient the saved receipt.
 */
export async function dispatch(params: {
  batchId: string;
  buyerId: string;
  kg: number;
  priceMinorPerKg: number;
  orRef: string | null;
}): Promise<Dispatch> {
  const { data, error } = await db().rpc("dispatch_from_batch", {
    p_batch_id: params.batchId,
    p_buyer_id: params.buyerId,
    p_kg: params.kg,
    p_price_minor_per_kg: params.priceMinorPerKg,
    // The generated arg type is non-null, but the SQL `text` param takes null
    // (a pickup has no OR ref).
    p_or_ref: params.orRef as string,
  });
  if (error) throw dispatchError(error);
  const saved = data as Dispatch;
  try {
    const { data: details, error: detailsError } = await db()
      .from("dispatches")
      .select("buyer:clients(phone), batch:batches(batch_no, ownership)")
      .eq("id", saved.id)
      .single();
    if (detailsError) throw detailsError;
    await send(
      details.buyer.phone,
      dispatchText({
        batchNo: details.batch.batch_no,
        ownership: details.batch.ownership,
        kg: saved.kg,
        priceMinorPerKg: saved.price_minor_per_kg,
        orRef: saved.or_ref,
      }),
    );
  } catch (error) {
    console.error("Unable to send dispatch receipt text", error);
  }
  return saved;
}

/** Maps a `dispatch_from_batch` exception to the GateError the action expects. */
function dispatchError(error: { message: string }): Error {
  const { message } = error;
  if (message.includes("batch_not_found"))
    return new GateError(
      "not_found",
      "This batch no longer exists. Refresh the page.",
    );
  if (message.includes("not_dispatchable"))
    return new GateError(
      "not_dispatchable",
      "This batch isn't ready to dispatch yet.",
    );
  const over = message.match(/over_dispatch:(\d+)/);
  if (over)
    return new GateError(
      "over_dispatch",
      `Only ${over[1]} kg left to dispatch from this batch.`,
    );
  return error instanceof Error ? error : new Error(message);
}

/** Same transaction saves the measurements and their prompt; no SMS runs under a lock. */
async function recordMeasurement(
  batchId: string,
  stage: WeightStage,
  fields: object & { ready_for_pickup?: boolean },
) {
  for (let attempt = 0; ; attempt++) {
    const args = {
      p_batch_id: batchId,
      p_fields: fields as Json,
      p_ref: newRef(),
    };
    const { data, error } =
      stage === "drying"
        ? await db().rpc("finish_batch_drying", {
            ...args,
            p_ready_for_pickup: fields.ready_for_pickup ?? false,
          })
        : await db().rpc("record_batch_measurement", {
            ...args,
            p_stage: stage,
          });
    if (error?.code === "23505" && attempt < 3) continue;
    if (error?.message.includes("stale_stage"))
      throw new GateError(
        "stale_stage",
        "This batch has moved on. Refresh the page.",
      );
    if (error) throw error;
    return data as unknown as { batch: Batch; promptRef: string | null };
  }
}
async function sendWeightRequest(
  batch: Batch,
  stage: WeightStage,
  ref: string,
  purchase?: {
    paid_kg: number;
    price_minor_per_kg: number;
    total_minor: number;
  },
) {
  try {
    const { data: owner, error } = await db()
      .from("clients")
      .select("phone")
      .eq("id", batch.client_id)
      .single();
    if (error) throw error;
    await send(
      owner.phone,
      weightConfirmationText({
        batchNo: batch.batch_no,
        stage,
        measurements:
          stage === "receiving"
            ? { bags: batch.bags!, kg: batch.net_kg!, mc: batch.mc! }
            : { kg: batch.dried_kg!, mc: batch.mc_out! },
        ref,
        readyForPickup:
          stage === "drying" &&
          batch.ownership === "custom" &&
          batch.pickup_after_drying,
        purchase,
      }),
    );
  } catch (error) {
    console.error("Unable to send weight confirmation", error);
  }
}
export async function batchWeightConfirmations(batchId: string) {
  const { data, error } = await db()
    .from("batch_weight_confirmations")
    .select()
    .eq("batch_id", batchId)
    .order("created_at");
  if (error) throw error;
  return data;
}
export async function answerWeightConfirmation(
  prompt: SmsPrompt,
  yes: boolean,
  ctx: CommandContext,
): Promise<string> {
  const { data, error } = await db().rpc("answer_batch_weight", {
    p_prompt_id: prompt.id,
    p_phone: ctx.phone,
    p_yes: yes,
  });
  if (error?.message.includes("weight_forbidden"))
    throw new PromptRefusal(
      "IRPC: Only the owner or original booker can confirm this weight.",
    );
  if (error) throw error;
  const { batchId } = prompt.payload as { batchId: string };
  revalidatePath(`/batches/${batchId}`);
  revalidatePath("/batches");
  return data
    ? weightAnswerText(yes)
    : "IRPC: This weight request is no longer pending. Ask staff to check the batch.";
}
export async function confirmWeightInPerson(
  batchId: string,
  stage: WeightStage,
  staffId: string,
  updatedAt: string,
) {
  const { data, error } = await db().rpc("confirm_batch_weight_in_person", {
    p_batch_id: batchId,
    p_stage: stage,
    p_staff_id: staffId,
    p_confirmation_updated_at: updatedAt,
  });
  if (error) throw error;
  if (!data)
    throw new GateError(
      "stale_stage",
      "These measurements have changed. Refresh the page.",
    );
}

/** Each recipient is isolated so a failed send never skips the other recipient. */
async function notifyPickup(
  batch: Batch,
  includeOwner: boolean,
): Promise<void> {
  try {
    const { data, error } = await db()
      .from("batches")
      .select(
        "client:clients(phone), entry:queue_entries(booking:bookings(booked_by_phone), offer:sell_offers(booked_by_phone))",
      )
      .eq("id", batch.id)
      .single();
    if (error) throw error;
    const owner = data.client.phone;
    const booker =
      data.entry?.booking?.booked_by_phone ??
      data.entry?.offer?.booked_by_phone;
    const phones = new Set(includeOwner ? [owner] : []);
    if (booker && booker !== owner) phones.add(booker);
    const body = pickupText({
      batchNo: batch.batch_no,
      stage: batch.rice_kg != null ? "milling" : "drying",
      kg: batch.rice_kg ?? batch.dried_kg!,
      byproducts: batch.byproducts as {
        bran_kg?: number | null;
        husk_kg?: number | null;
      },
    });
    for (const phone of phones) {
      try {
        await send(phone, body);
      } catch (error) {
        console.error("Unable to send pickup alert", error);
      }
    }
  } catch (error) {
    console.error("Unable to read pickup recipients", error);
  }
}
