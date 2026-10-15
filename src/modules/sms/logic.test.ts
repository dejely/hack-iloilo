import { describe, expect, it } from "vitest";
import {
  aiConfirmText,
  fillQuestion,
  fillTemplate,
  helpText,
  inboundAllowance,
  INBOUND_LIMIT,
  isGsm7,
  isHelp,
  mergeFill,
  missingFields,
  omitFields,
  parseAnswer,
  parseDayMonth,
  normalizeBody,
  parseInbound,
  SMS_MAX_CHARS,
} from "./logic";

describe("parseInbound", () => {
  it("uppercases the first word as the keyword", () => {
    expect(parseInbound("book dry 500 20/10")).toEqual({
      keyword: "BOOK",
      args: ["dry", "500", "20/10"],
      forPhone: undefined,
    });
  });

  it("ignores extra whitespace", () => {
    expect(parseInbound("  price \n  ")).toEqual({
      keyword: "PRICE",
      args: [],
      forPhone: undefined,
    });
  });

  it("returns an empty keyword for an empty text", () => {
    expect(parseInbound("   ").keyword).toBe("");
  });

  it("strips a trailing FOR <phone>, case-insensitive", () => {
    expect(parseInbound("BOOK dry 500 for 09171234567")).toEqual({
      keyword: "BOOK",
      args: ["dry", "500"],
      forPhone: "09171234567",
    });
  });

  it("keeps FOR that is not at the end", () => {
    expect(parseInbound("BOOK FOR 0917 dry")).toEqual({
      keyword: "BOOK",
      args: ["FOR", "0917", "dry"],
      forPhone: undefined,
    });
  });

  it("does not treat the keyword itself as FOR", () => {
    expect(parseInbound("FOR 09171234567").forPhone).toBeUndefined();
  });

  it("strips punctuation around words", () => {
    expect(parseInbound("#Book: dry, 500 20/10.")).toEqual({
      keyword: "BOOK",
      args: ["dry", "500", "20/10"],
      forPhone: undefined,
    });
    expect(parseInbound("/price?").keyword).toBe("PRICE");
    expect(parseInbound("BOOK dry 500 20/10 +2").args.at(-1)).toBe("+2");
    expect(parseInbound("QUOTE 14%").args).toEqual(["14%"]);
    expect(parseInbound("BOOK x for (+639171234567)").forPhone).toBe(
      "+639171234567",
    );
  });

  it("reads full-width and zero-width characters", () => {
    expect(parseInbound("ＢＯＯＫ\u200B dry").keyword).toBe("BOOK");
    expect(parseInbound("\uFEFFprice").keyword).toBe("PRICE");
  });

  it("gives punctuation-only and emoji-only texts an empty keyword", () => {
    expect(parseInbound("???").keyword).toBe("");
    expect(parseInbound("🙂").keyword).toBe("");
  });
});

describe("normalizeBody", () => {
  it("rewrites dashed and dated days as day/month", () => {
    expect(normalizeBody("BOOK DRY 500 20-10")).toBe("BOOK DRY 500 20/10");
    expect(normalizeBody("sa 20/10/2026")).toBe("sa 20/10");
    expect(normalizeBody("sa 20.10.26")).toBe("sa 20/10");
  });

  it("keeps decimals, ranges and impossible days", () => {
    expect(normalizeBody("QUOTE 14.5")).toBe("QUOTE 14.5");
    expect(normalizeBody("1000-1200 kg")).toBe("1000-1200 kg");
    expect(normalizeBody("40-10")).toBe("40-10");
  });

  it("reads thumbs as yes and no", () => {
    expect(normalizeBody("👍")).toBe("YES");
    expect(normalizeBody("👎🏽")).toBe("NO");
  });
});

describe("isHelp", () => {
  it("reads empty texts and help words", () => {
    for (const word of ["", "HELP", "TABANG", "BULIG", "INFO"])
      expect(isHelp(word)).toBe(true);
    expect(isHelp("BOOK")).toBe(false);
  });
});

describe("inboundAllowance", () => {
  it("replies up to the limit, warns once, then goes silent", () => {
    expect(inboundAllowance(1)).toBe("ok");
    expect(inboundAllowance(INBOUND_LIMIT)).toBe("ok");
    expect(inboundAllowance(INBOUND_LIMIT + 1)).toBe("warn");
    expect(inboundAllowance(INBOUND_LIMIT + 2)).toBe("silent");
  });
});

describe("parseAnswer", () => {
  const answer = (text: string) => parseAnswer(parseInbound(text));

  it("reads YES and NO with a ref", () => {
    expect(answer("yes k7p2qx")).toEqual({ yes: true, ref: "K7P2QX" });
    expect(answer("NO K7P2QX")).toEqual({ yes: false, ref: "K7P2QX" });
  });

  it("reads plain answers in English, Hiligaynon and Tagalog", () => {
    for (const text of ["yes", "Oo sige", "huo!", "ok po", "Sige salamat"])
      expect(answer(text)).toEqual({ yes: true });
    for (const text of ["no", "Indi", "ayaw na lang", "hindi po"])
      expect(answer(text)).toEqual({ yes: false });
  });

  it("reads punctuation, stretched words, texting spellings and thumbs", () => {
    for (const text of ["YES!!!", "yesss", "Okiee", "k", "👍", "huooo po"])
      expect(answer(text)).toEqual({ yes: true });
    for (const text of ["NOOO", "nah", "inde", "👎", "Hindeee"])
      expect(answer(text)).toEqual({ yes: false });
  });

  it("keeps a word that looks like a ref for the caller to check", () => {
    expect(answer("yes please")).toEqual({ yes: true, ref: "PLEASE" });
  });

  it("leaves longer texts and other keywords alone", () => {
    expect(answer("ok book dry 20 sacks monday")).toBeNull();
    expect(answer("BOOK A")).toBeNull();
    expect(answer("")).toBeNull();
  });
});

