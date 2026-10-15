// M3. SMS: Sending, receiving and parsing texts; command registry. See TRD.md.
// Pure functions only: no I/O and no imports from other modules. Unit-test here.

import { addDays } from "@/lib/dates";
import type { StatusTone } from "@/lib/status";
import type { Database } from "@/lib/supabase/database.types";

type SmsStatus = Database["public"]["Enums"]["sms_status"];

export const smsStatusLabels: Record<SmsStatus, string> = {
  received: "Received",
  processed: "Processed",
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
};
export const smsStatusTones: Record<SmsStatus, StatusTone> = {
  received: "neutral",
  processed: "success",
  queued: "info",
  sent: "success",
  failed: "danger",
};

/** Max SMS length (two GSM-7 segments). */
export const SMS_MAX_CHARS = 320;

export type ParsedInbound = {
  /** First word, uppercased; "" for an empty text. */
  keyword: string;
  /** Tokens after the keyword, with a trailing `FOR <phone>` removed. */
  args: string[];
  /** Raw phone from a trailing `FOR <phone>`; normalize before use. */
  forPhone?: string;
};

/** Longest text worth reading with AI (three SMS segments). */
export const MAX_AI_CHARS = 480;

/**
 * Cleans what phones and people add to a text: full-width and styled
 * characters, zero-width spaces, smart quotes, a thumbs up/down for yes/no,
 * `:`/`;` between words, and dates as `20-10` or `20/10/2026` (to `20/10`).
 */
export function normalizeBody(body: string): string {
  const text = body
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u{1F44D}[\u{1F3FB}-\u{1F3FF}]?/gu, " YES ")
    .replace(/\u{1F44E}[\u{1F3FB}-\u{1F3FF}]?/gu, " NO ")
    .replace(/[:;]/g, " ");
  return text
    .split(/(\s+)/)
    .map((token) => toDayMonth(token) ?? token)
    .join("")
    .trim();
}

/** `20-10`, `20/10/26`, `20.10.2026` as `20/10`; null for anything else. */
function toDayMonth(token: string): string | null {
  // A dot needs a year, so a decimal like 14.5 stays a number.
  const match =
    /^(\d{1,2})-(\d{1,2})$/.exec(token) ??
    /^(\d{1,2})[-/.](\d{1,2})[-/.](?:\d{2}|\d{4})$/.exec(token);
  if (!match || Number(match[1]) > 31 || Number(match[2]) > 12) return null;
  return `${match[1]}/${match[2]}`;
}

// Punctuation around a word: "Book:", "#PRICE", "yes!", "20/10."
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}±+-]+|[^\p{L}\p{N}%]+$/gu;

/** Splits a text into keyword, args and an optional trailing `FOR <phone>`. */
export function parseInbound(body: string): ParsedInbound {
  const tokens = normalizeBody(body)
    .split(/\s+/)
    .map((token) => token.replace(EDGE_PUNCTUATION, ""))
    .filter(Boolean);
  const [first = "", ...rest] = tokens;
  let forPhone: string | undefined;
  if (rest.length >= 2 && rest.at(-2)!.toUpperCase() === "FOR") {
    forPhone = rest.at(-1);
    rest.splice(-2);
  }
  return { keyword: first.toUpperCase(), args: rest, forPhone };
}

const HELP_WORDS = new Set("HELP TABANG BULIG INFO MENU".split(" "));

/** An empty text or a plain ask for help ("tabang", "?"). */
export const isHelp = (keyword: string): boolean =>
  !keyword || HELP_WORDS.has(keyword);

// English, Hiligaynon and Tagalog, with common texting spellings.
const YES_WORDS = new Set(
  (
    "YES Y YEP YUP YEAH YA OK OKAY OKS OKI OKIE K KK SURE GO CONFIRM " +
    "CONFIRMED OO HUO HO OPO SIGE TAMA CORRECT PWEDE PUEDE AYOS GAME"
  ).split(" "),
);
const NO_WORDS = new Set(
  "NO N NOPE NAH INDI INDE HINDI HINDE DILI AYAW WALA MALI DECLINE".split(" "),
);

/** `word` and its stretched forms read back: "YESSS", "NOOO", "OOOO". */
const answerWord = (word: string, words: Set<string>): boolean =>
  [
    word,
    word.replace(/(.)\1+/g, "$1"),
    word.replace(/(.)\1{2,}/g, "$1$1"),
  ].some((w) => words.has(w));

/** Words that can follow an answer, e.g. "oo sige salamat". */
const MAX_ANSWER_WORDS = 4;

/**
 * A short yes/no reply ("oo sige", "no thanks", "YES K7P2QX"); null otherwise.
 * `ref` is any 6-character token, which may just be a word like "please".
 */
export function parseAnswer({
  keyword,
  args,
}: ParsedInbound): { yes: boolean; ref?: string } | null {
  const word = keyword.replace(/[^A-Z]/g, "");
  const yes = answerWord(word, YES_WORDS);
  if (!yes && !answerWord(word, NO_WORDS)) return null;
  if (args.length > MAX_ANSWER_WORDS - 1) return null;
  const ref = args.find((a) => /^[A-Z0-9]{6}$/i.test(a))?.toUpperCase();
  return { yes, ...(ref && { ref }) };
}

