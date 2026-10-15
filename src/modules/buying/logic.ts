// M5. Buying: Quotes, sell offers, purchases. See TRD.md.
// Pure functions only: no I/O and no imports from other modules. Unit-test here.

import { z } from "zod";
import { formatKg, formatMoneySms } from "@/lib/format";
import type { StatusTone } from "@/lib/status";
import type { Database } from "@/lib/supabase/database.types";

type OfferStatus = Database["public"]["Enums"]["sell_offer_status"];

export const offerStatusLabels: Record<OfferStatus, string> = {
  offered: "Offered",
  accepted: "Accepted",
  arrived: "Arrived",
  declined: "Declined",
  withdrawn: "Withdrawn",
};
export const offerStatusTones: Record<OfferStatus, StatusTone> = {
  offered: "warning",
  accepted: "info",
  arrived: "success",
  declined: "danger",
  withdrawn: "neutral",
};

type PurchasePrice = {
  paid_kg: number;
  price_minor_per_kg: number;
  total_minor: number;
};

/** Notify on the first save or when the farmer's displayed price details change. */
export function purchasePriceChanged(
  before: PurchasePrice | null,
  saved: PurchasePrice,
): boolean {
  return (
    !before ||
    before.paid_kg !== saved.paid_kg ||
    before.price_minor_per_kg !== saved.price_minor_per_kg ||
    before.total_minor !== saved.total_minor
  );
}

export function purchaseText(saved: PurchasePrice): string {
  return `IRPC: Palay purchase recorded. Paid weight: ${formatKg(saved.paid_kg)} at ${formatMoneySms(saved.price_minor_per_kg)}/kg. Total: ${formatMoneySms(saved.total_minor)}.`;
}

/** Validated input for a new sell offer. Weight is integer kg. */
export type CreateOfferInput = {
  clientId: string;
  varietyId: string | null;
  estKg: number;
  harvestDate: string;
  bookedByPhone: string;
};

// Matches clients.phone in the schema: E.164, 8–15 digits, no leading zero.
const phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
// Calendar date in Manila, stored as `date`.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a harvest date.")
  .refine(
    (d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)),
    "Choose a harvest date.",
  );

// IDs are only checked for presence here; the foreign keys enforce that the
// client and variety actually exist. (Seed UUIDs are not RFC-version-compliant.)
// Shared with the public /sell form (`offer-schema.ts`), which shows the messages.
export const offerForm = z.object({
  clientId: z.string().min(1),
  // A blank select means "no variety yet".
  varietyId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
  estKg: z.coerce
    .number("Enter the estimated kg.")
    .int("Enter whole kilograms.")
    .positive("Enter more than 0 kg."),
  harvestDate: isoDate,
  bookedByPhone: phone,
});

export type ParseResult =
  { ok: true; value: CreateOfferInput } | { ok: false; error: string };

/** Parse and validate raw sell-offer form values from untrusted input. */
export function parseOfferForm(raw: Record<string, unknown>): ParseResult {
  const parsed = offerForm.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Check the offer details and try again." };
  }
  return { ok: true, value: parsed.data };
}

// --- SMS command parsing (M5). Still pure; the registry validates with the
// schema and the queries resolve the variety and harvest date server-side. ---

/** `QUOTE <mc>% [<kg>]`. MC is a percentage (`numeric(4,1)`), kg is whole kg. */
export const quoteSmsSchema = z.object({
  mc: z.number().positive().max(99.9),
  kg: z.number().int().positive().optional(),
});
export type QuoteSmsInput = z.infer<typeof quoteSmsSchema>;

/** Tokens after `QUOTE`: `<mc>%` and an optional `<kg>`. The `%` is optional. */
export function parseQuoteArgs(args: string[]): unknown {
  if (args.length < 1 || args.length > 2) return null;
  const [mcRaw, kgRaw] = args;
  const mcToken = mcRaw.replace(/%$/, "");
  if (!/^\d+(\.\d+)?$/.test(mcToken)) return null;
  if (kgRaw !== undefined && !/^\d+$/.test(kgRaw)) return null;
  return {
    mc: Number(mcToken),
    kg: kgRaw === undefined ? undefined : Number(kgRaw),
  };
}

/** `SELL <kg> <variety> <dd/mm>`. The variety code resolves to an id server-side. */
export const sellSmsSchema = z.object({
  estKg: z.number().int().positive(),
  varietyCode: z.string().min(1),
  dayMonth: z.string().regex(/^\d{1,2}\/\d{1,2}$/),
});
export type SellSmsInput = z.infer<typeof sellSmsSchema>;

/** Tokens after `SELL`: `<kg> <variety> <dd/mm>`, in that order. */
export function parseSellArgs(args: string[]): unknown {
  if (args.length !== 3) return null;
  const [kg, variety, dayMonth] = args;
  if (!/^\d+$/.test(kg)) return null;
  return { estKg: Number(kg), varietyCode: variety.toUpperCase(), dayMonth };
}

