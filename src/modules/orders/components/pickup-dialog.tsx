"use client";

import { useId, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { OptionSelect } from "@/components/option-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatKg } from "@/lib/format";
import { pickUpOrder } from "../actions";

export type SaleBatch = { id: string; batchNo: string; remainingKg: number };

// Price is entered in pesos and converted to centavos on submit, as in the
// batch dispatch form.
const schema = z.object({
  batchId: z.string().min(1, "Choose the batch the rice comes from."),
  kg: z
    .number("Enter the weight in kg.")
    .int("Enter whole kilograms.")
    .positive("Enter more than 0 kg."),
  pricePerKg: z
    .number("Enter the price per kg.")
    .nonnegative("Price can't be negative."),
  orRef: z.string().trim(),
});
type FormValues = z.infer<typeof schema>;

const toNumber = (value: string | number | null) =>
  value === "" || value === null ? NaN : Number(value);

/**
 * "Picked up" for an accepted request: records the sale from one batch, so
 * stock goes down and the buyer is traced to the batch, then closes the request.
 */
export function PickupDialog({
  order,
  batches,
  riceMinorPerKg,
}: {
  order: { id: string; ref: string; kg: number };
  batches: SaleBatch[];
  riceMinorPerKg: number | null;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      batchId: batches[0]?.id ?? "",
      kg: order.kg,
      pricePerKg: riceMinorPerKg !== null ? riceMinorPerKg / 100 : NaN,
      orRef: "",
    },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit((values) =>
    startTransition(async () => {
      setMessage(undefined);
      try {
        const result = await pickUpOrder(order.id, {
          batchId: values.batchId,
          kg: values.kg,
          priceMinorPerKg: Math.round(values.pricePerKg * 100),
          orRef: values.orRef || null,
        });
        if (result.status === "error") {
          setMessage(result.message);
          for (const [field, error] of Object.entries(result.fieldErrors ?? {}))
            form.setError(
              (field === "priceMinorPerKg"
                ? "pricePerKg"
                : field) as keyof FormValues,
              { message: error },
              { shouldFocus: true },
            );
          return;
        }
        toast.success(`Pickup recorded for ${order.ref}.`);
        setOpen(false);
      } catch {
        setMessage("Unable to record the pickup. Please try again.");
      }
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Picked up</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record pickup · {order.ref}</DialogTitle>
          <DialogDescription>
            Records the sale from a batch. The buyer is texted the receipt and
            batch no.
          </DialogDescription>
        </DialogHeader>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No milled IRPC rice is left to sell. Record milling first.
          </p>
        ) : (
          <form onSubmit={submit}>
            <FieldGroup>
              <Controller
                control={form.control}
                name="batchId"
                render={({ field, fieldState }) => (
                  <Field data-invalid={!!fieldState.error}>
                    <FieldLabel htmlFor={`${formId}-batch`}>Batch</FieldLabel>
                    <OptionSelect
                      id={`${formId}-batch`}
                      options={batches.map((b) => ({
                        value: b.id,
                        label: `${b.batchNo} · ${formatKg(b.remainingKg)} left`,
                      }))}
                      placeholder="Choose a batch"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      triggerRef={field.ref}
                      invalid={!!fieldState.error}
                      disabled={pending}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Field data-invalid={!!errors.kg}>
                <FieldLabel htmlFor={`${formId}-kg`}>Weight (kg)</FieldLabel>
                <Input
                  id={`${formId}-kg`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  {...form.register("kg", { setValueAs: toNumber })}
                  aria-invalid={!!errors.kg}
                  disabled={pending}
                />
                <FieldDescription>
                  Requested {formatKg(order.kg)}.
                </FieldDescription>
                <FieldError errors={[errors.kg]} />
              </Field>
              <Field data-invalid={!!errors.pricePerKg}>
                <FieldLabel htmlFor={`${formId}-price`}>
                  Price (₱/kg)
                </FieldLabel>
                <Input
                  id={`${formId}-price`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  {...form.register("pricePerKg", { setValueAs: toNumber })}
                  aria-invalid={!!errors.pricePerKg}
                  disabled={pending}
                />
                <FieldError errors={[errors.pricePerKg]} />
              </Field>
              <Field data-invalid={!!errors.orRef}>
                <FieldLabel htmlFor={`${formId}-or`}>Receipt no.</FieldLabel>
                <Input
                  id={`${formId}-or`}
                  autoComplete="off"
                  {...form.register("orRef")}
                  aria-invalid={!!errors.orRef}
                  disabled={pending}
                />
                <FieldDescription>
                  Optional. The official receipt.
                </FieldDescription>
                <FieldError errors={[errors.orRef]} />
              </Field>
              {message ? (
                <Alert variant="destructive">
                  <AlertTitle>Unable to record pickup</AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                {pending ? "Saving…" : "Record pickup"}
              </Button>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
