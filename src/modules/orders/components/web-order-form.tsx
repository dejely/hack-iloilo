"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DatePicker } from "@/components/date-picker";
import { OptionSelect } from "@/components/option-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { addDays } from "@/lib/dates";
import { formatDate, formatKg, formatMoney } from "@/lib/format";
import { buyerTypeLabels, buyerTypes } from "@/modules/accounts/logic";
import { requestRiceOnline, type BuyerOrder } from "../actions";
import { estimateMinor, MAX_PICKUP_DAYS } from "../logic";
import {
  webOrderSchema,
  type WebOrderFormValues,
  type WebOrderInput,
} from "../order-schema";

/** Public rice request from a phone browser; the buyer is found or created by the entered phone. */
export function WebOrderForm({
  today,
  riceMinorPerKg,
}: {
  today: string;
  /** Today's rice price, or null when none is set (no estimate shown). */
  riceMinorPerKg: number | null;
}) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const [requested, setRequested] = useState<BuyerOrder>();
  const form = useForm<WebOrderFormValues, unknown, WebOrderInput>({
    resolver: zodResolver(webOrderSchema),
    defaultValues: { name: "", phone: "", pickupDate: "" },
  });
  const errors = form.formState.errors;
  const kg = Number(useWatch({ control: form.control, name: "kg" }));
  const estimate =
    riceMinorPerKg !== null && Number.isInteger(kg) && kg > 0
      ? estimateMinor(kg, riceMinorPerKg)
      : null;

  const submit = form.handleSubmit(() =>
    startTransition(async () => {
      setMessage(undefined);
      try {
        const result = await requestRiceOnline(form.getValues());
        if (result.status === "error") {
          setMessage(result.message);
          for (const [field, error] of Object.entries(result.fieldErrors ?? {}))
            form.setError(
              field as keyof WebOrderFormValues,
              { message: error },
              { shouldFocus: true },
            );
          return;
        }
        setRequested(result.order);
      } catch {
        setMessage("Unable to send the request. Please try again.");
      }
    }),
  );

  if (requested)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-center">
          <p className="text-sm text-muted-foreground">Request sent</p>
          <p className="font-mono text-4xl font-bold tracking-widest">
            {requested.ref}
          </p>
          <p>
            {formatKg(requested.kg)} · pickup{" "}
            {formatDate(requested.pickup_date)}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          We texted this code to your phone. We&apos;ll text you again once the
          manager decides. You pay at the plant on pickup.
        </p>
        <Link
          href={`/buy/track?ref=${requested.ref}`}
          className="text-center text-sm font-semibold text-primary underline"
        >
          Track this request
        </Link>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            form.reset({ ...form.getValues(), kg: undefined });
            setRequested(undefined);
          }}
        >
          Make another request
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor={`${formId}-name`}>Name or store</FieldLabel>
          <Input
            id={`${formId}-name`}
            autoComplete="organization"
            placeholder="Dela Cruz Rice Store"
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
          <FieldDescription>We text your request code here.</FieldDescription>
          <FieldError errors={[errors.phone]} />
        </Field>
        <Field data-invalid={!!errors.buyerType}>
          <FieldLabel htmlFor={`${formId}-type`}>You are a</FieldLabel>
          <Controller
            control={form.control}
            name="buyerType"
            render={({ field }) => (
              <OptionSelect
                id={`${formId}-type`}
                options={buyerTypes.map((t) => ({
                  value: t,
                  label: buyerTypeLabels[t],
                }))}
                placeholder="Choose one"
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                triggerRef={field.ref}
                invalid={!!errors.buyerType}
                disabled={pending}
              />
            )}
          />
          <FieldError errors={[errors.buyerType]} />
        </Field>
        <Field data-invalid={!!errors.kg}>
          <FieldLabel htmlFor={`${formId}-kg`}>Rice (kg)</FieldLabel>
          <Input
            id={`${formId}-kg`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="500"
            {...form.register("kg", { valueAsNumber: true })}
            aria-invalid={!!errors.kg}
            disabled={pending}
          />
          {estimate !== null ? (
            <FieldDescription>
              About {formatMoney(estimate)} at today&apos;s price. The final
              price is set at pickup.
            </FieldDescription>
          ) : null}
          <FieldError errors={[errors.kg]} />
        </Field>
        <Controller
          control={form.control}
          name="pickupDate"
          render={({ field, fieldState }) => (
            <Field data-invalid={!!fieldState.error}>
              <FieldLabel htmlFor={`${formId}-date`}>Pickup date</FieldLabel>
              <DatePicker
                id={`${formId}-date`}
                value={field.value}
                min={today}
                max={addDays(today, MAX_PICKUP_DAYS)}
                disabled={pending}
                aria-invalid={!!fieldState.error}
                onChange={(value) => field.onChange(value ?? "")}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        {message ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to complete request</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? "Sending…" : "Send request"}
        </Button>
      </FieldGroup>
    </form>
  );
}
