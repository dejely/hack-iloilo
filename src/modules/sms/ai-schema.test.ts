import { describe, expect, it } from "vitest";
import { z } from "zod";
import { bookingAiSchema } from "@/modules/booking/booking-schema";
import { bookingAsk } from "@/modules/booking/logic";
import { fillQuestion, missingFields } from "./logic";
import { optionalAiFields } from "./ai-schema";

describe("optional AI fields", () => {
  const schema = optionalAiFields(bookingAiSchema, Object.keys(bookingAsk));
  it("accepts the OpenRouter reading of pa dry ko palay and asks for its missing details", () => {
    const reading = schema.safeParse({
      service: "drying",
      flexDays: 0,
      amount: null,
      unit: "",
    });
    expect(reading.success).toBe(true);
    if (!reading.success) return;
    const booking = bookingAiSchema.safeParse(reading.data);
    expect(booking.success).toBe(false);
    if (booking.success) return;
    const missing = missingFields(
      booking.error.issues,
      Object.keys(bookingAsk),
    );
    expect(missing).toEqual(
      expect.arrayContaining(["amount", "unit", "dayMonth"]),
    );
    const question = fillQuestion(missing!, bookingAsk);
    expect(question).toContain(bookingAsk.amount);
    expect(question).toContain(bookingAsk.dayMonth);
    expect(question.split(bookingAsk.amount)).toHaveLength(2);
  });
  it("keeps complete valid readings", () => {
    const input = {
      service: "drying",
      flexDays: 0,
      amount: 20,
      unit: "sacks",
      dayMonth: "20/10",
    };
    expect(schema.parse(input)).toEqual(input);
  });
  it("does not relax supplied invalid values or required fields", () => {
    expect(
      schema.safeParse({ service: "drying", flexDays: 0, amount: -1 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ service: "drying", flexDays: 0, unit: "tons" })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ service: "drying", flexDays: null }).success,
    ).toBe(false);
  });
  it("supports a follow-up schema containing only the missing fields", () => {
    const followup = optionalAiFields(
      bookingAiSchema,
      ["amount", "unit"],
      true,
    );
    expect(followup.parse({ amount: null, unit: "" })).toEqual({
      amount: null,
      unit: "",
    });
    expect(
      followup.parse({ amount: 20, unit: "sacks", service: "milling" }),
    ).toEqual({ amount: 20, unit: "sacks" });
  });
  it("leaves other object fields and non-object schemas unchanged", () => {
    const plain = z.object({ n: z.number() });
    expect(optionalAiFields(plain, []).safeParse({ n: null }).success).toBe(
      false,
    );
    const text = z.string();
    expect(optionalAiFields(text, ["n"])).toBe(text);
  });
});
