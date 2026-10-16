// M11 rice requests through the same SMS registry as booking and selling.
import { todayManila } from "@/lib/dates";
import { registerCommand } from "@/modules/sms/registry";
import { buySmsSchema, buyAsk } from "./sms-schema";
import { parseBuyArgs, readBuyReply, smsBuyerDefaults } from "./logic";
import { buyBySms, validateBuyReading, describeRiceRequest } from "./queries";
registerCommand({
  keywords: ["BUY"],
  usage: "BUY 100 25/10",
  schema: buySmsSchema,
  parse: (args) => parseBuyArgs(args, todayManila()),
  handle: buyBySms,
  confirm: true,
  ai: {
    description:
      "A client wants to BUY MILLED RICE from IRPC (mabakal/bakal bugas). Not selling palay. Copy stated quantities and units; never assume sack weight. Ask for missing name and buyer type.",
    summary: describeRiceRequest,
    ask: buyAsk,
    maxAsks: 8,
    defaults: (ctx) => smsBuyerDefaults(ctx.client),
    validate: validateBuyReading,
    readReply: (text, fields) => readBuyReply(text, todayManila(), fields),
  },
});
