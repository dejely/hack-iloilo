"use client";

import {
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Check,
  RefreshCw,
  Search,
} from "lucide-react";
import { ServiceLabel } from "@/components/service-icon";
import { useId, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DatePicker } from "@/components/date-picker";
import { InfoIcon } from "@/components/hint-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatKg } from "@/lib/format";
import {
  answerTrackedProposal,
  cancelTrackedBooking,
  moveTrackedBooking,
  trackBooking,
  type TrackedBooking,
  type TrackResult,
} from "../actions";
import { trackLookupSchema, type TrackLookupInput } from "../booking-schema";
import {
  MAX_FLEX_DAYS,
  serviceLabels,
  statusLabels,
  statusTones,
} from "../logic";

/** Public /track: look up a booking by ref and phone, then check, move, cancel or answer a proposal. */
export function TrackBooking({
  defaultRef,
  today,
}: {
  defaultRef: string;
  today: string;
}) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [owner, setOwner] = useState<TrackLookupInput>();
  const [booking, setBooking] = useState<TrackedBooking>();
  const form = useForm<TrackLookupInput>({
    resolver: zodResolver(trackLookupSchema),
    defaultValues: { ref: defaultRef, phone: "" },
  });
  const errors = form.formState.errors;

  function run(action: () => Promise<TrackResult>, done?: string) {
    startTransition(async () => {
      setMessage(undefined);
      setNotice(undefined);
      try {
        const result = await action();
        if (result.status === "error") {
          setMessage(result.message ?? "Check the code and mobile number.");
          return;
        }
        setBooking(result.booking);
        setNotice(done);
      } catch {
        setMessage("Something went wrong. Please try again.");
      }
    });
  }

  const submit = form.handleSubmit((input) => {
    setOwner(input);
    run(() => trackBooking(input));
  });

  if (booking && owner)
    return (
      <BookingDetails
        booking={booking}
        today={today}
        pending={pending}
        message={message}
        notice={notice}
        onCancel={() =>
          run(
            () => cancelTrackedBooking(owner),
            "Booking cancelled. We texted you.",
          )
        }
        onMove={(date, flexDays) =>
          run(
            () => moveTrackedBooking({ ...owner, date, flexDays }),
            "Booking moved. We texted you the new date.",
          )
        }
        onAnswer={(yes) =>
          run(
            () => answerTrackedProposal({ ...owner, yes }),
            yes
              ? "New date accepted. We texted you."
              : "Kept your date. We texted you.",
          )
        }
        onRefresh={() => run(() => trackBooking(owner))}
        onReset={() => {
          setBooking(undefined);
          setMessage(undefined);
          setNotice(undefined);
          form.reset({ ref: "", phone: owner.phone });
        }}
      />
    );

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field data-invalid={!!errors.ref}>
          <FieldLabel htmlFor={`${formId}-ref`}>Booking code</FieldLabel>
          <Input
            id={`${formId}-ref`}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="K7P2QX"
            className="font-mono uppercase"
            {...form.register("ref")}
            aria-invalid={!!errors.ref}
            disabled={pending}
          />
          <FieldDescription>
            The 6-character code we texted you.
          </FieldDescription>
          <FieldError errors={[errors.ref]} />
        </Field>
        <Field data-invalid={!!errors.phone}>
          <FieldLabel htmlFor={`${formId}-phone`}>Mobile number</FieldLabel>
          <Input
            id={`${formId}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0917 123 4567"
            {...form.register("phone")}
            aria-invalid={!!errors.phone}
            disabled={pending}
          />
          <FieldDescription>
            The number that booked, or the client&apos;s own number.
          </FieldDescription>
          <FieldError errors={[errors.phone]} />
        </Field>
        {message ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to find booking</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Search data-icon="inline-start" />
          )}
          {pending ? "Looking up…" : "Find my booking"}
        </Button>
      </FieldGroup>
    </form>
  );
}

function BookingDetails({
  booking,
  today,
  pending,
  message,
  notice,
  onCancel,
  onMove,
  onAnswer,
  onRefresh,
  onReset,
}: {
  booking: TrackedBooking;
  today: string;
  pending: boolean;
  message?: string;
  notice?: string;
  onCancel: () => void;
  onMove: (date: string, flexDays: number) => void;
  onAnswer: (yes: boolean) => void;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const [moving, setMoving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const open =
    booking.status === "confirmed" || booking.status === "reschedule_proposed";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="font-mono text-4xl font-bold tracking-widest">
          {booking.ref}
        </p>
        <StatusBadge tone={statusTones[booking.status]}>
          {statusLabels[booking.status]}
        </StatusBadge>
        <p>
          <ServiceLabel kind={booking.service} className="align-bottom">
            {serviceLabels[booking.service]}
          </ServiceLabel>{" "}
          · {formatKg(booking.est_kg)} · {formatDate(booking.scheduled_date)}
        </p>
        {open ? (
          <p className="text-sm text-muted-foreground">
            Flex: {booking.flex_days} day{booking.flex_days === 1 ? "" : "s"}{" "}
            earlier or later
          </p>
        ) : null}
      </div>

      {notice ? (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to complete request</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <StatusNote booking={booking} />

      {booking.status === "reschedule_proposed" && booking.proposed_date ? (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <p className="text-sm">
            The day is full. Can you come on{" "}
            <span className="font-semibold">
              {formatDate(booking.proposed_date)}
            </span>{" "}
            instead?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={pending} onClick={() => onAnswer(true)}>
              <Check data-icon="inline-start" />
              Accept
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => onAnswer(false)}
            >
              Keep my date
            </Button>
          </div>
        </div>
      ) : null}

      {open && moving ? (
        <MoveForm
          booking={booking}
          today={today}
          pending={pending}
          onMove={(date, flexDays) => {
            onMove(date, flexDays);
            setMoving(false);
          }}
          onClose={() => setMoving(false)}
        />
      ) : null}

      {open && !moving ? (
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setMoving(true)}
          >
            <CalendarClock data-icon="inline-start" />
            Change date
          </Button>
          {booking.status === "confirmed" ? (
            <Button
              variant="outline"
              className="text-destructive"
              disabled={pending}
              onClick={() => setCancelling(true)}
            >
              <CalendarX data-icon="inline-start" />
              Cancel booking
            </Button>
          ) : null}
        </div>
      ) : null}

      <Separator />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={pending} onClick={onRefresh}>
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          Refresh
        </Button>
        <Button variant="outline" disabled={pending} onClick={onReset}>
          <Search data-icon="inline-start" />
          Look up another
        </Button>
      </div>

      <AlertDialog
        open={cancelling}
        onOpenChange={(next) => {
          if (!pending) setCancelling(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel booking {booking.ref}?</AlertDialogTitle>
            <AlertDialogDescription>
              {serviceLabels[booking.service]} · {formatKg(booking.est_kg)} on{" "}
              {formatDate(booking.scheduled_date)}. This frees your slot and
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              Keep booking
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setCancelling(false);
                onCancel();
              }}
            >
              Cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusNote({ booking }: { booking: TrackedBooking }) {
  switch (booking.status) {
    case "confirmed":
      return (
        <p className="text-sm text-muted-foreground">
          Come on {formatDate(booking.scheduled_date)} and show this code at the
          gate.
        </p>
      );
    case "reschedule_proposed":
      return null;
    case "arrived":
      return booking.queue.length ? (
        <ul className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
          {booking.queue.map((place) => (
            <li key={place.service}>
              <ServiceLabel
                kind={place.service}
                className="align-bottom font-semibold"
              >
                {serviceLabels[place.service]}:
              </ServiceLabel>{" "}
              {place.serving
                ? "you're being served now."
                : `#${place.position} in line.`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Checked in. You&apos;re not waiting in a line right now.
        </p>
      );
    case "cancelled":
      return (
        <p className="text-sm text-muted-foreground">
          This booking was cancelled. Book again any time.
        </p>
      );
    case "no_show":
      return (
        <p className="text-sm text-muted-foreground">
          This booking was missed. Book again any time.
        </p>
      );
  }
}

