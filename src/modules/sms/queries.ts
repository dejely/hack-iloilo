// M3. SMS: Sending, receiving and parsing texts; command registry. See TRD.md.
// Server-side reads. May call other modules' queries.

import "server-only";
import { z } from "zod";
import { optionalAiFields } from "./ai-schema";
import { aiEnabled, extract } from "@/lib/ai";
import { newRef } from "@/lib/ref";
import { smsGateway } from "@/lib/sms";
import { db } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { normalizePhone } from "@/modules/accounts/logic";
import {
  findClientByPhone,
  findOrRegisterByPhone,
} from "@/modules/accounts/queries";
import {
  aiConfirmText,
  fillQuestion,
  fillTemplate,
  helpText,
  INBOUND_WINDOW_MINUTES,
  inboundAllowance,
  isGsm7,
  isHelp,
  MAX_AI_CHARS,
  MAX_FILL_ASKS,
  mergeFill,
  missingFields,
  normalizeBody,
  omitFields,
  parseAnswer,
  parseInbound,
  SMS_MAX_CHARS,
  smsReplies,
  type ParsedInbound,
} from "./logic";
import {
  aiCommands,
  commandUsages,
  findCommand,
  onPromptAnswer,
  promptHandler,
  PromptRefusal,
  type Command,
  type CommandContext,
  type SmsPrompt,
  type SmsPromptKind,
} from "./registry";

// Command registrations: each module's `sms.ts` calls `registerCommand()`.
import "@/modules/booking/sms";
import "@/modules/buying/sms";
import "@/modules/orders/sms";
import "@/modules/gate/sms";
import "@/modules/pricing/sms";

export type SmsMessage = Database["public"]["Tables"]["sms_messages"]["Row"];

/** Fills `{name}` and `vars`, logs to `sms_messages` and sends via the gateway. */
export async function send(
  phone: string,
  template: string,
  vars: Record<string, string | number> = {},
): Promise<void> {
  const filled = { ...vars };
  if (template.includes("{name}") && filled.name === undefined)
    filled.name = (await findClientByPhone(phone))?.name ?? "there";
  const body = fillTemplate(template, filled);
  if (body.length > SMS_MAX_CHARS || !isGsm7(body))
    console.warn(`[sms] not GSM-7 or over ${SMS_MAX_CHARS} chars:`, body);

  const { data: row, error } = await db()
    .from("sms_messages")
    .insert({ direction: "outbound", phone, body, status: "queued" })
    .select("id")
    .single();
  if (error) throw error;

  try {
    const { id } = await smsGateway().send(phone, body);
    await update(row.id, { status: "sent", gateway_id: id });
  } catch (error) {
    console.error("[sms] send failed", error);
    await update(row.id, { status: "failed" });
  }
}

/**
 * Opens a yes/no prompt, answered within 24 h by a plain yes or no (the
 * sender's latest prompt) or `YES <ref>` / `NO <ref>`.
 * Returns the ref. Passing a ref (e.g. a booking's) replaces its open prompt.
 */
export async function openPrompt({
  phone,
  kind,
  payload,
  ref,
}: {
  phone: string;
  kind: SmsPromptKind;
  payload: Json;
  ref?: string;
}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const candidate = (ref ?? newRef()).toUpperCase();
    if (ref) await expirePrompt(candidate);
    const { error } = await db()
      .from("sms_prompts")
      .insert({ phone, kind, payload: payload ?? {}, ref: candidate });
    if (!error) return candidate;
    // A random ref collided with another open prompt: draw again.
    if (error.code !== "23505" || ref || attempt >= 3) throw error;
  }
}

/** Closes the open prompt under `ref`, if any, so a late answer is ignored. */
export async function expirePrompt(ref: string): Promise<void> {
  const { error } = await db()
    .from("sms_prompts")
    .update({ status: "expired" })
    .eq("ref", ref.toUpperCase())
    .eq("status", "open");
  if (error) throw error;
}

