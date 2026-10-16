import { z } from "zod";
import { tradeWeightShape } from "@/lib/sms-trade";
import type { Database } from "@/lib/supabase/database.types";
export const smsBuyerTypes = [
  "wholesaler",
  "retailer",
  "institutional",
  "cooperative",
  "drop_point",
  "subsidy_program",
] as const satisfies readonly Database["public"]["Enums"]["buyer_type"][];
export const buySmsSchema = z.object({
  ...tradeWeightShape,
  dayMonth: z
    .string()
    .min(1)
    .max(20)
    .describe("Rice pickup date as stated. Never invent a date."),
  name: z.string().trim().min(1).max(100).optional(),
  buyerType: z.enum(smsBuyerTypes).optional(),
});
export type BuySmsInput = z.infer<typeof buySmsSchema>;
export const buyAsk = {
  amount: "Pila ka bugas? I-text ang kadamuon kag unit, pareho sang 100 kg.",
  unit: "Kg, sako, ukon tons ang unit sang bugas mo?",
  kgPerSack: "Pila ka kg ang isa ka sako sang bugas?",
  dayMonth:
    "San-o kuhaon ang bugas? I-text ang petsa subong ukon sa sulod sang 30 ka adlaw, pareho sang 25/10.",
  name: "Ano ang ngalan mo ukon sang imo tindahan? I-text NAME <ngalan>.",
  buyerType:
    "Ano nga buyer ka? wholesaler, retailer, institutional, cooperative, drop_point, ukon subsidy_program?",
};
