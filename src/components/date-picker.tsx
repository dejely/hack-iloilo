"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Pickers speak `YYYY-MM-DD` strings (Asia/Manila calendar dates, as in
// `@/lib/dates`); react-day-picker speaks local `Date`s at midnight.

export function toPickerDate(date: string | undefined): Date | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fromPickerDate(date: Date | undefined): string | undefined {
  if (!date) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const display = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatPickerDate(date: string): string {
  return display.format(toPickerDate(date));
}

export type DatePickerProps = {
  value?: string;
  onChange?: (value: string | undefined) => void;
  /** Earliest selectable date, `YYYY-MM-DD`. */
  min?: string;
  /** Latest selectable date, `YYYY-MM-DD`. */
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
  className?: string;
  /** Submits the value with a plain form under this name. */
  name?: string;
};

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
  name,
  ...trigger
}: DatePickerProps) {
  const selected = toPickerDate(value);
  const bounds = usePickerBounds(min, max);

  return (
    <>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <PickerPopover
        label={value ? formatPickerDate(value) : undefined}
        placeholder={placeholder}
        {...trigger}
      >
        {(close) => (
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            disabled={bounds}
            onSelect={(date) => {
              onChange?.(fromPickerDate(date));
              close();
            }}
          />
        )}
      </PickerPopover>
    </>
  );
}

/** An uncontrolled date picker for plain forms: submits its value under `name`. */
export function DateInput({
  defaultValue,
  ...props
}: Omit<DatePickerProps, "value" | "onChange"> & {
  defaultValue?: string;
  name: string;
}) {
  const [value, setValue] = React.useState(defaultValue);
  return <DatePicker {...props} value={value} onChange={setValue} />;
}

type PickerPopoverProps = {
  label?: string;
  placeholder: string;
  disabled?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
  className?: string;
  children: (close: () => void) => React.ReactNode;
};

/** Outline button that opens a calendar popover. */
export function PickerPopover({
  label,
  placeholder,
  disabled,
  id,
  "aria-invalid": ariaInvalid,
  className,
  children,
}: PickerPopoverProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            disabled={disabled}
            aria-invalid={ariaInvalid}
            className={className}
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {label ?? <span className="text-muted-foreground">{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

/** react-day-picker `disabled` matchers for `YYYY-MM-DD` bounds. */
export function usePickerBounds(min?: string, max?: string) {
  return React.useMemo(() => pickerBounds(min, max), [min, max]);
}

export function pickerBounds(min?: string, max?: string) {
  const before = toPickerDate(min);
  const after = toPickerDate(max);
  return [...(before ? [{ before }] : []), ...(after ? [{ after }] : [])];
}
