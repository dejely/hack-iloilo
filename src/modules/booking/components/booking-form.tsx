"use client";

import { ServiceIcon } from "@/components/service-icon";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
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
import { SheetFooter } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { bookForClient } from "../actions";
import { bookingSchema, type BookingInput } from "../booking-schema";
import { MAX_FLEX_DAYS, serviceLabels, services } from "../logic";
import type { BookingClient } from "../types";

const serviceItems = services.map((value) => ({
  value,
  label: serviceLabels[value],
}));
const clientLabel = (client: BookingClient) =>
  `${client.name} · ${client.phone}`;

/** Staff booking for a client; `channel = staff`, booked by the client's phone. */
export function BookingForm({
  clients,
  today,
  onSaved,
  onCancel,
}: {
  clients: BookingClient[];
  today: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const form = useForm<BookingInput>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      clientId: "",
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
        const result = await bookForClient(input);
        if (result.status === "error") {
          setMessage(result.message);
          for (const [field, error] of Object.entries(result.fieldErrors ?? {}))
            form.setError(
              field as keyof BookingInput,
              { message: error },
              { shouldFocus: true },
            );
          return;
        }
        toast.success(`Booked · ref ${result.booking.ref}`, {
          description: "The booking is confirmed.",
        });
        onSaved();
      } catch {
        setMessage("Unable to save the booking. Please try again.");
      }
    }),
  );

  return (
    <form
      onSubmit={submit}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <FieldGroup className="p-4">
        <Controller
          control={form.control}
          name="clientId"
          render={({ field, fieldState }) => (
            <Field data-invalid={!!fieldState.error}>
              <FieldLabel htmlFor={`${formId}-client`}>Client</FieldLabel>
              <Combobox
                items={clients}
                value={
                  clients.find((client) => client.id === field.value) ?? null
                }
                onValueChange={(client) => field.onChange(client?.id ?? "")}
                itemToStringLabel={clientLabel}
                isItemEqualToValue={(item, selected) => item.id === selected.id}
                disabled={pending}
              >
                <ComboboxInput
                  id={`${formId}-client`}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  disabled={pending}
                  aria-invalid={!!fieldState.error}
                  placeholder="Search name or phone…"
                />
                <ComboboxContent>
                  <ComboboxEmpty>No matching clients.</ComboboxEmpty>
                  <ComboboxList>
                    {(client: BookingClient) => (
                      <ComboboxItem key={client.id} value={client}>
                        {clientLabel(client)}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <FieldDescription>
                Not listed?{" "}
                <Link href="/clients" className="underline underline-offset-4">
                  Quick register a client
                </Link>
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
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
          <FieldLabel htmlFor={`${formId}-kg`}>Est. kg</FieldLabel>
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
          <FieldLabel htmlFor={`${formId}-flex`}>Flex days</FieldLabel>
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
            How many days either side the client can shift (0–{MAX_FLEX_DAYS}).
          </FieldDescription>
          <FieldError errors={[errors.flexDays]} />
        </Field>
        {message ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to complete request</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? "Booking…" : "Confirm booking"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </SheetFooter>
    </form>
  );
}
