"use client";

import type { Ref } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Option = { value: string; label: string; icon?: React.ReactNode };

/** "" stands for no choice, which the Select models as null. */
const toItem = (value?: string) =>
  value === undefined ? undefined : value || null;

/**
 * Shadcn select over string options, with "" meaning nothing chosen. `none`
 * adds a choosable empty option; `placeholder` only labels the empty state.
 * Pass `name` to submit it with a plain form.
 */
export function OptionSelect({
  options,
  value,
  defaultValue,
  onChange,
  none,
  placeholder,
  name,
  required,
  id,
  disabled,
  invalid,
  onBlur,
  triggerRef,
}: {
  options: Option[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  none?: string;
  placeholder?: string;
  name?: string;
  required?: boolean;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  onBlur?: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const items = [{ value: null, label: none ?? placeholder ?? "" }, ...options];
  const withIcons = options.some((option) => option.icon);
  return (
    <Select
      items={items}
      value={toItem(value)}
      defaultValue={toItem(defaultValue)}
      onValueChange={(next) => onChange?.(next ?? "")}
      name={name}
      required={required}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        ref={triggerRef}
        onBlur={onBlur}
        aria-invalid={invalid}
        className="w-full"
      >
        {withIcons ? (
          <SelectValue>
            {(value: string | null) => {
              const option = options.find((o) => o.value === value);
              return option ? (
                <>
                  {option.icon}
                  {option.label}
                </>
              ) : (
                (none ?? placeholder)
              );
            }}
          </SelectValue>
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {none ? <SelectItem value={null}>{none}</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.icon}
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
