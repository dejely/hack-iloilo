"use client";

import { ArrowLeft, Search } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { StatusBadge } from "@/components/status-badge";
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
import {
  trackLookupSchema,
  type TrackLookupInput,
} from "@/modules/booking/booking-schema";
import {
  cancelTrackedOrder,
  trackOrder,
  type BuyerOrder,
  type TrackOrderResult,
} from "../actions";
import { canCancel, orderStatusLabels, orderStatusTones } from "../logic";

/** Public /buy/track: look up a rice request by code and phone, then cancel it. */
export function TrackOrder({ defaultRef }: { defaultRef: string }) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [owner, setOwner] = useState<TrackLookupInput>();
  const [order, setOrder] = useState<BuyerOrder>();
  const form = useForm<TrackLookupInput>({
    resolver: zodResolver(trackLookupSchema),
    defaultValues: { ref: defaultRef, phone: "" },
  });
  const errors = form.formState.errors;

  function run(action: () => Promise<TrackOrderResult>, done?: string) {
    startTransition(async () => {
      setMessage(undefined);
      setNotice(undefined);
      try {
        const result = await action();
        if (result.status === "error") {
          setMessage(result.message ?? "Check the code and mobile number.");
          if (result.order) setOrder(result.order);
          return;
        }
        setOrder(result.order);
        setNotice(done);
      } catch {
        setMessage("Something went wrong. Please try again.");
      }
    });
  }

  const submit = form.handleSubmit((input) => {
    setOwner(input);
    run(() => trackOrder(input));
  });

  if (order && owner)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-2xl font-bold tracking-widest">
            {order.ref}
          </p>
          <StatusBadge tone={orderStatusTones[order.status]}>
            {orderStatusLabels[order.status]}
          </StatusBadge>
        </div>
        <dl className="divide-y">
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted-foreground">Rice</dt>
            <dd className="tabular-nums">{formatKg(order.kg)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted-foreground">Pickup</dt>
            <dd className="tabular-nums">{formatDate(order.pickup_date)}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          You pay at the plant on pickup. The price is set then.
        </p>
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
        {canCancel(order.status) ? (
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={pending}
            onClick={() =>
              run(
                () => cancelTrackedOrder(owner),
                "Request cancelled. We texted you.",
              )
            }
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Cancel request
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            setOrder(undefined);
            setMessage(undefined);
            setNotice(undefined);
            form.reset({ ref: "", phone: owner.phone });
          }}
        >
          <ArrowLeft data-icon="inline-start" />
          Look up another
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field data-invalid={!!errors.ref}>
          <FieldLabel htmlFor={`${formId}-ref`}>Request code</FieldLabel>
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
          <FieldDescription>The number that sent the request.</FieldDescription>
          <FieldError errors={[errors.phone]} />
        </Field>
        {message ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to find request</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Search data-icon="inline-start" />
          )}
          {pending ? "Looking up…" : "Find my request"}
        </Button>
      </FieldGroup>
    </form>
  );
}
