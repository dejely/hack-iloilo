// M11. Rice Buying: rice requests from buyers. See PRD.md.
// Server-side reads. May call other modules' queries.

import "server-only";
import { todayManila } from "@/lib/dates";
import { smsLabel, tradeKg, weightErrors } from "@/lib/sms-trade";
import { parseDayMonth, fillTemplate } from "@/modules/sms/logic";
import type { CommandContext } from "@/modules/sms/registry";
import type { BuySmsInput } from "./sms-schema";
import { smsBuyerDefaults } from "./logic";
import { formatDate, formatKg } from "@/lib/format";
import { newRef } from "@/lib/ref";
import { db } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { riceBatchesForSale, riceStock } from "@/modules/gate/queries";
import { send } from "@/modules/sms/queries";
import { currentFacility } from "@/modules/setup/queries";
import {
  canCancel,
  orderSms,
  type OrderStatus,
  pickupDateError,
} from "./logic";

export type Order = Database["public"]["Tables"]["rice_orders"]["Row"];
export type { OrderStatus } from "./logic";

/** A request joined with its buyer, for the Buying list. */
export type OrderListItem = Order & {
  client: {
    name: string;
    phone: string;
    buyer_type: Database["public"]["Enums"]["buyer_type"] | null;
  } | null;
};

/**
 * Creates a `requested` order with a fresh ref. Server-only, not an action:
 * the public action validates before calling this. Nothing is held until staff
 * accept.
 */
