// M7. Pricing and Cost: Prices, batch cost, electricity per kg. See TRD.md.
// Pure functions only: no I/O and no imports from other modules. Unit-test here.

import { z } from "zod";

/** The MC adjustment rule. Only the TRD default exists until IRPC confirms. */
export type McRule = "proportional";

/** Deduction factors, sack weight and the MC rule, stored as `prices.buy_rules`. */
export type BuyRules = {
  damaged: number;
  immature: number;
  foreign: number;
  sack_kg: number;
  mc_rule: McRule;
};

/** Validated price row from the manager's form. Money is integer centavos. */
export type PriceInput = {
  effectiveDate: string;
  buyBaseMinorPerKg: number;
  dryingFeeMinorPerKg: number;
  millingFeeMinorPerKg: number;
  riceMinorPerKg: number;
  buyRules: BuyRules;
};

// Not set in the form: sack weight per TRD, and the only confirmed MC rule.
const SACK_KG = 0.1;
const MC_RULE: McRule = "proportional";

// Calendar date in Manila, stored as `date`.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Invalid date");

// A required number field: reject a blank so an empty input never reads as 0.
const number = z.string().trim().min(1).pipe(z.coerce.number());

// Peso amount typed by the manager, stored as integer centavos.
const pesos = number
  .pipe(z.number().nonnegative())
  .transform((p) => Math.round(p * 100));

// A kg deduction factor: a fraction of the affected weight, 0..1.
const factor = number.pipe(z.number().min(0).max(1));

const priceForm = z.object({
  effectiveDate: isoDate,
  buyBase: pesos,
  damaged: factor,
  immature: factor,
  foreign: factor,
  rice: pesos,
  drying: pesos,
  milling: pesos,
});

export type PriceParseResult =
  { ok: true; value: PriceInput } | { ok: false; error: string };

// Field labels for error messages, keyed by the form field name.
const FIELD_LABELS: Record<string, string> = {
  effectiveDate: "effective date",
  buyBase: "palay buying base",
  damaged: "damaged deduction",
  immature: "immature deduction",
  foreign: "foreign deduction",
  rice: "rice selling price",
  drying: "drying fee",
  milling: "milling fee",
};

/** Parse and validate raw price-form values from untrusted input. */
export function parsePriceForm(raw: Record<string, unknown>): PriceParseResult {
  const parsed = priceForm.safeParse(raw);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const label = typeof field === "string" ? FIELD_LABELS[field] : undefined;
    return {
      ok: false,
      error: label
        ? `Check the ${label} and try again.`
        : "Check the price details and try again.",
    };
  }
  const v = parsed.data;
  return {
    ok: true,
    value: {
      effectiveDate: v.effectiveDate,
      buyBaseMinorPerKg: v.buyBase,
      dryingFeeMinorPerKg: v.drying,
      millingFeeMinorPerKg: v.milling,
      riceMinorPerKg: v.rice,
      buyRules: {
        damaged: v.damaged,
        immature: v.immature,
        foreign: v.foreign,
        sack_kg: SACK_KG,
        mc_rule: MC_RULE,
      },
    },
  };
}

/**
 * The parts of a `prices` row the buy rule reads. The DB row satisfies this
 * (cast `buy_rules` from `Json` to `BuyRules`); other tickets pass the row.
 */
export type PriceRule = {
  buy_base_minor_per_kg: number;
  buy_reference_mc: number;
  buy_rules: BuyRules;
};

/**
 * Buying price per kg in centavos, MC-adjusted off the base at the reference
 * MC: base × (100 − mc) ÷ (100 − ref), the `proportional` rule (TRD M5).
 * Clamped at 0 so extreme MC never yields a negative price.
 */
function buyPricePerKg(prices: PriceRule, mc: number): number {
  const { buy_base_minor_per_kg: base, buy_reference_mc: ref } = prices;
  const adjusted = (base * (100 - mc)) / (100 - ref);
  return Math.max(0, Math.round(adjusted));
}

/**
 * A quote: the MC-adjusted price per kg, and the total for `kg` if given.
 * An estimate only — it skips the receiving deductions (TRD M5 step 4).
 */
