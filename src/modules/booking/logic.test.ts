import { describe, expect, it } from "vitest";
import { bookingAiSchema, bookingSchema } from "./booking-schema";
import {
  bookedByLabel,
  bookingFromAi,
  SACK_KG,
  canCancel,
  canMove,
  cleanRef,
  isClientOrBooker,
  isTrackLocked,
  TRACK_MAX_FAILURES,
  defaultRange,
  formatDay,
  formatRange,
  formatShortDate,
  groupBookings,
  parseMoveArgs,
  readBookingReply,
  rescheduleAnswer,
  validateMove,
  type BookingFilters,
} from "./logic";
import type { BookingRow } from "./types";

describe("move date and flex validation", () => {
  it("accepts today, future dates, and both flex boundaries", () => {
    expect(validateMove("2026-10-15", 0, "2026-10-15")).toBeNull();
    expect(validateMove("2027-01-01", 7, "2026-10-15")).toBeNull();
  });
  it("rejects past dates against Manila today", () => {
    expect(validateMove("2026-10-14", 0, "2026-10-15")).toBe(
      "Choose today or a later date.",
    );
  });
  it.each(["2026-02-30", "invalid", "25/10", "2026-13-01"])(
    "rejects invalid dates: %s",
    (date) => {
      expect(validateMove(date, 0, "2026-10-15")).toBe("Choose a valid date.");
    },
  );
  it.each([-1, 8, 1.5, NaN, Infinity])("rejects invalid flex: %s", (flex) => {
    expect(validateMove("2026-10-25", flex, "2026-10-15")).toBe(
      "Flex days must be a whole number from 0 to 7.",
    );
  });
});

const row = (overrides: Partial<BookingRow> = {}): BookingRow => ({
  id: "b1",
  facility_id: "f1",
  ref: "K7P2QX",
  service: "drying",
  client_id: "c1",
  booked_by_phone: "+639171234567",
  channel: "sms",
  est_kg: 5000,
  preferred_date: "2026-10-20",
  flex_days: 0,
  scheduled_date: "2026-10-20",
  proposed_date: null,
  status: "confirmed",
  created_at: "",
  updated_at: "",
  client: { name: "Rodel Panes", phone: "+639171234567", kind: "farmer" },
  ...overrides,
});
const all: BookingFilters = { service: "all", status: "all", search: "" };

describe("groupBookings", () => {
  const rows = [
    row({ id: "a", scheduled_date: "2026-10-21", est_kg: 3000 }),
    row({ id: "b", est_kg: 12000 }),
    row({ id: "c", est_kg: 2500 }),
    row({ id: "d", service: "milling", est_kg: 4000 }),
  ];

  it("groups by day and service with total kg, sorted by date", () => {
    expect(
      groupBookings(rows, all).map(({ date, service, count, totalKg }) => ({
        date,
        service,
        count,
        totalKg,
      })),
    ).toEqual([
      { date: "2026-10-20", service: "drying", count: 2, totalKg: 14500 },
      { date: "2026-10-20", service: "milling", count: 1, totalKg: 4000 },
      { date: "2026-10-21", service: "drying", count: 1, totalKg: 3000 },
    ]);
  });

  it("filters by service and status", () => {
    const mixed = [...rows, row({ id: "e", status: "cancelled" })];
    expect(
      groupBookings(mixed, { ...all, service: "milling" }).flatMap((g) =>
        g.rows.map((r) => r.id),
      ),
    ).toEqual(["d"]);
    expect(
      groupBookings(mixed, { ...all, status: "cancelled" }).flatMap((g) =>
        g.rows.map((r) => r.id),
      ),
    ).toEqual(["e"]);
  });

  it.each(["k7p2", "rodel", "0917 123", "+63917123", "4567"])(
    "finds by ref, name or phone: %s",
    (search) => {
      expect(groupBookings([row()], { ...all, search })).toHaveLength(1);
    },
  );

  it("finds by the booker's phone", () => {
    const booked = row({ booked_by_phone: "+639179990000" });
    expect(groupBookings([booked], { ...all, search: "0917999" })).toHaveLength(
      1,
    );
    expect(groupBookings([booked], { ...all, search: "nobody" })).toEqual([]);
  });
});

