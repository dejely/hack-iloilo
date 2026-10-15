// Every outbound SMS text, filled with long values: GSM-7 and within one text.

import { describe, expect, it } from "vitest";
import {
  bookingAsk,
  bookingSms,
  cancelAsk,
  describeBookingRequest,
} from "@/modules/booking/logic";
import { buyingSms, formatVarietiesSms } from "@/modules/buying/logic";
import { NOT_IN_LINE_REPLY, queueStatusReply } from "@/modules/gate/logic";
import { orderSms } from "@/modules/orders/logic";
import { idleDraft } from "@/modules/prescriptions/logic";
import {
  aiConfirmText,
  fillQuestion,
  fillTemplate,
  helpText,
  isGsm7,
  SMS_MAX_CHARS,
  smsReplies,
} from "./logic";

const longVars = {
  ref: "K7P2QX",
  service: "milling",
  kg: "9,999,999",
  date: "Wed, Sep 30",
  newDate: "Wed, Sep 30",
  buy: "PHP 9,999.99",
  drying: "PHP 9,999.99",
  milling: "PHP 9,999.99",
  rice: "PHP 9,999.99",
  mc: "99.9",
  perKg: "PHP 9,999.99",
  total: ", 9,999,999 kg = PHP 99,999,999.99",
  code: "NSIC-RC999",
  variety: "NSIC-RC999",
};

const usages = [
  "BOOK DRY 1000 20/10 +2 (DRY or MILL, kg, day/month, flex days)",
  "CANCEL <ref>",
  "STATUS",
];

// Kept per module: spreading them into one object would drop shared keys.
const templates = Object.entries({
  bookingSms,
  buyingSms,
  orderSms,
  smsReplies,
}).flatMap(([group, replies]) =>
  Object.entries(replies).map(([key, template]): [string, string] => [
    `${group}.${key}`,
    fillTemplate(template, longVars),
  ]),
);

const texts: [string, string][] = [
  ...templates,
  ["help", helpText(usages)],
  ["help (AI)", helpText(usages, true)],
  [
    "AI confirm",
    aiConfirmText(
      describeBookingRequest({
        service: "milling",
        estKg: 9_999_999,
        dayMonth: "30/09",
        date: "2026-09-30",
        flexDays: 7,
      }),
    ),
  ],
  ["booking questions", fillQuestion(Object.keys(bookingAsk), bookingAsk)],
  ["cancel question", fillQuestion(Object.keys(cancelAsk), cancelAsk)],
  ["not in line", NOT_IN_LINE_REPLY],
  [
    "queue",
    queueStatusReply([
      { service: "drying", serving: false, position: 999 },
      { service: "milling", serving: true },
    ]),
  ],
  [
    "varieties",
    formatVarietiesSms(
      Array.from({ length: 80 }, (_, i) => `NSIC-RC${i}`),
      SMS_MAX_CHARS,
    ),
  ],
  [
    "idle",
    idleDraft("2026-12-28", "2027-01-03", {
      dryingMinorPerKg: 999_999,
      millingMinorPerKg: 999_999,
      buyBaseMinorPerKg: 999_999,
      buyReferenceMc: 25,
    }),
  ],
];

describe("outbound SMS texts", () => {
  it.each(texts)("%s is GSM-7 and fits", (_, text) => {
    expect(text).not.toMatch(/\{\w+\}/);
    expect(isGsm7(text)).toBe(true);
    expect(text.length).toBeLessThanOrEqual(SMS_MAX_CHARS);
  });
});
