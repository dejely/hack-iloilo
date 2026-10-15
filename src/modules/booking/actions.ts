"use server";

// M4. Booking: Future drying and milling slots. See TRD.md.
// Server actions. Check the staff role first with requireRole(), except the
// public /book and /track actions, which act only for the entered phone.

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { todayManila } from "@/lib/dates";
import { requireRole } from "@/modules/accounts/auth";
import { normalizePhone } from "@/modules/accounts/logic";
import { findOrRegisterByPhone } from "@/modules/accounts/queries";
import type { QueuePosition } from "@/modules/gate/logic";
import { clientQueuePositions } from "@/modules/gate/queries";
import { fillTemplate } from "@/modules/sms/logic";
import { expirePrompt } from "@/modules/sms/queries";
import {
  bookingSchema,
  moveBookingSchema,
  trackAnswerSchema,
  trackLookupSchema,
  trackMoveSchema,
  webBookingSchema,
  type BookingInput,
  type TrackLookupInput,
  type WebBookingInput,
} from "./booking-schema";
import { bookingSms, cleanRef, TRACK_WINDOW_MINUTES } from "./logic";
import {
  answerProposal,
  bookingClient,
  cancelBooking,
  createBooking,
  moveBooking,
  notifyBookingMoved,
  notifyBookingConfirmation,
  recordTrackFailure,
  textEach,
  trackedBooking,
  trackLocked,
} from "./queries";
import type { Booking } from "./types";

export type MoveBookingByStaffResult =
  { status: "moved" } | { status: "error"; message: string };

/** Staff and SMS use the same ownership-independent move rules and update. */
export async function moveBookingByStaff(
  input: unknown,
): Promise<MoveBookingByStaffResult> {
  await requireRole();
  const parsed = moveBookingSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0].message };
  try {
    const { ref, date, flexDays } = parsed.data;
    const result = await moveBooking(ref, date, flexDays);
    if (result.status !== "moved")
      return {
        status: "error",
        message:
          result.status === "invalid"
            ? result.message
            : result.status === "not_found"
              ? "This booking no longer exists. Refresh the list."
              : "Only confirmed bookings or bookings with a reschedule proposal can be moved.",
      };
    await notifyBookingMoved(result.booking, [
      result.clientPhone,
      result.booking.booked_by_phone,
    ]);
    return { status: "moved" };
  } catch (error) {
    console.error("Unable to move booking", error);
    return {
      status: "error",
      message: "Unable to move the booking. Please try again.",
    };
  }
}

export type BookForClientResult =
  | { status: "created"; booking: Booking }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<keyof BookingInput, string>>;
    };

function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path[0], issue.message]),
  );
}

/** Staff booking for a walk-in or phone call; confirms instantly. */
export async function bookForClient(
  input: unknown,
): Promise<BookForClientResult> {
  await requireRole();
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const { clientId, ...booking } = parsed.data;
  if (booking.preferredDate < todayManila())
    return {
      status: "error",
      fieldErrors: { preferredDate: "Choose today or a later date." },
    };
  try {
    const client = await bookingClient(clientId);
    if (!client)
      return {
        status: "error",
        fieldErrors: { clientId: "This client no longer exists." },
      };
    const created = await createBooking({
      ...booking,
      clientId,
      channel: "staff",
      bookedByPhone: client.phone,
    });
    await notifyBookingConfirmation(created, client.phone);
    revalidatePath("/bookings");
    return { status: "created", booking: created };
  } catch (error) {
    console.error("Unable to create booking", error);
    return {
      status: "error",
      message: "Unable to save the booking. Please try again.",
    };
  }
}

export type BookOnlineResult =
  | {
      status: "created";
      booking: Pick<Booking, "ref" | "service" | "est_kg" | "scheduled_date">;
    }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<keyof WebBookingInput, string>>;
    };

/**
 * Client self-service booking from the public /book page. No requireRole():
 * like an SMS `BOOK`, it can only create a confirmed booking for the entered
 * phone, which is texted the ref.
 */
export async function bookOnline(input: unknown): Promise<BookOnlineResult> {
  const parsed = webBookingSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const { name, phone, ...booking } = parsed.data;
  if (booking.preferredDate < todayManila())
    return {
      status: "error",
      fieldErrors: { preferredDate: "Choose today or a later date." },
    };
  const normalized = normalizePhone(phone)!;
  try {
    // The name only labels a new client; an existing one is never renamed.
    const client = await findOrRegisterByPhone(normalized, { name });
    const created = await createBooking({
      ...booking,
      clientId: client.id,
      channel: "sms",
      bookedByPhone: normalized,
    });
    await notifyBookingConfirmation(created, normalized);
    revalidatePath("/bookings");
    const { ref, service, est_kg, scheduled_date } = created;
    return {
      status: "created",
      booking: { ref, service, est_kg, scheduled_date },
    };
  } catch (error) {
    console.error("Unable to create web booking", error);
    return {
      status: "error",
      message: "Unable to save the booking. Please try again.",
    };
  }
}

export type CancelBookingResult =
  { status: "cancelled" } | { status: "error"; message: string };

