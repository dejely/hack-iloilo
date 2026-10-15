// M11. Rice Buying: rice requests from buyers. See PRD.md.
// Server-side reads. May call other modules' queries.

import "server-only";
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
  REQUEST_LIMITS,
  requestLimited,
  type OrderStatus,
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
}): Promise<Order> {
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
      })
      .select()
      .single();
    if (!error) return data;
    if (error.code !== "23505")
      throw new Error(`Create rice order: ${error.message}`);
  }
  throw new Error("Create rice order: could not allocate a unique ref.");
}

/** Too many /buy requests from this phone or IP in the current window. */
export async function requestLocked(
  ip: string,
  phone: string,
): Promise<boolean> {
  const since = new Date(
    Date.now() - REQUEST_LIMITS.windowMinutes * 60_000,
  ).toISOString();
  const count = (column: "ip" | "phone", value: string) =>
    db()
      .from("request_attempts")
      .select("id", { count: "exact", head: true })
      .eq(column, value)
      .gte("created_at", since);
  const [byPhone, byIp] = await Promise.all([
    count("phone", phone),
    count("ip", ip),
  ]);
  if (byPhone.error) throw byPhone.error;
  if (byIp.error) throw byIp.error;
  return requestLimited(byPhone.count ?? 0, byIp.count ?? 0);
}

export async function recordRequest(ip: string, phone: string): Promise<void> {
  const { error } = await db().from("request_attempts").insert({ ip, phone });
  if (error) throw error;
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
