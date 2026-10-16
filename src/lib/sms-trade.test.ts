import { describe, expect, it } from "vitest";
import {
  readTradeValues,
  tradeKg,
  weightErrors,
  tradeDay,
  smsLabel,
} from "./sms-trade";
const today = "2026-10-16";
describe("trade quantities and dates", () => {
  it("never assumes a sack weight or rounds fractional kg", () => {
    expect(weightErrors({ amount: 20, unit: "sacks" })).toEqual(["kgPerSack"]);
    expect(tradeKg({ amount: 20, unit: "sacks", kgPerSack: 42 })).toBe(840);
    expect(weightErrors({ amount: 1.5, unit: "kg" })).toEqual(["amount"]);
    expect(weightErrors({ amount: 201, unit: "tons" })).toEqual(["amount"]);
    expect(tradeKg({ amount: 1.5, unit: "tons" })).toBe(1500);
  });
  it("reads labelled amounts and separate sack weight without computing", () => {
    expect(readTradeValues("20 ka sako, 42 kg per sack", today)).toMatchObject({
      amount: 20,
      unit: "sacks",
      kgPerSack: 42,
    });
    expect(readTradeValues("3,000kg", today)).toMatchObject({
      amount: 3000,
      unit: "kg",
    });
    expect(readTradeValues("50", today, ["kgPerSack"])).toEqual({
      kgPerSack: 50,
    });
    expect(readTradeValues("42 kg", today, ["kgPerSack"])).toEqual({
      kgPerSack: 42,
    });
    expect(readTradeValues("50", today)).toBeNull();
    expect(readTradeValues("50", today, ["amount", "unit"])).toEqual({
      amount: 50,
    });
    expect(readTradeValues("-5 kg", today)).toMatchObject({ amount: 0 });
    expect(readTradeValues("- 50 kg per sack", today, ["kgPerSack"])).toEqual({
      kgPerSack: 0,
    });
    expect(readTradeValues("-23% moisture", today)).toEqual({ mc: 0 });
    expect(readTradeValues("23% 5,000 kg", today)).toMatchObject({
      mc: 23,
      amount: 5000,
      unit: "kg",
    });
  });
  it("uses Manila today for relative dates and refuses conflicting dates", () => {
    expect(tradeDay("buas", today)).toBe("2026-10-17");
    expect(tradeDay("sa Lunes", today)).toBe("2026-10-19");
    expect(tradeDay("today or tomorrow", today)).toBeUndefined();
    expect(tradeDay("20/10 or 21/10", today)).toBeUndefined();
    expect(readTradeValues("Oct 20", today)).toBeNull();
    expect(smsLabel("José 🍌")).toBe("Jose ??");
  });
});
