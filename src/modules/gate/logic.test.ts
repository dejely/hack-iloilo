import { describe, expect, it } from "vitest";
import { checkInSchema } from "./checkin-schema";
import {
  arrivalLabel,
  batchNo,
  batchNoDate,
  batchOwnership,
  dispatchableKg,
  dispatchedKg,
  dispatchMode,
  dispatchPeriod,
  formatDay,
  formatWait,
  isFullyDispatched,
  kgByBuyerType,
  maskPhone,
  nextBatchNo,
  nextStage,
  normalizeBatchNo,
  normalizeRef,
  NOT_IN_LINE_REPLY,
  queueLines,
  queuePositions,
  queueStatusReply,
  recordDateNote,
  recoveryPct,
  refCheckInError,
  refLine,
  remainingKg,
  riceStockKg,
  traceOrigin,
  traceSteps,
  waitMinutes,
} from "./logic";
import type { QueueRow } from "./types";

const row = (overrides: Partial<QueueRow> = {}): QueueRow => ({
  id: "q1",
  facility_id: "f1",
  service: "drying",
  client_id: "c1",
  booking_id: null,
  offer_id: null,
  ownership: "custom",
  est_kg: 2500,
  checked_in_at: "2026-10-15T08:55:00+08:00",
  started_at: null,
  finished_at: null,
  status: "waiting",
  created_at: "",
  updated_at: "",
  client: { name: "Rodel Panes", phone: "+639172000001", kind: "farmer" },
  batch: null,
  booking: null,
  offer: null,
  ...overrides,
});

describe("batch numbers", () => {
  it("formats YYMMDD-NNN", () => {
    expect(batchNo("2026-10-15", 7)).toBe("261015-007");
  });
  it("starts each day at 001", () => {
    expect(nextBatchNo("2026-10-15", [])).toBe("261015-001");
    expect(nextBatchNo("2026-10-16", ["261015-004"])).toBe("261016-001");
  });
  it("continues the day's sequence numerically", () => {
    expect(nextBatchNo("2026-10-15", ["261015-002", "261015-010"])).toBe(
      "261015-011",
    );
    expect(nextBatchNo("2026-10-15", ["261015-999", "261015-1000"])).toBe(
      "261015-1001",
    );
  });
});

describe("batchOwnership", () => {
  it("derives from offers and bookings, else the check-in choice", () => {
    const entry = { offer_id: null, booking_id: null, ownership: null };
    expect(batchOwnership({ ...entry, offer_id: "o1" })).toBe("irpc");
    expect(batchOwnership({ ...entry, booking_id: "b1" })).toBe("custom");
    expect(batchOwnership({ ...entry, ownership: "irpc" })).toBe("irpc");
    expect(batchOwnership(entry)).toBe("custom");
  });
});

describe("queueLines", () => {
  it("splits by service, serving first, waiting first come first served", () => {
    const lines = queueLines([
      row({ id: "late", checked_in_at: "2026-10-15T09:50:00+08:00" }),
      row({ id: "early", checked_in_at: "2026-10-15T08:10:00+08:00" }),
      row({
        id: "serving",
        status: "serving",
        started_at: "2026-10-15T09:58:00+08:00",
      }),
      row({ id: "mill", service: "milling" }),
      row({ id: "gone", status: "left" }),
    ]);
    expect(lines.drying.serving.map((r) => r.id)).toEqual(["serving"]);
    expect(lines.drying.waiting.map((r) => r.id)).toEqual(["early", "late"]);
    expect(lines.milling.waiting.map((r) => r.id)).toEqual(["mill"]);
  });
});

