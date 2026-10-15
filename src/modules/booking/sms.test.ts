import { describe, expect, it } from "vitest";
import { bookingSmsSchema } from "./booking-schema";
import { describeBookingRequest, parseBookingArgs } from "./logic";

const parse = (text: string) =>
  bookingSmsSchema.safeParse(parseBookingArgs(text.split(" ")));

describe("booking SMS arguments", () => {
  it("accepts drying, milling and optional flexibility", () => {
    expect(parse("dry 5000 20/10").data).toEqual({
      service: "drying",
      estKg: 5000,
      dayMonth: "20/10",
      flexDays: 0,
    });
    expect(parse("MILL 1 1/1 ±7").data).toEqual({
      service: "milling",
      estKg: 1,
      dayMonth: "1/1",
      flexDays: 7,
    });
    expect(parse("DRY 5000 20/10 +3").data?.flexDays).toBe(3);
  });

  it("reads aliases, units, filler words and any order", () => {
    const booking = (text: string) => parse(text).data;
    expect(booking("galing 1000 20/10")?.service).toBe("milling");
    expect(booking("pa-galing 1000 20/10")?.service).toBe("milling");
    expect(booking("pagiling 1000 20/10")?.service).toBe("milling");
    expect(booking("kiskis 1000 20/10")?.service).toBe("milling");
    expect(booking("bulad 1000 20/10")?.service).toBe("drying");
    expect(booking("PA-DRY 1000 20/10")?.service).toBe("drying");
    expect(booking("DRY 1,000 20/10")?.estKg).toBe(1000);
    expect(booking("DRY 1000kg 20/10")?.estKg).toBe(1000);
    expect(booking("DRY 1000 kilos 20/10")?.estKg).toBe(1000);
    expect(booking("DRY 20 sako 20/10")?.estKg).toBe(1000);
    expect(booking("DRY 20 ka sako 20/10")?.estKg).toBe(1000);
    expect(booking("DRY 20sacks 20/10")?.estKg).toBe(1000);
    expect(booking("DRY 10 kaban 20/10")?.estKg).toBe(500);
    expect(booking("DRY 1.5 sako 20/10")?.estKg).toBe(75);
    expect(booking("DRY 2 tons 20/10")?.estKg).toBe(2000);
    expect(booking("20/10 1000 DRY")).toEqual(booking("DRY 1000 20/10"));
    expect(booking("DRY 1000 kg sa 20/10 po")?.estKg).toBe(1000);
    for (const flex of ["+2", "±2", "+-2", "+/-2", "+2days", "+2d"])
      expect(booking(`DRY 1000 20/10 ${flex}`)?.flexDays).toBe(2);
  });

  it.each([
    "DRY MILL 1000 20/10",
    "DRY 1000 20/10 21/10",
    "DRY 1000 500 20/10",
    "DRY 1000 20/10 +2 +3",
    "DRY 200001 20/10",
    "DRY 5000 sako 20/10",
    "DRY 1,00 20/10",
    "DRY 20 baskets 20/10",
    "DRY 0 sako 20/10",
  ])("rejects ambiguous or absurd arguments: %s", (text) => {
    expect(parse(text).success).toBe(false);
  });

  it.each([
    "DRY 0 20/10",
    "DRY -1 20/10",
    "DRY 1.5 20/10",
    "DRY 1e3 20/10",
    "DRY 5000 20/10 ±8",
    "DRY 5000 20/10 -3",
    "DRY 5000 20/10 3",
    "DRY 5000 20/10 ±1.5",
    "OTHER 5000 20/10",
    "DRY 5000 2026-10-20",
    "DRY 5000",
    "DRY 5000 20/10 ±1 extra",
    "DRY 99999999999999999999 20/10",
  ])("rejects invalid arguments: %s", (text) => {
    expect(parse(text).success).toBe(false);
  });
});

describe("describeBookingRequest", () => {
  const base = {
    service: "drying" as const,
    estKg: 1000,
    dayMonth: "19/10",
    date: "2026-10-19",
    flexDays: 0,
  };

  it("reads like a sentence", () => {
    expect(describeBookingRequest(base)).toBe(
      "mag-book sang drying para sa 1,000 kg sa Mon, Oct 19",
    );
    expect(describeBookingRequest({ ...base, flexDays: 1 })).toMatch(
      /puwede 1 ka adlaw nga mas temprano ukon mas ulihi$/,
    );
    expect(describeBookingRequest({ ...base, flexDays: 3 })).toMatch(
      /puwede 3 ka adlaw nga mas temprano ukon mas ulihi$/,
    );
  });

  it("falls back to the typed day", () => {
    expect(
      describeBookingRequest({ ...base, dayMonth: "31/02", date: null }),
    ).toBe("mag-book sang drying para sa 1,000 kg sa 31/02");
  });
});
