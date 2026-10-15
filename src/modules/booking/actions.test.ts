import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/accounts/auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/dates", () => ({ todayManila: () => "2026-10-15" }));
vi.mock("@/modules/accounts/queries", () => ({
  findOrRegisterByPhone: vi.fn(),
}));
vi.mock("@/modules/gate/queries", () => ({ clientQueuePositions: vi.fn() }));
vi.mock("@/modules/sms/queries", () => ({ expirePrompt: vi.fn() }));
vi.mock("./queries", () => ({
  answerProposal: vi.fn(),
  bookingClient: vi.fn(),
  createBooking: vi.fn(),
  cancelBooking: vi.fn(),
  notifyBookingConfirmation: vi.fn(),
  moveBooking: vi.fn(),
  notifyBookingMoved: vi.fn(),
  recordTrackFailure: vi.fn(),
  textEach: vi.fn(),
  trackedBooking: vi.fn(),
  trackLocked: vi.fn(),
}));
import { requireRole } from "@/modules/accounts/auth";
import { findOrRegisterByPhone } from "@/modules/accounts/queries";
import { clientQueuePositions } from "@/modules/gate/queries";
import { expirePrompt } from "@/modules/sms/queries";
import {
  answerTrackedProposal,
  bookForClient,
  bookOnline,
  cancelTrackedBooking,
  moveBookingByStaff,
  moveTrackedBooking,
  trackBooking,
} from "./actions";
import { revalidatePath } from "next/cache";
import {
  answerProposal,
  bookingClient,
  cancelBooking,
  createBooking,
  notifyBookingConfirmation,
  moveBooking,
  notifyBookingMoved,
  recordTrackFailure,
  textEach,
  trackedBooking,
  trackLocked,
} from "./queries";
import type { Booking } from "./types";

beforeEach(() => vi.resetAllMocks());

it("requires staff auth before moving and tells both client and booker", async () => {
  const booking = {
    ref: "ABC123",
    booked_by_phone: "+639181234567",
  } as Awaited<ReturnType<typeof createBooking>>;
  vi.mocked(moveBooking).mockResolvedValue({
    status: "moved",
    booking,
    clientPhone: "+639171234567",
  });
  expect(
    await moveBookingByStaff({
      ref: "ABC123",
      date: "2026-10-25",
      flexDays: 3,
    }),
  ).toEqual({ status: "moved" });
  expect(requireRole).toHaveBeenCalledOnce();
  expect(vi.mocked(requireRole).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(moveBooking).mock.invocationCallOrder[0],
  );
  expect(moveBooking).toHaveBeenCalledWith("ABC123", "2026-10-25", 3);
  expect(notifyBookingMoved).toHaveBeenCalledWith(booking, [
    "+639171234567",
    "+639181234567",
  ]);
});
it("cannot move through the staff path without authentication", async () => {
  vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
  await expect(moveBookingByStaff({})).rejects.toThrow("Unauthorized");
  expect(moveBooking).not.toHaveBeenCalled();
});
it("rejects invalid staff move input before writing", async () => {
  expect(
    await moveBookingByStaff({
      ref: "ABC123",
      date: "2026-10-25",
      flexDays: 8,
    }),
  ).toMatchObject({ status: "error" });
  expect(moveBooking).not.toHaveBeenCalled();
});
it("reports shared rule failures without notifying", async () => {
  vi.mocked(moveBooking).mockResolvedValue({
    status: "invalid",
    message: "Choose today or a later date.",
  });
  expect(
    await moveBookingByStaff({
      ref: "ABC123",
      date: "2026-10-14",
      flexDays: 0,
    }),
  ).toEqual({ status: "error", message: "Choose today or a later date." });
  expect(notifyBookingMoved).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
});
it("authenticates staff, saves, and confirms to the selected client", async () => {
  const client = {
    id: "11111111-1111-4111-8111-111111111111",
    phone: "+639171234567",
    name: "Farmer",
    kind: "farmer" as const,
  };
  vi.mocked(bookingClient).mockResolvedValue(client);
  const booking = { ref: "ABC123" } as Awaited<
    ReturnType<typeof createBooking>
  >;
  vi.mocked(createBooking).mockResolvedValue(booking);
  expect(
    await bookForClient({
      clientId: client.id,
      service: "drying",
      estKg: 5000,
      preferredDate: "2026-10-20",
      flexDays: 0,
    }),
  ).toEqual({ status: "created", booking });
  expect(requireRole).toHaveBeenCalledOnce();
  expect(vi.mocked(requireRole).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(createBooking).mock.invocationCallOrder[0],
  );
  expect(createBooking).toHaveBeenCalledWith(
    expect.objectContaining({ channel: "staff", bookedByPhone: client.phone }),
  );
  expect(notifyBookingConfirmation).toHaveBeenCalledWith(booking, client.phone);
});
it("does not save or notify when staff authentication fails", async () => {
  vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
  await expect(bookForClient({})).rejects.toThrow("Unauthorized");
  expect(createBooking).not.toHaveBeenCalled();
  expect(notifyBookingConfirmation).not.toHaveBeenCalled();
});

