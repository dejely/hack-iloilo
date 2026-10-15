import {
  ServiceIcon,
  ServiceLabel,
  isServiceIconKind,
} from "@/components/service-icon";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StatusBadge } from "@/components/status-badge";
import { InfoIcon } from "@/components/hint-icons";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatKg } from "@/lib/format";
import { requireRole } from "@/modules/accounts/auth";
import { listMachines, listVarieties } from "@/modules/setup/queries";
import {
  ownershipLabels,
  recoveryPct,
  serviceLabels,
  stageLabels,
  stageTones,
} from "../logic";
import { WeightConfirmations } from "./weight-confirmations";
import { batchWeightConfirmations, batchSummary } from "../queries";
import { batchChip } from "./batch-link";
import { BatchStages } from "./batch-stages";

const started = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function when(iso: string | null): string {
  return iso ? started.format(new Date(iso)) : "—";
}

function FieldList({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Basic batch record opened from the gate; #29 adds the receiving form. */
export async function BatchSummaryCard({ id }: { id: string }) {
  await requireRole();
  if (!z.guid().safeParse(id).success) notFound();
  const batch = await batchSummary(id);
  if (!batch) notFound();
  const [dryers, mills, varieties, confirmations] = await Promise.all([
    listMachines("dryer"),
    listMachines("mill"),
    listVarieties(),
    batchWeightConfirmations(id),
  ]);
  const recovery = recoveryPct(batch.rice_kg, batch.mill_in_kg);
  const skippedDrying = !batch.dry_start && batch.stage !== "received";
  const rows: [string, React.ReactNode][] = [
    ["Client", `${batch.client.name} · ${batch.client.phone}`],
    [
      "Line",
      batch.entry ? (
        <ServiceLabel kind={batch.entry.service}>
          {serviceLabels[batch.entry.service]}
        </ServiceLabel>
      ) : (
        "—"
      ),
    ],
    ["Ownership", ownershipLabels[batch.ownership]],
    ["Est. weight", batch.entry?.est_kg ? formatKg(batch.entry.est_kg) : "—"],
    ["Started", when(batch.entry?.started_at ?? null)],
    ...(batch.pickup_after_drying
      ? [["After drying", "Ready for pickup"] as [string, string]]
      : []),
  ];
  const showDrying = batch.dry_start || skippedDrying;
  const showMilling = batch.mill_start !== null;
  const showReceiving = batch.net_kg != null;

  return (
    <section className="flex min-w-0 flex-col gap-6 font-sans [--font-sans:var(--font-geist-sans)]">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Batch <span className={batchChip}>{batch.batch_no}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Recorded in stages, from the gate through drying and milling.
        </p>
      </header>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Batch record</CardTitle>
          <CardDescription>
            Stage{" "}
            <StatusBadge
              tone={stageTones[batch.stage]}
              icon={
                isServiceIconKind(batch.stage) ? (
                  <ServiceIcon kind={batch.stage} />
                ) : undefined
              }
            >
              {stageLabels[batch.stage]}
            </StatusBadge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldList rows={rows} />
        </CardContent>
      </Card>

      <WeightConfirmations batchId={id} confirmations={confirmations} />

      {showReceiving ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Receiving</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldList
              rows={[
                ["Sacks", batch.bags != null ? String(batch.bags) : "—"],
                ["Net weight", batch.net_kg ? formatKg(batch.net_kg) : "—"],
                [
                  "Variety",
                  batch.variety
                    ? `${batch.variety.code} — ${batch.variety.name}`
                    : "—",
                ],
                ["Moisture", batch.mc != null ? `${batch.mc}%` : "—"],
                [
                  "Damaged",
                  batch.damaged_pct != null ? `${batch.damaged_pct}%` : "—",
                ],
                [
                  "Immature",
                  batch.immature_pct != null ? `${batch.immature_pct}%` : "—",
                ],
                [
                  "Foreign matter",
                  batch.foreign_pct != null ? `${batch.foreign_pct}%` : "—",
                ],
              ]}
            />
          </CardContent>
        </Card>
      ) : null}

      {showDrying ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>
              <ServiceLabel kind="drying">Drying</ServiceLabel>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {skippedDrying ? (
              <p className="text-sm text-muted-foreground">
                Skipped — palay was already dry.
              </p>
            ) : (
              <FieldList
                rows={[
                  ["Started", when(batch.dry_start)],
                  ["Finished", when(batch.dry_end)],
                  [
                    "Moisture out",
                    batch.mc_out != null ? `${batch.mc_out}%` : "—",
                  ],
                  [
                    "Dried weight",
                    batch.dried_kg ? formatKg(batch.dried_kg) : "—",
                  ],
                ]}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {showMilling ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>
              <ServiceLabel kind="milling">Milling</ServiceLabel>
            </CardTitle>
            {recovery != null ? (
              <CardDescription>
                Recovery <Badge variant="secondary">{recovery}%</Badge>
                <InfoIcon text="Milled rice out of the palay that went into the mill, by weight." />
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <FieldList
              rows={[
                ["Started", when(batch.mill_start)],
                ["Finished", when(batch.mill_end)],
                [
                  "Into the mill",
                  batch.mill_in_kg ? formatKg(batch.mill_in_kg) : "—",
                ],
                ["Rice out", batch.rice_kg ? formatKg(batch.rice_kg) : "—"],
              ]}
            />
          </CardContent>
        </Card>
      ) : null}

      {batch.stage === "milled" || batch.stage === "dispatched" ? null : (
        <Card className="max-w-xl">
          <CardContent>
            <BatchStages
              batch={{
                id: batch.id,
                stage: batch.stage,
                ownership: batch.ownership,
              }}
              dryers={dryers.map((m) => ({ id: m.id, code: m.code }))}
              mills={mills.map((m) => ({ id: m.id, code: m.code }))}
              varieties={varieties.map((v) => ({
                id: v.id,
                code: v.code,
                name: v.name,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </section>
  );
}