/** SMS replies in Hiligaynon, filled with `fillTemplate`. GSM-7. */
export const buyingSms = {
  prices:
    "IRPC presyo subong: palay {buy}/kg sa {mc}% MC, drying {drying}/kg, milling {milling}/kg, bugas {rice}/kg. Para sa quote: QUOTE <mc>% <kg>.",
  /** `{total}` is `, 1,000 kg = PHP 21,000.00` or empty. */
  quote:
    "IRPC estimate sa {mc}% MC: {perKg}/kg{total}. Estimate lang ini; ang final nga presyo matalana pag-receive sang palay.",
  unknownVariety:
    'IRPC: Wala namon nakilala ang variety "{code}". Palihog i-check ang code kag tilawi liwat. I-text ang VARIETIES para sa listahan.',
  offerRecorded:
    "IRPC: Nalista na ang offer mo. Code {ref}: {kg} {variety} para sa harvest sa {date}. I-text ka namon kon may desisyon na ang manager.",
  offerAccepted:
    "IRPC: Accepted ang offer {ref}: {kg} palay, harvest sa {date}. Dal-a sa IRPC, Amamaros, Pototan kag ipakita ang code sa gate.",
  offerDeclined:
    "IRPC: Pasensya, indi mabakal ang offer {ref} ({kg}, {date}). I-text ang PRICE para sa presyo subong.",
} as const;

/**
 * The `VARIETIES` reply: the total count, the known variety codes in the order
 * given, and a reminder of the `SELL` format. The count is the full total even
 * when the list is cut, so a farmer can tell there are more than shown. If the
 * whole reply would exceed `maxChars` (the SMS limit, passed in to keep this
 * pure), the list is cut to the codes that fit with a trailing `...` (GSM-7).
 */
export function formatVarietiesSms(codes: string[], maxChars: number): string {
  if (codes.length === 0)
    return "IRPC: Wala pa sang nalista nga variety sang humay. Para magbaligya: SELL <kg> <variety> <dd/mm>";
  const prefix = `IRPC mga variety sang humay (${codes.length}): `;
  const suffix = ". Para magbaligya: SELL <kg> <variety> <dd/mm>";

  const full = `${prefix}${codes.join(", ")}${suffix}`;
  if (full.length <= maxChars) return full;

  // Over the limit: keep as many codes as fit alongside a trailing ellipsis.
  const kept: string[] = [];
  for (const code of codes) {
    const candidate = `${prefix}${[...kept, code].join(", ")} ...${suffix}`;
    if (candidate.length > maxChars) break;
    kept.push(code);
  }
  return `${prefix}${kept.join(", ")} ...${suffix}`;
}

// --- Price override (M5 P1). The manager replaces the computed price per kg
// with a reason; the original computed price is kept in `deductions`. ---

/** A required pesos field typed by the manager, stored as integer centavos. */
const overridePesos = z
  .string()
  .trim()
  .min(1)
  .pipe(z.coerce.number())
  .pipe(z.number().nonnegative())
  .transform((p) => Math.round(p * 100));

/** Validated override: a new price per kg (centavos) and a required reason. */
export const overrideFormSchema = z.object({
  priceMinorPerKg: overridePesos,
  reason: z.string().trim().min(1),
});
export type OverrideInput = z.infer<typeof overrideFormSchema>;

export type OverrideParseResult =
  { ok: true; value: OverrideInput } | { ok: false; error: string };

/** Parse and validate the raw override form (price in pesos, a reason). */
export function parseOverrideForm(
  raw: Record<string, unknown>,
): OverrideParseResult {
  const parsed = overrideFormSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Enter a price (₱/kg) and a reason for the override.",
    };
  }
  return { ok: true, value: parsed.data };
}

/**
 * Applies a price override to a purchase: the new price per kg, the total
 * recomputed as paid kg × price, and the reason. The original computed price
 * is kept in `deductions.original_minor_per_kg`, set only the first time so
 * repeated overrides preserve the true computed original.
 */
export function applyOverride(
  current: {
    paidKg: number;
    priceMinorPerKg: number;
    deductions: Record<string, number>;
  },
  input: OverrideInput,
): {
  priceMinorPerKg: number;
  totalMinor: number;
  deductions: Record<string, number>;
  overrideReason: string;
} {
  const originalMinorPerKg =
    current.deductions.original_minor_per_kg ?? current.priceMinorPerKg;
  return {
    priceMinorPerKg: input.priceMinorPerKg,
    totalMinor: current.paidKg * input.priceMinorPerKg,
    deductions: {
      ...current.deductions,
      original_minor_per_kg: originalMinorPerKg,
    },
    overrideReason: input.reason,
  };
}

// --- Buying budget (M5 P1). The manager sets working capital for a period
// that starts on a date; purchases priced since then count as used. ---

/** Validated budget: an amount (centavos) and an optional period start. */
export const budgetFormSchema = z.object({
  budgetMinor: overridePesos,
  start: z
    .string()
    .trim()
    .transform((d) => d || null)
    .pipe(isoDate.nullable()),
});
export type BudgetInput = z.infer<typeof budgetFormSchema>;

export type BudgetParseResult =
  { ok: true; value: BudgetInput } | { ok: false; error: string };

/** Parse and validate the raw budget form (amount in pesos, optional start date). */
export function parseBudgetForm(
  raw: Record<string, unknown>,
): BudgetParseResult {
  const parsed = budgetFormSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Enter a budget (₱) and, optionally, a valid start date.",
    };
  }
  return { ok: true, value: parsed.data };
}

export type BudgetStatus = { usedMinor: number; remainingMinor: number };

/**
 * Working capital used (Σ purchase totals in the period) and remaining
 * (budget − used). Remaining goes negative when purchases exceed the budget.
 */
export function budgetStatus(
  budgetMinor: number,
  purchaseTotalsMinor: number[],
): BudgetStatus {
  const usedMinor = purchaseTotalsMinor.reduce((sum, t) => sum + t, 0);
  return { usedMinor, remainingMinor: budgetMinor - usedMinor };
}
