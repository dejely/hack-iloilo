import { z } from "zod";
import { tradeWeightShape } from "@/lib/sms-trade";
export const sellAiSchema = z.object({
  ...tradeWeightShape,
  varietyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,20}$/),
  dayMonth: z
    .string()
    .min(1)
    .max(20)
    .describe(
      "Harvest date as stated, NOT delivery or appointment date; never invent a date.",
    ),
});
export const quoteAiSchema = z.object({
  mc: z.number().positive().max(99.9),
  amount: tradeWeightShape.amount.optional(),
  unit: tradeWeightShape.unit.optional(),
  kgPerSack: tradeWeightShape.kgPerSack,
});
export const sellAsk = {
  amount: "Pila ka palay? I-text ang kadamuon kag unit, pareho sang 1000 kg.",
  unit: "Kg, sako, ukon tons ang unit sang palay mo?",
  kgPerSack: "Pila ka kg ang isa ka sako sang palay?",
  varietyCode:
    "Ano ang variety code sang palay? I-text ang VARIETIES para sa listahan.",
  dayMonth:
    "San-o ang harvest? I-text ang petsa subong ukon sa masunod, pareho sang 25/10. Indi ini delivery date.",
};
export const quoteAsk = {
  mc: "Pila ang moisture content (MC) sang palay? Pareho sang 23%.",
  amount: sellAsk.amount,
  unit: sellAsk.unit,
  kgPerSack: sellAsk.kgPerSack,
};
