import { ArrowRight } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatKg, formatMoney } from "@/lib/format";
import { requireRole } from "@/modules/accounts/auth";
import { buyerTypeLabels } from "@/modules/accounts/logic";
import {
  dispatchableKg,
  dispatchedKg,
  dispatchMode,
  remainingKg,
} from "../logic";
import { batchTrail, listBuyers } from "../queries";
import { DispatchForm } from "./dispatch-form";

const at = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

/** Dispatch form and the trail of dispatches out to buyers, for the batch page. */
export async function BatchDispatch({ id }: { id: string }) {
  await requireRole();
  if (!z.guid().safeParse(id).success) return null;
  const batch = await batchTrail(id);
  if (!batch) return null;

  const dispatchable = dispatchableKg(batch);
  if (dispatchable === 0) return null; // Not milled (or dried) yet.

  const remaining = remainingKg(dispatchable, dispatchedKg(batch.dispatches));
  const mode = dispatchMode(batch.ownership);
  const buyers = mode === "sale" && remaining > 0 ? await listBuyers() : [];
  const origin = batch.client.municipality
    ? `${batch.client.name} · ${batch.client.municipality.name}`
    : batch.client.name;

  return (
    <>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>
            {mode === "sale" ? "Dispatch · sale" : "Dispatch · pickup"}
          </CardTitle>
          <CardDescription>
            {formatKg(remaining)} of {formatKg(dispatchable)} left to dispatch
          </CardDescription>
        </CardHeader>
        <CardContent>
          {remaining > 0 ? (
            <DispatchForm
              batchId={batch.id}
              mode={mode}
              remaining={remaining}
              buyers={buyers}
              owner={{ id: batch.client_id, name: batch.client.name }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Fully dispatched — every kilogram has left.
            </p>
          )}
        </CardContent>
      </Card>

      {batch.dispatches.length > 0 ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>{mode === "sale" ? "To buyers" : "Picked up"}</CardTitle>
            <CardDescription>From {origin}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-4">
              {batch.dispatches.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-col gap-1 border-l-2 border-muted pl-4 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="inline-flex items-center gap-1 font-medium">
                      {formatKg(d.kg)}
                      <ArrowRight aria-label="to" className="size-3.5" />
                      {d.buyer.name}
                    </span>
                    <span className="text-muted-foreground">
                      {d.price_minor_per_kg > 0
                        ? `${formatMoney(d.price_minor_per_kg)}/kg · ${formatMoney(d.kg * d.price_minor_per_kg)}`
                        : "Pickup"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                    <span>{at.format(new Date(d.dispatched_at))}</span>
                    {d.buyer.buyer_type ? (
                      <Badge variant="outline">
                        {buyerTypeLabels[d.buyer.buyer_type]}
                      </Badge>
                    ) : null}
                    {d.or_ref ? (
                      <Badge variant="secondary">OR {d.or_ref}</Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
