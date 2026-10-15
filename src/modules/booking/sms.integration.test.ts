import { randomInt, randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/accounts/auth", () => ({ requireRole: vi.fn() }));
// Never send real SMS, even if the developer's gateway configuration changes.
const { gatewaySend } = vi.hoisted(() => ({ gatewaySend: vi.fn() }));
vi.mock("@/lib/sms", () => ({ smsGateway: () => ({ send: gatewaySend }) }));
import * as dates from "@/lib/dates";
import { db } from "@/lib/supabase/admin";
import { findClientByPhone } from "@/modules/accounts/queries";
import {
  fillTemplate,
  isGsm7,
  SMS_MAX_CHARS,
  smsReplies,
} from "@/modules/sms/logic";
import * as sms from "@/modules/sms/queries";
import {
  answerTrackedProposal,
  bookForClient,
  cancelTrackedBooking,
  moveBookingByStaff,
  moveTrackedBooking,
  trackBooking,
} from "./actions";
import { bookingSms, formatDay } from "./logic";
import {
  bookingsBetween,
  findByRef,
  moveBooking,
  proposeReschedule,
} from "./queries";

// Opt in with an existing local Supabase environment; no database reset required.
describe.skipIf(process.env.RUN_BOOKING_SMS_DB_TESTS !== "1")(
  "booking commands through the inbound SMS router",
  () => {
    const phones = Array.from(
      { length: 3 },
      () => `+639${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`,
    );
    const [sender, beneficiary, stranger] = phones;
    const thread = (phone = sender) => sms.smsThread(phone);
    const lastReply = async (phone = sender) =>
      (await thread(phone)).filter((m) => m.direction === "outbound").at(-1)!;
    const inbound = (body: string, phone = sender, gatewayId?: string) =>
      sms.handleInbound({ phone, body, gatewayId });
    const book = async (body = "BOOK DRY 5000 20/10", phone = sender) => {
      await inbound(body, phone);
      const reply = await lastReply(phone);
      expect(reply.body).toContain("Confirmed na ang booking");
      const ref = /Ref ([A-Z0-9]{6})/.exec(reply.body)![1];
      return (await findByRef(ref))!;
    };

    beforeAll(() => {
      const hostname = new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid",
      ).hostname;
      if (!["localhost", "127.0.0.1"].includes(hostname))
        throw new Error("Booking integration tests require local Supabase.");
      gatewaySend.mockImplementation(async () => ({
        id: `test-${randomUUID()}`,
      }));
    });
    afterEach(() => vi.restoreAllMocks());
    afterAll(async () => {
      for (const [table, column] of [
        ["bookings", "booked_by_phone"],
        ["sms_messages", "phone"],
        ["sms_prompts", "phone"],
        ["track_attempts", "phone"],
        ["clients", "phone"],
      ] as const) {
        const { error } = await db().from(table).delete().in(column, phones);
        if (error) throw error;
      }
    });

    it("books drying with the sender's identity and one GSM-7 confirmation", async () => {
      const booking = await book();
      const client = await findClientByPhone(sender);
      expect(booking).toMatchObject({
        client_id: client!.id,
        booked_by_phone: sender,
        channel: "sms",
        service: "drying",
        est_kg: 5000,
        flex_days: 0,
        status: "confirmed",
      });
      const replies = (await thread()).filter(
        (m) => m.direction === "outbound",
      );
      expect(replies).toHaveLength(1);
      expect(replies[0].body).toContain(booking.scheduled_date);
      expect(isGsm7(replies[0].body)).toBe(true);
      expect(replies[0].body.length).toBeLessThanOrEqual(SMS_MAX_CHARS);
    });

    it("registers a FOR beneficiary, books milling and confirms to both phones", async () => {
      const before = (await thread()).length;
      const booking = await book(
        `book mill 3000 20/10 ±3 FOR ${beneficiary.replace("+63", "0")}`,
      );
      const client = await findClientByPhone(beneficiary);
      expect(booking).toMatchObject({
        client_id: client!.id,
        service: "milling",
        flex_days: 3,
        booked_by_phone: sender,
      });
      expect((await lastReply(beneficiary)).body).toBe(
        (await lastReply()).body,
      );
      expect((await thread()).length).toBe(before + 2);
    });

    it("avoids duplicate confirmation for FOR the sender", async () => {
      const before = (await thread()).length;
      await book(`BOOK DRY 1 20/10 FOR ${sender}`);
      expect((await thread()).length).toBe(before + 2);
    });

    it("rejects invalid arguments and impossible dates without creating bookings", async () => {
      const count = async () => {
        const { count, error } = await db()
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("booked_by_phone", sender);
        if (error) throw error;
        return count;
      };
      const before = await count();
      for (const body of [
        "BOOK DRY 0 20/10",
        "BOOK DRY 1.5 20/10",
        "BOOK DRY 1 31/02",
        "BOOK DRY 1 20/10 ±8",
        "CANCEL ABC123 extra",
        "BOOK DRY 1 20/10 FOR invalid",
      ]) {
        await inbound(body);
        expect((await lastReply()).body).toContain("wala namon naintiendihan");
      }
      expect(await count()).toBe(before);
    });

    it("resolves dates against Manila today, including year rollover", async () => {
      vi.spyOn(dates, "todayManila").mockReturnValue("2026-12-31");
      const booking = await book("BOOK MILL 100 01/01");
      expect(booking.scheduled_date).toBe("2027-01-01");
      expect(booking.preferred_date).toBe("2027-01-01");
    });

    it("does not create a second booking for a duplicate gateway delivery", async () => {
      const gatewayId = `booking-test-${randomUUID()}`;
      const before = (await thread()).length;
      await inbound("BOOK DRY 10 20/10", sender, gatewayId);
      await inbound("BOOK DRY 10 20/10", sender, gatewayId);
      expect((await thread()).length).toBe(before + 2);
    });

    it("authorizes the actual sender, not FOR, and allows the beneficiary to cancel", async () => {
      const booking = await book(`BOOK DRY 100 20/10 FOR ${beneficiary}`);
      await inbound(`CANCEL ${booking.ref} FOR ${beneficiary}`, stranger);
      expect((await lastReply(stranger)).body).toContain(
        "wala namon naintiendihan",
      );
      expect((await findByRef(booking.ref))!.status).toBe("confirmed");
      await inbound(`cancel ${booking.ref.toLowerCase()}`, beneficiary);
      expect((await findByRef(booking.ref))!.status).toBe("cancelled");
      expect((await lastReply(beneficiary)).body).toContain(
        `Na-cancel na ang booking ${booking.ref}`,
      );
    });

    it("allows the original booker to cancel a beneficiary's booking", async () => {
      const booking = await book(`BOOK DRY 100 20/10 FOR ${beneficiary}`);
      await inbound(`CANCEL ${booking.ref}`);
      expect((await findByRef(booking.ref))!.status).toBe("cancelled");
      await inbound(`CANCEL ${booking.ref}`);
      expect((await lastReply()).body).toContain("Indi na ma-cancel");
    });

    it("reports unknown references", async () => {
      await inbound("CANCEL ZZZZZZ");
      expect((await lastReply()).body).toContain(
        "Wala sang booking nga may code",
      );
    });

    it("sends staff confirmations and preserves saved bookings if SMS logging fails", async () => {
      const client = (await findClientByPhone(sender))!;
      const input = {
        clientId: client.id,
        service: "drying",
        estKg: 50,
        preferredDate: dates.todayManila(),
        flexDays: 0,
      };
      const result = await bookForClient(input);
      expect(result.status).toBe("created");
      if (result.status !== "created") throw new Error("Staff booking failed");
      expect((await lastReply()).body).toContain(result.booking.ref);
      vi.spyOn(sms, "send").mockRejectedValueOnce(
        new Error("SMS log unavailable"),
      );
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      const saved = await bookForClient(input);
      expect(saved.status).toBe("created");
      if (saved.status !== "created")
        throw new Error("Saved booking reported as failed");
      expect(await findByRef(saved.booking.ref)).not.toBeNull();
      expect(errorLog).toHaveBeenCalled();
    });

    it("texts a reschedule and moves the booking on YES", async () => {
      const booking = await book("BOOK DRY 700 20/10 ±3");
      const to = dates.addDays(booking.scheduled_date, 2);
      expect(await proposeReschedule(booking.id, to)).toMatchObject({
        status: "reschedule_proposed",
        proposed_date: to,
      });
      const question = (await lastReply()).body;
      expect(question).toContain(
        `Reply YES ${booking.ref} ukon NO ${booking.ref}`,
      );
      expect(isGsm7(question)).toBe(true);
      expect(question.length).toBeLessThanOrEqual(SMS_MAX_CHARS);
      // Already proposed: not asked twice.
      expect(await proposeReschedule(booking.id, to)).toBeNull();

      await inbound(`YES ${booking.ref}`, stranger);
      expect((await lastReply(stranger)).body).toContain(
        "wala namon naintiendihan",
      );
      expect((await findByRef(booking.ref))!.status).toBe(
        "reschedule_proposed",
      );

      await inbound(`yes ${booking.ref.toLowerCase()}`);
      expect(await findByRef(booking.ref)).toMatchObject({
        status: "confirmed",
        scheduled_date: to,
        proposed_date: null,
      });
      expect((await lastReply()).body).toContain(
        `Na-saylo na ang booking ${booking.ref}`,
      );
    });

    it("keeps the date on NO from the booker and tells the client", async () => {
      const booking = await book(`BOOK DRY 700 20/10 ±3 FOR ${beneficiary}`);
      await proposeReschedule(
        booking.id,
        dates.addDays(booking.scheduled_date, 1),
      );
      expect((await lastReply(beneficiary)).body).toContain(
        `YES ${booking.ref}`,
      );
      await inbound(`NO ${booking.ref}`);
      expect(await findByRef(booking.ref)).toMatchObject({
        status: "confirmed",
        scheduled_date: booking.scheduled_date,
        proposed_date: null,
      });
      expect((await lastReply()).body).toBe(
        fillTemplate(bookingSms.rescheduleKept, {
          ref: booking.ref,
          date: formatDay(booking.scheduled_date),
        }),
      );
      expect((await lastReply(beneficiary)).body).toBe(
        (await lastReply()).body,
      );
    });

    it("moves a booking by MOVE from the client and keeps its ref and kg", async () => {
      const booking = await book("BOOK DRY 800 20/10 ±2");
      const to = dates.addDays(booking.scheduled_date, 3);
      const [, month, day] = to.split("-");
      await inbound(`move ${booking.ref.toLowerCase()} ${day}/${month}`);
      expect(await findByRef(booking.ref)).toMatchObject({
        id: booking.id,
        status: "confirmed",
        est_kg: 800,
        preferred_date: to,
        scheduled_date: to,
        flex_days: 2,
      });
      const reply = (await lastReply()).body;
      expect(reply).toContain(`Na-saylo na ang booking ${booking.ref}`);
      expect(isGsm7(reply)).toBe(true);
      expect(reply.length).toBeLessThanOrEqual(SMS_MAX_CHARS);

      await inbound(`MOVE ${booking.ref} ${day}/${month} ±5`);
      expect((await findByRef(booking.ref))!.flex_days).toBe(5);
    });

    it("refuses MOVE from a stranger, for unknown refs and closed bookings", async () => {
      const booking = await book(`BOOK DRY 100 20/10 FOR ${beneficiary}`);
      await inbound(`MOVE ${booking.ref} 25/10 FOR ${beneficiary}`, stranger);
      expect((await lastReply(stranger)).body).toContain(
        "wala namon naintiendihan",
      );
      expect((await findByRef(booking.ref))!.scheduled_date).toBe(
        booking.scheduled_date,
      );
      await inbound("MOVE ZZZZZZ 25/10");
      expect((await lastReply()).body).toContain("wala namon naintiendihan");
      await inbound(`MOVE ${booking.ref} 31/02`);
      expect((await lastReply()).body).toContain("Indi husto ang petsa");
      await inbound(`CANCEL ${booking.ref}`);
      await inbound(`MOVE ${booking.ref} 25/10`);
      expect((await lastReply()).body).toContain("Indi na ma-saylo");
    });

    it("drops a pending reschedule on MOVE from the booker and tells the client", async () => {
      const booking = await book(`BOOK DRY 700 20/10 ±3 FOR ${beneficiary}`);
      await proposeReschedule(
        booking.id,
        dates.addDays(booking.scheduled_date, 1),
      );
      const to = dates.addDays(booking.scheduled_date, 4);
      const [, month, day] = to.split("-");
      await inbound(`MOVE ${booking.ref} ${day}/${month}`);
      expect(await findByRef(booking.ref)).toMatchObject({
        status: "confirmed",
        scheduled_date: to,
        proposed_date: null,
      });
      expect((await lastReply(beneficiary)).body).toBe(
        (await lastReply()).body,
      );
      const { data: prompts, error } = await db()
        .from("sms_prompts")
        .select("status")
        .eq("ref", booking.ref);
      if (error) throw error;
      expect(prompts.map((p) => p.status)).toEqual(["expired"]);
      // A late answer to the old question no longer moves the booking.
      await inbound(`YES ${booking.ref}`, beneficiary);
      expect((await findByRef(booking.ref))!.scheduled_date).toBe(to);
    });

    it("rejects past dates, excess flex and every closed status without changing the booking", async () => {
      const booking = await book();
      expect(
        await moveBooking(booking.ref, dates.addDays(dates.todayManila(), -1)),
      ).toMatchObject({
        status: "invalid",
        message: "Choose today or a later date.",
      });
      await inbound(`MOVE ${booking.ref} 25/10 +8`);
      expect((await lastReply()).body).toContain("0 tubtob 7");
      expect(await findByRef(booking.ref)).toEqual(booking);
      for (const status of ["arrived", "cancelled", "no_show"] as const) {
        const { error } = await db()
          .from("bookings")
          .update({ status })
          .eq("id", booking.id);
        if (error) throw error;
        await inbound(`MOVE ${booking.ref} 25/10`);
        expect((await lastReply()).body).toContain("Indi na ma-saylo");
        expect((await findByRef(booking.ref))!.status).toBe(status);
      }
    });

    it("staff move clears the proposal, notifies both phones, and updates capacity inputs", async () => {
      const booking = await book(`BOOK MILL 700 20/10 +3 FOR ${beneficiary}`);
      await proposeReschedule(
        booking.id,
        dates.addDays(booking.scheduled_date, 1),
      );
      const to = dates.addDays(booking.scheduled_date, 4);
      expect(
        await moveBookingByStaff({ ref: booking.ref, date: to, flexDays: 1 }),
      ).toEqual({ status: "moved" });
      expect(await findByRef(booking.ref)).toMatchObject({
        id: booking.id,
        ref: booking.ref,
        service: booking.service,
        est_kg: booking.est_kg,
        scheduled_date: to,
        preferred_date: to,
        flex_days: 1,
        proposed_date: null,
        status: "confirmed",
      });
      expect((await lastReply()).body).toBe(
        (await lastReply(beneficiary)).body,
      );
      expect((await lastReply()).body).toContain(
        `Na-saylo na ang booking ${booking.ref}`,
      );
      expect(
        (
          await bookingsBetween(booking.scheduled_date, booking.scheduled_date)
        ).some((b) => b.id === booking.id),
      ).toBe(false);
      expect(
        (await bookingsBetween(to, to)).some((b) => b.id === booking.id),
      ).toBe(true);
      const { data, error } = await db()
        .from("sms_prompts")
        .select("status")
        .eq("ref", booking.ref);
      if (error) throw error;
      expect(data.map((p) => p.status)).toEqual(["expired"]);
      await inbound(`YES ${booking.ref}`, beneficiary);
      expect((await findByRef(booking.ref))!.scheduled_date).toBe(to);
    });

    it("still confirms to the sender when beneficiary notification fails", async () => {
      const original = sms.send;
      vi.spyOn(sms, "send").mockImplementation(
        async (phone, template, vars) => {
          if (phone === beneficiary)
            throw new Error("Beneficiary SMS log unavailable");
          return original(phone, template, vars);
        },
      );
      vi.spyOn(console, "error").mockImplementation(() => {});
      const booking = await book(`BOOK DRY 100 20/10 FOR ${beneficiary}`);
      expect(booking.status).toBe("confirmed");
    });

    it("accepts a proposal on /track like YES and ignores a late SMS YES", async () => {
      const booking = await book(`BOOK DRY 700 20/10 ±3 FOR ${beneficiary}`);
      const to = dates.addDays(booking.scheduled_date, 2);
      await proposeReschedule(booking.id, to);
      const owner = { ref: booking.ref.toLowerCase(), phone: sender };
      expect(
        await answerTrackedProposal({ ...owner, yes: true }),
      ).toMatchObject({
        status: "found",
        booking: { status: "confirmed", scheduled_date: to },
      });
      expect(await findByRef(booking.ref)).toMatchObject({
        status: "confirmed",
        scheduled_date: to,
        proposed_date: null,
      });
      const moved = fillTemplate(bookingSms.rescheduleMoved, {
        ref: booking.ref,
        date: formatDay(to),
      });
      expect((await lastReply()).body).toBe(moved);
      expect((await lastReply(beneficiary)).body).toBe(moved);

      await inbound(`YES ${booking.ref}`, beneficiary);
      expect((await lastReply(beneficiary)).body).toBe(smsReplies.noPrompt);
      expect(await answerTrackedProposal({ ...owner, yes: false })).toEqual({
        status: "error",
        message: "This booking is no longer waiting for an answer.",
      });
    });

    it("cancels and moves on /track like CANCEL and MOVE, for the client or booker only", async () => {
      const booking = await book(`BOOK DRY 400 20/10 ±1 FOR ${beneficiary}`);
      const notFound = {
        status: "error",
        message: "No booking matches that code and phone.",
      };
      expect(await trackBooking({ ref: booking.ref, phone: stranger })).toEqual(
        notFound,
      );
      expect(
        await cancelTrackedBooking({ ref: booking.ref, phone: stranger }),
      ).toEqual(notFound);
      expect((await findByRef(booking.ref))!.status).toBe("confirmed");

      const to = dates.addDays(booking.scheduled_date, 3);
      expect(
        await moveTrackedBooking({
          ref: booking.ref,
          phone: beneficiary,
          date: to,
          flexDays: 2,
        }),
      ).toMatchObject({ status: "found", booking: { scheduled_date: to } });
      expect(await findByRef(booking.ref)).toMatchObject({
        status: "confirmed",
        preferred_date: to,
        scheduled_date: to,
        flex_days: 2,
      });
      expect((await lastReply(beneficiary)).body).toContain(
        `Na-saylo na ang booking ${booking.ref}`,
      );

      expect(
        await cancelTrackedBooking({ ref: booking.ref, phone: sender }),
      ).toMatchObject({ status: "found", booking: { status: "cancelled" } });
      expect((await findByRef(booking.ref))!.status).toBe("cancelled");
      expect((await lastReply()).body).toBe(
        fillTemplate(bookingSms.cancelled, { ref: booking.ref }),
      );
      expect(
        await moveTrackedBooking({
          ref: booking.ref,
          phone: sender,
          date: to,
          flexDays: 0,
        }),
      ).toEqual({
        status: "error",
        message: "Only upcoming bookings can be moved.",
      });
    });

    it("locks /track for a phone after repeated misses", async () => {
      const booking = await book();
      await db().from("track_attempts").delete().eq("phone", stranger);
      for (let i = 0; i < 5; i++)
        expect(
          await trackBooking({ ref: booking.ref, phone: stranger }),
        ).toMatchObject({ message: "No booking matches that code and phone." });
      expect(
        await trackBooking({ ref: booking.ref, phone: stranger }),
      ).toMatchObject({ message: expect.stringContaining("Too many tries") });
      // Other phones are unaffected.
      expect(
        await trackBooking({ ref: booking.ref, phone: sender }),
      ).toMatchObject({ status: "found" });
    });
  },
);
