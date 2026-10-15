"use client";

import { ServiceIcon, ServiceLabel } from "@/components/service-icon";
import { Pencil, Plus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { OptionSelect } from "@/components/option-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTonnes } from "@/lib/format";
import {
  type SettingsFormState,
  saveMachine,
  setMachineActive,
} from "../actions";
import type { Machine } from "../queries";
import { NumberField } from "./facility-form";
import { UnconfirmedIcon } from "@/components/hint-icons";

const machineTypes = [
  { value: "dryer", label: "Dryer", icon: <ServiceIcon kind="dryer" /> },
  { value: "mill", label: "Mill", icon: <ServiceIcon kind="mill" /> },
];

const t = (kg: number | null) => (kg == null ? "" : String(kg / 1000));

export function MachinesTable({ machines }: { machines: Machine[] }) {
  // null: adding; a machine: editing it. Kept while closing so the dialog
  // doesn't change content mid-animation.
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  // Bumped on each open so the form starts fresh.
  const [session, setSession] = useState(0);
  const openFor = (m: Machine | null) => {
    setEditing(m);
    setSession((n) => n + 1);
    setOpen(true);
  };
  const [toggle, setToggle] = useState<SettingsFormState>();
  const [pending, startTransition] = useTransition();

  function onToggle(m: Machine, active: boolean) {
    startTransition(async () =>
      setToggle(await setMachineActive(m.id, active)),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                Load / throughput <UnconfirmedIcon />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                Cycle <UnconfirmedIcon />
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1">
                kW <UnconfirmedIcon />
              </span>
            </TableHead>
            <TableHead>Active</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {machines.map((m) => (
            <TableRow
              key={m.id}
              className={m.active ? undefined : "text-muted-foreground"}
            >
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  {m.code}
                  {!m.active && (
                    <StatusBadge tone="neutral">Inactive</StatusBadge>
                  )}
                </span>
              </TableCell>
              <TableCell>
                <ServiceLabel kind={m.type}>
                  {m.type === "dryer" ? "Dryer" : "Mill"}
                </ServiceLabel>
              </TableCell>
              <TableCell className="text-right">
                {m.type === "dryer"
                  ? `${formatTonnes(m.capacity_kg ?? 0)}/load`
                  : `${formatTonnes(m.kg_per_hour ?? 0)}/h`}
              </TableCell>
              <TableCell className="text-right">
                {m.cycle_hours == null ? "—" : `${m.cycle_hours} h`}
              </TableCell>
              <TableCell className="text-right">{m.rated_kw}</TableCell>
              <TableCell>
                <Switch
                  checked={m.active}
                  disabled={pending}
                  onCheckedChange={(active) => onToggle(m, active)}
                  aria-label={`${m.code} active`}
                />
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${m.code}`}
                  title={`Edit ${m.code}`}
                  onClick={() => openFor(m)}
                >
                  <Pencil />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {toggle && !toggle.ok && <FieldError>{toggle.error}</FieldError>}

      <Button className="self-end" onClick={() => openFor(null)}>
        <Plus data-icon="inline-start" />
        Add machine
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.code}` : "Add machine"}
            </DialogTitle>
            <DialogDescription>
              Dryers take a load size and cycle; mills take throughput.
            </DialogDescription>
          </DialogHeader>
          <MachineForm
            key={session}
            machine={editing}
            onSaved={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MachineForm({
  machine,
  onSaved,
}: {
  machine: Machine | null;
  onSaved: () => void;
}) {
  const [type, setType] = useState(machine?.type ?? "dryer");
  const [state, action, pending] = useActionState(
    async (prev: SettingsFormState, formData: FormData) => {
      const result = await saveMachine(prev, formData);
      if (result?.ok) onSaved();
      return result;
    },
    undefined,
  );

  return (
    <form action={action}>
      {machine && <input type="hidden" name="id" value={machine.id} />}
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="type">Type</FieldLabel>
            <OptionSelect
              id="type"
              name="type"
              options={machineTypes}
              value={type}
              onChange={(value) => setType(value as Machine["type"])}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="code">Code</FieldLabel>
            <Input
              id="code"
              name="code"
              required
              maxLength={10}
              defaultValue={machine?.code}
              placeholder={type === "dryer" ? "D7" : "M2"}
            />
          </Field>
        </div>

        {type === "dryer" ? (
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              id="loadT"
              label="Load (t)"
              defaultValue={t(machine?.capacity_kg ?? null)}
              step={0.001}
              info="Palay one batch holds. Daily capacity counts only whole loads."
              unconfirmed
            />
            <NumberField
              id="cycleHours"
              label="Cycle hours"
              defaultValue={machine?.cycle_hours?.toString() ?? ""}
              step={0.1}
              info="Hours to dry one load, from loading to unloading."
              unconfirmed
            />
          </div>
        ) : (
          <NumberField
            id="millTph"
            label="Throughput (t/hour)"
            defaultValue={t(machine?.kg_per_hour ?? null)}
            step={0.001}
            info="Palay the mill takes in per hour of running."
            unconfirmed
          />
        )}

        <NumberField
          id="ratedKw"
          label="Rated kW"
          defaultValue={machine?.rated_kw.toString() ?? "0"}
          step={0.01}
          info="Power the machine draws while running, from its nameplate. Used for electricity cost."
          unconfirmed
        />

        {state && !state.ok && <FieldError>{state.error}</FieldError>}
        {state?.ok && <FieldDescription>{state.message}</FieldDescription>}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save machine"}
        </Button>
      </FieldGroup>
    </form>
  );
}
