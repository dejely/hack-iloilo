"use client";

import { useState } from "react";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { InfoIcon } from "@/components/hint-icons";
import { Input } from "@/components/ui/input";
import { formatKg, formatMoney } from "@/lib/format";
import { type PriceRule, quote } from "../logic";

/**
 * Live buying-quote estimator for the buying page. Pure `quote` runs in the
 * browser off the current price rule, so the price per kilo and total update as
 * staff type. It skips deductions and is labelled an estimate (TRD M5).
 */
export function QuoteCalculator({ priceRule }: { priceRule: PriceRule }) {
  const [mcInput, setMcInput] = useState("");
  const [kgInput, setKgInput] = useState("");

  const mc = Number(mcInput);
  const mcValid =
    mcInput.trim() !== "" && Number.isFinite(mc) && mc >= 0 && mc <= 100;

  const kg = Number(kgInput);
  const kgValid = kgInput.trim() !== "" && Number.isInteger(kg) && kg > 0;

  const result = mcValid
    ? quote(priceRule, mc, kgValid ? kg : undefined)
    : null;

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="quoteMc">
          Estimated MC (%)
          <InfoIcon text="Moisture the palay is expected to have. The real moisture is measured at receiving and sets the final price." />
        </FieldLabel>
        <Input
          id="quoteMc"
          type="number"
          min={0}
          max={100}
          step={0.1}
          inputMode="decimal"
          placeholder="23"
          value={mcInput}
          onChange={(e) => setMcInput(e.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="quoteKg">Estimated kilos</FieldLabel>
        <Input
          id="quoteKg"
          type="number"
          min={1}
          step={1}
          placeholder="5000"
          value={kgInput}
          onChange={(e) => setKgInput(e.target.value)}
        />
        <FieldDescription>Optional, for an estimated total.</FieldDescription>
      </Field>

      {result && (
        <div className="rounded-md border bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Estimate
          </p>
          <p className="text-2xl font-semibold">
            {formatMoney(result.minorPerKg)}
            <span className="text-base font-normal text-muted-foreground">
              {" "}
              / kg
            </span>
          </p>
          {result.totalMinor !== undefined && (
            <p className="text-sm text-muted-foreground">
              {formatKg(kg)} × {formatMoney(result.minorPerKg)} ={" "}
              <span className="font-medium text-foreground">
                {formatMoney(result.totalMinor)}
              </span>
            </p>
          )}
        </div>
      )}
    </FieldGroup>
  );
}
