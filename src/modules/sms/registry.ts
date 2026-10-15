// M3. SMS: command and prompt-answer registry. Modules register from their `sms.ts`.

import type { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import type { Client } from "@/modules/accounts/types";

export type CommandContext = {
  /** Sender, E.164. */
  phone: string;
  /** Sender's client record (self-registered if new). */
  client: Client;
  /** Normalized phone from a trailing `FOR <phone>`. */
  forPhone?: string;
};

export type Command<T, A = T> = {
  /** Matched on the first word, case-insensitive, e.g. `["BOOK"]`. */
  keywords: string[];
  /** Validates the parsed args; a failure gets the help reply. */
  schema: z.ZodType<T>;
  /** Raw tokens after the keyword, `FOR <phone>` already stripped. */
  parse: (args: string[]) => unknown;
  /** Example for the help reply, e.g. `CANCEL K7P2QX`. Defaults to the keyword. */
  usage?: string;
  /** Returns the reply text. */
  handle: (cmd: T, ctx: CommandContext) => Promise<string>;
  /** Lets AI read free text as this command. Omit to keep it keyword-only. */
  ai?: {
    /** What the command does, for the AI. */
    description: string;
    /**
     * What the AI fills in when it differs from `schema`, e.g. an amount and
     * unit as stated, so code (never AI) converts sacks to kg. Defaults to
     * `schema`; `toArgs` maps the reading back to `schema`'s shape.
     */
    input?: { schema: z.ZodType<A>; toArgs: (extracted: A) => unknown };
    /**
     * Completes "you want to …?", asked before running, e.g. "cancel booking
     * K7P2QX". Omit for read-only commands, which run right away.
     */
    summary?: (cmd: T) => string;
    /**
     * Questions for values the sender may leave out, keyed by field of the AI
     * reading (`input.schema`, else `schema`). Those fields are optional for
     * the AI and asked for in a follow-up text; a shared question asks once.
     */
    ask?: Record<string, string>;
    /** Reads a follow-up reply without AI, e.g. "1000" as kg; null when unclear. */
    readReply?: (text: string) => Record<string, unknown> | null;
  };
};

export type SmsPrompt = Database["public"]["Tables"]["sms_prompts"]["Row"];
export type SmsPromptKind = SmsPrompt["kind"];
export type PromptHandler = (
  prompt: SmsPrompt,
  yes: boolean,
  ctx: CommandContext,
) => Promise<string>;

/**
 * Thrown by a prompt handler to refuse an answer (e.g. from a phone that
 * doesn't own the booking). The prompt stays open and `reply` is sent.
 */
export class PromptRefusal extends Error {
  constructor(public readonly reply: string) {
    super(reply);
  }
}

// Handled by M3 itself.
const RESERVED = new Set(["YES", "NO", "HELP"]);

const commands = new Map<string, Command<unknown>>();
const promptHandlers = new Map<SmsPromptKind, PromptHandler>();

export function registerCommand<T, A = T>(command: Command<T, A>): void {
  for (const keyword of command.keywords) {
    const key = keyword.toUpperCase();
    if (RESERVED.has(key)) throw new Error(`SMS keyword ${key} is reserved`);
    commands.set(key, command as unknown as Command<unknown>);
  }
}

export function findCommand(keyword: string): Command<unknown> | undefined {
  return commands.get(keyword.toUpperCase());
}

/** AI-readable commands, each once under its first keyword. */
export function aiCommands(): { keyword: string; command: Command<unknown> }[] {
  const seen = new Set<Command<unknown>>();
  return [...commands]
    .filter(([, c]) => c.ai && !seen.has(c) && seen.add(c))
    .map(([keyword, command]) => ({ keyword, command }));
}

/** Each command's usage once, for the help reply. */
export function commandUsages(): string[] {
  const seen = new Set<Command<unknown>>();
  return [...commands]
    .filter(([, c]) => !seen.has(c) && seen.add(c))
    .map(([keyword, c]) => c.usage ?? keyword);
}

export function onPromptAnswer(kind: SmsPromptKind, fn: PromptHandler): void {
  promptHandlers.set(kind, fn);
}

export function promptHandler(kind: SmsPromptKind): PromptHandler | undefined {
  return promptHandlers.get(kind);
}