export function quote(
  prices: PriceRule,
  mc: number,
  kg?: number,
): { minorPerKg: number; totalMinor?: number } {
  const minorPerKg = buyPricePerKg(prices, mc);
  return kg === undefined
    ? { minorPerKg }
    : { minorPerKg, totalMinor: minorPerKg * kg };
}

/** Receiving inputs from the Receiving Report. Deduction shares are percentages. */
export type ReceivingInput = {
  /** Weighed net delivery, in kg. */
  netKg: number;
  /** Moisture content, percent. */
  mc: number;
  /** Damaged grains, percent of the delivery. */
  damagedPct: number;
  /** Immature grains, percent of the delivery. */
  immaturePct: number;
  /** Foreign matter, percent of the delivery. */
  foreignPct: number;
  /** Number of sacks, for the per-sack weight deduction. */
  bags: number;
};

/** Kilos deducted by category, as stored in `purchases.deductions`. */
export type Deductions = {
  damaged: number;
  immature: number;
  foreign: number;
  sack: number;
  /** The computed price per kg (centavos) before a manager override (M5 P1). */
  original_minor_per_kg?: number;
};

/**
 * Prices a full receiving like the paper Receiving Report (TRD M5): the same
 * MC-adjusted price as a quote, then kg deductions — each a percentage of the
 * delivery times its factor, plus the sack weight per bag — off the net weight.
 * Total is paid kg × price.
 */
export function priceReceiving(
  prices: PriceRule,
  { netKg, mc, damagedPct, immaturePct, foreignPct, bags }: ReceivingInput,
): {
  paidKg: number;
  minorPerKg: number;
  totalMinor: number;
  deductions: Deductions;
} {
  const { damaged, immature, foreign, sack_kg } = prices.buy_rules;
  const deductions: Deductions = {
    damaged: Math.round((netKg * damagedPct * damaged) / 100),
    immature: Math.round((netKg * immaturePct * immature) / 100),
    foreign: Math.round((netKg * foreignPct * foreign) / 100),
    sack: Math.round(bags * sack_kg),
  };
  const paidKg =
    netKg -
    deductions.damaged -
    deductions.immature -
    deductions.foreign -
    deductions.sack;
  const minorPerKg = buyPricePerKg(prices, mc);
  return { paidKg, minorPerKg, totalMinor: paidKg * minorPerKg, deductions };
}

/**
 * The price row in effect on `today`, from rows sorted newest effective date
 * first: the first row with `effective_date <= today`. Prefills the price
 * form.
 */
export function livePrice<T extends { effective_date: string }>(
  rows: T[],
  today: string,
): T | undefined {
  return rows.find((p) => p.effective_date <= today);
}

/** Inputs for the shared electricity cost basis. Energy in kWh, money in centavos. */
export type ElectricityInput = {
  /** Metered machine energy over the run, in kWh. */
  machineKwh: number;
  /** Palay throughput the cost is spread over, in kg. */
  kg: number;
  /** Days the facility ran, for the base-load term. */
  daysRun: number;
  /** Facility base load drawn whenever it runs, in kW. */
  baseLoadKw: number;
  /** Operating hours per day, for the base-load term. */
  hoursPerDay: number;
  /** Electricity tariff, in centavos per kWh. */
  tariffMinorPerKwh: number;
};

/** Ownership of the batch, which decides how its revenue is figured. */
export type BatchOwnership = "custom" | "irpc";

/** Raw numbers a batch's direct cost and margin are computed from (TRD M7). */
export type BatchCostInput = {
  /** Who owns the palay: `custom` bills fees, `irpc` nets dispatches. */
  ownership: BatchOwnership;
  /** Hours the batch spent drying (0 if it never dried). */
  dryHours: number;
  /** Hours the batch spent milling (0 if it never milled). */
  millHours: number;
  /** Rated power of the dryer used, in kW (0 if none). */
  dryerRatedKw: number;
  /** Rated power of the mill used, in kW (0 if none). */
  millRatedKw: number;
  /** Electricity tariff, in centavos per kWh. */
  tariffMinorPerKwh: number;
  /** Labor rate, in centavos per hour. */
  laborMinorPerHour: number;
  /** Received weight, in kg, the per-kg margin is spread over. */
  netKg: number;
  /** Weight fed into the mill, in kg (custom milling fee basis). */
  millInKg: number;
  /** Drying fee, in centavos per kg (custom revenue). */
  dryingFeeMinorPerKg: number;
  /** Milling fee, in centavos per kg (custom revenue). */
  millingFeeMinorPerKg: number;
  /** Σ dispatch kg × price, in centavos (IRPC revenue). */
  dispatchRevenueMinor: number;
  /** Centavos IRPC paid for the palay (IRPC revenue). */
  purchaseCostMinor: number;
};