export async function cancelBookingByStaff(
  ref: string,
): Promise<CancelBookingResult> {
  await requireRole();
  try {
    const result = await cancelBooking(ref);
    if (result.status === "cancelled") {
      revalidatePath("/bookings");
      return { status: "cancelled" };
    }
    return {
      status: "error",
      message:
        result.status === "not_found"
          ? "This booking no longer exists. Refresh the list."
          : "Only confirmed bookings can be cancelled. Refresh the list.",
    };
  } catch (error) {
    console.error("Unable to cancel booking", error);
    return {
      status: "error",
      message: "Unable to cancel the booking. Please try again.",
    };
  }
}

/** What /track shows: the booking without its client, plus the place in line once checked in. */
export type TrackedBooking = Pick<
  Booking,
  | "ref"
  | "service"
  | "est_kg"
  | "scheduled_date"
  | "proposed_date"
  | "flex_days"
  | "status"
> & { queue: QueuePosition[] };

export type TrackResult =
  | { status: "found"; booking: TrackedBooking }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<keyof TrackLookupInput, string>>;
    };

const TRACK_NOT_FOUND = "No booking matches that code and phone.";
const TRACK_LOCKED = `Too many tries. Wait ${TRACK_WINDOW_MINUTES} minutes and try again.`;

async function tracked(booking: Booking): Promise<TrackedBooking> {
  const { ref, service, est_kg, scheduled_date, proposed_date, flex_days } =
    booking;
  return {
    ref,
    service,
    est_kg,
    scheduled_date,
    proposed_date,
    flex_days,
    status: booking.status,
    queue:
      booking.status === "arrived"
        ? await clientQueuePositions(booking.client_id)
        : [],
  };
}

/**
 * Runs a public /track request for its ref and normalized phone. `run` returns
 * the booking, an error message, or null when the ref is unknown or not the
 * phone's: both read "not found" and count toward the lock.
 */
async function trackRequest<T extends TrackLookupInput>(
  schema: z.ZodType<T>,
  input: unknown,
  failure: string,
  run: (
    ref: string,
    phone: string,
    data: T,
  ) => Promise<Booking | string | null>,
): Promise<TrackResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const phone = normalizePhone(parsed.data.phone)!;
  try {
    if (await trackLocked(phone))
      return { status: "error", message: TRACK_LOCKED };
    const result = await run(cleanRef(parsed.data.ref), phone, parsed.data);
    if (result === null) {
      await recordTrackFailure(phone);
      return { status: "error", message: TRACK_NOT_FOUND };
    }
    if (typeof result === "string") return { status: "error", message: result };
    return { status: "found", booking: await tracked(result) };
  } catch (error) {
    console.error(failure, error);
    return { status: "error", message: `${failure}. Please try again.` };
  }
}

/** /track lookup, the web twin of checking a booking and `STATUS`. */
export async function trackBooking(input: unknown): Promise<TrackResult> {
  return trackRequest(
    trackLookupSchema,
    input,
    "Unable to look up the booking",
    (ref, phone) => trackedBooking(ref, phone),
  );
}

/** /track twin of `CANCEL <ref>`: same rules, same text to the phone. */
export async function cancelTrackedBooking(
  input: unknown,
): Promise<TrackResult> {
  return trackRequest(
    trackLookupSchema,
    input,
    "Unable to cancel the booking",
    async (ref, phone) => {
      const result = await cancelBooking(ref, phone);
      switch (result.status) {
        case "not_found":
        case "forbidden":
          return null;
        case "not_cancellable":
          return "Only confirmed bookings can be cancelled.";
      }
      await textEach([phone], fillTemplate(bookingSms.cancelled, { ref }));
      revalidatePath("/bookings");
      return result.booking;
    },
  );
}

/** /track twin of `MOVE <ref> <dd/mm> [+days]`: same rules and texts. */
export async function moveTrackedBooking(input: unknown): Promise<TrackResult> {
  return trackRequest(
    trackMoveSchema,
    input,
    "Unable to move the booking",
    async (ref, phone, { date, flexDays }) => {
      const result = await moveBooking(ref, date, flexDays, phone);
      switch (result.status) {
        case "not_found":
        case "forbidden":
          return null;
        case "invalid":
          return result.message;
        case "not_movable":
          return "Only upcoming bookings can be moved.";
      }
      await notifyBookingMoved(result.booking, [phone, result.clientPhone]);
      return result.booking;
    },
  );
}

/**
 * /track twin of `YES <ref>` / `NO <ref>` to a reschedule proposal. Closes the
 * SMS prompt so a late text answer is ignored.
 */
export async function answerTrackedProposal(
  input: unknown,
): Promise<TrackResult> {
  return trackRequest(
    trackAnswerSchema,
    input,
    "Unable to answer the proposal",
    async (ref, phone, { yes }) => {
      const result = await answerProposal(ref, yes, phone);
      switch (result.status) {
        case "not_found":
        case "forbidden":
          return null;
        case "not_open":
          return "This booking is no longer waiting for an answer.";
      }
      await expirePrompt(ref);
      await textEach([phone, result.clientPhone], result.reply);
      return result.booking;
    },
  );
}
