// M11. Rice Buying: rice requests from buyers. See PRD.md.
// Pure functions only: no I/O and no imports from other modules. Unit-test here.

import { readTradeValues } from "@/lib/sms-trade";
import { daysBetween } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import type { StatusTone } from "@/lib/status";

export type OrderStatus = Database["public"]["Enums"]["rice_order_status"];

export const orderStatusLabels: Record<OrderStatus, string> = {
  requested: "Requested",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  picked_up: "Picked up",
};
export const orderStatusTones: Record<OrderStatus, StatusTone> = {
  requested: "warning",
  accepted: "info",
  declined: "danger",
  cancelled: "neutral",
  picked_up: "success",
};

/** Buyers and staff can cancel until the rice is picked up or the request is closed. */
export function canCancel(status: OrderStatus): boolean {
  return status === "requested" || status === "accepted";
}

/** Today's rice price × kg, in centavos. An estimate: the dispatch sets the final price. */
export function estimateMinor(kg: number, riceMinorPerKg: number): number {
  return kg * riceMinorPerKg;
}

/** How far ahead a buyer can ask for a pickup day. */
export const MAX_PICKUP_DAYS = 30;

/** `2026-02-30` is false: a real calendar date survives a round trip through `Date`. */
export function isRealDate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

/** Why a pickup day can't be requested today, or null when it's fine. */
export function pickupDateError(date: string, today: string): string | null {
  const ahead = daysBetween(today, date);
  if (ahead < 0) return "Choose today or a later date.";
  if (ahead > MAX_PICKUP_DAYS)
    return `Choose a date within ${MAX_PICKUP_DAYS} days.`;
  return null;
}

/**
 * Rice not yet promised: on hand minus accepted requests still to be picked up.
 * Negative when accepted requests already exceed what's on hand.
 */
export function freeKg(onHandKg: number, acceptedKg: number): number {
  return onHandKg - acceptedKg;
}

/** An open request asks for more than the free rice, so accepting it over-promises. */
export function exceedsFree(
  order: { kg: number; status: OrderStatus },
  free: number,
): boolean {
  return order.status === "requested" && order.kg > free;
}

export const orderSms = {
  recorded:
    "IRPC: Nalista na ang request mo. Code {ref}: {kg} bugas, kuha sa {date}. I-text ka namon kon may desisyon na.",
  accepted:
    "IRPC: Accepted ang request {ref}: {kg} bugas, kuha sa {date} sa IRPC, Amamaros, Pototan. Bayad sa planta.",
  declined:
    "IRPC: Pasensya, indi ma-serve ang request {ref} ({kg} bugas, {date}). I-text ang PRICE para sa presyo subong.",
  cancelled: "IRPC: Kanselado na ang request {ref}.",
} as const;

/** Known account details are defaults, not AI-generated values. */
export function smsBuyerDefaults(client: {
  name: string;
  buyer_type: Database["public"]["Enums"]["buyer_type"] | null;
}): Record<string, unknown> {
  return {
    ...(/^SMS \d{4}$/.test(client.name) ? {} : { name: client.name }),
    ...(client.buyer_type ? { buyerType: client.buyer_type } : {}),
  };
}
export function readBuyReply(
  text: string,
  today: string,
  fields: readonly string[] = [],
): Record<string, unknown> | null {
  const values = readTradeValues(text, today, fields) ?? {};
  const type = text
    .toLowerCase()
    .match(
      /\b(wholesaler|retailer|institutional|cooperative|drop_point|subsidy_program)\b/,
    )?.[1];
  if (type) values.buyerType = type;
  const labelled = text
    .match(
      /\bNAME\s+(.+?)(?=\s+(?:wholesaler|retailer|institutional|cooperative|drop_point|subsidy_program)\b|$)/i,
    )?.[1]
    .trim();
  if (labelled) values.name = labelled;
  else if (
    fields.includes("name") &&
    Object.keys(values).length === 0 &&
    /^[\p{L}][\p{L} .'-]{1,99}$/u.test(text.trim()) &&
    !/^(yes|no|huo|indi|banana|ambot|hello|thanks)$/i.test(text.trim())
  )
    values.name = text.trim();
  return Object.keys(values).length ? values : null;
}
export function parseBuyArgs(args: string[], today: string): unknown {
  const first = args[0]?.match(/^(\d{1,3}(?:,\d{3})+|\d+)(?:kg)?$/i);
  if (!first) return null;
  const offset = /^(kg|kilos?)$/i.test(args[1] ?? "") ? 2 : 1;
  const dayMonth = args[offset];
  if (!dayMonth || !/^(?:\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})$/.test(dayMonth))
    return null;
  const rest = args.slice(offset + 1).join(" ");
  const extra = rest ? readBuyReply(rest, today) : {};
  // Reject arbitrary trailing words rather than silently accepting them.
  if (rest && !extra) return null;
  return {
    amount: Number(first[1].replace(/,/g, "")),
    unit: "kg",
    dayMonth,
    ...extra,
  };
}

export function orderBuyerDetails(order: {
  buyer_name: string | null;
  buyer_type: Database["public"]["Enums"]["buyer_type"] | null;
  client: {
    name: string;
    buyer_type: Database["public"]["Enums"]["buyer_type"] | null;
  } | null;
}): { name: string; type: Database["public"]["Enums"]["buyer_type"] | null } {
  return {
    name: order.buyer_name ?? order.client?.name ?? "—",
    type: order.buyer_type ?? order.client?.buyer_type ?? null,
  };
}
