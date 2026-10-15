// M5. Buying: Quotes, sell offers, purchases. See TRD.md.
// Server-side reads. May call other modules' queries.

import "server-only";
import { todayManila } from "@/lib/dates";
import { formatDate, formatKg, formatMoneySms } from "@/lib/format";
import { newRef } from "@/lib/ref";
import { db } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { findOrRegisterByPhone } from "@/modules/accounts/queries";
import {
  type BuyRules,
  type PriceRule,
  priceReceiving,
  quote,
} from "@/modules/pricing/logic";
import { priceOn } from "@/modules/pricing/queries";
import {
  fillTemplate,
  helpText,
  parseDayMonth,
  SMS_MAX_CHARS,
} from "@/modules/sms/logic";
import { commandUsages, type CommandContext } from "@/modules/sms/registry";
import { send } from "@/modules/sms/queries";
import {
  currentFacility,
  findVarietyByCode,
  listVarieties,
} from "@/modules/setup/queries";
import {
  budgetStatus,
  type BudgetStatus,
  formatVarietiesSms,
  purchasePriceChanged,
  purchaseText,
  buyingSms,
} from "./logic";
import type { CreateOfferInput, QuoteSmsInput, SellSmsInput } from "./logic";

export type Offer = Database["public"]["Tables"]["sell_offers"]["Row"];
export type OfferStatus = Database["public"]["Enums"]["sell_offer_status"];
export type Purchase = Database["public"]["Tables"]["purchases"]["Row"];

/**
 * Create a sell offer in `offered` status with a fresh ref. Server-only (not a
 * server action) so it has no HTTP endpoint: the staff form authorizes in its
 * action before calling this, and the SMS `SELL` command (#41) reuses it the
 * same way. Offers are inert until a manager accepts.
 */
export async function createOffer(input: CreateOfferInput): Promise<Offer> {
  const facility = await currentFacility();

  // ref is unique; retry the rare collision with a new one.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db()
      .from("sell_offers")
      .insert({
        facility_id: facility.id,
        ref: newRef(),
        client_id: input.clientId,
        booked_by_phone: input.bookedByPhone,
        variety_id: input.varietyId,
        est_kg: input.estKg,
        harvest_date: input.harvestDate,
      })
      .select()
      .single();
    if (!error) return data;
    if (error.code !== "23505")
      throw new Error(`Create offer: ${error.message}`);
  }
  throw new Error("Create offer: could not allocate a unique ref.");
}

/**
 * Texts the seller the ref of an offer made on the public /sell page, in the
 * same words as the SMS `SELL` reply. A failed text never fails the saved offer.
 */
export async function notifyOfferRecorded(
  offer: Offer,
  phone: string,
): Promise<void> {
  try {
    const variety = offer.variety_id
      ? (await listVarieties()).find((v) => v.id === offer.variety_id)
      : undefined;
    await send(phone, buyingSms.offerRecorded, {
      ref: offer.ref,
      kg: formatKg(offer.est_kg),
      variety: variety?.code ?? "palay",
      date: formatDate(offer.harvest_date),
    });
  } catch (error) {
    console.error("Unable to send offer confirmation", error);
  }
}

/**
 * Texts the seller the manager's decision on an offer. A failed text never
 * fails the saved decision.
 */
export async function notifyOfferDecision(
  offer: Offer,
  accepted: boolean,
): Promise<void> {
  try {
    await send(
      offer.booked_by_phone,
      accepted ? buyingSms.offerAccepted : buyingSms.offerDeclined,
      {
        ref: offer.ref,
        kg: formatKg(offer.est_kg),
        date: formatDate(offer.harvest_date),
      },
    );
  } catch (error) {
    console.error("Unable to send offer decision", error);
  }
}

/** An offer joined with its client and variety, for the buying list. */
export type OfferListItem = Offer & {
  client: { name: string; phone: string } | null;
  variety: { code: string; name: string } | null;
};

/** The single offer with this ref, or null. Refs are globally unique. */
export async function findOfferByRef(ref: string): Promise<Offer | null> {
  const { data, error } = await db()
    .from("sell_offers")
    .select()
    .eq("ref", ref)
    .maybeSingle();
  if (error) throw new Error(`Offer by ref: ${error.message}`);
  return data;
}

/** Marks an `accepted` offer `arrived` at the gate. Null if it is no longer accepted. */
export async function markOfferArrived(offerId: string): Promise<Offer | null> {
  const { data, error } = await db()
    .from("sell_offers")
    .update({ status: "arrived" })
    .eq("id", offerId)
    .eq("status", "accepted")
    .select()
    .maybeSingle();
  if (error) throw new Error(`Offer arrived: ${error.message}`);
  return data;
}

