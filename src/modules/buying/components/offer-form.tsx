"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { OptionSelect } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SheetFooter } from "@/components/ui/sheet";
import { submitOffer, type OfferFormState } from "../actions";

type ClientOption = { id: string; name: string; phone: string };
type VarietyOption = { id: string; code: string; name: string };

/** Staff record of a client's offer to sell palay, laid out for a sheet. */
export function OfferForm({
  clients,
  varieties,
  onSaved,
}: {
  clients: ClientOption[];
  varieties: VarietyOption[];
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(
    async (previous: OfferFormState, formData: FormData) => {
      const result = await submitOffer(previous, formData);
      if (result?.ok) {
        toast.success(`Offer ${result.ref} recorded.`);
        onSaved?.();
      }
      return result;
    },
    undefined,
  );
  // A new ref means a successful submit: remount the fields to clear them
  // (DOM and phone state both reset), without a setState-in-effect.
  const resetKey = state?.ok ? state.ref : "new";

  return (
    <OfferFields
      key={resetKey}
      clients={clients}
      varieties={varieties}
      action={action}
      pending={pending}
      state={state}
    />
  );
}

function OfferFields({
  clients,
  varieties,
  action,
  pending,
  state,
}: {
  clients: ClientOption[];
  varieties: VarietyOption[];
  action: (formData: FormData) => void;
  pending: boolean;
  state: OfferFormState;
}) {
  const [phone, setPhone] = useState("");
  const [harvestDate, setHarvestDate] = useState("");

  return (
    <form
      action={action}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <FieldGroup className="p-4">
        <Field>
          <FieldLabel htmlFor="clientId">Client</FieldLabel>
          <OptionSelect
            id="clientId"
            name="clientId"
            required
            defaultValue=""
            placeholder="Select a client"
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(id) => {
              const client = clients.find((c) => c.id === id);
              setPhone(client?.phone ?? "");
            }}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="varietyId">Variety</FieldLabel>
          <OptionSelect
            id="varietyId"
            name="varietyId"
            defaultValue=""
            none="Unknown"
            options={varieties.map((v) => ({
              value: v.id,
              label: `${v.code} — ${v.name}`,
            }))}
          />
          <FieldDescription>Optional.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="estKg">Estimated kilos</FieldLabel>
          <Input
            id="estKg"
            name="estKg"
            type="number"
            min={1}
            step={1}
            required
            placeholder="3000"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="harvestDate">Harvest date</FieldLabel>
          <DatePicker
            id="harvestDate"
            name="harvestDate"
            value={harvestDate}
            onChange={(value) => setHarvestDate(value ?? "")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="bookedByPhone">Contact phone</FieldLabel>
          <Input
            id="bookedByPhone"
            name="bookedByPhone"
            type="tel"
            required
            placeholder="+639XXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <FieldDescription>Who to text the decision to.</FieldDescription>
        </Field>

        {state && !state.ok && <FieldError>{state.error}</FieldError>}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : "Record offer"}
        </Button>
      </SheetFooter>
    </form>
  );
}