/** Shared by the simulator and the webhook relay. Dedupes on `gatewayId`. */
export async function handleInbound({
  phone,
  body,
  gatewayId,
}: {
  phone: string;
  body: string;
  gatewayId?: string;
}): Promise<void> {
  const { data, error } = await db()
    .from("sms_messages")
    .insert({
      direction: "inbound",
      phone,
      body,
      gateway_id: gatewayId ?? null,
      status: "received",
    })
    .select("id")
    .single();
  if (error?.code === "23505") return;
  if (error) throw error;
  await processInbound(data.id);
}

/** Inbound texts from a phone (raw or normalized) in the flood window. */
async function recentInboundCount(phones: string[]): Promise<number> {
  const since = new Date(
    Date.now() - INBOUND_WINDOW_MINUTES * 60_000,
  ).toISOString();
  const { count, error } = await db()
    .from("sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .in("phone", [...new Set(phones)])
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

/** Routes a logged inbound text once and sends the reply. */
export async function processInbound(id: string): Promise<void> {
  // Claim the row so retries and duplicate relays process it once.
  const { data: message, error } = await db()
    .from("sms_messages")
    .update({ status: "processed" })
    .eq("id", id)
    .eq("direction", "inbound")
    .eq("status", "received")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!message) return;

  const phone = normalizePhone(message.phone);
  const parsed = parseInbound(message.body);
  if (!phone) {
    // Network shortcodes and foreign numbers get no reply.
    console.warn("[sms] ignored text from", message.phone);
    await update(id, { parsed: toJson(parsed) });
    return;
  }

  const allowance = inboundAllowance(
    await recentInboundCount([message.phone, phone]),
  );
  if (allowance !== "ok") {
    console.warn("[sms] over the inbound limit:", phone);
    await update(id, { phone, parsed: toJson(parsed) });
    if (allowance === "warn") await send(phone, smsReplies.slowDown);
    return;
  }

  let reply: string;
  try {
    const client = await findOrRegisterByPhone(phone);
    const body = normalizeBody(message.body);
    const routed = await route(parsed, body, { phone, client });
    reply = routed.reply;
    await update(id, {
      phone,
      parsed: toJson(parsed),
      via_ai: routed.viaAi ?? false,
    });
  } catch (error) {
    console.error("[sms] inbound failed", error);
    await update(id, { phone, parsed: toJson(parsed), status: "failed" });
    reply = smsReplies.error;
  }
  if (reply) await send(phone, reply);
}

async function route(
  parsed: ParsedInbound,
  body: string,
  ctx: CommandContext,
): Promise<{ reply: string; viaAi?: boolean }> {
  const answer = parseAnswer(parsed);
  if (answer) {
    // A plain NO drops a pending follow-up question; it isn't a yes/no prompt.
    if (!answer.yes && !answer.ref) {
      const fill = await latestOpenFill(ctx.phone);
      if (fill && (await setPromptStatus(fill.id, "open", "declined")))
        return { reply: smsReplies.aiDeclined };
    }
    return { reply: await answerPrompt(answer, ctx) };
  }

  const command = findCommand(parsed.keyword);
  const activeFill = await latestOpenFill(ctx.phone);
  if (activeFill && body.length > MAX_AI_CHARS)
    return { reply: smsReplies.tooLong };
  if (
    activeFill?.payload &&
    (activeFill.payload as FillPayload).keyword === "CLARIFY" &&
    !isHelp(parsed.keyword)
  )
    return continueFill(activeFill, body, ctx);
  if (!command) {
    if (isHelp(parsed.keyword)) return { reply: help(aiEnabled()) };
    // A wall of text is not a request; it also keeps AI costs bounded.
    if (body.length > MAX_AI_CHARS) return { reply: smsReplies.tooLong };
    if (activeFill) return continueFill(activeFill, body, ctx);
    const pending = await latestOpenPrompt(ctx.phone);
    if (pending?.kind === "ai_confirm") {
      const old = pending.payload as { keyword: string };
      const owner = findCommand(old.keyword);
      const correction =
        owner?.ai?.readReply?.(body) ||
        parseAnswer({ keyword: parsed.keyword, args: [] }) ||
        /\b(change|instead|actually|gali|ilisan|pero)\b/i.test(body);
      if (correction) return reviseConfirmation(pending, body, ctx);
      await setPromptStatus(pending.id, "open", "expired");
    }
    return interpret(body, ctx);
  }
  // A keyword starts over, so a pending follow-up question no longer applies.
  if (command.ai?.summary || command.confirm || !command.ai)
    await closePrompts(ctx.phone, ["ai_fill", "ai_confirm"]);
  const reply = await runKeyword(command, parsed, ctx);
  if (reply !== null) return { reply };
  // A keyword with words AI can read, e.g. "BOOK dry 20 sako sa Lunes".
  if (command.ai && aiEnabled() && body.length <= MAX_AI_CHARS)
    return interpret(body, ctx);
  return { reply: helpText([command.usage ?? parsed.keyword]) };
}

/** Runs a keyword command; null when its args don't parse. */
async function runKeyword(
  command: Command<unknown>,
  parsed: ParsedInbound,
  ctx: CommandContext,
): Promise<string | null> {
  let forPhone: string | undefined;
  if (parsed.forPhone) {
    const normalized = normalizePhone(parsed.forPhone);
    if (!normalized) return help();
    forPhone = normalized;
  }

  let args: unknown;
  try {
    args = command.parse(parsed.args, parsed.keyword);
  } catch {
    return null;
  }
  const result = command.schema.safeParse(args);
  if (!result.success) return null;
  if (command.confirm) {
    if (forPhone && forPhone !== ctx.phone)
      return "IRPC: Ang BUY para sa imo kaugalingon nga number lang. Palihog indi gamiton ang FOR.";
    return beginReading(command, command.keywords[0], result.data, ctx);
  }
  return command.handle(result.data, { ...ctx, forPhone });
}

/** An AI reading in the command's own args shape; code does any conversion. */
function fromAi(command: Command<unknown>, args: unknown): unknown {
  const input = command.ai?.input;
  if (!input) return args;
  const read = input.schema.safeParse(args);
  return read.success ? input.toArgs(read.data) : null;
}

/** What the AI fills in for a command. */
const aiSchema = (command: Command<unknown>): z.ZodType<unknown> =>
  command.ai?.input?.schema ?? command.schema;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validate conditional fields and server-side references before asking to save. */
async function checkReading(
  command: Command<unknown>,
  args: unknown,
  ctx: CommandContext,
) {
  const defaults = command.ai?.defaults?.(ctx) ?? {};
  const values = isRecord(args)
    ? {
        ...defaults,
        ...Object.fromEntries(
          Object.entries(args).filter(
            ([, v]) => v !== undefined && v !== null && v !== "",
          ),
        ),
      }
    : args;
  const reading = aiSchema(command).safeParse(values);
  const fields = Object.keys(command.ai?.ask ?? {});
  const missing = reading.success
    ? ((await command.ai?.validate?.(reading.data, ctx)) ?? [])
    : missingFields(reading.error.issues, fields);
  return { reading, missing, args: values };
}

async function beginReading(
  command: Command<unknown>,
  keyword: string,
  args: unknown,
  ctx: CommandContext,
): Promise<string> {
  const checked = await checkReading(command, args, ctx);
  if (checked.reading.success && !checked.missing?.length)
    return finishAi(command, keyword, checked.reading.data, ctx);
  if (!checked.missing?.length || !isRecord(checked.args)) return help(true);
  await closePrompts(ctx.phone, ["ai_fill", "ai_confirm"]);
  await openPrompt({
    phone: ctx.phone,
    kind: "ai_fill",
    payload: {
      keyword,
      args: omitFields(checked.args, checked.missing),
      missing: checked.missing,
      asks: 1,
    } as Json,
  });
  return fillQuestion(checked.missing, command.ai?.ask ?? {});
}

/**
 * Reads free text as a command with AI. Missing values are asked for first;
 * commands with a summary ask to confirm and run on a yes. AI failure gets
 * the help reply.
 */
async function interpret(
  body: string,
  ctx: CommandContext,
  context?: string,
): Promise<{ reply: string; viaAi?: boolean }> {
  const commands = aiCommands();
  if (!aiEnabled() || !commands.length) return { reply: help() };

  const options = commands.map(({ keyword, command }) =>
    z
      .object({
        command: z.literal(keyword),
        args: optionalAiFields(
          aiSchema(command),
          Object.keys(command.ai!.ask ?? {}),
        ),
      })
      .describe(command.ai!.description),
  );
  const clarify = z
    .object({ command: z.literal("CLARIFY") })
    .describe(
      "Buying versus selling or rice versus palay is unclear. Do not guess the direction or product.",
    );
  const none = z
    .object({ command: z.literal("NONE") })
    .describe("The text matches none of the other commands.");
  const intent = await extract(
    z.object({ intent: z.union([none, clarify, ...options]) }),
    context ? `${context}\nClient clarification: ${body}` : body,
  );
  // AI down or timed out: fall back to the keyword formats.
  if (!intent) return { reply: help() };
  if (intent.intent.command === "NONE") return { reply: help(true) };
  if (intent.intent.command === "CLARIFY") {
    await closePrompts(ctx.phone, ["ai_confirm", "ai_fill"]);
    await openPrompt({
      phone: ctx.phone,
      kind: "ai_fill",
      payload: {
        keyword: "CLARIFY",
        args: { text: body },
        missing: ["direction"],
        asks: 1,
      },
    });
    return { reply: tradeClarification, viaAi: true };
  }

  const { command: keyword, args: read } = intent.intent as {
    command: string;
    args: unknown;
  };
  const command = findCommand(keyword);
  if (!command?.ai) return { reply: help(true) };

  // Code reads plain values too and wins: models miss or misread local
  // words ("pa galing" is milling, not drying), and code never guesses.
  const ask = command.ai.ask ?? {};
  const args = isRecord(read)
    ? mergeFill(read, command.ai.readReply?.(body), Object.keys(ask))
    : read;
  return {
    reply: await beginReading(command, keyword, args, ctx),
    viaAi: true,
  };
}

/** Runs a complete AI reading, asking to confirm first when it has a summary. */
async function finishAi(
  command: Command<unknown>,
  keyword: string,
  reading: unknown,
  ctx: CommandContext,
): Promise<string> {
  const valid = command.schema.safeParse(fromAi(command, reading));
  if (!valid.success || !command.ai) return help(true);

  const { summary } = command.ai;
  if (!summary) return command.handle(valid.data, ctx);
  await closePrompts(ctx.phone, ["ai_confirm"]);
  await openPrompt({
    phone: ctx.phone,
    kind: "ai_confirm",
    payload: { keyword, args: valid.data as Json, reading: reading as Json },
  });
  return aiConfirmText(summary(valid.data));
}

/** Partial AI reading waiting for the sender's missing values. */
type FillPayload = {
  keyword: string;
  args: Record<string, unknown>;
  missing: string[];
  asks: number;
};

/**
 * Merges a reply into a pending AI reading: code reads plain values, AI the
 * rest, and code wins where both read one. Asks again while values are
 * missing, up to `MAX_FILL_ASKS`, then gives up with the help reply. A reply
 * AI reads no missing value from is taken as a new request.
 */
async function continueFill(
  prompt: SmsPrompt,
  body: string,
  ctx: CommandContext,
): Promise<{ reply: string; viaAi?: boolean }> {
  const { keyword, args, missing, asks } = prompt.payload as FillPayload;
  if (keyword === "CLARIFY") {
    if (!(await setPromptStatus(prompt.id, "open", "accepted")))
      return { reply: smsReplies.alreadyAnswered };
    if (!aiEnabled()) return { reply: help() };
    return interpret(body, ctx, `Original message: ${String(args.text)}`);
  }
  const command = findCommand(keyword);
  if (!command?.ai) {
    await setPromptStatus(prompt.id, "open", "expired");
    return { reply: help(true) };
  }
  const ask = command.ai.ask ?? {};

  let read = command.ai.readReply?.(body, missing) ?? null;
  let viaAi = false;
  if (!missing.every((f) => read?.[f] != null) && aiEnabled()) {
    const extracted = await extract(
      optionalAiFields(aiSchema(command), missing, true),
      `IRPC asked: "${fillQuestion(missing, ask)}"\nClient replied: "${body}"`,
    );
    viaAi = true;
    if (isRecord(extracted)) {
      read = { ...extracted, ...read };
      if (!missing.some((f) => read?.[f] != null)) {
        // Not an answer, e.g. a new question: drop the fill and start over.
        await setPromptStatus(prompt.id, "open", "expired");
        return interpret(body, ctx);
      }
    }
  }

  // Include explicit corrections to previously supplied fields as well.
  const merged = mergeFill(args, read, Object.keys(ask));
  const checked = await checkReading(command, merged, ctx);
  const { reading } = checked;
  if (reading.success && !checked.missing?.length) {
    if (!(await setPromptStatus(prompt.id, "open", "accepted")))
      return { reply: smsReplies.alreadyAnswered, viaAi };
    return {
      reply: await finishAi(command, keyword, reading.data, ctx),
      viaAi,
    };
  }

  const still = checked.missing;
  if (!still || asks >= (command.ai.maxAsks ?? MAX_FILL_ASKS)) {
    await setPromptStatus(prompt.id, "open", "expired");
    return { reply: help(true), viaAi };
  }
  const payload: FillPayload = {
    keyword,
    args: omitFields(merged, still),
    missing: still,
    asks: asks + 1,
  };
  const { error } = await db()
    .from("sms_prompts")
    .update({ payload: payload as NonNullable<Json> })
    .eq("id", prompt.id)
    .eq("status", "open");
  if (error) throw error;
  return { reply: fillQuestion(still, ask), viaAi };
}

const tradeClarification =
  "IRPC: Gusto mo magbakal sang bugas ukon magbaligya sang palay? Palihog isugid ang produkto kag kon bakal ukon baligya.";

/** A qualified answer edits the reading; it never answers the old confirmation. */
async function reviseConfirmation(
  prompt: SmsPrompt,
  body: string,
  ctx: CommandContext,
): Promise<{ reply: string; viaAi?: boolean }> {
  const payload = prompt.payload as {
    keyword: string;
    args: Json;
    reading?: Json;
  };
  const command = findCommand(payload.keyword);
  if (!command?.ai) return { reply: help() };
  const fields = Object.keys(command.ai.ask ?? {});
  let changes = command.ai.readReply?.(body, fields) ?? null;
  let viaAi = false;
  if (aiEnabled()) {
    const correction = await extract(
      z.object({
        action: z.enum(["correct", "new", "unclear"]),
        changes: optionalAiFields(aiSchema(command), fields),
      }),
      `Pending request: ${JSON.stringify(payload.reading ?? payload.args)}. Client replied: ${body}. Extract only explicitly changed fields. Use new for a different intent/product or unrelated request; unclear if there is no clear correction. Never treat qualified yes/no as approval.`,
    );
    viaAi = true;
    if (correction?.action === "new") {
      await setPromptStatus(prompt.id, "open", "expired");
      return interpret(body, ctx);
    }
    if (correction?.action === "correct" && isRecord(correction.changes))
      changes = { ...correction.changes, ...changes };
    else if (correction?.action === "unclear") changes = null;
  }
  if (!changes || !Object.keys(changes).length)
    return {
      reply:
        "IRPC: Palihog YES ukon NO lang kon husto ang detalye. Kon may bag-o nga detalye, isugid ang gusto mo ilisan.",
      viaAi,
    };
  if (!(await setPromptStatus(prompt.id, "open", "expired")))
    return { reply: smsReplies.alreadyAnswered, viaAi };
  const old = payload.reading ?? payload.args;
  const merged = isRecord(old) ? mergeFill(old, changes, fields) : changes;
  // A changed unit invalidates the old per-sack assumption.
  if (
    isRecord(merged) &&
    changes.unit &&
    changes.unit !== (isRecord(old) ? old.unit : undefined) &&
    changes.kgPerSack === undefined
  )
    delete merged.kgPerSack;
  return {
    reply: await beginReading(command, payload.keyword, merged, ctx),
    viaAi,
  };
}

onPromptAnswer("ai_confirm", async (prompt, yes, ctx) => {
  if (prompt.phone !== ctx.phone) throw new PromptRefusal(help());
  if (!yes) return smsReplies.aiDeclined;

  const { keyword, args } = prompt.payload as { keyword: string; args: Json };
  const command = findCommand(keyword);
  const valid = command?.schema.safeParse(args);
  if (!command || !valid?.success) return help();
  return command.handle(valid.data, { ...ctx, promptId: prompt.id });
});

async function answerPrompt(
  { yes, ref }: { yes: boolean; ref?: string },
  ctx: CommandContext,
): Promise<string> {
  // A ref may just be a word ("yes please"), so fall back to the latest.
  const referenced = ref ? await openPromptByRef(ref) : null;
  if (ref && !referenced) {
    const { data, error } = await db()
      .from("sms_prompts")
      .select("id")
      .eq("ref", ref)
      .limit(1);
    if (error) throw error;
    // A late reply to a known closed reference must not answer another stage.
    if (data.length || !["PLEASE", "THANKS"].includes(ref))
      return smsReplies.noPrompt;
  }
  const prompt = referenced || (await latestOpenPrompt(ctx.phone));
  const handler = prompt && promptHandler(prompt.kind);
  if (!prompt || !handler) return smsReplies.noPrompt;

  if (new Date(prompt.expires_at) <= new Date()) {
    await setPromptStatus(prompt.id, "open", "expired");
    return smsReplies.promptExpired;
  }

  const claimed = await setPromptStatus(
    prompt.id,
    "open",
    yes ? "accepted" : "declined",
  );
  if (!claimed) return smsReplies.alreadyAnswered;
  try {
    return await handler(claimed, yes, ctx);
  } catch (error) {
    // Reopen so the rightful phone can still answer.
    await setPromptStatus(prompt.id, claimed.status, "open");
    if (error instanceof PromptRefusal) return error.reply;
    throw error;
  }
}

async function openPromptByRef(ref: string) {
  const { data, error } = await db()
    .from("sms_prompts")
    .select()
    .eq("ref", ref)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The phone's newest unexpired open yes/no prompt (not a follow-up). */
async function latestOpenPrompt(phone: string) {
  const { data, error } = await db()
    .from("sms_prompts")
    .select()
    .eq("phone", phone)
    .eq("status", "open")
    .neq("kind", "ai_fill")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The phone's newest unexpired follow-up question, if any. */
async function latestOpenFill(phone: string) {
  const { data, error } = await db()
    .from("sms_prompts")
    .select()
    .eq("phone", phone)
    .eq("kind", "ai_fill")
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Closes the phone's open prompts of `kinds`. */
async function closePrompts(
  phone: string,
  kinds: SmsPromptKind[],
): Promise<void> {
  const { error } = await db()
    .from("sms_prompts")
    .update({ status: "expired" })
    .eq("phone", phone)
    .in("kind", kinds)
    .eq("status", "open");
  if (error) throw error;
}

/** `natural` only when AI is up to read plain language. */
function help(natural = false): string {
  return helpText(commandUsages(), natural);
}

type PromptStatus = Database["public"]["Enums"]["sms_prompt_status"];

async function setPromptStatus(
  id: string,
  from: PromptStatus,
  to: PromptStatus,
) {
  const { data, error } = await db()
    .from("sms_prompts")
    .update({ status: to })
    .eq("id", id)
    .eq("status", from)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function update(
  id: string,
  values: Database["public"]["Tables"]["sms_messages"]["Update"],
) {
  const { error } = await db().from("sms_messages").update(values).eq("id", id);
  if (error) throw error;
}

const toJson = (parsed: ParsedInbound): Json => ({
  keyword: parsed.keyword,
  args: parsed.args,
  ...(parsed.forPhone && { forPhone: parsed.forPhone }),
});

/** Phones with their latest message, newest first. */
export async function smsThreads(): Promise<SmsMessage[]> {
  const { data, error } = await db()
    .from("sms_messages")
    .select()
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  const latest = new Map<string, SmsMessage>();
  for (const message of data)
    if (!latest.has(message.phone)) latest.set(message.phone, message);
  return [...latest.values()];
}

/** One phone's messages, oldest first (last 200). */
export async function smsThread(phone: string): Promise<SmsMessage[]> {
  const { data, error } = await db()
    .from("sms_messages")
    .select()
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data.reverse();
}
