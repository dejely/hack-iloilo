// M4. Booking: Future drying and milling slots. See TRD.md.
// Server-side reads. May call other modules' queries.

import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase/admin";
import { newRef } from "@/lib/ref";
import {
  clientsDirectory,
  findOrRegisterByPhone,
} from "@/modules/accounts/queries";
import { todayManila } from "@/lib/dates";
import { fillTemplate, helpText, parseDayMonth } from "@/modules/sms/logic";
import { expirePrompt, openPrompt, send } from "@/modules/sms/queries";
import {
  commandUsages,
  PromptRefusal,
  type CommandContext,
  type SmsPrompt,
} from "@/modules/sms/registry";
import type { BookingSmsInput, MoveSmsInput } from "./booking-schema";
import { currentFacility } from "@/modules/setup/queries";
import {
  bookingSms,
  canCancel,
  canMove,
  formatDay,
  isClientOrBooker,
  isTrackLocked,
  rescheduleAnswer,
  serviceLabels,
  TRACK_WINDOW_MINUTES,
  validateMove,
} from "./logic";
import type {
  Booking,
  BookingChannel,
  BookingClient,
  BookingRow,
  BookingStatus,
  Service,
} from "./types";
export type { Booking, BookingRow } from "./types";

const REF_ATTEMPTS = 5;

/**
 * Books a slot. It always confirms, even past capacity: overloads are caught
 * by M9 and cleared by M10.
 */
export async function createBooking(input: {
  clientId: string;
  service: Service;
  estKg: number;
  preferredDate: string;
  flexDays: number;
  channel: BookingChannel;
  bookedByPhone: string;
}): Promise<Booking> {
  const facility = await currentFacility();
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await db()
      .from("bookings")
      .insert({
        facility_id: facility.id,
        ref: newRef(),
        service: input.service,
        client_id: input.clientId,
        booked_by_phone: input.bookedByPhone,
        channel: input.channel,
        est_kg: input.estKg,
        preferred_date: input.preferredDate,
        flex_days: input.flexDays,
        scheduled_date: input.preferredDate,
        status: "confirmed",
      })
      .select()
      .single();
    // A ref collision is the only unique violation here; draw a new ref.
    if (error?.code === "23505" && attempt < REF_ATTEMPTS) continue;
    if (error) throw error;
    return data;
  }
}

