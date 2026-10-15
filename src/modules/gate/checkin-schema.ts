import { z } from "zod";
import { clientKinds, normalizePhone } from "@/modules/accounts/logic";
import { normalizeRef, ownerships, REF_LENGTH, services } from "./logic";

export const checkInModes = ["booking", "offer", "phone", "walkIn"] as const;

/**
 * Gate check-in by booking or offer ref, by phone, or as a walk-in registered
 * on the spot. Flat so one form covers every mode; each mode checks its fields.
 */
export const checkInSchema = z
  .object({
    mode: z.enum(checkInModes),
    ref: z.string(),
    phone: z.string(),
    service: z.enum(services, "Choose drying or milling."),
    ownership: z.enum(ownerships, "Choose custom service or selling to IRPC."),
    estKg: z
      .number("Enter the estimated kg.")
      .int("Enter whole kilograms.")
      .positive("Enter more than 0 kg.")
      .nullable(),
    name: z.string().trim(),
    kind: z.enum(clientKinds),
    municipality_id: z.guid().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "booking" || value.mode === "offer") {
      if (normalizeRef(value.ref).length !== REF_LENGTH)
        ctx.addIssue({
          code: "custom",
          path: ["ref"],
          message: `Enter the ${REF_LENGTH}-character code.`,
        });
      return;
    }
    if (normalizePhone(value.phone) === null)
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Enter a valid Philippine mobile number.",
      });
    if (value.mode === "walkIn" && value.name.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Enter the client's name.",
      });
  });
export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckInMode = CheckInInput["mode"];
