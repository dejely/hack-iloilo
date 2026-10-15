import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTonnes } from "@/lib/format";
import { RoleGate } from "@/modules/accounts/components/role-gate";
import {
  FacilityForm,
  type FacilityFormDefaults,
} from "@/modules/setup/components/facility-form";
import { MachinesTable } from "@/modules/setup/components/machines-table";
import { UnconfirmedIcon } from "@/components/hint-icons";
import { ServiceIcon, type ServiceIconKind } from "@/components/service-icon";
import { capacitySettings } from "@/modules/setup/queries";

export const metadata: Metadata = { title: "Settings" };

const peso = (minor: number) => (minor / 100).toFixed(2);

async function Settings() {
  const { facility, machines, dryerKgPerDay, millKgPerDay } =
    await capacitySettings();

  const defaults: FacilityFormDefaults = {
    storageT: String(facility.storage_capacity_kg / 1000),
    hours: String(facility.operating_hours_per_day),
    baseLoadKw: String(facility.base_load_kw),
    tariff: peso(facility.tariff_minor_per_kwh),
    labor: peso(facility.labor_minor_per_hour),
    dryYieldPct: String(facility.dry_yield_pct),
    idleThresholdPct: String(facility.idle_threshold_pct),
    notifyAheadN: String(facility.notify_ahead_n),
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{facility.name}</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon="dryer"
          label="Dryer capacity"
          value={`${formatTonnes(dryerKgPerDay)}/day`}
        />
        <Stat
          icon="mill"
          label="Mill capacity"
          value={`${formatTonnes(millKgPerDay)}/day`}
        />
        <Stat
          icon="storage"
          label="Storage"
          value={formatTonnes(facility.storage_capacity_kg)}
          confirmed
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <FacilityForm
          // Remount after a save so inputs show the stored values.
          key={facility.updated_at}
          defaults={defaults}
        />

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Machines</CardTitle>
            <CardDescription>
              Inactive machines don&apos;t count toward capacity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MachinesTable machines={machines} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  confirmed,
}: {
  icon: ServiceIconKind;
  label: string;
  value: string;
  confirmed?: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <ServiceIcon kind={icon} className="size-4 text-primary" />
          {label}
          {!confirmed && <UnconfirmedIcon />}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <RoleGate role="manager">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Settings />
      </Suspense>
    </RoleGate>
  );
}