describe("queuePositions", () => {
  const lines = queueLines([
    row({
      id: "a",
      client_id: "other",
      checked_in_at: "2026-10-15T08:00:00+08:00",
    }),
    row({
      id: "b",
      client_id: "c1",
      checked_in_at: "2026-10-15T08:30:00+08:00",
    }),
    row({
      id: "c",
      client_id: "c1",
      checked_in_at: "2026-10-15T09:30:00+08:00",
    }),
    row({
      id: "d",
      client_id: "c1",
      service: "milling",
      status: "serving",
      started_at: "2026-10-15T09:00:00+08:00",
    }),
    row({ id: "e", client_id: "c2", status: "done" }),
    row({ id: "f", client_id: "c3", service: "milling" }),
    row({
      id: "g",
      client_id: "c3",
      status: "serving",
      started_at: "2026-10-15T09:00:00+08:00",
    }),
  ]);

  it("gives the earliest waiting place per line, or serving", () => {
    expect(queuePositions(lines, "c1")).toEqual([
      { service: "drying", serving: false, position: 2 },
      { service: "milling", serving: true },
    ]);
  });

  it("prefers serving over a later waiting entry", () => {
    expect(queuePositions(lines, "c3")).toEqual([
      { service: "drying", serving: true },
      { service: "milling", serving: false, position: 1 },
    ]);
  });

  it("skips done and left entries", () => {
    expect(queuePositions(lines, "c2")).toEqual([]);
  });
});

