"use server";

// M5. Buying: Quotes, sell offers, purchases. See TRD.md.
// Server actions. Check the staff role first with requireRole().

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { todayManila } from "@/lib/dates";
import { db } from "@/lib/supabase/admin";
import { requireRole } from "@/modules/accounts/auth";
import { normalizePhone } from "@/modules/accounts/logic";
import {
  ClientInputError,
  findOrRegisterByPhone,
} from "@/modules/accounts/queries";
import { currentFacility } from "@/modules/setup/queries";
import {
  applyOverride,
  parseBudgetForm,
  parseOfferForm,
  parseOverrideForm,
} from "./logic";
import { webOfferSchema, type WebOfferInput } from "./offer-schema";
import {
  createOffer,
  notifyOfferDecision,
  notifyOfferRecorded,
  purchaseByBatch,
  type Offer,
} from "./queries";

export type OfferFormState =
  { ok: true; ref: string } | { ok: false; error: string } | undefined;

/** Form action for the staff offer form. Any signed-in staff may record an offer. */
export async function submitOffer(
  _prev: OfferFormState,
  formData: FormData,
): Promise<OfferFormState> {
  await requireRole();

  const parsed = parseOfferForm(Object.fromEntries(formData));
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const offer = await createOffer(parsed.value);
  revalidatePath("/selling");
  return { ok: true, ref: offer.ref };
}

export type OfferOnlineResult =
  | {
      status: "created";
      offer: Pick<Offer, "ref" | "est_kg" | "harvest_date">;
    }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<keyof WebOfferInput, string>>;
    };

function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path[0], issue.message]),
  );
}

/**
 * Sell offer from the public /sell page, without requireRole(): like an SMS
 * `SELL`, it can only create an `offered` offer for the entered phone, which
 * is texted the ref. Offers stay inert until a manager accepts.
 */
export async function offerOnline(input: unknown): Promise<OfferOnlineResult> {
  const parsed = webOfferSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const { name, phone, municipalityId, ...offer } = parsed.data;
  if (offer.harvestDate < todayManila())
    return {
      status: "error",
      fieldErrors: { harvestDate: "Choose today or a later date." },
    };
  const normalized = normalizePhone(phone)!;
  try {
    // Name and municipality only label a new client; an existing one is never changed.
    const client = await findOrRegisterByPhone(normalized, {
      name,
      municipality_id: municipalityId,
    });
    const created = await createOffer({
      ...offer,
      clientId: client.id,
      bookedByPhone: normalized,
    });
    await notifyOfferRecorded(created, normalized);
    revalidatePath("/selling");
    const { ref, est_kg, harvest_date } = created;
    return { status: "created", offer: { ref, est_kg, harvest_date } };
  } catch (error) {
    if (error instanceof ClientInputError && error.field === "municipality_id")
      return {
        status: "error",
        fieldErrors: { municipalityId: "Choose your municipality." },
      };
    console.error("Unable to create web offer", error);
    return {
      status: "error",
      message: "Unable to save the offer. Please try again.",
    };
  }
}

/**
 * Accept or decline an offer and text the seller. Manager only. Only an
 * `offered` offer can be decided.
 */
export async function decideOffer(id: string, accept: boolean): Promise<void> {
  await requireRole("manager");
  const { data, error } = await db()
    .from("sell_offers")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", id)
    .eq("status", "offered")
    .select()
    .maybeSingle();
  if (error) throw new Error(`Decide offer: ${error.message}`);
  if (data) await notifyOfferDecision(data, accept);
  revalidatePath("/selling");
}

/** Withdraw an offer. Available to any signed-in staff. Only from `offered`. */
export async function withdrawOffer(id: string): Promise<void> {
  await requireRole();
  const { error } = await db()
    .from("sell_offers")
    .update({ status: "withdrawn" })
    .eq("id", id)
    .eq("status", "offered");
  if (error) throw new Error(`Withdraw offer: ${error.message}`);
  revalidatePath("/selling");
}

export type VoucherResult = { ok: true } | { ok: false; error: string };

/**
 * Sets (or clears) the voucher number on a batch's purchase, recorded after
 * the receiving is priced. Any signed-in staff may add it.
 */
export async function setVoucherRef(
  batchId: string,
  ref: string,
): Promise<VoucherResult> {
  await requireRole();
  const trimmed = ref.trim();
  const { error } = await db()
    .from("purchases")
    .update({ voucher_ref: trimmed === "" ? null : trimmed })
    .eq("batch_id", batchId);
  if (error) return { ok: false, error: "Couldn't save the voucher number." };
  revalidatePath(`/batches/${batchId}`);
  return { ok: true };
}

export type OverrideResult = { ok: true } | { ok: false; error: string };

/**
 * Overrides a purchase's price per kg with a required reason. Manager only.
 * The original computed price is preserved in `deductions`; the total is
 * recomputed as paid kg × the new price.
 */
export async function overridePrice(
  batchId: string,
  priceInput: string,
  reason: string,
): Promise<OverrideResult> {
  await requireRole("manager");

  const parsed = parseOverrideForm({ priceMinorPerKg: priceInput, reason });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const purchase = await purchaseByBatch(batchId);
  if (!purchase) return { ok: false, error: "No purchase to override." };

  const update = applyOverride(
    {
      paidKg: purchase.paid_kg,
      priceMinorPerKg: purchase.price_minor_per_kg,
      deductions: purchase.deductions as Record<string, number>,
    },
    parsed.value,
  );

  const { error } = await db()
    .from("purchases")
    .update({
      price_minor_per_kg: update.priceMinorPerKg,
      total_minor: update.totalMinor,
      deductions: update.deductions,
      override_reason: update.overrideReason,
    })
    .eq("batch_id", batchId);
  if (error) return { ok: false, error: "Couldn't save the override." };
  revalidatePath(`/batches/${batchId}`);
  return { ok: true };
}

export type BudgetResult = { ok: true } | { ok: false; error: string };

/** Set the buying budget (pesos) and its period start date. Manager only. */
export async function saveBudget(
  budgetInput: string,
  startInput: string,
): Promise<BudgetResult> {
  await requireRole("manager");

  const parsed = parseBudgetForm({
    budgetMinor: budgetInput,
    start: startInput,
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const facility = await currentFacility();
  const { error } = await db()
    .from("facilities")
    .update({
      buy_budget_minor: parsed.value.budgetMinor,
      buy_budget_start: parsed.value.start,
    })
    .eq("id", facility.id);
  if (error) return { ok: false, error: "Couldn't save the budget." };
  revalidatePath("/selling");
  return { ok: true };
}
