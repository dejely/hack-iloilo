// Shared, pure readers for buying/selling SMS. AI copies values; code converts.
import { z } from "zod";
import { addDays } from "./dates";

export const TRADE_MAX_KG = 200_000;
export const tradeWeightShape = {
  amount: z.number().positive().max(TRADE_MAX_KG),
  unit: z.enum(["kg", "sacks", "tons"]),
  kgPerSack: z.number().positive().max(TRADE_MAX_KG).optional(),
};
export type TradeWeight = {
  amount: number;
  unit: "kg" | "sacks" | "tons";
  kgPerSack?: number;
};
export function tradeKg({ amount, unit, kgPerSack }: TradeWeight): number {
  return (
    amount *
    (unit === "tons" ? 1000 : unit === "sacks" ? (kgPerSack ?? NaN) : 1)
  );
}
export function weightErrors(input: TradeWeight): string[] {
  if (input.unit === "sacks" && !input.kgPerSack) return ["kgPerSack"];
  const kg = tradeKg(input);
  return Number.isInteger(kg) && kg > 0 && kg <= TRADE_MAX_KG ? [] : ["amount"];
}
export const tradeWeightAsk = {
  amount:
    "Pila ang kadamuon? I-text ang numero kag unit, pareho sang 100 kg ukon 20 sako.",
  unit: "Kg, sako, ukon tons ang unit sang kadamuon mo?",
  kgPerSack:
    "Pila ka kg ang isa ka sako? Wala kami naga-assume sang timbang sang sako.",
};

const RELATIVE: Record<string, number> = {
  today: 0,
  subong: 0,
  karon: 0,
  ngayon: 0,
  tomorrow: 1,
  tmrw: 1,
  buas: 1,
  buwas: 1,
  bwas: 1,
  bukas: 1,
};
const WEEKDAYS = [
  ["domingo", "sunday", "sun"],
  ["lunes", "monday", "mon"],
  ["martes", "tuesday", "tue"],
  ["miyerkoles", "miyerkules", "wednesday", "wed"],
  ["huwebes", "thursday", "thu"],
  ["biyernes", "friday", "fri"],
  ["sabado", "saturday", "sat"],
];
/** Relative dates are resolved by code using Manila today, never by AI arithmetic. */
export function tradeDay(text: string, today: string): string | undefined {
  const explicit = text.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2})\b/g);
  if (explicit?.length)
    return new Set(explicit).size === 1 ? explicit[0] : undefined;
  const days = new Set<number>();
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (word in RELATIVE) days.add(RELATIVE[word]);
    const day = WEEKDAYS.findIndex((names) => names.includes(word));
    if (day >= 0) days.add(((day - weekday + 6) % 7) + 1);
  }
  return days.size === 1 ? addDays(today, [...days][0]) : undefined;
}
/** Read only labelled amounts (or a bare number when answering an amount question). */
export function readTradeValues(
  text: string,
  today: string,
  fields: readonly string[] = [],
): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  const clean = text.toLowerCase().trim();
  const n = "(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
  const amounts = [
    ...clean.matchAll(
      new RegExp(
        `(${n})(?:\\s+ka)?\\s*(kg|kgs|kilo(?:s)?|kilograms?|sako|sacks?|bags?|tons?|tonnes?)(?![a-z])`,
        "g",
      ),
    ),
  ];
  const perSack = clean.match(
    new RegExp(
      `(${n})\\s*(?:kg|kilos?)\\s*(?:per|/|kada|sa isa ka|ang isa ka)\\s*(?:sako|sack)`,
    ),
  );
  const negativeSack =
    !!perSack && clean.slice(0, perSack.index).trimEnd().endsWith("-");
  if (perSack)
    result.kgPerSack = negativeSack ? 0 : Number(perSack[1].replace(/,/g, ""));
  const amount = amounts.find((m) => m.index !== perSack?.index);
  if (amount) {
    const value = Number(amount[1].replace(/,/g, ""));
    const unit = /^(sako|sack|bag)/.test(amount[3])
      ? "sacks"
      : /^ton/.test(amount[3])
        ? "tons"
        : "kg";
    if (
      fields.includes("kgPerSack") &&
      !fields.includes("amount") &&
      amounts.length === 1 &&
      !perSack
    )
      result.kgPerSack = value;
    else {
      result.amount = value;
      result.unit = unit;
    }
  } else if (/^\d+(?:\.\d+)?$/.test(clean)) {
    if (fields.includes("kgPerSack")) result.kgPerSack = Number(clean);
    else if (fields.includes("mc")) result.mc = Number(clean);
    else if (fields.includes("amount")) {
      result.amount = Number(clean);
    }
  }
  if (!result.unit && /^(kg|kgs|kilos?|sako|sacks?|bags?|tons?)$/.test(clean))
    result.unit = /^(sako|sack|bag)/.test(clean)
      ? "sacks"
      : /^ton/.test(clean)
        ? "tons"
        : "kg";
  if (
    !negativeSack &&
    /-\s*\d+(?:,\d{3})*(?:\.\d+)?\s*(?:kg|kilos?|sako|sacks?|tons?)/i.test(
      clean,
    )
  )
    result.amount = 0;
  const statedAmounts = amounts.filter((m) => m.index !== perSack?.index);
  if (new Set(statedAmounts.map((m) => `${m[1]}:${m[3]}`)).size > 1)
    result.amount = 0;
  const statedDates = clean.match(
    /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2})\b/g,
  );
  if (statedDates && new Set(statedDates).size > 1) result.dayMonth = "";
  const day = tradeDay(clean, today);
  if (day) result.dayMonth = day;
  const mc = clean.match(/\b(\d+(?:[.,]\d+)?)\s*(?:%|percent|mc|moisture)/);
  if (mc)
    result.mc = clean.slice(0, mc.index).trimEnd().endsWith("-")
      ? 0
      : Number(mc[1].replace(",", "."));
  return Object.keys(result).length ? result : null;
}
/** Avoid non-GSM names/codes in the confirmation, preserving the stored value. */
export function smsLabel(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 .,'&-]/g, "?")
    .slice(0, 60);
}
