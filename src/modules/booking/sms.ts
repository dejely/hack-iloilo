// M4. Booking: SMS commands. Reply texts are `bookingSms` in logic.ts.

import { todayManila } from "@/lib/dates";
import { parseDayMonth } from "@/modules/sms/logic";
import { onPromptAnswer, registerCommand } from "@/modules/sms/registry";
import {
  bookingAiSchema,
  bookingSmsSchema,
  cancelSmsSchema,
  moveSmsSchema,
} from "./booking-schema";
import {
  bookingAsk,
  bookingFromAi,
  cancelAsk,
  cleanRef,
  describeBookingRequest,
  parseBookingArgs,
  parseMoveArgs,
  readBookingReply,
} from "./logic";
import { answerReschedule, bookBySms, cancelBySms, moveBySms } from "./queries";

registerCommand({
  keywords: ["BOOK"],
  usage: "BOOK DRY 1000 20/10 +2 (DRY or MILL, kg, day/month, flex days)",
  schema: bookingSmsSchema,
  parse: parseBookingArgs,
  handle: bookBySms,
  ai: {
    description:
      "Book a drying or milling slot. flexDays: how many days earlier or later the client can come (0 if not stated).",
    input: { schema: bookingAiSchema, toArgs: bookingFromAi },
    summary: (cmd) =>
      describeBookingRequest({
        ...cmd,
        date: parseDayMonth(cmd.dayMonth, todayManila()),
      }),
    ask: bookingAsk,
    readReply: readBookingReply,
  },
});

registerCommand({
  keywords: ["CANCEL"],
  usage: "CANCEL <code>",
  schema: cancelSmsSchema,
  parse: (args) => (args.length === 1 ? { ref: args[0].toUpperCase() } : null),
  handle: cancelBySms,
  ai: {
    description: "Cancel a booking by its 6-character code.",
    summary: ({ ref }) => `i-cancel ang booking ${ref}`,
    ask: cancelAsk,
    readReply: (text) => {
      const ref = text
        .split(/\s+/)
        .map(cleanRef)
        .find((t) => /^[A-Z0-9]{6}$/.test(t));
      return ref ? { ref } : null;
    },
  },
});

registerCommand({
  keywords: ["MOVE"],
  usage: "MOVE <code> <dd/mm> [+days]",
  schema: moveSmsSchema,
  parse: parseMoveArgs,
  handle: moveBySms,
});

onPromptAnswer("reschedule", answerReschedule);
