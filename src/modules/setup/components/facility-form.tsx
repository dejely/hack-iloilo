"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveFacility } from "../actions";
import { InfoIcon, UnconfirmedIcon } from "@/components/hint-icons";

/** Pre-filled values in display units: tonnes, pesos, percent. */
export type FacilityFormDefaults = {
  storageT: string;
  hours: string;
  baseLoadKw: string;
  tariff: string;
  labor: string;
  dryYieldPct: string;
  idleThresholdPct: string;
  notifyAheadN: string;
};

export function FacilityForm({ defaults }: { defaults: FacilityFormDefaults }) {
  const [state, action, pending] = useActionState(saveFacility, undefined);

  return (
    <form action={action} className="flex flex-col gap-6">
      <Section title="Capacity">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
          <NumberField
            id="storageT"
            label="Storage (t)"
            defaultValue={defaults.storageT}
            step={0.001}
          />
          <NumberField
            id="hours"
            label="Operating hours/day"
            defaultValue={defaults.hours}
            step={0.1}
            max={24}
            unconfirmed
          />
        </div>
      </Section>

      <Section title="Costs" unconfirmed>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
          <NumberField
            id="baseLoadKw"
            label="Base load kW"
            defaultValue={defaults.baseLoadKw}
            step={0.01}
            info="Power the plant draws on any operating day apart from the machines, like lights, pumps and the office."
          />
          <NumberField
            id="tariff"
            label="₱/kWh"
            defaultValue={defaults.tariff}
            step={0.01}
          />
          <NumberField
            id="labor"
            label="Labor ₱/hour"
            defaultValue={defaults.labor}
            step={0.01}
          />
        </div>
      </Section>

      <Section title="Planning">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
          <NumberField
            id="idleThresholdPct"
            label="Idle threshold %"
            defaultValue={defaults.idleThresholdPct}
            step={0.01}
            max={100}
            info="A day below this share of capacity counts as idle."
          />
          <NumberField
            id="dryYieldPct"
            label="Dry yield %"
            defaultValue={defaults.dryYieldPct}
            step={0.01}
            max={100}
            info="Dried kg per wet kg, for storage projections."
          />
          <NumberField
            id="notifyAheadN"
            label="Notify ahead"
            defaultValue={defaults.notifyAheadN}
            step={1}
            info="How many clients next in line get a text when a truck starts."
          />
        </div>
      </Section>

      <FieldGroup>
        {state && !state.ok && <FieldError>{state.error}</FieldError>}
        {state?.ok && <FieldDescription>{state.message}</FieldDescription>}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </FieldGroup>
    </form>
  );
}

function Section({
  title,
  unconfirmed,
  children,
}: {
  title: string;
  unconfirmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {unconfirmed && <UnconfirmedIcon />}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function NumberField({
  id,
  label,
  defaultValue,
  step,
  max,
  unconfirmed,
  info,
}: {
  id: string;
  label: string;
  defaultValue: string;
  step: number;
  max?: number;
  unconfirmed?: boolean;
  info?: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id} className="whitespace-nowrap">
        {label}
        {info && <InfoIcon text={info} />}
        {unconfirmed && <UnconfirmedIcon />}
      </FieldLabel>
      <Input
        id={id}
        name={id}
        type="number"
        min={0}
        max={max}
        step={step}
        required
        defaultValue={defaultValue}
      />
    </Field>
  );
}