describe("queueStatusReply", () => {
  const gsm7 = /^[A-Za-z0-9 @$_!"#%&'()*+,\-./:;<=>?\n]*$/;

  it("lists each line", () => {
    const reply = queueStatusReply([
      { service: "drying", serving: false, position: 3 },
      { service: "milling", serving: true },
    ]);
    expect(reply).toBe(
      "IRPC: Drying: #3 ka sa linya. Milling: ikaw na ang ginaserbisyuhan subong.",
    );
    expect(reply).toMatch(gsm7);
    expect(reply.length).toBeLessThanOrEqual(160);
  });

  it("is short when not in line", () => {
    expect(queueStatusReply([])).toBe(NOT_IN_LINE_REPLY);
    expect(NOT_IN_LINE_REPLY).toMatch(gsm7);
  });
});

describe("nextStage", () => {
  it("moves received forward through drying to stored", () => {
    expect(nextStage({ stage: "received" }, "start_drying")).toBe("drying");
    expect(nextStage({ stage: "drying" }, "finish_drying")).toBe("stored");
  });

  it("skips drying straight from received to stored", () => {
    expect(nextStage({ stage: "received" }, "skip_drying")).toBe("stored");
  });

  it("moves stored forward through milling to milled", () => {
    expect(nextStage({ stage: "stored" }, "start_milling")).toBe("milling");
    expect(nextStage({ stage: "milling" }, "finish_milling")).toBe("milled");
  });

  it("rejects an action that does not apply to the current stage", () => {
    expect(() => nextStage({ stage: "received" }, "start_milling")).toThrow();
    expect(() => nextStage({ stage: "stored" }, "start_drying")).toThrow();
    expect(() => nextStage({ stage: "drying" }, "skip_drying")).toThrow();
  });

  it("never moves backward or re-enters a finished stage", () => {
    expect(() => nextStage({ stage: "milled" }, "start_drying")).toThrow();
    expect(() => nextStage({ stage: "milled" }, "start_milling")).toThrow();
    expect(() => nextStage({ stage: "stored" }, "finish_drying")).toThrow();
  });
});

describe("recoveryPct", () => {
  it("is rice over mill-in as a percent, rounded to one decimal", () => {
    expect(recoveryPct(650, 1000)).toBe(65);
    expect(recoveryPct(673, 1000)).toBe(67.3);
    expect(recoveryPct(2, 3)).toBe(66.7);
  });

  it("is null when there is no mill-in weight yet", () => {
    expect(recoveryPct(null, null)).toBeNull();
    expect(recoveryPct(650, null)).toBeNull();
    expect(recoveryPct(650, 0)).toBeNull();
  });
});

describe("dispatchMode", () => {
  it("sells IRPC rice and hands custom batches back to their owner", () => {
    expect(dispatchMode("irpc")).toBe("sale");
    expect(dispatchMode("custom")).toBe("pickup");
  });
});

describe("dispatchableKg", () => {
  it("is the milled rice once a batch is milled, either ownership", () => {
    expect(
      dispatchableKg({
        ownership: "irpc",
        stage: "milled",
        rice_kg: 5400,
        dried_kg: 7800,
      }),
    ).toBe(5400);
    expect(
      dispatchableKg({
        ownership: "custom",
        stage: "milled",
        rice_kg: 1200,
        dried_kg: 1800,
      }),
    ).toBe(1200);
  });

  it("is the dried palay for a stored custom batch not yet milled", () => {
    expect(
      dispatchableKg({
        ownership: "custom",
        stage: "stored",
        rice_kg: null,
        dried_kg: 2300,
      }),
    ).toBe(2300);
  });

  it("keeps the dried palay dispatchable once a custom pickup is dispatched", () => {
    expect(
      dispatchableKg({
        ownership: "custom",
        stage: "dispatched",
        rice_kg: null,
        dried_kg: 2300,
      }),
    ).toBe(2300);
  });

  it("is nothing for a custom batch while it is being milled", () => {
    expect(
      dispatchableKg({
        ownership: "custom",
        stage: "milling",
        rice_kg: null,
        dried_kg: 2300,
      }),
    ).toBe(0);
  });

  it("is nothing for IRPC palay before it is milled", () => {
    expect(
      dispatchableKg({
        ownership: "irpc",
        stage: "stored",
        rice_kg: null,
        dried_kg: 9000,
      }),
    ).toBe(0);
  });

  it("is nothing when neither rice nor dried weight is recorded", () => {
    expect(
      dispatchableKg({
        ownership: "custom",
        stage: "stored",
        rice_kg: null,
        dried_kg: null,
      }),
    ).toBe(0);
  });
});

describe("dispatched and remaining kg", () => {
  it("sums what has been dispatched", () => {
    expect(dispatchedKg([])).toBe(0);
    expect(dispatchedKg([{ kg: 1800 }, { kg: 1200 }])).toBe(3000);
  });

  it("is the dispatchable weight less what has left, never negative", () => {
    expect(remainingKg(5400, 1800)).toBe(3600);
    expect(remainingKg(5400, 5400)).toBe(0);
    expect(remainingKg(5400, 6000)).toBe(0);
  });
});

describe("kgByBuyerType", () => {
  it("sums kg per buyer type, keeping untyped buyers apart", () => {
    const kg = kgByBuyerType([
      { kg: 3000, buyerType: "wholesaler" },
      { kg: 2400, buyerType: "wholesaler" },
      { kg: 1800, buyerType: "subsidy_program" },
      { kg: 500, buyerType: null },
    ]);
    expect(kg.get("wholesaler")).toBe(5400);
    expect(kg.get("subsidy_program")).toBe(1800);
    expect(kg.get(null)).toBe(500);
    expect(kg.has("retailer")).toBe(false);
  });

  it("is empty with no dispatches", () => {
    expect(kgByBuyerType([]).size).toBe(0);
  });
});

describe("dispatchPeriod", () => {
  const today = "2026-10-15";

  it("keeps a valid from-to range", () => {
    expect(dispatchPeriod("2026-09-01", "2026-09-30", today)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(dispatchPeriod(today, today, today)).toEqual({
      from: today,
      to: today,
    });
  });

  it("falls back to this month so far when missing, invalid or reversed", () => {
    const month = { from: "2026-10-01", to: today };
    expect(dispatchPeriod(undefined, undefined, today)).toEqual(month);
    expect(dispatchPeriod("2026-02-31", "2026-03-05", today)).toEqual(month);
    expect(dispatchPeriod("yesterday", today, today)).toEqual(month);
    expect(dispatchPeriod(["2026-09-01"], today, today)).toEqual(month);
    expect(dispatchPeriod("2026-09-30", "2026-09-01", today)).toEqual(month);
  });
});

describe("isFullyDispatched", () => {
  it("is true once every dispatchable kg has left", () => {
    expect(isFullyDispatched(5400, 5400)).toBe(true);
    expect(isFullyDispatched(5400, 5401)).toBe(true);
  });

  it("is false while weight remains or nothing is dispatchable", () => {
    expect(isFullyDispatched(5400, 3600)).toBe(false);
    expect(isFullyDispatched(0, 0)).toBe(false);
  });
});

describe("wait time", () => {
  it("counts whole minutes and formats hours", () => {
    const now = new Date("2026-10-15T10:20:30+08:00");
    expect(waitMinutes("2026-10-15T08:55:00+08:00", now)).toBe(85);
    expect(waitMinutes("2026-10-15T10:30:00+08:00", now)).toBe(0);
    expect(formatWait(25)).toBe("25 min");
    expect(formatWait(65)).toBe("1 h 5 min");
    expect(formatWait(120)).toBe("2 h");
  });
});

describe("arrivalLabel", () => {
  it("names how the client arrived", () => {
    expect(arrivalLabel({ booking_id: "b", offer_id: null })).toBe("Booking");
    expect(arrivalLabel({ booking_id: null, offer_id: "o" })).toBe("Offer");
    expect(arrivalLabel({ booking_id: null, offer_id: null })).toBe("Walk-in");
  });
  it("shows the ref when the row has one", () => {
    expect(
      arrivalLabel(row({ booking_id: "b", booking: { ref: "K7P2QX" } })),
    ).toBe("K7P2QX");
    expect(arrivalLabel(row({ offer_id: "o", offer: { ref: "SELL06" } }))).toBe(
      "SELL06",
    );
  });
});

describe("ref check-in", () => {
  it("normalizes typed refs", () => {
    expect(normalizeRef(" k7p-2qx ")).toBe("K7P2QX");
    expect(normalizeRef("k7p 2qx")).toBe("K7P2QX");
  });
  it.each(["confirmed", "reschedule_proposed"] as const)(
    "lets a %s booking check in",
    (status) => {
      expect(refCheckInError({ kind: "booking", status })).toBeNull();
    },
  );
  it.each(["arrived", "cancelled", "no_show"] as const)(
    "stops a %s booking",
    (status) => {
      expect(refCheckInError({ kind: "booking", status })).toMatch(/booking/);
    },
  );
  it("lets only accepted offers check in", () => {
    expect(refCheckInError({ kind: "offer", status: "accepted" })).toBeNull();
    for (const status of [
      "offered",
      "declined",
      "arrived",
      "withdrawn",
    ] as const)
      expect(refCheckInError({ kind: "offer", status })).toMatch(/offer/);
  });
  it("takes the booking's service as custom and offers to drying as IRPC", () => {
    expect(refLine({ kind: "booking", service: "milling" })).toEqual({
      service: "milling",
      ownership: "custom",
    });
    expect(refLine({ kind: "offer" })).toEqual({
      service: "drying",
      ownership: "irpc",
    });
  });
  it("masks phones", () => {
    expect(maskPhone("+639163393390")).toBe("0916•••3390");
  });
  it("places the record date against today", () => {
    expect(formatDay("2026-10-15")).toBe("Thu, Oct 15");
    expect(recordDateNote("booking", "2026-10-15", "2026-10-15")).toBe(
      "Scheduled for today",
    );
    expect(recordDateNote("booking", "2026-10-16", "2026-10-15")).toBe(
      "Arrived 1 day early",
    );
    expect(recordDateNote("booking", "2026-10-12", "2026-10-15")).toBe(
      "Arrived 3 days late",
    );
    expect(recordDateNote("offer", "2026-10-20", "2026-10-15")).toBe(
      "Harvest date shown",
    );
  });
});

describe("checkInSchema", () => {
  const input = {
    mode: "phone",
    ref: "",
    phone: "0917 123 4567",
    service: "drying",
    ownership: "custom",
    estKg: null,
    name: "",
    kind: "farmer",
    municipality_id: null,
  };
  it("accepts a phone check-in without kg", () => {
    expect(checkInSchema.safeParse(input).success).toBe(true);
  });
  it.each([
    { phone: "12345" },
    { estKg: 0 },
    { estKg: 1.5 },
    { ownership: "sold" },
    { mode: "walkIn" },
  ])("rejects %o", (bad) => {
    expect(checkInSchema.safeParse({ ...input, ...bad }).success).toBe(false);
  });
  it("needs only a full ref for booking and offer check-ins", () => {
    for (const mode of ["booking", "offer"]) {
      expect(
        checkInSchema.safeParse({ ...input, mode, ref: "k7p-2qx", phone: "" })
          .success,
      ).toBe(true);
      expect(
        checkInSchema.safeParse({ ...input, mode, ref: "K7P" }).success,
      ).toBe(false);
    }
  });
  it("accepts a named walk-in", () => {
    expect(
      checkInSchema.safeParse({ ...input, mode: "walkIn", name: "Ana" })
        .success,
    ).toBe(true);
  });
});

describe("riceStockKg", () => {
  const milled = {
    ownership: "irpc" as const,
    stage: "milled" as const,
    rice_kg: 1000,
    dried_kg: 1500,
    dispatches: [{ kg: 300 }],
  };

  it("sums what's left of IRPC rice", () => {
    expect(riceStockKg([milled, { ...milled, dispatches: [] }])).toBe(1700);
  });

  it("ignores custom batches", () => {
    expect(riceStockKg([{ ...milled, ownership: "custom" }])).toBe(0);
  });

  it("never goes below zero", () => {
    expect(riceStockKg([{ ...milled, dispatches: [{ kg: 1200 }] }])).toBe(0);
  });
});

describe("normalizeBatchNo", () => {
  it("adds the dash to digits typed on a keypad", () => {
    expect(normalizeBatchNo("261015007")).toBe("261015-007");
  });

  it("drops spaces and keeps a typed dash", () => {
    expect(normalizeBatchNo(" 261015-007 ")).toBe("261015-007");
  });

  it("is empty for no digits", () => {
    expect(normalizeBatchNo("abc")).toBe("");
  });
});

describe("batchNoDate", () => {
  it("reads the receiving day from the batch no.", () => {
    expect(batchNoDate(batchNo("2026-10-15", 7))).toBe("2026-10-15");
  });
});

describe("traceSteps", () => {
  it("lists each stage with its Manila date", () => {
    expect(
      traceSteps({
        batchNo: "261020-001",
        dryEnd: "2026-10-22T17:00:00Z",
        millEnd: "2026-10-25T03:00:00Z",
      }),
    ).toEqual([
      { label: "Received", date: "2026-10-20" },
      { label: "Dried", date: "2026-10-23" },
      { label: "Milled", date: "2026-10-25" },
    ]);
  });

  it("leaves out drying for dry palay", () => {
    expect(
      traceSteps({
        batchNo: "261020-001",
        dryEnd: null,
        millEnd: "2026-10-21T03:00:00Z",
      }).map((s) => s.label),
    ).toEqual(["Received", "Milled"]);
  });
});

describe("traceOrigin", () => {
  const farmer = {
    kind: "farmer",
    name: "Merlinda Tayco",
    coopName: null,
    municipality: "Pototan",
  };

  it("names a co-op client", () => {
    expect(
      traceOrigin({ ...farmer, kind: "coop", name: "Lumbo Rice Growers" }),
    ).toBe("Lumbo Rice Growers");
  });

  it("shows a member's co-op, not their name", () => {
    expect(traceOrigin({ ...farmer, coopName: "Amamaros Farmers MPC" })).toBe(
      "Amamaros Farmers MPC",
    );
  });

  it("falls back to the municipality, never a person or trader's name", () => {
    expect(traceOrigin(farmer)).toBe("Pototan farmers");
    expect(
      traceOrigin({ ...farmer, kind: "trader", name: "Nonoy Palay Trading" }),
    ).toBe("Pototan farmers");
  });

  it("is null with nothing safe to show", () => {
    expect(traceOrigin({ ...farmer, municipality: null })).toBeNull();
  });
});