export async function createOrder(input: {
  clientId: string;
  bookedByPhone: string;
  kg: number;
  pickupDate: string;
  buyerName?: string;
  buyerType?: Database["public"]["Enums"]["buyer_type"];
  promptId?: string;
}): Promise<Order> {
  if (input.promptId) {
    const { data, error } = await db()
      .from("rice_orders")
      .select()
      .eq("sms_prompt_id", input.promptId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  const facility = await currentFacility();
  // ref is unique; retry the rare collision with a new one.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db()
      .from("rice_orders")
      .insert({
        facility_id: facility.id,
        ref: newRef(),
        client_id: input.clientId,
        booked_by_phone: input.bookedByPhone,
        kg: input.kg,
        pickup_date: input.pickupDate,
        buyer_name: input.buyerName ?? null,
        buyer_type: input.buyerType ?? null,
        sms_prompt_id: input.promptId ?? null,
      })
      .select()
      .single();
    if (!error) return data;
    if (error.code !== "23505")
      throw new Error(`Create rice order: ${error.message}`);
    if (input.promptId) {
      const { data: existing, error: lookupError } = await db()
        .from("rice_orders")
        .select()
        .eq("sms_prompt_id", input.promptId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return existing;
    }
  }
  throw new Error("Create rice order: could not allocate a unique ref.");
}

/** Texts the buyer about their order. A failed text never fails the saved change. */
export async function notifyOrder(
  order: Order,
  template: keyof typeof orderSms,
): Promise<void> {
  try {
    await send(order.booked_by_phone, orderSms[template], {
      ref: order.ref,
      kg: formatKg(order.kg),
      date: formatDate(order.pickup_date),
    });
  } catch (error) {
    console.error("Unable to send rice order text", error);
  }
}

/**
 * The order as /buy/track shows it, only to its buyer or the phone that
 * requested it. Null when the ref is unknown or the phone isn't theirs, so the
 * two look the same.
 */
export async function trackedOrder(
  ref: string,
  phone: string,
): Promise<Order | null> {
  const { data, error } = await db()
    .from("rice_orders")
    .select("*, client:clients(phone)")
    .eq("ref", ref)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { client, ...order } = data;
  return phone === client.phone || phone === order.booked_by_phone
    ? order
    : null;
}

/**
 * Moves an order from one of `from` to `to`. Null when it's no longer in one
 * of those (another staff member or the buyer got there first).
 */
export async function setOrderStatus(
  id: string,
  from: OrderStatus[],
  to: OrderStatus,
): Promise<Order | null> {
  const { data, error } = await db()
    .from("rice_orders")
    .update({ status: to })
    .eq("id", id)
    .in("status", from)
    .select()
    .maybeSingle();
  if (error) throw new Error(`Rice order ${to}: ${error.message}`);
  return data;
}

export async function findOrder(id: string): Promise<Order | null> {
  const { data, error } = await db()
    .from("rice_orders")
    .select()
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Closes an accepted order with the dispatch that recorded its sale. */
export async function closePickedUp(
  id: string,
  dispatchId: string,
): Promise<Order | null> {
  const { data, error } = await db()
    .from("rice_orders")
    .update({ status: "picked_up", dispatch_id: dispatchId })
    .eq("id", id)
    .eq("status", "accepted")
    .select()
    .maybeSingle();
  if (error) throw new Error(`Rice order picked_up: ${error.message}`);
  return data;
}

/** Batches a pickup can be sold from (M6). */
export async function pickupBatches() {
  return riceBatchesForSale();
}

/** Cancels an open order and texts the buyer. Null if it can no longer be cancelled. */
export async function cancelOrder(order: Order): Promise<Order | null> {
  if (!canCancel(order.status)) return null;
  const cancelled = await setOrderStatus(
    order.id,
    ["requested", "accepted"],
    "cancelled",
  );
  if (cancelled) await notifyOrder(cancelled, "cancelled");
  return cancelled;
}

/** IRPC rice on hand and kg already promised to accepted requests. */
export async function orderStock(): Promise<{
  onHandKg: number;
  acceptedKg: number;
}> {
  const facility = await currentFacility();
  const [onHandKg, { data, error }] = await Promise.all([
    riceStock(),
    db()
      .from("rice_orders")
      .select("kg")
      .eq("facility_id", facility.id)
      .eq("status", "accepted"),
  ]);
  if (error) throw new Error(`Accepted rice orders: ${error.message}`);
  return { onHandKg, acceptedKg: data.reduce((sum, o) => sum + o.kg, 0) };
}

/** Orders by pickup date, optionally one status. */
export async function listOrders(
  status?: OrderStatus,
): Promise<OrderListItem[]> {
  const facility = await currentFacility();
  let query = db()
    .from("rice_orders")
    .select("*, client:clients(name, phone, buyer_type)")
    .eq("facility_id", facility.id)
    .order("pickup_date")
    .order("created_at");
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(`List rice orders: ${error.message}`);
  return data;
}

function ricePickupDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      return null;
    return pickupDateError(value, todayManila()) ? null : value;
  }
  const date = parseDayMonth(value, todayManila());
  return date && !pickupDateError(date, todayManila()) ? date : null;
}
export async function validateBuyReading(
  input: BuySmsInput,
  ctx: CommandContext,
): Promise<string[]> {
  const invalid = weightErrors(input);
  if (!ricePickupDate(input.dayMonth)) invalid.push("dayMonth");
  const values = { ...smsBuyerDefaults(ctx.client), ...input };
  if (!values.name) invalid.push("name");
  if (!values.buyerType) invalid.push("buyerType");
  return invalid;
}
export function describeRiceRequest(input: BuySmsInput): string {
  return `magbakal sang ${formatKg(tradeKg(input))} bugas, kuha sa ${input.dayMonth}, ngalan ${smsLabel(input.name ?? "")}, buyer ${input.buyerType ?? ""}`;
}
export async function buyBySms(
  input: BuySmsInput,
  ctx: CommandContext,
): Promise<string> {
  if ((await validateBuyReading(input, ctx)).length)
    return "IRPC: Palihog i-check ang detalye kag i-text liwat ang BUY.";
  // Look up a saved confirmation before consuming another request attempt.
  if (ctx.promptId) {
    const { data, error } = await db()
      .from("rice_orders")
      .select()
      .eq("sms_prompt_id", ctx.promptId)
      .maybeSingle();
    if (error) throw error;
    if (data) return riceRequestReply(data);
  }
  if (!ctx.promptId) return "IRPC: Palihog kumpirmahon anay ang rice request.";
  const { data: allowed, error: limitError } = await db().rpc(
    "reserve_sms_rice_request",
    { p_phone: ctx.phone, p_prompt_id: ctx.promptId },
  );
  if (limitError) throw limitError;
  if (!allowed)
    return "IRPC: Tatlo lang ka rice request kada oras. Palihog hulat anay kag tilawi liwat.";
  const order = await createOrder({
    clientId: ctx.client.id,
    bookedByPhone: ctx.phone,
    kg: tradeKg(input),
    pickupDate: ricePickupDate(input.dayMonth)!,
    buyerName: input.name ?? String(smsBuyerDefaults(ctx.client).name),
    buyerType: input.buyerType ?? ctx.client.buyer_type!,
    promptId: ctx.promptId,
  });
  // The inbound router sends the recorded reply once; later decisions use notifyOrder.
  return riceRequestReply(order);
}
function riceRequestReply(order: Order): string {
  return fillTemplate(orderSms.recorded, {
    ref: order.ref,
    kg: formatKg(order.kg),
    date: formatDate(order.pickup_date),
  });
}
