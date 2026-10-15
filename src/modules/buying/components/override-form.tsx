"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { InfoIcon } from "@/components/hint-icons";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { overridePrice } from "../actions";

/** Manager-only override of a purchase's price per kg, with a required reason. */
export function OverrideForm({
  batchId,
  reason,
}: {
  batchId: string;
  reason: string | null;
}) {
  const priceId = useId();
  const reasonId = useId();
  const [price, setPrice] = useState("");
  const [why, setWhy] = useState(reason ?? "");
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await overridePrice(batchId, price, why);
          if (result.ok) {
            toast.success("Price override saved.");
            setPrice("");
          } else toast.error(result.error);
        });
      }}
    >
      <div className="flex items-end gap-2">
        <Field className="w-40">
          <FieldLabel htmlFor={priceId}>
            Override price (₱/kg)
            <InfoIcon text="Replaces the computed price, for example after negotiating. The reason is kept with the purchase." />
          </FieldLabel>
          <Input
            id={priceId}
            type="number"
            step={0.01}
            min={0}
            value={price}
            placeholder="21.00"
            disabled={pending}
            onChange={(event) => setPrice(event.target.value)}
          />
        </Field>
        <Field className="flex-1">
          <FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
          <Input
            id={reasonId}
            value={why}
            placeholder="Why the price changes"
            disabled={pending}
            onChange={(event) => setWhy(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Override
        </Button>
      </div>
    </form>
  );
}
