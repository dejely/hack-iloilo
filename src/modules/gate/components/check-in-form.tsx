"use client";

import { ServiceIcon, ServiceLabel } from "@/components/service-icon";
import { useEffect, useId, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { InfoIcon } from "@/components/hint-icons";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatKg } from "@/lib/format";
import { ClientKindSelect } from "@/modules/accounts/components/client-kind-select";
import { kindLabels } from "@/modules/accounts/logic";
import type { Municipality } from "@/modules/accounts/types";
import { checkInClient, lookupRef, type LookupRefResult } from "../actions";
import {
  checkInSchema,
  type CheckInInput,
  type CheckInMode,
} from "../checkin-schema";
import {
  formatDay,
  maskPhone,
  normalizeRef,
  ownershipLabels,
  ownerships,
  REF_LENGTH,
  refKindLabels,
  serviceLabels,
  services,
} from "../logic";
import type { RefPreview, Service } from "../types";

/** Asks the form to switch tab, preselect a line and focus the first field. */
export type CheckInRequest = {
  mode: CheckInInput["mode"];
  service?: Service;
  seq: number;
};

const blank: CheckInInput = {
  mode: "phone",
  ref: "",
  phone: "",
  service: "drying",
  ownership: "custom",
  estKg: null,
  name: "",
  kind: "farmer",
  municipality_id: null,
};

const lookupFailed: LookupRefResult = {
  status: "error",
  message: "Unable to look up the code. Please try again.",
};

const isRefMode = (mode: CheckInMode) => mode === "booking" || mode === "offer";

/** A label and value row in the ref summary. */
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

function RefSummary({ preview }: { preview: RefPreview }) {
  return (
    <dl
      aria-label={`${refKindLabels[preview.kind]} ${preview.ref}`}
      className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm"
    >
      <Detail label="Client">
        {preview.client.name}
        <span className="block text-xs font-normal text-muted-foreground">
          {kindLabels[preview.client.kind as keyof typeof kindLabels] ??
            preview.client.kind}{" "}
          · {maskPhone(preview.client.phone)}
        </span>
      </Detail>
      <Detail label="Service">
        <ServiceLabel kind={preview.service}>
          {serviceLabels[preview.service]}
        </ServiceLabel>
      </Detail>
      {preview.kind === "offer" ? (
        <Detail label="Ownership">{ownershipLabels[preview.ownership]}</Detail>
      ) : null}
      <Detail label="Est. weight">{formatKg(preview.estKg)}</Detail>
      <Detail label={preview.kind === "offer" ? "Harvest" : "Booked for"}>
        {formatDay(preview.date)}
      </Detail>
    </dl>
  );
}