const webInput = {
  name: "Juan Dela Cruz",
  phone: "0917 123 4567",
  service: "drying",
  estKg: 5000,
  preferredDate: "2026-10-20",
  flexDays: 2,
};
it("books online without staff auth, by and for the entered phone", async () => {
  const client = { id: "client-1" } as Awaited<
    ReturnType<typeof findOrRegisterByPhone>
  >;
  vi.mocked(findOrRegisterByPhone).mockResolvedValue(client);
  const booking = {
    id: "booking-1",
    ref: "ABC123",
    service: "drying",
    est_kg: 5000,
    scheduled_date: "2026-10-20",
  } as Awaited<ReturnType<typeof createBooking>>;
  vi.mocked(createBooking).mockResolvedValue(booking);
  expect(await bookOnline(webInput)).toEqual({
    status: "created",
    booking: {
      ref: "ABC123",
      service: "drying",
      est_kg: 5000,
      scheduled_date: "2026-10-20",
    },
  });
  expect(requireRole).not.toHaveBeenCalled();
  expect(findOrRegisterByPhone).toHaveBeenCalledWith("+639171234567", {
    name: "Juan Dela Cruz",
  });
  expect(createBooking).toHaveBeenCalledWith({
    clientId: "client-1",
    service: "drying",
    estKg: 5000,
    preferredDate: "2026-10-20",
    flexDays: 2,
    channel: "sms",
    bookedByPhone: "+639171234567",
  });
  expect(notifyBookingConfirmation).toHaveBeenCalledWith(
    booking,
    "+639171234567",
  );
});
it("rejects a blank name, an invalid phone or a past date online without saving", async () => {
  expect(await bookOnline({ ...webInput, name: "  " })).toMatchObject({
    status: "error",
    fieldErrors: { name: "Enter your name." },
  });
  expect(await bookOnline({ ...webInput, phone: "12345" })).toMatchObject({
    status: "error",
    fieldErrors: { phone: "Enter a valid Philippine mobile number." },
  });
  expect(
    await bookOnline({ ...webInput, preferredDate: "2026-10-14" }),
  ).toMatchObject({
    status: "error",
    fieldErrors: { preferredDate: "Choose today or a later date." },
  });
  expect(findOrRegisterByPhone).not.toHaveBeenCalled();
  expect(createBooking).not.toHaveBeenCalled();
});