/** Undoes `markOfferArrived` when the check-in that caused it fails. */
export async function unmarkOfferArrived(offerId: string): Promise<void> {
  const { error } = await db()
    .from("sell_offers")
    .update({ status: "accepted" })
    .eq("id", offerId)
    .eq("status", "arrived");
  if (error) throw new Error(`Offer arrived: ${error.message}`);
}

/**
 * Accepted offers with a harvest date in `[from, to]`, by harvest date.
 * Used by capacity (#33) as expected arrivals.
 */
export async function acceptedOffersBetween(
  from: string,
  to: string,
): Promise<Offer[]> {
  const facility = await currentFacility();
  const { data, error } = await db()
    .from("sell_offers")
    .select()
    .eq("facility_id", facility.id)
    .eq("status", "accepted")
    .gte("harvest_date", from)
    .lte("harvest_date", to)
    .order("harvest_date");
  if (error) throw new Error(`Accepted offers: ${error.message}`);
  return data;
}

/**
 * Prices a `received` IRPC batch off its saved Receiving Report and records the
 * purchase. Reads the batch's receiving fields, prices them with
 * `priceReceiving` on the prices in effect today, and upserts the `purchases`
 * row keyed by batch — re-saving the receiving re-prices without disturbing a
 * voucher added later. Texts the farmer when the saved price details change.
 * Custom batches are never passed here.
 */
export async function createPurchase(
  batchId: string,
  options: { notify?: boolean } = {},
): Promise<Purchase> {
  const { data: batch, error } = await db()
    .from("batches")
    .select(
      "client_id, ownership, bags, net_kg, mc, damaged_pct, immature_pct, foreign_pct",
    )
    .eq("id", batchId)
    .single();
  if (error) throw new Error(`Purchase: ${error.message}`);
  if (batch.ownership !== "irpc")
    throw new Error("Purchase: only IRPC-owned batches are bought.");
  if (batch.net_kg == null || batch.mc == null || batch.bags == null)
    throw new Error("Purchase: the receiving report is incomplete.");

  const priceDate = todayManila();
  const prices = await priceOn(priceDate);
  const rule: PriceRule = {
    buy_base_minor_per_kg: prices.buy_base_minor_per_kg,
    buy_reference_mc: prices.buy_reference_mc,
    buy_rules: prices.buy_rules as BuyRules,
  };
  const priced = priceReceiving(rule, {
    netKg: batch.net_kg,
    mc: batch.mc,
    damagedPct: batch.damaged_pct ?? 0,
    immaturePct: batch.immature_pct ?? 0,
    foreignPct: batch.foreign_pct ?? 0,
    bags: batch.bags,
  });

  const previous = await purchaseByBatch(batchId);
  // Omit voucher_ref and override_reason so an upsert update leaves them alone.
  const { data, error: upsertError } = await db()
    .from("purchases")
    .upsert(
      {
        batch_id: batchId,
        client_id: batch.client_id,
        price_date: priceDate,
        net_kg: batch.net_kg,
        paid_kg: priced.paidKg,
        price_minor_per_kg: priced.minorPerKg,
        total_minor: priced.totalMinor,
        deductions: priced.deductions,
      },
      { onConflict: "batch_id" },
    )
    .select()
    .single();
  if (upsertError) throw new Error(`Purchase: ${upsertError.message}`);
  if (options.notify !== false && purchasePriceChanged(previous, data)) {
    try {
      const { data: client, error: clientError } = await db()
        .from("clients")
        .select("phone")
        .eq("id", data.client_id)
        .single();
      if (clientError) throw clientError;
      await send(client.phone, purchaseText(data));
    } catch (error) {
      console.error("Unable to send purchase price text", error);
    }
  }
  return data;
}

/** Centavos IRPC pays for a batch's palay, or 0 if it was not bought. */
export async function purchaseCost(batchId: string): Promise<number> {
  const { data, error } = await db()
    .from("purchases")
    .select("total_minor")
    .eq("batch_id", batchId)
    .maybeSingle();
  if (error) throw new Error(`Purchase cost: ${error.message}`);
  return data?.total_minor ?? 0;
}

export type BuyingBudget = BudgetStatus & {
  budgetMinor: number;
  start: string | null;
};

