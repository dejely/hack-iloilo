"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { InfoIcon } from "@/components/hint-icons";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { setVoucherRef } from "../actions";

/** Records the disbursement voucher number against a purchase, added after pricing. */
export function VoucherForm({
  batchId,
  current,
}: {
  batchId: string;
  current: string | null;
}) {
  const fieldId = useId();
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await setVoucherRef(batchId, value);
          if (result.ok) toast.success("Voucher number saved.");
          else toast.error(result.error);
        });
      }}
    >
      <Field className="flex-1">
        <FieldLabel htmlFor={fieldId}>
          Voucher no.
          <InfoIcon text="Number on the payment voucher, added once the client is paid." />
        </FieldLabel>
        <Input
          id={fieldId}
          value={value}
          placeholder="Add after payment"
          disabled={pending}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Save
      </Button>
    </form>
  );
}
