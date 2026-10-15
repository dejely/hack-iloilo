"use client";

import { useId, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { formatDate, formatKg } from "@/lib/format";
import { offerOnline, type OfferOnlineResult } from "../actions";
import {
  webOfferSchema,
  type WebOfferFormValues,
  type WebOfferInput,
} from "../offer-schema";

type Option = { id: string; name: string };
type VarietyOption = { id: string; code: string; name: string };
type CreatedOffer = Extract<OfferOnlineResult, { status: "created" }>["offer"];

/** Public sell offer from a phone browser; the client is found or created by the entered phone. */
export function WebOfferForm({
  today,
  municipalities,
  varieties,
}: {
  today: string;
  municipalities: Option[];
  varieties: VarietyOption[];
}) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const [offered, setOffered] = useState<CreatedOffer>();
  const form = useForm<WebOfferFormValues, unknown, WebOfferInput>({
    resolver: zodResolver(webOfferSchema),
    defaultValues: {
      name: "",
      phone: "",
      municipalityId: "",
      varietyId: "",
      harvestDate: "",
    },
  });
  const errors = form.formState.errors;
  // Send the raw form values, not the parsed ones (a blank variety parses to
  // null): the server parses them again with the same schema.
  const submit = form.handleSubmit(() =>
    startTransition(async () => {
      setMessage(undefined);
      try {
        const result = await offerOnline(form.getValues());
        if (result.status === "error") {
          setMessage(result.message);
          for (const [field, error] of Object.entries(result.fieldErrors ?? {}))
            form.setError(
              field as keyof WebOfferFormValues,
              { message: error },
              { shouldFocus: true },
            );
          return;
        }
        setOffered(result.offer);
      } catch {
        setMessage("Unable to save the offer. Please try again.");
      }
    }),
  );

  if (offered)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-center">
          <p className="text-sm text-muted-foreground">Offer recorded</p>
          <p className="font-mono text-4xl font-bold tracking-widest">
            {offered.ref}
          </p>
          <p>
            {formatKg(offered.est_kg)} · harvest{" "}
            {formatDate(offered.harvest_date)}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          We texted this code to your phone. We&apos;ll text you again once the
          manager decides.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            form.reset({ ...form.getValues(), estKg: undefined });
            setOffered(undefined);
          }}
        >
          Make another offer
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
          <FieldDescription>We text your offer code here.</FieldDescription>
          <FieldError errors={[errors.phone]} />
        </Field>
        <Field data-invalid={!!errors.municipalityId}>
          <FieldLabel htmlFor={`${formId}-municipality`}>
            Municipality
          </FieldLabel>
          <Controller
            control={form.control}
            name="municipalityId"
            render={({ field }) => (
              <OptionSelect
                id={`${formId}-municipality`}
                options={municipalities.map((m) => ({
                  value: m.id,
                  label: m.name,
                }))}
                placeholder="Choose your municipality"
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                triggerRef={field.ref}
                invalid={!!errors.municipalityId}
                disabled={pending}
              />
            )}
          />
          <FieldError errors={[errors.municipalityId]} />
        </Field>
        <Field data-invalid={!!errors.estKg}>
          <FieldLabel htmlFor={`${formId}-kg`}>Estimated kg</FieldLabel>
          <Input
            id={`${formId}-kg`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="3000"
            {...form.register("estKg", { valueAsNumber: true })}
            aria-invalid={!!errors.estKg}
            disabled={pending}
          />
          <FieldError errors={[errors.estKg]} />
        </Field>
        <Field data-invalid={!!errors.varietyId}>
          <FieldLabel htmlFor={`${formId}-variety`}>Variety</FieldLabel>
          <Controller
            control={form.control}
            name="varietyId"
            render={({ field }) => (
              <OptionSelect
                id={`${formId}-variety`}
                options={varieties.map((v) => ({
                  value: v.id,
                  label: `${v.code} — ${v.name}`,
                }))}
                none="Not sure"
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                triggerRef={field.ref}
                invalid={!!errors.varietyId}
                disabled={pending}
              />
            )}
          />
          <FieldDescription>Optional.</FieldDescription>
          <FieldError errors={[errors.varietyId]} />
        </Field>
        <Controller
          control={form.control}
          name="harvestDate"
          render={({ field, fieldState }) => (
            <Field data-invalid={!!fieldState.error}>
              <FieldLabel htmlFor={`${formId}-date`}>Harvest date</FieldLabel>
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
        {message ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to complete request</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? "Sending…" : "Send offer"}
        </Button>
      </FieldGroup>
    </form>
  );
}