describe("public /book/track actions", () => {
  const owner = { ref: "k7p-2qx", phone: "0917 123 4567" };
  const phone = "+639171234567";
  const clientPhone = "+639181234567";
  const booking = {
    id: "booking-1",
    ref: "K7P2QX",
    client_id: "client-1",
    service: "drying",
    est_kg: 5000,
    preferred_date: "2026-10-20",
    scheduled_date: "2026-10-20",
    proposed_date: null,
    flex_days: 2,
    status: "confirmed",
    booked_by_phone: phone,
  } as Booking;
  const shown = {
    ref: "K7P2QX",
    service: "drying",
    est_kg: 5000,
    scheduled_date: "2026-10-20",
    proposed_date: null,
    flex_days: 2,
    status: "confirmed",
    queue: [],
  };
  const notFound = {
    status: "error",
    message: "No booking matches that code and phone.",
  };

  beforeEach(() => vi.mocked(trackLocked).mockResolvedValue(false));

  it("looks up by cleaned ref and normalized phone without staff auth or client details", async () => {
    vi.mocked(trackedBooking).mockResolvedValue(booking);
    expect(await trackBooking(owner)).toEqual({
      status: "found",
      booking: shown,
    });
    expect(requireRole).not.toHaveBeenCalled();
    expect(trackedBooking).toHaveBeenCalledWith("K7P2QX", phone);
    expect(clientQueuePositions).not.toHaveBeenCalled();
  });

  it("shows the place in line once checked in", async () => {
    vi.mocked(trackedBooking).mockResolvedValue({
      ...booking,
      status: "arrived",
    });
    const queue = [
      { service: "drying" as const, serving: false as const, position: 3 },
    ];
    vi.mocked(clientQueuePositions).mockResolvedValue(queue);
    expect(await trackBooking(owner)).toMatchObject({
      status: "found",
      booking: { status: "arrived", queue },
    });
    expect(clientQueuePositions).toHaveBeenCalledWith("client-1");
  });

  it("answers an unknown ref and someone else's booking alike, and counts both", async () => {
    vi.mocked(trackedBooking).mockResolvedValue(null);
    expect(await trackBooking(owner)).toEqual(notFound);
    vi.mocked(cancelBooking).mockResolvedValue({ status: "forbidden" });
    expect(await cancelTrackedBooking(owner)).toEqual(notFound);
    vi.mocked(moveBooking).mockResolvedValue({ status: "not_found" });
    expect(
      await moveTrackedBooking({ ...owner, date: "2026-10-22", flexDays: 0 }),
    ).toEqual(notFound);
    vi.mocked(answerProposal).mockResolvedValue({ status: "forbidden" });
    expect(await answerTrackedProposal({ ...owner, yes: true })).toEqual(
      notFound,
    );
    expect(recordTrackFailure).toHaveBeenCalledTimes(4);
    expect(recordTrackFailure).toHaveBeenCalledWith(phone);
    expect(textEach).not.toHaveBeenCalled();
    expect(notifyBookingMoved).not.toHaveBeenCalled();
  });

  it("refuses a locked phone before touching any booking", async () => {
    vi.mocked(trackLocked).mockResolvedValue(true);
    expect(await trackBooking(owner)).toMatchObject({
      status: "error",
      message: expect.stringContaining("Too many tries"),
    });
    expect(await cancelTrackedBooking(owner)).toMatchObject({
      status: "error",
    });
    expect(trackLocked).toHaveBeenCalledWith(phone);
    expect(trackedBooking).not.toHaveBeenCalled();
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it("rejects invalid input before reading or writing", async () => {
    expect(await trackBooking({ ref: "ABC", phone: "12345" })).toMatchObject({
      status: "error",
      fieldErrors: {
        ref: "Enter the 6-character code from your text.",
        phone: "Enter a valid Philippine mobile number.",
      },
    });
    expect(
      await moveTrackedBooking({ ...owner, date: "2026-10-22", flexDays: 8 }),
    ).toMatchObject({ status: "error" });
    expect(trackLocked).not.toHaveBeenCalled();
    expect(moveBooking).not.toHaveBeenCalled();
  });

  it("cancels like CANCEL and texts the same reply to the phone", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({
      status: "cancelled",
      booking: { ...booking, status: "cancelled" },
    });
    expect(await cancelTrackedBooking(owner)).toEqual({
      status: "found",
      booking: { ...shown, status: "cancelled" },
    });
    expect(cancelBooking).toHaveBeenCalledWith("K7P2QX", phone);
    expect(textEach).toHaveBeenCalledWith(
      [phone],
      "IRPC: Na-cancel na ang booking K7P2QX.",
    );
  });

  it("refuses to cancel a booking that is no longer confirmed", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({ status: "not_cancellable" });
    expect(await cancelTrackedBooking(owner)).toEqual({
      status: "error",
      message: "Only confirmed bookings can be cancelled.",
    });
    expect(textEach).not.toHaveBeenCalled();
    expect(recordTrackFailure).not.toHaveBeenCalled();
  });

  it("moves like MOVE and texts the phone and the client", async () => {
    const moved = { ...booking, scheduled_date: "2026-10-22", flex_days: 0 };
    vi.mocked(moveBooking).mockResolvedValue({
      status: "moved",
      booking: moved,
      clientPhone,
    });
    expect(
      await moveTrackedBooking({ ...owner, date: "2026-10-22", flexDays: 0 }),
    ).toMatchObject({
      status: "found",
      booking: { scheduled_date: "2026-10-22", flex_days: 0 },
    });
    expect(moveBooking).toHaveBeenCalledWith("K7P2QX", "2026-10-22", 0, phone);
    expect(notifyBookingMoved).toHaveBeenCalledWith(moved, [
      phone,
      clientPhone,
    ]);
  });

  it("refuses to move an arrived booking or to a bad date", async () => {
    vi.mocked(moveBooking).mockResolvedValue({ status: "not_movable" });
    expect(
      await moveTrackedBooking({ ...owner, date: "2026-10-22", flexDays: 0 }),
    ).toEqual({
      status: "error",
      message: "Only upcoming bookings can be moved.",
    });
    vi.mocked(moveBooking).mockResolvedValue({
      status: "invalid",
      message: "Choose today or a later date.",
    });
    expect(
      await moveTrackedBooking({ ...owner, date: "2026-10-14", flexDays: 0 }),
    ).toEqual({ status: "error", message: "Choose today or a later date." });
    expect(notifyBookingMoved).not.toHaveBeenCalled();
  });

  it("answers a proposal like YES, closes the SMS prompt and texts the outcome", async () => {
    vi.mocked(answerProposal).mockResolvedValue({
      status: "answered",
      booking: { ...booking, scheduled_date: "2026-10-22" },
      clientPhone,
      reply: "IRPC: Na-saylo na ang booking K7P2QX sa Thu, Oct 22. Salamat!",
    });
    expect(await answerTrackedProposal({ ...owner, yes: true })).toMatchObject({
      status: "found",
      booking: { scheduled_date: "2026-10-22" },
    });
    expect(answerProposal).toHaveBeenCalledWith("K7P2QX", true, phone);
    expect(expirePrompt).toHaveBeenCalledWith("K7P2QX");
    expect(textEach).toHaveBeenCalledWith(
      [phone, clientPhone],
      "IRPC: Na-saylo na ang booking K7P2QX sa Thu, Oct 22. Salamat!",
    );
  });

  it("reports a proposal that is no longer open without texting", async () => {
    vi.mocked(answerProposal).mockResolvedValue({ status: "not_open" });
    expect(await answerTrackedProposal({ ...owner, yes: false })).toEqual({
      status: "error",
      message: "This booking is no longer waiting for an answer.",
    });
    expect(expirePrompt).not.toHaveBeenCalled();
    expect(textEach).not.toHaveBeenCalled();
  });
});
