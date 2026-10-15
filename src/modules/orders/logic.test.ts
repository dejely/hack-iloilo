import { describe, expect, it } from "vitest";
import {
  canCancel,
  estimateMinor,
  exceedsFree,
  freeKg,
  isRealDate,
  pickupDateError,
  requestLimited,
  orderStatusTones,
} from "./logic";

describe("canCancel", () => {
  it("allows cancelling until pickup or a decision closes it", () => {
    const open = Object.keys(orderStatusTones).filter((s) =>
      canCancel(s as keyof typeof orderStatusTones),
    );
    expect(open).toEqual(["requested", "accepted"]);
  });
});

describe("estimateMinor", () => {
  it("is kg × today's price in centavos", () => {
    expect(estimateMinor(2000, 4700)).toBe(9_400_000);
  });
});

describe("freeKg", () => {
  it("is on hand minus accepted, negative when over-promised", () => {
    expect(freeKg(1200, 500)).toBe(700);
    expect(freeKg(1200, 4000)).toBe(-2800);
  });
});

describe("exceedsFree", () => {
  it("flags an open request bigger than the free rice", () => {
    expect(exceedsFree({ kg: 800, status: "requested" }, 700)).toBe(true);
    expect(exceedsFree({ kg: 700, status: "requested" }, 700)).toBe(false);
  });

  it("ignores requests already decided", () => {
    expect(exceedsFree({ kg: 800, status: "accepted" }, 0)).toBe(false);
  });
});

describe("isRealDate", () => {
  it("rejects dates that don't exist", () => {
    expect(isRealDate("2026-02-28")).toBe(true);
    expect(isRealDate("2026-02-30")).toBe(false);
    expect(isRealDate("2026-13-01")).toBe(false);
  });
});

describe("pickupDateError", () => {
  it("allows today through 30 days ahead", () => {
    expect(pickupDateError("2026-10-16", "2026-10-16")).toBeNull();
    expect(pickupDateError("2026-11-15", "2026-10-16")).toBeNull();
  });

  it("rejects past days and days too far ahead", () => {
    expect(pickupDateError("2026-10-15", "2026-10-16")).toBe(
      "Choose today or a later date.",
    );
    expect(pickupDateError("2026-11-16", "2026-10-16")).toBe(
      "Choose a date within 30 days.",
    );
  });
});

describe("requestLimited", () => {
  it("locks at 3 requests per phone or 10 per IP", () => {
    expect(requestLimited(2, 9)).toBe(false);
    expect(requestLimited(3, 0)).toBe(true);
    expect(requestLimited(0, 10)).toBe(true);
  });
});
