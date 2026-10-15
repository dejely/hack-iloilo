"use client";

import { useId, useState, useTransition } from "react";
import { Controller, type FieldValues, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { DateTimePicker } from "@/components/date-time-picker";
import { OptionSelect } from "@/components/option-select";
import { InfoIcon } from "@/components/hint-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Spinner } from "@/components/ui/spinner";
import { joinManila, splitManila } from "@/lib/dates";
import {
  finishDryingBatch,
  finishMillingBatch,
  recordReceivingBatch,
  skipDryingBatch,
  startDryingBatch,
  startMillingBatch,
  type StageResult,
} from "../actions";
import {
  finishDryingSchema,
  type FinishDryingInput,
  finishMillingSchema,
  type FinishMillingInput,
  receivingSchema,
  type ReceivingInput,
  startDryingSchema,
  type StartDryingInput,
  startMillingSchema,
  type StartMillingInput,
} from "../batch-schema";
import type { Batch } from "../types";

type Machine = { id: string; code: string };
type Variety = { id: string; code: string; name: string };

/** Current Manila wall-clock as the picker's ISO format. */
function nowManila(): string {
  const { date, time } = splitManila(new Date());
  return joinManila(date, time);
}

/** The next step for a batch, matching the stage it's on. */
export function BatchStages({
  batch,
  dryers,
  mills,
  varieties,
}: {
  batch: Pick<Batch, "id" | "stage" | "ownership">;
  dryers: Machine[];
  mills: Machine[];
  varieties: Variety[];
}) {
  switch (batch.stage) {
    case "received":
      return (
        <div className="flex flex-col gap-8">
          <ReceivingForm batchId={batch.id} varieties={varieties} />
          <ReceivedForms batchId={batch.id} dryers={dryers} />
        </div>
      );
    case "drying":
      return (
        <FinishDryingForm
          batchId={batch.id}
          custom={batch.ownership === "custom"}
        />
      );
    case "stored":
      return <StartMillingForm batchId={batch.id} mills={mills} />;
    case "milling":
      return <FinishMillingForm batchId={batch.id} />;
    default:
      return null;
  }
}

/** Shared submit wiring: run the action, map errors back onto the form. */
function useStageSubmit<T extends FieldValues>(
  form: ReturnType<typeof useForm<T>>,
  action: (input: T) => Promise<StageResult>,
  done: string,
) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const submit = form.handleSubmit((input) =>
    startTransition(async () => {
      setMessage(undefined);
      const result = await action(input);
      if (result.status === "error") {
        setMessage(result.message);
        for (const [field, error] of Object.entries(result.fieldErrors ?? {}))
          form.setError(field as never, { message: error });
        return;
      }
      toast.success(done);
    }),
  );
  return { pending, message, submit };
}