export async function findByRef(ref: string): Promise<Booking | null> {
  const { data, error } = await db()
    .from("bookings")
    .select()
    .eq("ref", ref.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * A booking as /book/track shows it, only to its client or booker. Null when the
 * ref is unknown or the phone is not theirs, so the two look the same.
 */
export async function trackedBooking(
  ref: string,
  phone: string,
): Promise<Booking | null> {
  const { data, error } = await db()
    .from("bookings")
    .select("*, client:clients(phone)")
    .eq("ref", ref.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { client, ...booking } = data;
  return isClientOrBooker(booking, client.phone, phone) ? booking : null;
}

/** Too many failed /book/track tries for this phone in the current window. */
export async function trackLocked(phone: string): Promise<boolean> {
  const since = new Date(
    Date.now() - TRACK_WINDOW_MINUTES * 60_000,
  ).toISOString();
  const { count, error } = await db()
    .from("track_attempts")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", since);
  if (error) throw error;
  return isTrackLocked(count ?? 0);
}

export async function recordTrackFailure(phone: string): Promise<void> {
  const { error } = await db().from("track_attempts").insert({ phone });
  if (error) throw error;
}

/**
 * Marks an open booking (`confirmed` or `reschedule_proposed`) `arrived` when
 * the client checks in at the gate. Null if it is no longer open.
 */
export async function markArrived(bookingId: string): Promise<Booking | null> {
  const { data, error } = await db()
    .from("bookings")
    .update({ status: "arrived" })
    .eq("id", bookingId)
    .in("status", ["confirmed", "reschedule_proposed"])
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Asks to move a `confirmed` booking to `date` (M10) and texts the client a
 * `reschedule` prompt under the booking ref. It keeps its scheduled date until
 * the client answers. Null if it is no longer `confirmed`.
 */
export async function proposeReschedule(
  bookingId: string,
  date: string,
): Promise<Booking | null> {
  const { data, error } = await db()
    .from("bookings")
    .update({ status: "reschedule_proposed", proposed_date: date })
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .select("*, client:clients(phone)")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { client, ...booking } = data;
  try {
    await openPrompt({
      phone: client.phone,
      kind: "reschedule",
      payload: { bookingId, date },
      ref: booking.ref,
    });
  } catch (error) {
    // Without a prompt the client could never answer: keep the booking as is.
    await db()
      .from("bookings")
      .update({ status: "confirmed", proposed_date: null })
      .eq("id", bookingId)
      .eq("status", "reschedule_proposed");
    throw error;
  }
  await send(client.phone, bookingSms.rescheduleQuestion, {
    date: formatDay(booking.scheduled_date),
    service: serviceLabels[booking.service].toLowerCase(),
    ref: booking.ref,
    kg: booking.est_kg,
    newDate: formatDay(date),
  });
  return booking;
}

export type ProposalResult =
  | { status: "answered"; booking: Booking; clientPhone: string; reply: string }
  | { status: "not_found" | "forbidden" | "not_open" };

/**
 * Answers a pending M10 proposal: YES moves the booking to its proposed date,
 * NO keeps its date; both confirm it. Only the client or booker may. Shared by
 * SMS `YES`/`NO` and /book/track; the caller closes the prompt and sends texts.
 */
export async function answerProposal(
  ref: string,
  yes: boolean,
  byPhone: string,
): Promise<ProposalResult> {
  const { data: found, error: findError } = await db()
    .from("bookings")
    .select("*, client:clients(phone)")
    .eq("ref", ref.trim().toUpperCase())
    .maybeSingle();
  if (findError) throw findError;
  if (!found) return { status: "not_found" };
  const answer = rescheduleAnswer(found, found.client.phone, byPhone, yes);
  if (answer.status !== "ok") return answer;

  const { data, error } = await db()
    .from("bookings")
    .update({
      status: "confirmed",
      scheduled_date: answer.date,
      proposed_date: null,
    })
    .eq("id", found.id)
    .eq("status", "reschedule_proposed")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return { status: "not_open" };

  revalidatePath("/bookings");
  revalidatePath("/capacity");
  revalidatePath("/suggestions");
  const reply = fillTemplate(
    yes ? bookingSms.rescheduleMoved : bookingSms.rescheduleKept,
    {
      ref: data.ref,
      date: formatDay(data.scheduled_date),
    },
  );
  return {
    status: "answered",
    booking: data,
    clientPhone: found.client.phone,
    reply,
  };
}

/** Texts each phone once; a gateway failure never undoes a saved change. */
export async function textEach(phones: string[], text: string): Promise<void> {
  for (const phone of new Set(phones)) {
    try {
      await send(phone, text);
    } catch (error) {
      console.error("Unable to send booking text", error);
    }
  }
}

/**
 * Prompt handler for `YES <ref>` / `NO <ref>` to a reschedule. Only the client
 * or booker may answer; others get the help reply.
 */
export async function answerReschedule(
  prompt: SmsPrompt,
  yes: boolean,
  ctx: CommandContext,
): Promise<string> {
  const result = await answerProposal(prompt.ref, yes, ctx.phone);
  switch (result.status) {
    case "forbidden":
      throw new PromptRefusal(helpText(commandUsages()));
    case "not_found":
      return fillTemplate(bookingSms.notFound, { ref: prompt.ref });
    case "not_open":
      return fillTemplate(bookingSms.notWaiting, { ref: prompt.ref });
  }
  // M3 sends the reply to the sender; when the booker answered, tell the client too.
  await textEach(
    [result.clientPhone].filter((phone) => phone !== ctx.phone),
    result.reply,
  );
  return result.reply;
}

/** Undoes `markArrived` when the check-in that caused it fails. */
export async function unmarkArrived(
  bookingId: string,
  status: BookingStatus,
): Promise<void> {
  const { error } = await db()
    .from("bookings")
    .update({ status })
    .eq("id", bookingId)
    .eq("status", "arrived");
  if (error) throw error;
}

export type CancelResult =
  | { status: "cancelled"; booking: Booking }
  | { status: "not_found" | "forbidden" | "not_cancellable" };

/** Moves `confirmed` to `cancelled`. With `byPhone`, only the client or booker may. */
export async function cancelBooking(
  ref: string,
  byPhone?: string,
): Promise<CancelResult> {
  const { data: found, error: findError } = await db()
    .from("bookings")
    .select("id, status, booked_by_phone, client:clients(phone)")
    .eq("ref", ref.trim().toUpperCase())
    .maybeSingle();
  if (findError) throw findError;
  if (!found) return { status: "not_found" };
  const check = canCancel(found, found.client.phone, byPhone);
  if (check !== "ok") return { status: check };
  const { data, error } = await db()
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", found.id)
    .eq("status", "confirmed")
    .select()
    .maybeSingle();
  if (error) throw error;
  return data
    ? { status: "cancelled", booking: data }
    : { status: "not_cancellable" };
}

export type MoveResult =
  | { status: "moved"; booking: Booking; clientPhone: string }
  | { status: "invalid"; message: string }
  | { status: "not_found" | "forbidden" | "not_movable" };

/**
 * Moves an open booking to `date` and confirms it, keeping its ref, service
 * and kg. A pending M10 proposal is dropped and its prompt closed. With
 * `byPhone`, only the client or booker may.
 */
export async function moveBooking(
  ref: string,
  date: string,
  flexDays?: number,
  byPhone?: string,
): Promise<MoveResult> {
  const { data: found, error: findError } = await db()
    .from("bookings")
    .select(
      "id, ref, status, flex_days, booked_by_phone, client:clients(phone)",
    )
    .eq("ref", ref.trim().toUpperCase())
    .maybeSingle();
  if (findError) throw findError;
  if (!found) return { status: "not_found" };
  const check = canMove(found, found.client.phone, byPhone);
  if (check !== "ok") return { status: check };
  const message = validateMove(
    date,
    flexDays ?? found.flex_days,
    todayManila(),
  );
  if (message) return { status: "invalid", message };
  const { data, error } = await db()
    .from("bookings")
    .update({
      status: "confirmed",
      preferred_date: date,
      scheduled_date: date,
      flex_days: flexDays ?? found.flex_days,
      proposed_date: null,
    })
    .eq("id", found.id)
    .in("status", ["confirmed", "reschedule_proposed"])
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return { status: "not_movable" };
  await expirePrompt(found.ref);
  revalidatePath("/bookings");
  revalidatePath("/capacity");
  revalidatePath("/suggestions");
  return { status: "moved", booking: data, clientPhone: found.client.phone };
}

/** Open bookings (confirmed or awaiting a reschedule answer) by scheduled day. */
export async function bookingsBetween(
  from: string,
  to: string,
  service?: Service,
): Promise<Booking[]> {
  const facility = await currentFacility();
  let query = db()
    .from("bookings")
    .select()
    .eq("facility_id", facility.id)
    .in("status", ["confirmed", "reschedule_proposed"])
    .gte("scheduled_date", from)
    .lte("scheduled_date", to);
  if (service) query = query.eq("service", service);
  const { data, error } = await query
    .order("scheduled_date")
    .order("created_at");
  if (error) throw error;
  return data;
}

/** Every booking in the range, any status, with its client, for the staff list. */
export async function bookingList(
  from: string,
  to: string,
): Promise<BookingRow[]> {
  const facility = await currentFacility();
  const { data, error } = await db()
    .from("bookings")
    .select("*, client:clients(name, phone, kind)")
    .eq("facility_id", facility.id)
    .gte("scheduled_date", from)
    .lte("scheduled_date", to)
    .order("scheduled_date")
    .order("service")
    .order("created_at");
  if (error) throw error;
  return data;
}

/** Clients the booking form can pick from, by name. */
export async function bookingClients(): Promise<BookingClient[]> {
  const clients = await clientsDirectory();
  return clients
    .map(({ id, name, phone, kind }) => ({ id, name, phone, kind }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function bookingClient(id: string): Promise<BookingClient | null> {
  const { data, error } = await db()
    .from("clients")
    .select("id, name, phone, kind")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function confirmation(booking: Booking): string {
  return fillTemplate(bookingSms.confirmed, {
    ref: booking.ref,
    service: booking.service === "drying" ? "Drying" : "Milling",
    kg: booking.est_kg,
    date: booking.scheduled_date,
  });
}

/** Notification failure must never turn a saved booking into a failed booking. */
export async function notifyBookingConfirmation(
  booking: Booking,
  phone: string,
): Promise<void> {
  try {
    await send(phone, confirmation(booking));
  } catch (error) {
    console.error("Unable to send booking confirmation", error);
  }
}

/** Trusted SMS router entrypoint, not a public staff server action. */
export async function bookBySms(
  input: BookingSmsInput,
  ctx: CommandContext,
): Promise<string> {
  const preferredDate = parseDayMonth(input.dayMonth, todayManila());
  if (!preferredDate) return helpText(commandUsages());
  const client =
    ctx.forPhone && ctx.forPhone !== ctx.phone
      ? await findOrRegisterByPhone(ctx.forPhone)
      : ctx.client;
  const booking = await createBooking({
    clientId: client.id,
    service: input.service,
    estKg: input.estKg,
    preferredDate,
    flexDays: input.flexDays,
    channel: "sms",
    bookedByPhone: ctx.phone,
  });
  // M3 sends the returned reply to the sender exactly once.
  if (client.phone !== ctx.phone)
    await notifyBookingConfirmation(booking, client.phone);
  return confirmation(booking);
}

export async function cancelBySms(
  { ref }: { ref: string },
  ctx: CommandContext,
): Promise<string> {
  // FOR never grants authority: always authorize the actual sender.
  const result = await cancelBooking(ref, ctx.phone);
  switch (result.status) {
    case "cancelled":
      return fillTemplate(bookingSms.cancelled, { ref: result.booking.ref });
    case "forbidden":
      return helpText(commandUsages());
    case "not_found":
      return fillTemplate(bookingSms.notFound, { ref });
    case "not_cancellable":
      return fillTemplate(bookingSms.notCancellable, { ref });
  }
}

export async function moveBySms(
  { ref, dayMonth, flexDays }: MoveSmsInput,
  ctx: CommandContext,
): Promise<string> {
  const date = parseDayMonth(dayMonth, todayManila());
  if (!date) return bookingSms.invalidDate;
  // FOR never grants authority: always authorize the actual sender.
  const result = await moveBooking(ref, date, flexDays, ctx.phone);
  switch (result.status) {
    case "forbidden":
    case "not_found":
      return helpText(commandUsages());
    case "invalid":
      return fillTemplate(bookingSms.invalidMove, { ref });
    case "not_movable":
      return fillTemplate(bookingSms.notMovable, { ref });
  }
  const { booking, clientPhone } = result;
  const reply = movedConfirmation(booking);
  // M3 sends the returned reply to the sender exactly once.
  await notifyBookingMoved(
    booking,
    [clientPhone].filter((phone) => phone !== ctx.phone),
  );
  return reply;
}

function movedConfirmation(booking: Booking): string {
  return fillTemplate(bookingSms.moved, {
    ref: booking.ref,
    date: formatDay(booking.scheduled_date),
    service: serviceLabels[booking.service],
    kg: booking.est_kg,
  });
}

/** Send each recipient one confirmation; a gateway failure does not undo a saved move. */
export async function notifyBookingMoved(
  booking: Booking,
  phones: string[],
): Promise<void> {
  await textEach(phones, movedConfirmation(booking));
}
