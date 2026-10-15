"use client";

import { useActionState, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { InfoIcon } from "@/components/hint-icons";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { savePrice } from "../actions";

/** Pre-filled values: pesos as decimal strings, factors as plain decimals. */
export type PriceFormDefaults = {
  effectiveDate: string;
  buyBase: string;
  damaged: string;
  immature: string;
  foreign: string;
  rice: string;
  drying: string;
  milling: string;
};

export function PriceForm({ defaults }: { defaults: PriceFormDefaults }) {
  const [state, action, pending] = useActionState(savePrice, undefined);
  const [effectiveDate, setEffectiveDate] = useState(defaults.effectiveDate);

  return (
    <form action={action}>
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="effectiveDate">
            Effective date
            <InfoIcon text="Prices apply from this date. If you save twice for one date, the latest save counts." />
          </FieldLabel>
          <DatePicker
            id="effectiveDate"
            name="effectiveDate"
            value={effectiveDate}
            onChange={(value) => setEffectiveDate(value ?? "")}
          />
        </Field>

        <Peso
          id="buyBase"
          label="Palay buying base"
          info="Price per kg for palay at 25% moisture. Quotes adjust it for the actual moisture."
          defaultValue={defaults.buyBase}
          placeholder="21.00"
        />

        <FieldSet>
          <FieldLegend variant="label" className="flex items-center gap-2">
            Deductions
            <InfoIcon text="Share of the affected kilos taken off the paid weight, from 0 to 1. For example, 0.25 removes a quarter." />
          </FieldLegend>
          <div className="grid grid-cols-3 gap-3">
            <Factor
              id="damaged"
              label="Damaged"
              defaultValue={defaults.damaged}
            />
            <Factor
              id="immature"
              label="Immature"
              defaultValue={defaults.immature}
            />
            <Factor
              id="foreign"
              label="Foreign"
              defaultValue={defaults.foreign}
            />
          </div>
        </FieldSet>

        <div className="grid grid-cols-2 gap-3">
          <Peso
            id="drying"
            label="Drying fee"
            info="Charged per kg to clients who bring palay for drying."
            defaultValue={defaults.drying}
            placeholder="1.60"
          />
          <Peso
            id="milling"
            label="Milling fee"
            info="Charged per kg to clients who bring palay for milling."
            defaultValue={defaults.milling}
            placeholder="3.30"
          />
        </div>

        <Peso
          id="rice"
          label="Rice selling price"
          info="Price per kg of milled rice, sent to clients who text PRICE."
          defaultValue={defaults.rice}
          placeholder="47.00"
        />

        {state && !state.ok && <FieldError>{state.error}</FieldError>}
        {state?.ok && (
          <FieldDescription>
            Prices saved, effective {state.effectiveDate}.
          </FieldDescription>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save prices"}
        </Button>
      </FieldGroup>
    </form>
  );
}

function Peso({
  id,
  label,
  info,
  defaultValue,
  placeholder,
}: {
  id: string;
  label: string;
  info: string;
  defaultValue: string;
  placeholder?: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label} (₱/kg)
        <InfoIcon text={info} />
      </FieldLabel>
      <Input
        id={id}
        name={id}
        type="number"
        min={0}
        step={0.01}
        required
        defaultValue={defaultValue}
        placeholder={placeholder}
      />
    </Field>
  );
}

function Factor({
  id,
  label,
  defaultValue,
}: {
  id: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={id}
        type="number"
        min={0}
        max={1}
        step={0.01}
        required
        defaultValue={defaultValue}
      />
    </Field>
  );
}