export function CheckInForm({
  municipalities,
  request,
  onCheckedIn,
}: {
  municipalities: Municipality[];
  request: CheckInRequest | null;
  onCheckedIn?: () => void;
}) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const form = useForm<CheckInInput>({
    resolver: zodResolver(checkInSchema),
    defaultValues: blank,
  });
  const mode = useWatch({ control: form.control, name: "mode" });
  const service = useWatch({ control: form.control, name: "service" });
  const ref = normalizeRef(useWatch({ control: form.control, name: "ref" }));
  const errors = form.formState.errors;
  const refMode = isRefMode(mode);
  const [lookup, setLookup] = useState<{
    ref: string;
    result: LookupRefResult;
  } | null>(null);
  const [looking, startLookup] = useTransition();
  const lookupResult = refMode && lookup?.ref === ref ? lookup.result : null;
  const preview = lookupResult?.status === "ok" ? lookupResult.preview : null;

  // Look the ref up as soon as it is complete; bookings first, then offers.
  useEffect(() => {
    if (!refMode || ref.length !== REF_LENGTH) return;
    let current = true;
    startLookup(async () => {
      const result = await lookupRef(ref).catch(() => lookupFailed);
      if (!current) return;
      setLookup({ ref, result });
      // An offer ref typed under Booking (or the reverse) moves to its tab.
      if (
        result.status === "ok" &&
        result.preview.kind !== form.getValues("mode")
      )
        form.setValue("mode", result.preview.kind);
    });
    return () => {
      current = false;
    };
  }, [refMode, ref, form]);

  useEffect(() => {
    if (!request) return;
    form.setValue("mode", request.mode);
    if (request.service) form.setValue("service", request.service);
    form.setFocus(
      request.mode === "walkIn"
        ? "name"
        : isRefMode(request.mode)
          ? "ref"
          : "phone",
    );
  }, [request, form]);

  const submit = form.handleSubmit((input) =>
    startTransition(async () => {
      setMessage(undefined);
      try {
        const result = await checkInClient(input);
        if (result.status === "error") {
          setMessage(result.message);
          for (const [field, error] of Object.entries(result.fieldErrors ?? {}))
            form.setError(
              field as keyof CheckInInput,
              { message: error },
              { shouldFocus: true },
            );
          return;
        }
        toast.success(
          preview
            ? `Checked in ${preview.ref} to the ${preview.service} line.`
            : `Checked in to the ${input.service} line.`,
        );
        form.reset({ ...blank, mode: input.mode, service: input.service });
        setLookup(null);
        onCheckedIn?.();
      } catch {
        setMessage("Unable to check in the client. Please try again.");
      }
    }),
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Tabs
        value={mode}
        onValueChange={(value) => {
          form.setValue("mode", value);
          form.clearErrors();
        }}
      >
        <TabsList aria-label="Check in by">
          <TabsTrigger value="booking">Booking</TabsTrigger>
          <TabsTrigger value="offer">Offer</TabsTrigger>
          <TabsTrigger value="phone">Phone</TabsTrigger>
          <TabsTrigger value="walkIn">Walk-in</TabsTrigger>
        </TabsList>
      </Tabs>
      <FieldGroup>
        {refMode ? (
          <>
            <Field
              data-invalid={!!errors.ref || lookupResult?.status === "error"}
            >
              <FieldLabel htmlFor={`${formId}-ref`}>
                {refKindLabels[mode as "booking" | "offer"]} code
              </FieldLabel>
              <Input
                id={`${formId}-ref`}
                placeholder="K7P2QX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={REF_LENGTH + 2}
                className="uppercase"
                {...form.register("ref")}
                aria-invalid={!!errors.ref || lookupResult?.status === "error"}
                disabled={pending}
              />
              {looking && !lookupResult ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> Looking up {ref}…
                </p>
              ) : null}
              <FieldError
                errors={[
                  errors.ref ??
                    (lookupResult?.status === "error"
                      ? { message: lookupResult.message }
                      : undefined),
                ]}
              />
            </Field>
            {preview ? <RefSummary preview={preview} /> : null}
          </>
        ) : null}
        {!refMode && mode === "walkIn" ? (
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor={`${formId}-name`}>Name</FieldLabel>
            <Input
              id={`${formId}-name`}
              placeholder="Full name"
              autoComplete="name"
              {...form.register("name")}
              aria-invalid={!!errors.name}
              disabled={pending}
            />
            <FieldError errors={[errors.name]} />
          </Field>
        ) : null}
        {refMode ? null : (
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor={`${formId}-phone`}>Phone</FieldLabel>
            <Input
              id={`${formId}-phone`}
              type="tel"
              autoComplete="tel"
              placeholder="0917 123 4567"
              {...form.register("phone")}
              aria-invalid={!!errors.phone}
              disabled={pending}
            />
            <FieldError errors={[errors.phone]} />
          </Field>
        )}
        {mode === "walkIn" ? (
          <>
            <Controller
              control={form.control}
              name="municipality_id"
              render={({ field, fieldState }) => {
                const selected =
                  municipalities.find((m) => m.id === field.value) ?? null;
                return (
                  <Field data-invalid={!!fieldState.error}>
                    <FieldLabel htmlFor={`${formId}-municipality`}>
                      Municipality
                    </FieldLabel>
                    <Combobox
                      items={municipalities}
                      value={selected}
                      onValueChange={(item) => field.onChange(item?.id ?? null)}
                      itemToStringLabel={(item) => item.name}
                      isItemEqualToValue={(item, value) => item.id === value.id}
                      disabled={pending}
                    >
                      <ComboboxInput
                        id={`${formId}-municipality`}
                        disabled={pending}
                        aria-invalid={!!fieldState.error}
                        placeholder="Search municipality…"
                      />
                      <ComboboxContent>
                        <ComboboxEmpty>No matches.</ComboboxEmpty>
                        <ComboboxList>
                          {(item: Municipality) => (
                            <ComboboxItem key={item.id} value={item}>
                              {item.name}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                );
              }}
            />
            <Controller
              control={form.control}
              name="kind"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor={`${formId}-kind`}>Kind</FieldLabel>
                  <ClientKindSelect
                    id={`${formId}-kind`}
                    value={field.value}
                    disabled={pending}
                    invalid={!!fieldState.error}
                    onBlur={field.onBlur}
                    triggerRef={field.ref}
                    onChange={(value) => {
                      if (value !== "all") field.onChange(value);
                    }}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </>
        ) : null}
        {refMode ? null : (
          <>
            <Controller
              control={form.control}
              name="service"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel>Service line</FieldLabel>
                  <ToggleGroup
                    variant="outline"
                    spacing={0}
                    aria-label="Service line"
                    value={[field.value]}
                    disabled={pending}
                    onValueChange={([value]) => {
                      if (value) field.onChange(value);
                    }}
                  >
                    {services.map((value) => (
                      <ToggleGroupItem key={value} value={value}>
                        <ServiceIcon kind={value} />
                        {serviceLabels[value]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="ownership"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel>
                    Ownership
                    <InfoIcon text="Custom: the client pays a fee to dry or mill their own palay. Selling to IRPC: IRPC buys the palay." />
                  </FieldLabel>
                  <ToggleGroup
                    variant="outline"
                    spacing={0}
                    aria-label="Ownership"
                    value={[field.value]}
                    disabled={pending}
                    onValueChange={([value]) => {
                      if (value) field.onChange(value);
                    }}
                  >
                    {ownerships.map((value) => (
                      <ToggleGroupItem key={value} value={value}>
                        {ownershipLabels[value]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Field data-invalid={!!errors.estKg}>
              <FieldLabel htmlFor={`${formId}-kg`}>Est. weight (kg)</FieldLabel>
              <Input
                id={`${formId}-kg`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="Optional"
                {...form.register("estKg", {
                  // A reset hands back null, which Number() would turn into 0.
                  setValueAs: (value: string | number | null) =>
                    value === "" || value === null ? null : Number(value),
                })}
                aria-invalid={!!errors.estKg}
                disabled={pending}
              />
              <FieldError errors={[errors.estKg]} />
            </Field>
          </>
        )}
        {message ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to complete request</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
      </FieldGroup>
      <Button
        type="submit"
        disabled={pending || (refMode && !preview)}
        className="self-start"
      >
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {pending
          ? "Checking in…"
          : refMode && !preview
            ? "Check in"
            : `Check in to ${serviceLabels[preview?.service ?? service]} line`}
      </Button>
      <Alert>
        <AlertDescription>
          Unknown phone? Register the walk-in in seconds (name, phone,
          municipality, kind).
        </AlertDescription>
      </Alert>
    </form>
  );
}
