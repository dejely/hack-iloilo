import { z } from "zod";
import { normalizePhone } from "@/modules/accounts/logic";
import { cleanRef, MAX_FLEX_DAYS, services } from "./logic";

/** Staff booking form. Past dates are checked on the server against Manila today. */
export const bookingSchema = z.object({
  clientId: z.guid("Choose a client."),
  service: z.enum(services, "Choose drying or milling."),
  estKg: z
    .number("Enter the estimated kg.")
    .int("Enter whole kilograms.")
    .positive("Enter more than 0 kg."),
  preferredDate: z.iso.date("Choose a preferred date."),
  flexDays: z
    .number("Enter flex days.")
    .int("Enter whole days.")
    .min(0, "Flex days can't be negative.")
    .max(MAX_FLEX_DAYS, `Flex days can be at most ${MAX_FLEX_DAYS}.`),
});
export type BookingInput = z.infer<typeof bookingSchema>;

const phoneSchema = z
  .string()
  .refine(
    (value) => normalizePhone(value) !== null,
    "Enter a valid Philippine mobile number.",
  );

/** Public web booking: the client enters their own name and phone instead of picking a client. */
export const webBookingSchema = bookingSchema.omit({ clientId: true }).extend({
  name: z.string().trim().min(1, "Enter your name."),
  phone: phoneSchema,
});
export type WebBookingInput = z.infer<typeof webBookingSchema>;

/** SMS date resolution belongs to the shared SMS core. */
export const bookingSmsSchema = bookingSchema
  .pick({ service: true, estKg: true, flexDays: true })
  .extend({
    dayMonth: z
      .string()
      .regex(/^\d{1,2}\/\d{1,2}$/)
      .describe("Preferred day as day/month, e.g. 20/10"),
  });
export type BookingSmsInput = z.infer<typeof bookingSmsSchema>;

/** A free-text booking as AI reads it: the amount as stated, converted by `bookingFromAi`. */
export const bookingAiSchema = bookingSmsSchema.omit({ estKg: true }).extend({
  amount: z.number().positive().describe("The amount exactly as stated"),
  unit: z
    .enum(["kg", "sacks"])
    .describe("The unit stated: kg, or sacks (sako)"),
});

export const cancelSmsSchema = z.object({
  ref: z.string().regex(/^[A-Z0-9]{6}$/),
});

export const moveSmsSchema = cancelSmsSchema.extend({
  dayMonth: bookingSmsSchema.shape.dayMonth,
  // The shared move action returns a clear message for out-of-range flex.
  flexDays: z.number().int().optional(),
});
export type MoveSmsInput = z.infer<typeof moveSmsSchema>;

export const moveBookingSchema = cancelSmsSchema.extend({
  date: bookingSchema.shape.preferredDate,
  flexDays: bookingSchema.shape.flexDays,
});
export type MoveBookingInput = z.infer<typeof moveBookingSchema>;

/** Public /track: the booking ref (spaces and dashes allowed) and the client's or booker's phone. */
export const trackLookupSchema = z.object({
  ref: z
    .string()
    .refine(
      (value) => /^[A-Z0-9]{6}$/.test(cleanRef(value)),
      "Enter the 6-character code from your text.",
    ),
  phone: phoneSchema,
});
export type TrackLookupInput = z.infer<typeof trackLookupSchema>;

export const trackMoveSchema = trackLookupSchema.extend({
  date: bookingSchema.shape.preferredDate,
  flexDays: bookingSchema.shape.flexDays,
});
export type TrackMoveInput = z.infer<typeof trackMoveSchema>;

export const trackAnswerSchema = trackLookupSchema.extend({ yes: z.boolean() });