function StageCard({
  title,
  description,
  pending,
  message,
  submit,
  submitLabel,
  children,
  extra,
}: {
  title: string;
  description: string;
  pending: boolean;
  message?: string;
  submit: () => void;
  submitLabel: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <FieldGroup>{children}</FieldGroup>
      {message ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t save</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {submitLabel}
        </Button>
        {extra}
      </div>
    </form>
  );
}

function ReceivingForm({
  batchId,
  varieties,
}: {
  batchId: string;
  varieties: Variety[];
}) {
  const formId = useId();
  const form = useForm<ReceivingInput>({
    resolver: zodResolver(receivingSchema),
    defaultValues: {
      bags: undefined,
      net_kg: undefined,
      variety_id: "",
      mc: undefined,
      damaged_pct: 0,
      immature_pct: 0,
      foreign_pct: 0,
    },
  });
  const { pending, message, submit } = useStageSubmit(
    form,
    (input) => recordReceivingBatch(batchId, input),
    "Receiving saved.",
  );
  const errors = form.formState.errors;
  const asNumber = { valueAsNumber: true } as const;

  const pctField = (
    name: "damaged_pct" | "immature_pct" | "foreign_pct",
    label: string,
    info: string,
  ) => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={`${formId}-${name}`}>
        {label}
        <InfoIcon text={info} />
      </FieldLabel>
      <Input
        id={`${formId}-${name}`}
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        max={100}
        aria-invalid={!!errors[name]}
        disabled={pending}
        {...form.register(name, asNumber)}
      />
      <FieldError errors={[errors[name]]} />
    </Field>
  );

  return (
    <StageCard
      title="Receiving report"
      description="Weigh and grade the delivery. IRPC palay is priced on save."
      pending={pending}
      message={message}
      submit={submit}
      submitLabel={pending ? "Saving…" : "Save receiving"}
    >
      <Field data-invalid={!!errors.bags}>
        <FieldLabel htmlFor={`${formId}-bags`}>
          Sacks
          <InfoIcon text="Number of sacks. Each sack's own weight comes off the paid weight." />
        </FieldLabel>
        <Input
          id={`${formId}-bags`}
          type="number"
          inputMode="numeric"
          step={1}
          min={0}
          aria-invalid={!!errors.bags}
          disabled={pending}
          {...form.register("bags", asNumber)}
        />
        <FieldError errors={[errors.bags]} />
      </Field>
      <Field data-invalid={!!errors.net_kg}>
        <FieldLabel htmlFor={`${formId}-net`}>
          Net weight (kg)
          <InfoIcon text="Palay weight on the scale, without the truck." />
        </FieldLabel>
        <Input
          id={`${formId}-net`}
          type="number"
          inputMode="numeric"
          step={1}
          min={1}
          aria-invalid={!!errors.net_kg}
          disabled={pending}
          {...form.register("net_kg", asNumber)}
        />
        <FieldError errors={[errors.net_kg]} />
      </Field>
      <Field data-invalid={!!errors.variety_id}>
        <FieldLabel htmlFor={`${formId}-variety`}>Variety</FieldLabel>
        <Controller
          control={form.control}
          name="variety_id"
          render={({ field }) => (
            <OptionSelect
              id={`${formId}-variety`}
              options={varieties.map((v) => ({
                value: v.id,
                label: `${v.code} — ${v.name}`,
              }))}
              none="Not recorded"
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              triggerRef={field.ref}
              invalid={!!errors.variety_id}
              disabled={pending}
            />
          )}
        />
        <FieldError errors={[errors.variety_id]} />
      </Field>
      <Field data-invalid={!!errors.mc}>
        <FieldLabel htmlFor={`${formId}-mc`}>
          Moisture content (%)
          <InfoIcon text="Water in the palay, from the moisture meter. Wetter palay gets a lower price per kg." />
        </FieldLabel>
        <Input
          id={`${formId}-mc`}
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          max={100}
          aria-invalid={!!errors.mc}
          disabled={pending}
          {...form.register("mc", asNumber)}
        />
        <FieldError errors={[errors.mc]} />
      </Field>
      {pctField(
        "damaged_pct",
        "Damaged (%)",
        "Share of the delivery that is broken, discolored or damaged grain. Part of it comes off the paid weight.",
      )}
      {pctField(
        "immature_pct",
        "Immature (%)",
        "Share of the delivery that is unfilled or green grain. Part of it comes off the paid weight.",
      )}
      {pctField(
        "foreign_pct",
        "Foreign matter (%)",
        "Share of the delivery that is stones, straw, dirt or weed seeds. It comes off the paid weight.",
      )}
    </StageCard>
  );
}