describe("bookedByLabel", () => {
  it("labels staff, self and FOR bookings", () => {
    expect(bookedByLabel(row({ channel: "staff" }))).toBe("Staff · walk-in");
    expect(bookedByLabel(row())).toBe("Self · SMS");
    const forRow = row({ booked_by_phone: "+639171000001" });
    expect(
      bookedByLabel(forRow, new Map([["+639171000001", "Amamaros Co-op"]])),
    ).toBe("Amamaros Co-op · FOR");
    expect(bookedByLabel(forRow)).toBe("+639171000001 · FOR");
  });
});

describe("canCancel", () => {
  const booking = { status: "confirmed" as const, booked_by_phone: "+6392" };
  it("lets staff cancel only confirmed bookings", () => {
    expect(canCancel(booking, "+6391")).toBe("ok");
    expect(canCancel({ ...booking, status: "arrived" }, "+6391")).toBe(
      "not_cancellable",
    );
  });
  it("lets only the client or booker cancel by phone", () => {
    expect(canCancel(booking, "+6391", "+6391")).toBe("ok");
    expect(canCancel(booking, "+6391", "+6392")).toBe("ok");
    expect(canCancel(booking, "+6391", "+6393")).toBe("forbidden");
  });
});

describe("canMove", () => {
  const booking = { status: "confirmed" as const, booked_by_phone: "+6392" };
  it("moves only open bookings", () => {
    expect(canMove(booking, "+6391")).toBe("ok");
    expect(
      canMove({ ...booking, status: "reschedule_proposed" }, "+6391"),
    ).toBe("ok");
    for (const status of ["arrived", "cancelled", "no_show"] as const)
      expect(canMove({ ...booking, status }, "+6391")).toBe("not_movable");
  });
  it("lets only the client or booker move by phone", () => {
    expect(canMove(booking, "+6391", "+6391")).toBe("ok");
    expect(canMove(booking, "+6391", "+6392")).toBe("ok");
    expect(canMove(booking, "+6391", "+6393")).toBe("forbidden");
  });
});

describe("parseMoveArgs", () => {
  it("reads the ref, date and optional flex days", () => {
    expect(parseMoveArgs(["k7p2qx", "25/10"])).toEqual({
      ref: "K7P2QX",
      dayMonth: "25/10",
    });
    expect(parseMoveArgs(["K7P2QX", "25/10", "±3"])).toEqual({
      ref: "K7P2QX",
      dayMonth: "25/10",
      flexDays: 3,
    });
  });
  it("rejects other shapes", () => {
    expect(parseMoveArgs(["K7P2QX"])).toBeNull();
    expect(parseMoveArgs(["K7P2QX", "25/10", "3"])).toBeNull();
    expect(parseMoveArgs(["K7P2QX", "25/10", "±3", "x"])).toBeNull();
  });
});

describe("rescheduleAnswer", () => {
  const booking = {
    status: "reschedule_proposed" as const,
    booked_by_phone: "+6392",
    scheduled_date: "2026-10-20",
    proposed_date: "2026-10-22",
  };
  it("moves on YES and keeps the date on NO", () => {
    expect(rescheduleAnswer(booking, "+6391", "+6391", true)).toEqual({
      status: "ok",
      date: "2026-10-22",
    });
    expect(rescheduleAnswer(booking, "+6391", "+6392", false)).toEqual({
      status: "ok",
      date: "2026-10-20",
    });
  });
  it("lets only the client or booker answer", () => {
    expect(rescheduleAnswer(booking, "+6391", "+6393", true)).toEqual({
      status: "forbidden",
    });
  });
  it("refuses bookings no longer awaiting an answer", () => {
    for (const changed of [
      { ...booking, status: "arrived" as const },
      { ...booking, status: "confirmed" as const, proposed_date: null },
    ])
      expect(rescheduleAnswer(changed, "+6391", "+6391", true)).toEqual({
        status: "not_open",
      });
  });
});

describe("defaultRange", () => {
  it("runs from today for 16 days", () => {
    expect(defaultRange("2026-10-15")).toEqual({
      from: "2026-10-15",
      to: "2026-10-31",
    });
  });
});