/**
 * The manager's buying budget and the working capital used and remaining:
 * used is Σ `total_minor` of purchases priced on or after the period start
 * (all purchases when no start is set).
 */
export async function buyingBudget(): Promise<BuyingBudget> {
  const facility = await currentFacility();
  let query = db().from("purchases").select("total_minor");
  if (facility.buy_budget_start)
    query = query.gte("price_date", facility.buy_budget_start);
  const { data, error } = await query;
  if (error) throw new Error(`Buying budget: ${error.message}`);
  return {
    budgetMinor: facility.buy_budget_minor,
    start: facility.buy_budget_start,
    ...budgetStatus(
      facility.buy_budget_minor,
      data.map((p) => p.total_minor),
    ),
  };
}

/** The purchase recorded for a batch, or null (a custom batch has none). */
export async function purchaseByBatch(
  batchId: string,
): Promise<Purchase | null> {
  const { data, error } = await db()
    .from("purchases")
    .select()
    .eq("batch_id", batchId)
    .maybeSingle();
  if (error) throw new Error(`Purchase: ${error.message}`);
  return data;
}

/** Offers for the current facility by harvest date, optionally filtered by status. */
export async function listOffers(
  status?: OfferStatus,
): Promise<OfferListItem[]> {
  const facility = await currentFacility();
  let query = db()
    .from("sell_offers")
    .select("*, client:clients(name, phone), variety:varieties(code, name)")
    .eq("facility_id", facility.id);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("harvest_date");
  if (error) throw new Error(`Offers: ${error.message}`);
  return data;
}

// --- SMS handlers (M5). Registered from `sms.ts`; each returns the reply the
// registry sends to the sender exactly once. See TRD M5. ---

/** `PRICE`: today's buying base, drying and milling fees, and rice price. */
export async function priceBySms(): Promise<string> {
  const prices = await priceOn(todayManila());
  return fillTemplate(buyingSms.prices, {
    buy: formatMoneySms(prices.buy_base_minor_per_kg),
    mc: prices.buy_reference_mc,
    drying: formatMoneySms(prices.drying_fee_minor_per_kg),
    milling: formatMoneySms(prices.milling_fee_minor_per_kg),
    rice: formatMoneySms(prices.rice_minor_per_kg),
  });
}

/** `QUOTE <mc>% [<kg>]`: the MC-adjusted price per kg and total, as an estimate. */
export async function quoteBySms(input: QuoteSmsInput): Promise<string> {
  const prices = await priceOn(todayManila());
  const rule: PriceRule = {
    buy_base_minor_per_kg: prices.buy_base_minor_per_kg,
    buy_reference_mc: prices.buy_reference_mc,
    buy_rules: prices.buy_rules as BuyRules,
  };
  const { minorPerKg, totalMinor } = quote(rule, input.mc, input.kg);
  const total =
    totalMinor === undefined
      ? ""
      : `, ${formatKg(input.kg as number)} = ${formatMoneySms(totalMinor)}`;
  return fillTemplate(buyingSms.quote, {
    mc: input.mc,
    perKg: formatMoneySms(minorPerKg),
    total,
  });
}

/** `SELL <kg> <variety> <dd/mm>` (with optional `FOR <phone>`): records an offer. */
export async function sellBySms(
  input: SellSmsInput,
  ctx: CommandContext,
): Promise<string> {
  const variety = await findVarietyByCode(input.varietyCode);
  if (!variety)
    return fillTemplate(buyingSms.unknownVariety, { code: input.varietyCode });
  const harvestDate = parseDayMonth(input.dayMonth, todayManila());
  if (!harvestDate) return helpText(commandUsages());

  // FOR records the offer under another client; authority is never granted by it.
  const client =
    ctx.forPhone && ctx.forPhone !== ctx.phone
      ? await findOrRegisterByPhone(ctx.forPhone)
      : ctx.client;
  const offer = await createOffer({
    clientId: client.id,
    varietyId: variety.id,
    estKg: input.estKg,
    harvestDate,
    bookedByPhone: ctx.phone,
  });
  return fillTemplate(buyingSms.offerRecorded, {
    ref: offer.ref,
    kg: formatKg(offer.est_kg),
    variety: variety.code,
    date: formatDate(harvestDate),
  });
}

/** `VARIETIES`: the rice variety codes IRPC recognizes, for use in `SELL`. */
export async function varietiesBySms(): Promise<string> {
  const varieties = await listVarieties();
  return formatVarietiesSms(
    varieties.map((v) => v.code),
    SMS_MAX_CHARS,
  );
}
