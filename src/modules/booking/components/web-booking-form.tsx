"use client";

import { ServiceIcon } from "@/components/service-icon";
import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarSearch, ImageDown } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DatePicker } from "@/components/date-picker";
import { InfoIcon } from "@/components/hint-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatKg } from "@/lib/format";
import { bookOnline } from "../actions";
import { webBookingSchema, type WebBookingInput } from "../booking-schema";
import { MAX_FLEX_DAYS, serviceLabels, services } from "../logic";
import { saveBookingSlip, type BookingSlip } from "./booking-image";

const serviceItems = services.map((value) => ({
  value,
  label: serviceLabels[value],
}));

/** Public booking from a phone browser; `channel = sms`, booked by the entered phone. */
export function WebBookingForm({ today }: { today: string }) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const [booked, setBooked] = useState<BookingSlip>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const form = useForm<WebBookingInput>({
    resolver: zodResolver(webBookingSchema),
    defaultValues: {
      name: "",
      phone: "",
      service: "drying",
      preferredDate: today,
      flexDays: 0,
    },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit((input) =>
    startTransition(async () => {
      setMessage(undefined);
      try {
        const result = await bookOnline(input);
        if (result.status === "error") {
          setMessage(result.message);
          for (const [field, error] of Object.entries(result.fieldErrors ?? {}))
            form.setError(
              field as keyof WebBookingInput,
              { message: error },
              { shouldFocus: true },
            );
          return;
        }
        setBooked({ ...result.booking, name: input.name.trim() });
      } catch {
        setMessage("Unable to save the booking. Please try again.");
      }
    }),
  );

  if (booked)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-center">
          <p className="text-sm text-muted-foreground">Booking confirmed</p>
          <p className="font-mono text-4xl font-bold tracking-widest">
            {booked.ref}
          </p>
          <p>
            {serviceLabels[booked.service]} · {formatKg(booked.est_kg)} ·{" "}
            {formatDate(booked.scheduled_date)}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          We texted this code to your phone. Show it at the gate. To cancel,
          text <span className="font-mono">CANCEL {booked.ref}</span>, or manage
          it online.
        </p>
        <Button
          type="button"
          className="w-full"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setSaveError(undefined);
            try {
              await saveBookingSlip(booked);
            } catch {
              setSaveError(
                "Unable to save the image. Take a screenshot instead.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <ImageDown data-icon="inline-start" />
          )}
          Save as image
        </Button>
        {saveError ? (
          <p className="text-sm text-destructive">{saveError}</p>
        ) : null}
        <Link
          href={`/book/track?ref=${booked.ref}`}
          className={buttonVariants({
            variant: "outline",
            className: "w-full",
          })}
        >
          <CalendarSearch data-icon="inline-start" />
          Track or change this booking
        </Link>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            form.reset({ ...form.getValues(), estKg: undefined });
            setBooked(undefined);
            setSaveError(undefined);
          }}
        >
          Book another
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor={`${formId}-name`}>Name</FieldLabel>
          <Input
            id={`${formId}-name`}
            autoComplete="name"
            placeholder="Juan Dela Cruz"
            {...form.register("name")}
            aria-invalid={!!errors.name}
            disabled={pending}
          />
          <FieldError errors={[errors.name]} />
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
          <FieldDescription>We text your booking code here.</FieldDescription>
          <FieldError errors={[errors.phone]} />
        </Field>
        <Controller
          control={form.control}
          name="service"
          render={({ field, fieldState }) => (
            <Field data-invalid={!!fieldState.error}>
              <FieldLabel htmlFor={`${formId}-service`}>Service</FieldLabel>
              <Select
                items={serviceItems}
                value={field.value}
                disabled={pending}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id={`${formId}-service`}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  aria-invalid={!!fieldState.error}
                  className="w-full"
                >
                  <SelectValue>
                    {(value: (typeof services)[number] | null) =>
                      value ? (
                        <>
                          <ServiceIcon kind={value} />
                          {serviceLabels[value]}
                        </>
                      ) : null
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {serviceItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        <ServiceIcon kind={item.value} />
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Field data-invalid={!!errors.estKg}>
          <FieldLabel htmlFor={`${formId}-kg`}>Estimated kg</FieldLabel>
          <Input
            id={`${formId}-kg`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="5000"
            {...form.register("estKg", { valueAsNumber: true })}
            aria-invalid={!!errors.estKg}
            disabled={pending}
          />
          <FieldError errors={[errors.estKg]} />
        </Field>
        <Controller
          control={form.control}
          name="preferredDate"
          render={({ field, fieldState }) => (
            <Field data-invalid={!!fieldState.error}>
              <FieldLabel htmlFor={`${formId}-date`}>Preferred date</FieldLabel>
              <DatePicker
                id={`${formId}-date`}
                value={field.value}
                min={today}
                disabled={pending}
                aria-invalid={!!fieldState.error}
                onChange={(value) => field.onChange(value ?? "")}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Field data-invalid={!!errors.flexDays}>
          <FieldLabel htmlFor={`${formId}-flex`}>
            Flex days
            <InfoIcon text="If your day fills up, we may move you within these days instead of turning you away." />
          </FieldLabel>
          <Input
            id={`${formId}-flex`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_FLEX_DAYS}
            step={1}
            {...form.register("flexDays", { valueAsNumber: true })}
            aria-invalid={!!errors.flexDays}
            disabled={pending}
          />
          <FieldDescription>
            How many days earlier or later you can come (0–{MAX_FLEX_DAYS}).
          </FieldDescription>
          <FieldError errors={[errors.flexDays]} />
        </Field>
        {message ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to complete request</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? "Booking…" : "Book"}
        </Button>
      </FieldGroup>
    </form>
  );
}
