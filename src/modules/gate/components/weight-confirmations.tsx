"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatKg } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import { confirmBatchWeightInPerson } from "../actions";
import {
  type WeightMeasurements,
  type WeightStatus,
  weightStatusLabels,
  weightStatusTones,
} from "../logic";

type Confirmation =
  Database["public"]["Tables"]["batch_weight_confirmations"]["Row"];
export function WeightConfirmations({
  batchId,
  confirmations,
}: {
  batchId: string;
  confirmations: Confirmation[];
}) {
  const [pending, startTransition] = useTransition();
  if (confirmations.length === 0) return null;
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Weight confirmations</CardTitle>
        <CardDescription>
          Confirmation records the client&apos;s agreement. Processing can
          continue while pending or disputed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {confirmations.map((c) => {
          const m = c.measurements as unknown as WeightMeasurements;
          return (
            <div key={c.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {c.stage === "receiving" ? "Receiving" : "After drying"}
                </span>
                <StatusBadge tone={weightStatusTones[c.status as WeightStatus]}>
                  {weightStatusLabels[c.status as WeightStatus]}
                </StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">
                {m.bags != null ? `${m.bags} bags · ` : ""}
                {formatKg(m.kg)} · MC {m.mc}%
              </p>
              {c.status === "confirmed" ? (
                <p className="text-sm text-muted-foreground">
                  {c.confirmed_by_staff_id
                    ? "Confirmed in person by staff."
                    : "Confirmed by SMS."}
                </p>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await confirmBatchWeightInPerson(batchId, {
                        stage: c.stage,
                        updatedAt: c.updated_at,
                      });
                      if (result.status === "error")
                        toast.error(
                          result.message ?? "Couldn't confirm weight.",
                        );
                      else toast.success("Weight confirmed in person.");
                    })
                  }
                >
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  {`Confirm ${c.stage === "receiving" ? "receiving" : "drying"} weight in person`}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
