"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { InfoIcon } from "@/components/hint-icons";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { saveBudget } from "../actions";

/** Manager-only form for the buying budget (₱) and its period start date. */
export function BudgetForm({
  budget,
  start,
}: {
  budget: string;
  start: string;
}) {
  const budgetId = useId();
  const startId = useId();
  const [amount, setAmount] = useState(budget);
  const [from, setFrom] = useState(start);
  const [pending, begin] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        begin(async () => {
          const result = await saveBudget(amount, from);
          if (result.ok) toast.success("Budget saved.");
          else toast.error(result.error);
        });
      }}
    >
      <Field>
        <FieldLabel htmlFor={budgetId}>Budget (₱)</FieldLabel>
        <Input
          id={budgetId}
          type="number"
          step={0.01}
          min={0}
          value={amount}
          placeholder="5000000"
          disabled={pending}
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={startId}>
          Period start
          <InfoIcon text="Purchases from this date count against the budget. Leave it empty to count all purchases." />
        </FieldLabel>
        <DatePicker
          id={startId}
          value={from}
          disabled={pending}
          onChange={(value) => setFrom(value ?? "")}
        />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Save budget
      </Button>
    </form>
  );
}