function ReceivedForms({
  batchId,
  dryers,
}: {
  batchId: string;
  dryers: Machine[];
}) {
  const formId = useId();
  const form = useForm<StartDryingInput>({
    resolver: zodResolver(startDryingSchema),
    defaultValues: { dryer_id: "", dry_start: nowManila() },
  });
  const { pending, message, submit } = useStageSubmit(
    form,
    (input) => startDryingBatch(batchId, input),
    "Drying started.",
  );
  const [skipping, startSkip] = useTransition();
  const errors = form.formState.errors;

  return (
    <StageCard
      title="Start drying"
      description="Load the palay into a dryer. Dry palay can skip this step."
      pending={pending}
      message={message}
      submit={submit}
      submitLabel={pending ? "Starting…" : "Start drying"}
      extra={
        <Button
          type="button"
          variant="outline"
          disabled={skipping}
          onClick={() =>
            startSkip(async () => {
              const result = await skipDryingBatch(batchId);
              if (result.status === "error")
                toast.error(result.message ?? "Couldn't skip drying.");
              else toast.success("Drying skipped — moved to storage.");
            })
          }
        >
          {skipping ? <Spinner data-icon="inline-start" /> : null}
          Skip drying
        </Button>
      }
    >
      <Field data-invalid={!!errors.dryer_id}>
        <FieldLabel htmlFor={`${formId}-dryer`}>Dryer</FieldLabel>
        <Controller
          control={form.control}
          name="dryer_id"
          render={({ field }) => (
            <OptionSelect
              id={`${formId}-dryer`}
              options={dryers.map((d) => ({
                value: d.id,
                label: d.code,
              }))}
              none="Choose a dryer…"
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              triggerRef={field.ref}
              invalid={!!errors.dryer_id}
              disabled={pending}
            />
          )}
        />
        <FieldError errors={[errors.dryer_id]} />
      </Field>
      <Controller
        control={form.control}
        name="dry_start"
        render={({ field, fieldState }) => (
          <Field data-invalid={!!fieldState.error}>
            <FieldLabel>Started</FieldLabel>
            <DateTimePicker
              value={field.value}
              onChange={(value) => field.onChange(value ?? "")}
              disabled={pending}
              aria-invalid={!!fieldState.error}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </StageCard>
  );
}

function FinishDryingForm({
  batchId,
  custom,
}: {
  batchId: string;
  custom: boolean;
}) {
  const formId = useId();
  const form = useForm<FinishDryingInput>({
    resolver: zodResolver(finishDryingSchema),
    defaultValues: {
      dry_end: nowManila(),
      mc_out: undefined,
      dried_kg: undefined,
      ready_for_pickup: false,
    },
  });
  const { pending, message, submit } = useStageSubmit(
    form,
    (input) => finishDryingBatch(batchId, input),
    "Drying saved. Check weight confirmation and pickup details below.",
  );
  const errors = form.formState.errors;

  return (
    <StageCard
      title="Finish drying"
      description="Record the dried palay coming out of the dryer."
      pending={pending}
      message={message}
      submit={submit}
      submitLabel={pending ? "Saving…" : "Finish drying"}
    >
      {custom ? (
        <Controller
          control={form.control}
          name="ready_for_pickup"
          render={({ field }) => (
            <Field>
              <FieldLabel id={`${formId}-next`}>After drying</FieldLabel>
              <ToggleGroup
                variant="outline"
                aria-labelledby={`${formId}-next`}
                value={[field.value ? "pickup" : "mill"]}
                disabled={pending}
                onValueChange={(values) => {
                  if (values.length) field.onChange(values[0] === "pickup");
                }}
              >
                <ToggleGroupItem value="mill">
                  Continue to milling
                </ToggleGroupItem>
                <ToggleGroupItem value="pickup">
                  Ready for pickup
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        />
      ) : null}
      <Controller
        control={form.control}
        name="dry_end"
        render={({ field, fieldState }) => (
          <Field data-invalid={!!fieldState.error}>
            <FieldLabel>Finished</FieldLabel>
            <DateTimePicker
              value={field.value}
              onChange={(value) => field.onChange(value ?? "")}
              disabled={pending}
              aria-invalid={!!fieldState.error}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Field data-invalid={!!errors.mc_out}>
        <FieldLabel htmlFor={`${formId}-mc`}>
          Moisture out (%)
          <InfoIcon text="Moisture after drying, from the moisture meter. Palay is dry enough to store at about 14%." />
        </FieldLabel>
        <Input
          id={`${formId}-mc`}
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          max={100}
          aria-invalid={!!errors.mc_out}
          disabled={pending}
          {...form.register("mc_out", { valueAsNumber: true })}
        />
        <FieldError errors={[errors.mc_out]} />
      </Field>
      <Field data-invalid={!!errors.dried_kg}>
        <FieldLabel htmlFor={`${formId}-dried`}>Dried weight (kg)</FieldLabel>
        <Input
          id={`${formId}-dried`}
          type="number"
          inputMode="numeric"
          step={1}
          min={1}
          aria-invalid={!!errors.dried_kg}
          disabled={pending}
          {...form.register("dried_kg", { valueAsNumber: true })}
        />
        <FieldError errors={[errors.dried_kg]} />
      </Field>
    </StageCard>
  );
}

function StartMillingForm({
  batchId,
  mills,
}: {
  batchId: string;
  mills: Machine[];
}) {
  const formId = useId();
  const form = useForm<StartMillingInput>({
    resolver: zodResolver(startMillingSchema),
    defaultValues: { mill_id: "", mill_start: nowManila() },
  });
  const { pending, message, submit } = useStageSubmit(
    form,
    (input) => startMillingBatch(batchId, input),
    "Milling started.",
  );
  const errors = form.formState.errors;

  return (
    <StageCard
      title="Start milling"
      description="Load the dried palay into the mill."
      pending={pending}
      message={message}
      submit={submit}
      submitLabel={pending ? "Starting…" : "Start milling"}
    >
      <Field data-invalid={!!errors.mill_id}>
        <FieldLabel htmlFor={`${formId}-mill`}>Mill</FieldLabel>
        <Controller
          control={form.control}
          name="mill_id"
          render={({ field }) => (
            <OptionSelect
              id={`${formId}-mill`}
              options={mills.map((m) => ({
                value: m.id,
                label: m.code,
              }))}
              none="Choose a mill…"
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              triggerRef={field.ref}
              invalid={!!errors.mill_id}
              disabled={pending}
            />
          )}
        />
        <FieldError errors={[errors.mill_id]} />
      </Field>
      <Controller
        control={form.control}
        name="mill_start"
        render={({ field, fieldState }) => (
          <Field data-invalid={!!fieldState.error}>
            <FieldLabel>Started</FieldLabel>
            <DateTimePicker
              value={field.value}
              onChange={(value) => field.onChange(value ?? "")}
              disabled={pending}
              aria-invalid={!!fieldState.error}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </StageCard>
  );
}

function FinishMillingForm({ batchId }: { batchId: string }) {
  const formId = useId();
  const form = useForm<FinishMillingInput>({
    resolver: zodResolver(finishMillingSchema),
    defaultValues: {
      mill_end: nowManila(),
      mill_in_kg: undefined,
      rice_kg: undefined,
      bran_kg: null,
      husk_kg: null,
    },
  });
  const { pending, message, submit } = useStageSubmit(
    form,
    (input) => finishMillingBatch(batchId, input),
    "Milling finished.",
  );
  const errors = form.formState.errors;
  const asKg = { valueAsNumber: true } as const;
  const asNullableKg = {
    setValueAs: (value: string) => (value === "" ? null : Number(value)),
  } as const;

  return (
    <StageCard
      title="Finish milling"
      description="Record the rice and by-products. Recovery is computed."
      pending={pending}
      message={message}
      submit={submit}
      submitLabel={pending ? "Saving…" : "Finish milling"}
    >
      <Controller
        control={form.control}
        name="mill_end"
        render={({ field, fieldState }) => (
          <Field data-invalid={!!fieldState.error}>
            <FieldLabel>Finished</FieldLabel>
            <DateTimePicker
              value={field.value}
              onChange={(value) => field.onChange(value ?? "")}
              disabled={pending}
              aria-invalid={!!fieldState.error}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Field data-invalid={!!errors.mill_in_kg}>
        <FieldLabel htmlFor={`${formId}-in`}>
          Into the mill (kg)
          <InfoIcon text="Dried palay fed into the mill. Recovery is rice out divided by this." />
        </FieldLabel>
        <Input
          id={`${formId}-in`}
          type="number"
          inputMode="numeric"
          step={1}
          min={1}
          aria-invalid={!!errors.mill_in_kg}
          disabled={pending}
          {...form.register("mill_in_kg", asKg)}
        />
        <FieldError errors={[errors.mill_in_kg]} />
      </Field>
      <Field data-invalid={!!errors.rice_kg}>
        <FieldLabel htmlFor={`${formId}-rice`}>Rice out (kg)</FieldLabel>
        <Input
          id={`${formId}-rice`}
          type="number"
          inputMode="numeric"
          step={1}
          min={1}
          aria-invalid={!!errors.rice_kg}
          disabled={pending}
          {...form.register("rice_kg", asKg)}
        />
        <FieldError errors={[errors.rice_kg]} />
      </Field>
      <Field data-invalid={!!errors.bran_kg}>
        <FieldLabel htmlFor={`${formId}-bran`}>Bran / darak (kg)</FieldLabel>
        <Input
          id={`${formId}-bran`}
          type="number"
          inputMode="numeric"
          step={1}
          min={0}
          placeholder="Optional"
          aria-invalid={!!errors.bran_kg}
          disabled={pending}
          {...form.register("bran_kg", asNullableKg)}
        />
        <FieldError errors={[errors.bran_kg]} />
      </Field>
      <Field data-invalid={!!errors.husk_kg}>
        <FieldLabel htmlFor={`${formId}-husk`}>Husk / ipa (kg)</FieldLabel>
        <Input
          id={`${formId}-husk`}
          type="number"
          inputMode="numeric"
          step={1}
          min={0}
          placeholder="Optional"
          aria-invalid={!!errors.husk_kg}
          disabled={pending}
          {...form.register("husk_kg", asNullableKg)}
        />
        <FieldError errors={[errors.husk_kg]} />
      </Field>
    </StageCard>
  );
}