function MoveForm({
  booking,
  today,
  pending,
  onMove,
  onClose,
}: {
  booking: TrackedBooking;
  today: string;
  pending: boolean;
  onMove: (date: string, flexDays: number) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [date, setDate] = useState(
    booking.scheduled_date < today ? today : booking.scheduled_date,
  );
  const [flexDays, setFlexDays] = useState(String(booking.flex_days));

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onMove(date, Number(flexDays));
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-date`}>New date</FieldLabel>
          <DatePicker
            id={`${id}-date`}
            value={date}
            min={today}
            disabled={pending}
            onChange={(value) => setDate(value ?? "")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-flex`}>
            Flex days
            <InfoIcon text="If your day fills up, we may move you within these days instead of turning you away." />
          </FieldLabel>
          <Input
            id={`${id}-flex`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_FLEX_DAYS}
            step={1}
            required
            value={flexDays}
            onChange={(event) => setFlexDays(event.target.value)}
            disabled={pending}
          />
          <FieldDescription>
            How many days earlier or later you can come (0–{MAX_FLEX_DAYS}).
          </FieldDescription>
        </Field>
      </FieldGroup>
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" disabled={pending || !date}>
          <CalendarCheck data-icon="inline-start" />
          Move booking
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
        >
          <ArrowLeft data-icon="inline-start" />
          Back
        </Button>
      </div>
    </form>
  );
}