describe("bookingSchema", () => {
  const input = {
    clientId: "c1000000-0000-0000-0000-000000000001",
    service: "drying",
    estKg: 5000,
    preferredDate: "2026-10-20",
    flexDays: 3,
  };
  it("accepts a valid booking", () => {
    expect(bookingSchema.safeParse(input).success).toBe(true);
  });
  it.each([
    { estKg: 0 },
    { estKg: 12.5 },
    { flexDays: -1 },
    { flexDays: 8 },
    { preferredDate: "20/10" },
    { service: "storage" },
  ])("rejects %o", (bad) => {
    expect(bookingSchema.safeParse({ ...input, ...bad }).success).toBe(false);
  });
});

describe("date labels", () => {
  it("formats days and ranges", () => {
    expect(formatDay("2026-10-20")).toBe("Tue, Oct 20");
    expect(formatShortDate("2026-10-20")).toBe("Oct 20");
    expect(formatRange("2026-10-15", "2026-10-31")).toMatch(/^Oct 15\s–\s31$/);
  });
});

describe("bookingFromAi", () => {
  const reading = {
    service: "drying",
    dayMonth: "20/10",
    flexDays: 0,
  } as const;

  it("converts sacks to kg in code and keeps kg as stated", () => {
    expect(bookingFromAi({ ...reading, amount: 20, unit: "sacks" })).toEqual({
      ...reading,
      estKg: 20 * SACK_KG,
    });
    expect(bookingFromAi({ ...reading, amount: 1500, unit: "kg" })).toEqual({
      ...reading,
      estKg: 1500,
    });
    expect(
      bookingFromAi({ ...reading, amount: 2.5, unit: "sacks" }).estKg,
    ).toBe(Math.round(2.5 * SACK_KG));
  });

  it("asks the AI for an amount and unit, not kg", () => {
    expect(
      bookingAiSchema.safeParse({ ...reading, amount: 20, unit: "sacks" })
        .success,
    ).toBe(true);
    expect(bookingAiSchema.safeParse({ ...reading, estKg: 1000 }).success).toBe(
      false,
    );
  });
});

describe("/book/track helpers", () => {
  it("cleans a typed ref to its stored form", () => {
    expect(cleanRef(" k7p-2qx ")).toBe("K7P2QX");
    expect(cleanRef("K7P 2QX")).toBe("K7P2QX");
  });
  it("lets only the client or booker see a booking", () => {
    const booking = { booked_by_phone: "+6392" };
    expect(isClientOrBooker(booking, "+6391", "+6391")).toBe(true);
    expect(isClientOrBooker(booking, "+6391", "+6392")).toBe(true);
    expect(isClientOrBooker(booking, "+6391", "+6393")).toBe(false);
  });
  it("locks a phone at the failure limit", () => {
    expect(isTrackLocked(TRACK_MAX_FAILURES - 1)).toBe(false);
    expect(isTrackLocked(TRACK_MAX_FAILURES)).toBe(true);
  });
});

describe("readBookingReply", () => {
  it("reads a bare number as kg, as asked", () => {
    expect(readBookingReply("1000")).toEqual({ amount: 1000, unit: "kg" });
    expect(readBookingReply("1,000 kilos")).toEqual({
      amount: 1000,
      unit: "kg",
    });
    expect(readBookingReply("1000kg")).toEqual({ amount: 1000, unit: "kg" });
  });

  it("reads sacks", () => {
    expect(readBookingReply("20 ka sako")).toEqual({
      amount: 20,
      unit: "sacks",
    });
    expect(readBookingReply("sako")).toEqual({ unit: "sacks" });
  });

  it("reads a day/month without taking it as the amount", () => {
    expect(readBookingReply("20/10")).toEqual({ dayMonth: "20/10" });
    expect(readBookingReply("500 kg sa 20/10")).toEqual({
      amount: 500,
      unit: "kg",
      dayMonth: "20/10",
    });
  });

  it("takes a number as the amount only with a unit or on its own", () => {
    expect(readBookingReply("sa Oct 20")).toBeNull();
    expect(readBookingReply("Lunes 20")).toBeNull();
    expect(readBookingReply("1000 kg sa Lunes")).toEqual({
      amount: 1000,
      unit: "kg",
    });
  });

  it("reads the service", () => {
    expect(readBookingReply("pa-dry")).toEqual({ service: "drying" });
    expect(readBookingReply("galing")).toEqual({ service: "milling" });
  });

  it("returns null when nothing is recognised", () => {
    expect(readBookingReply("wala ko kabalo")).toBeNull();
    expect(readBookingReply("0")).toBeNull();
  });
});