/** Furthest a texted day/month may be; beyond it, the day likely passed. */
export const MAX_DAYS_AHEAD = 180;

/**
 * `dd/mm` (or `d/m`) as the next occurrence on or after `today`, as `YYYY-MM-DD`.
 * Null when the day can't exist (e.g. `31/02`) or is over `MAX_DAYS_AHEAD`
 * away, so yesterday's date isn't read as next year.
 */
export function parseDayMonth(token: string, today: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(token.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const year = Number(today.slice(0, 4));
  // 29/02 may be up to 8 years away (e.g. across 2100).
  for (let y = year; y <= year + 8; y++) {
    const date = `${y}-${pad(month)}-${pad(day)}`;
    if (!isRealDate(date)) continue;
    if (date >= today)
      return date <= addDays(today, MAX_DAYS_AHEAD) ? date : null;
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

// A date is real when it survives a round trip (2026-02-31 does not).
const isRealDate = (date: string) => addDays(date, 0) === date;

/** Fills `{key}` placeholders; unknown keys are left as-is. */
export function fillTemplate(
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

/**
 * Reply to texts we can't read. Always lists the keyword formats, which work
 * without AI; `natural` (AI is up) also invites plain-language texts.
 */
export function helpText(usages: string[], natural = false): string {
  const list = [...new Set(usages)].join("; ");
  const text = natural
    ? `IRPC: Pasensya, wala namon naintiendihan. Isugid lang kon ano kinahanglan mo, pareho sang "pa-dry 20 ka sako sa Lunes". Ukon i-text: ${list}`
    : `IRPC: Pasensya, wala namon naintiendihan. Palihog i-text: ${list}`;
  return text.slice(0, SMS_MAX_CHARS);
}

/** M3's own replies, in Hiligaynon. GSM-7. */
export const smsReplies = {
  error:
    "IRPC: Pasensya, wala namon na-process ang text mo. Palihog tilawi liwat sa ulihi.",
  aiDeclined: "IRPC: Sige, wala kami gin-save.",
  noPrompt: "IRPC: Wala kami pamangkot nga ginahulat ang sabat mo.",
  promptExpired:
    "IRPC: Pasensya, expired na ina nga pamangkot. Palihog text liwat.",
  alreadyAnswered: "IRPC: Nasabat mo na ina.",
  tooLong:
    'IRPC: Pasensya, malawig gid ang text mo. Palihog i-text sing mubo lang, pareho sang "pa-dry 20 ka sako sa Lunes".',
  slowDown:
    "IRPC: Damo na ang text halin sa number mo. Palihog hulat anay sang 10 minutos antes mag-text liwat.",
} as const;

/** Texts a phone may send per window before IRPC stops replying. */
export const INBOUND_LIMIT = 60;
export const INBOUND_WINDOW_MINUTES = 10;

/**
 * What to do with a phone's `count`th text in the window, this one included:
 * reply as usual, warn once at the limit, then stay silent so a flood or an
 * auto-reply loop can't run up SMS and AI costs.
 */
export function inboundAllowance(count: number): "ok" | "warn" | "silent" {
  if (count <= INBOUND_LIMIT) return "ok";
  return count === INBOUND_LIMIT + 1 ? "warn" : "silent";
}

/** Asks the sender to confirm what AI read, e.g. "i-cancel ang booking K7P2QX". */
export function aiConfirmText(summary: string): string {
  return `IRPC: Para sigurado, gusto mo ${summary}? Husto bala?`;
}

/** Follow-up questions per AI-read text before falling back to help. */
export const MAX_FILL_ASKS = 2;

/**
 * Top-level fields named by validation issues, once each. Null when any of
 * them can't be asked for, so the sender gets the help reply instead.
 */
export function missingFields(
  issues: readonly { path: readonly PropertyKey[] }[],
  askable: readonly string[],
): string[] | null {
  const fields = [...new Set(issues.map(({ path }) => String(path[0] ?? "")))];
  if (!fields.length || fields.some((f) => !askable.includes(f))) return null;
  return fields;
}

/** `args` with the `missing` fields that `reply` has a value for. */
export function mergeFill(
  args: Record<string, unknown>,
  reply: Record<string, unknown> | null | undefined,
  missing: readonly string[],
): Record<string, unknown> {
  const merged = { ...args };
  for (const field of missing) {
    const value = reply?.[field];
    if (value !== undefined && value !== null) merged[field] = value;
  }
  return merged;
}

/** `args` without `fields`, e.g. invalid values to ask for again. */
export function omitFields(
  args: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).filter(([key]) => !fields.includes(key)),
  );
}

/** Asks for the missing fields; fields sharing a question ask it once. */
export function fillQuestion(
  missing: readonly string[],
  ask: Record<string, string>,
): string {
  const questions = [...new Set(missing.map((f) => ask[f]).filter(Boolean))];
  return `IRPC: ${questions.join(" ")}`.slice(0, SMS_MAX_CHARS);
}

// GSM 03.38 basic set plus extension table (which costs 2 chars each).
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€\f";

/** True when the text uses only GSM-7 characters. */
export function isGsm7(text: string): boolean {
  return [...text].every((c) => GSM7.includes(c) || GSM7_EXT.includes(c));
}
