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
  describeBookingRequest,
  parseBookingArgs,
  parseMoveArgs,
  readBookingReply,
  readRef,
  SERVICE_KEYWORDS,
  serviceOf,
} from "./logic";
import { answerReschedule, bookBySms, cancelBySms, moveBySms } from "./queries";

registerCommand({
  // "MILL 1000 20/10" without BOOK: the keyword is the service.
  keywords: [
    "BOOK",
    "BOOKING",
    "PABOOK",
    "RESERVE",
    "RESERBA",
    ...SERVICE_KEYWORDS,
  ],
  usage: "BOOK DRY 1000 20/10 +2 (DRY or MILL, kg, day/month, flex days)",
  schema: bookingSmsSchema,
  parse: (args, keyword) =>
    parseBookingArgs(serviceOf(keyword) ? [keyword, ...args] : args),
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
    readReply: (text) => readBookingReply(text, todayManila()),
  },
});

registerCommand({
  keywords: ["CANCEL", "KANSELA", "KANSEL", "ICANCEL"],
  usage: "CANCEL <code>",
  schema: cancelSmsSchema,
  parse: (args) => {
    const ref = readRef(args);
    return ref ? { ref } : null;
  },
  handle: cancelBySms,
  ai: {
    description: "Cancel a booking by its 6-character code.",
    summary: ({ ref }) => `i-cancel ang booking ${ref}`,
    ask: cancelAsk,
    readReply: (text) => {
      const ref = readRef(text.split(/\s+/).filter(Boolean));
      return ref ? { ref } : null;
    },
  },
});

registerCommand({
  keywords: ["MOVE", "SAYLO", "ISAYLO", "RESCHED", "RESCHEDULE"],
  usage: "MOVE <code> <dd/mm> [+days]",
  schema: moveSmsSchema,
  parse: parseMoveArgs,
  handle: moveBySms,
});

onPromptAnswer("reschedule", answerReschedule);
