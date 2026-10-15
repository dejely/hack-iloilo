"use server";

// M11. Rice Buying: rice requests from buyers. See PRD.md.
// Server actions. Check the staff role first with requireRole().

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { z } from "zod";
import { todayManila } from "@/lib/dates";
import { requireRole } from "@/modules/accounts/auth";
import { normalizePhone } from "@/modules/accounts/logic";
import { findOrRegisterByPhone } from "@/modules/accounts/queries";
import {
  trackLookupSchema,
  type TrackLookupInput,
} from "@/modules/booking/booking-schema";
import { cleanRef, TRACK_WINDOW_MINUTES } from "@/modules/booking/logic";
import { recordTrackFailure, trackLocked } from "@/modules/booking/queries";
import { dispatch, GateError } from "@/modules/gate/queries";
import { pickupDateError, REQUEST_LIMITS } from "./logic";
import {
  pickupSchema,
  webOrderSchema,
  type PickupInput,
  type WebOrderInput,
} from "./order-schema";
import {
  cancelOrder,
  closePickedUp,
  createOrder,
  findOrder,
  notifyOrder,
  recordRequest,
  requestLocked,
  setOrderStatus,
  trackedOrder,
  type Order,
} from "./queries";

/** What the buyer sees of their order on /buy and /buy/track. */
export type BuyerOrder = Pick<Order, "ref" | "kg" | "pickup_date" | "status">;

const buyerView = ({ ref, kg, pickup_date, status }: Order): BuyerOrder => ({
  ref,
  kg,
  pickup_date,
  status,
});

function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path[0], issue.message]),
  );
}

export type OrderOnlineResult =
  | { status: "created"; order: BuyerOrder }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<keyof WebOrderInput, string>>;
    };

/** The caller's IP as the proxy forwards it; "unknown" groups callers without one. */
async function callerIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

const REQUEST_LOCKED = `Too many requests. Wait ${REQUEST_LIMITS.windowMinutes} minutes and try again.`;

/**
 * Rice request from the public /buy page, without requireRole(): like /sell,
 * it can only create a `requested` order for the entered phone, which is
 * texted the ref. Nothing is held until a manager accepts. Limited per phone
 * and per IP, so the form can't be used to text many numbers.
 */
export async function requestRiceOnline(
  input: unknown,
): Promise<OrderOnlineResult> {
  const parsed = webOrderSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const { name, phone, buyerType, kg, pickupDate } = parsed.data;
  const dateError = pickupDateError(pickupDate, todayManila());
  if (dateError)
    return { status: "error", fieldErrors: { pickupDate: dateError } };
  const normalized = normalizePhone(phone)!;
  try {
    const ip = await callerIp();
    if (await requestLocked(ip, normalized))
      return { status: "error", message: REQUEST_LOCKED };
    await recordRequest(ip, normalized);
    // Name and type only label a new buyer; an existing client is never changed.
    const client = await findOrRegisterByPhone(normalized, {
      name,
      kind: "buyer",
      buyer_type: buyerType,
    });
    const created = await createOrder({
      clientId: client.id,
      bookedByPhone: normalized,
      kg,
      pickupDate,
    });
    await notifyOrder(created, "recorded");
    revalidatePath("/buying");
    return { status: "created", order: buyerView(created) };
  } catch (error) {
    console.error("Unable to create rice order", error);
    return {
      status: "error",
      message: "Unable to send the request. Please try again.",
    };
  }
}

export type TrackOrderResult =
  | { status: "found"; order: BuyerOrder }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<keyof TrackLookupInput, string>>;
      /** The order as it is now, when the lookup worked but the change didn't. */
      order?: BuyerOrder;
    };

const TRACK_NOT_FOUND = "No request matches that code and phone.";
const TRACK_LOCKED = `Too many tries. Wait ${TRACK_WINDOW_MINUTES} minutes and try again.`;

/**
 * Runs a public /buy/track request. `run` returns the order, an error message,
 * or null when the ref is unknown or not the phone's: both read "not found"
 * and count toward the same lock as /book/track.
 */
async function trackRequest(
  input: unknown,
  failure: string,
  run: (order: Order) => Promise<Order | string>,
): Promise<TrackOrderResult> {
  const parsed = trackLookupSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const phone = normalizePhone(parsed.data.phone)!;
  try {
    if (await trackLocked(phone))
      return { status: "error", message: TRACK_LOCKED };
    const order = await trackedOrder(cleanRef(parsed.data.ref), phone);
    if (!order) {
      await recordTrackFailure(phone);
      return { status: "error", message: TRACK_NOT_FOUND };
    }
    const result = await run(order);
    if (typeof result === "string") {
      // Someone else changed it first: show where it stands now.
      const current = await trackedOrder(order.ref, phone);
      return {
        status: "error",
        message: result,
        order: buyerView(current ?? order),
      };
    }
    return { status: "found", order: buyerView(result) };
  } catch (error) {
    console.error(failure, error);
    return { status: "error", message: `${failure}. Please try again.` };
  }
}

/** /buy/track lookup by code and phone. */
export async function trackOrder(input: unknown): Promise<TrackOrderResult> {
  return trackRequest(input, "Unable to look up the request", async (o) => o);
}

/** /buy/track cancel: the buyer cancels while it's requested or accepted. */
export async function cancelTrackedOrder(
  input: unknown,
): Promise<TrackOrderResult> {
  return trackRequest(input, "Unable to cancel the request", async (order) => {
    const cancelled = await cancelOrder(order);
    if (!cancelled) return "This request can no longer be cancelled.";
    revalidatePath("/buying");
    return cancelled;
  });
}

/** Accept or decline a request and text the buyer. Manager only, from `requested`. */
export async function decideOrder(id: string, accept: boolean): Promise<void> {
  await requireRole("manager");
  const order = await setOrderStatus(
    id,
    ["requested"],
    accept ? "accepted" : "declined",
  );
  if (order) await notifyOrder(order, accept ? "accepted" : "declined");
  revalidatePath("/buying");
}

export type PickupResult =
  | { status: "ok" }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<keyof PickupInput, string>>;
    };

/**
 * The buyer collected the rice. Records the sale as an M6 dispatch from the
 * chosen batch (kg checked against what's left; the buyer is texted the
 * receipt and batch no.), then closes the order with it. Any signed-in staff,
 * from `accepted`.
 */
export async function pickUpOrder(
  id: string,
  input: unknown,
): Promise<PickupResult> {
  await requireRole();
  const parsed = pickupSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  try {
    const order = await findOrder(id);
    if (order?.status !== "accepted")
      return {
        status: "error",
        message:
          "This request is no longer waiting for pickup. Refresh the page.",
      };
    const sale = await dispatch({
      ...parsed.data,
      buyerId: order.client_id,
    });
    await closePickedUp(order.id, sale.id);
  } catch (error) {
    if (error instanceof GateError)
      return { status: "error", message: error.message };
    console.error("Unable to record rice pickup", error);
    return {
      status: "error",
      message: "Unable to record the pickup. Please try again.",
    };
  }
  revalidatePath("/buying");
  revalidatePath("/batches");
  return { status: "ok" };
}

/** Cancel on the buyer's behalf (e.g. they called). Any signed-in staff. */
export async function cancelOrderByStaff(id: string): Promise<void> {
  await requireRole();
  const order = await setOrderStatus(
    id,
    ["requested", "accepted"],
    "cancelled",
  );
  if (order) await notifyOrder(order, "cancelled");
  revalidatePath("/buying");
}