/** A batch's direct cost against its revenue, all in centavos. */
export type BatchCost = {
  electricityMinor: number;
  laborMinor: number;
  revenueMinor: number;
  marginMinor: number;
  /** Margin spread over received kg, in centavos per kg. */
  perKgMinor: number;
};

/**
 * Direct cost and margin for one batch (TRD M7). Electricity is stage hours ×
 * machine `rated_kw` × tariff over drying and milling; labor is stage hours ×
 * rate. Revenue is the drying and milling fees for a custom batch, or
 * dispatches less the palay purchase cost for an IRPC-owned one. Margin is
 * revenue less direct cost, and per-kg margin spreads it over received kg.
 * Base load is not split per batch — it lives only in `electricityPerKg`.
 */
export function batchCost({
  ownership,
  dryHours,
  millHours,
  dryerRatedKw,
  millRatedKw,
  tariffMinorPerKwh,
  laborMinorPerHour,
  netKg,
  millInKg,
  dryingFeeMinorPerKg,
  millingFeeMinorPerKg,
  dispatchRevenueMinor,
  purchaseCostMinor,
}: BatchCostInput): BatchCost {
  const machineKwh = dryHours * dryerRatedKw + millHours * millRatedKw;
  const electricityMinor = Math.round(machineKwh * tariffMinorPerKwh);
  const laborMinor = Math.round((dryHours + millHours) * laborMinorPerHour);
  const revenueMinor =
    ownership === "custom"
      ? dryingFeeMinorPerKg * netKg + millingFeeMinorPerKg * millInKg
      : dispatchRevenueMinor - purchaseCostMinor;
  const marginMinor = revenueMinor - electricityMinor - laborMinor;
  const perKgMinor = netKg > 0 ? Math.round(marginMinor / netKg) : 0;
  return {
    electricityMinor,
    laborMinor,
    revenueMinor,
    marginMinor,
    perKgMinor,
  };
}

/**
 * Electricity cost per kg, in centavos. Base load is added over the whole run,
 * not split per batch (TRD M7). M9's headline and M10's full-load plan share this.
 */
export function electricityPerKg({
  machineKwh,
  kg,
  daysRun,
  baseLoadKw,
  hoursPerDay,
  tariffMinorPerKwh,
}: ElectricityInput): number {
  if (kg <= 0) {
    throw new Error("electricityPerKg: kg must be positive");
  }
  const totalKwh = machineKwh + baseLoadKw * hoursPerDay * daysRun;
  return Math.round((totalKwh * tariffMinorPerKwh) / kg);
}

/** One effective date on the price trend, in pesos per kg. */
export type PricePoint = {
  date: string;
  buyBase: number;
  drying: number;
  milling: number;
  rice: number;
};

/**
 * The price trend: the newest save for each effective date, oldest first,
 * keeping the most recent `limit` dates.
 */
export function priceTrend(
  rows: {
    effective_date: string;
    created_at: string;
    buy_base_minor_per_kg: number;
    drying_fee_minor_per_kg: number;
    milling_fee_minor_per_kg: number;
    rice_minor_per_kg: number;
  }[],
  limit = 12,
): PricePoint[] {
  const newest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const kept = newest.get(row.effective_date);
    if (!kept || row.created_at > kept.created_at)
      newest.set(row.effective_date, row);
  }
  return [...newest.values()]
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
    .slice(-limit)
    .map((row) => ({
      date: row.effective_date,
      buyBase: row.buy_base_minor_per_kg / 100,
      drying: row.drying_fee_minor_per_kg / 100,
      milling: row.milling_fee_minor_per_kg / 100,
      rice: row.rice_minor_per_kg / 100,
    }));
}
