// M5. Buying: Quotes, sell offers, purchases. See TRD.md.
// SMS commands owned by this module, registered with M3.

import { todayManila } from "@/lib/dates";
import { formatKg } from "@/lib/format";
import { readTradeValues } from "@/lib/sms-trade";
import { sellAiSchema, quoteAiSchema, sellAsk, quoteAsk } from "./sms-schema";
import { z } from "zod";
import { registerCommand } from "@/modules/sms/registry";
import {
  readSellReply,
  parseQuoteArgs,
  parseSellArgs,
  quoteSmsSchema,
  sellSmsSchema,
} from "./logic";
import {
  priceBySms,
  quoteBySms,
  sellBySms,
  varietiesBySms,
  validateSellReading,
  validateQuoteReading,
  sellReadingArgs,
  quoteReadingArgs,
} from "./queries";

registerCommand({
  keywords: ["PRICE", "PRICES", "PRESYO", "PRESIO"],
  schema: z.object({}),
  // Trailing words are ignored ("PRICE today").
  parse: () => ({}),
  handle: priceBySms,
  ai: {
    description:
      "Read today's IRPC prices for rice buying, palay selling, drying or milling. Read-only; does not create a purchase, offer or rice request.",
  },
});

registerCommand({
  keywords: ["QUOTE"],
  usage: "QUOTE 14% 1000",
  schema: quoteSmsSchema,
  parse: parseQuoteArgs,
  handle: quoteBySms,
  ai: {
    description:
      "Estimate the price IRPC would pay for a farmer's palay at a stated moisture content. This is NOT buying rice. Copy the stated amount and unit, never assume sack weight or calculate kg.",
    input: { schema: quoteAiSchema, toArgs: quoteReadingArgs },
    ask: quoteAsk,
    maxAsks: 5,
    validate: validateQuoteReading,
    readReply: (text, fields) => readTradeValues(text, todayManila(), fields),
  },
});

registerCommand({
  keywords: ["SELL", "BALIGYA", "IBALIGYA"],
  usage: "SELL 1000 RC222 25/10",
  schema: sellSmsSchema,
  parse: parseSellArgs,
  handle: sellBySms,
  ai: {
    description:
      "A farmer offers to SELL PALAY to IRPC (baligya/ibaligya palay). Not buying rice. Copy amounts and units; never assume sack weight. Ask for harvest date if only a delivery/pickup date was stated.",
    input: { schema: sellAiSchema, toArgs: sellReadingArgs },
    summary: (cmd) =>
      `magbaligya sang ${formatKg(cmd.estKg)} ${cmd.varietyCode}, harvest sa ${cmd.dayMonth}`,
    ask: sellAsk,
    maxAsks: 8,
    validate: validateSellReading,
    readReply: (text, fields) => readSellReply(text, todayManila(), fields),
  },
});

registerCommand({
  keywords: ["VARIETIES", "VARIETY"],
  schema: z.object({}),
  // Trailing words are ignored ("VARIETIES please").
  parse: () => ({}),
  handle: varietiesBySms,
  ai: {
    description:
      "Read the available palay variety codes for a sell offer. Read-only.",
  },
});