describe("parseDayMonth", () => {
  const today = "2026-10-15";

  it("resolves a later date this year", () => {
    expect(parseDayMonth("20/10", today)).toBe("2026-10-20");
    expect(parseDayMonth("1/12", today)).toBe("2026-12-01");
  });

  it("counts today as the next occurrence", () => {
    expect(parseDayMonth("15/10", today)).toBe("2026-10-15");
  });

  it("rolls a date into next year within the horizon", () => {
    expect(parseDayMonth("05/01", today)).toBe("2027-01-05");
  });

  it("rejects a date that already passed or is too far ahead", () => {
    expect(parseDayMonth("14/10", today)).toBeNull();
    expect(parseDayMonth("1/9", today)).toBeNull();
  });

  it("finds the next leap day", () => {
    expect(parseDayMonth("29/02", "2028-01-15")).toBe("2028-02-29");
    expect(parseDayMonth("29/02", today)).toBeNull();
  });

  it("rejects impossible or malformed dates", () => {
    expect(parseDayMonth("31/02", today)).toBeNull();
    expect(parseDayMonth("31/04", today)).toBeNull();
    expect(parseDayMonth("0/10", today)).toBeNull();
    expect(parseDayMonth("10/13", today)).toBeNull();
    expect(parseDayMonth("10-10", today)).toBeNull();
    expect(parseDayMonth("tomorrow", today)).toBeNull();
  });
});

describe("fillTemplate", () => {
  it("fills known placeholders and keeps unknown ones", () => {
    expect(
      fillTemplate("Hi {name}, ref {ref}. {other}", { name: "Ana", ref: 7 }),
    ).toBe("Hi Ana, ref 7. {other}");
  });
});

describe("helpText", () => {
  const usages = ["BOOK DRY 1000 20/10 +2", "CANCEL <ref>", "STATUS", "STATUS"];

  it("lists the keyword formats once, within the SMS limit", () => {
    const text = helpText(usages);
    expect(text).toBe(
      "IRPC: Pasensya, wala namon naintiendihan. Palihog i-text: BOOK DRY 1000 20/10 +2; CANCEL <ref>; STATUS",
    );
    expect(isGsm7(text)).toBe(true);
  });

  it("invites plain language only when AI is up", () => {
    const text = helpText(usages, true);
    expect(text).toMatch(/pa-dry 20 ka sako sa Lunes.*CANCEL <ref>/);
    expect(text.length).toBeLessThanOrEqual(SMS_MAX_CHARS);
    expect(helpText(usages)).not.toMatch(/sako/);
  });
});

describe("isGsm7", () => {
  it("rejects characters outside GSM-7", () => {
    expect(isGsm7("PHP 1,234.50 [ok]")).toBe(true);
    expect(isGsm7("₱1,234")).toBe(false);
  });
});

describe("aiConfirmText", () => {
  it("asks a plain question within one GSM-7 text", () => {
    const text = aiConfirmText(
      "mag-book sang milling para sa 1,000,000 kg sa Mon, Oct 19, puwede 7 ka adlaw nga mas temprano ukon mas ulihi",
    );
    expect(text).toMatch(/gusto mo mag-book sang milling .*\? Husto bala\?$/);
    expect(text).not.toMatch(/YES|NO/);
    expect(isGsm7(text)).toBe(true);
    expect(text.length).toBeLessThanOrEqual(160);
  });
});

describe("missingFields", () => {
  const issues = (...fields: string[]) => fields.map((f) => ({ path: [f] }));

  it("lists each top-level field once", () => {
    expect(
      missingFields(
        [...issues("amount", "unit"), { path: ["amount", 0] }],
        ["amount", "unit", "dayMonth"],
      ),
    ).toEqual(["amount", "unit"]);
  });

  it("returns null when a field can't be asked for", () => {
    expect(missingFields(issues("amount", "flexDays"), ["amount"])).toBeNull();
  });

  it("returns null for a root issue or no issues", () => {
    expect(missingFields([{ path: [] }], ["amount"])).toBeNull();
    expect(missingFields([], ["amount"])).toBeNull();
  });
});

describe("mergeFill", () => {
  it("takes only the missing fields the reply has", () => {
    expect(
      mergeFill(
        { service: "drying", dayMonth: "20/10" },
        { amount: 1000, unit: "kg", service: "milling", dayMonth: null },
        ["amount", "unit", "dayMonth"],
      ),
    ).toEqual({
      service: "drying",
      dayMonth: "20/10",
      amount: 1000,
      unit: "kg",
    });
  });

  it("keeps args unchanged without a reply", () => {
    expect(mergeFill({ a: 1 }, null, ["b"])).toEqual({ a: 1 });
  });
});

describe("omitFields", () => {
  it("drops the given fields", () => {
    expect(omitFields({ a: 1, b: -5, c: 3 }, ["b"])).toEqual({ a: 1, c: 3 });
  });
});

describe("fillQuestion", () => {
  const ask = { amount: "Pila ka kilo?", unit: "Pila ka kilo?", day: "San-o?" };

  it("asks a shared question once", () => {
    expect(fillQuestion(["amount", "unit"], ask)).toBe("IRPC: Pila ka kilo?");
  });

  it("joins different questions", () => {
    expect(fillQuestion(["amount", "day"], ask)).toBe(
      "IRPC: Pila ka kilo? San-o?",
    );
  });
});
