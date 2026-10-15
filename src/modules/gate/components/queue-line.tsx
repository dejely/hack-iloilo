"use client";

import { ServiceIcon } from "@/components/service-icon";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { formatKg } from "@/lib/format";
import { finishEntry, leaveEntry, startEntry } from "../actions";
import {
  arrivalLabel,
  formatWait,
  serviceLabels,
  waitMinutes,
  type QueueLine as Line,
} from "../logic";
import type { QueueRow, Service } from "../types";
import { BatchLink } from "./batch-link";

const clock = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});
const time = (iso: string) => clock.format(new Date(iso));

function details(row: QueueRow, ...extra: string[]) {
  return [arrivalLabel(row), row.est_kg ? formatKg(row.est_kg) : null, ...extra]
    .filter(Boolean)
    .join(" · ");
}

/** One service line: who is being served, who waits, and the next start. */
export function QueueLine({
  service,
  line,
  now,
  onCheckIn,
}: {
  service: Service;
  line: Line;
  now: Date;
  onCheckIn: (service: Service) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<QueueRow | null>(null);
  const name = serviceLabels[service];
  const next = line.waiting[0];

  const act = (
    id: string,
    action: () => Promise<
      { status: "ok" } | { status: "error"; message?: string }
    >,
    done: () => void,
  ) => {
    setBusy(id);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.status === "error")
          toast.error(result.message ?? "Please try again.");
        else done();
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <Card className="min-h-[32rem] lg:min-h-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ServiceIcon kind={service} className="size-4 text-primary" />
          {name} line
        </CardTitle>
        <CardAction>
          <Badge variant="secondary">{line.waiting.length} waiting</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        {line.serving.map((row) => (
          <Item key={row.id} variant="muted" className="relative shrink-0">
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full overflow-visible"
            >
              <rect
                strokeWidth={1}
                strokeDasharray="8 4"
                className="h-full w-full fill-none stroke-primary [rx:var(--radius-lg)] motion-safe:animate-dash-march"
              />
            </svg>
            <ItemContent>
              <ItemDescription className="text-xs font-medium uppercase">
                Now serving
              </ItemDescription>
              <ItemTitle>
                {row.client.name}
                {row.est_kg ? ` · ${formatKg(row.est_kg)}` : null}
              </ItemTitle>
              <ItemDescription>
                {row.batch ? (
                  <BatchLink id={row.batch.id} batchNo={row.batch.batch_no} />
                ) : (
                  "No batch"
                )}
                {row.started_at ? ` · started ${time(row.started_at)}` : null}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  act(
                    row.id,
                    () => finishEntry(row.id),
                    () => toast.success(`${row.client.name} is done.`),
                  )
                }
              >
                {busy === row.id ? <Spinner data-icon="inline-start" /> : null}
                Finish
              </Button>
            </ItemActions>
          </Item>
        ))}
        {line.waiting.length ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase">
              Waiting
            </h3>
            <ItemGroup className="min-h-0 gap-2 overflow-y-auto">
              {line.waiting.map((row, index) => (
                <Item key={row.id} variant="outline" size="sm">
                  <ItemMedia>
                    <Badge variant="secondary">{index + 1}</Badge>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{row.client.name}</ItemTitle>
                    <ItemDescription>
                      {details(row, `since ${time(row.checked_in_at)}`)}
                      {" · "}
                      <span className="whitespace-nowrap">
                        {formatWait(waitMinutes(row.checked_in_at, now))}
                      </span>
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      aria-label={`${row.client.name} left the queue`}
                      onClick={() => setLeaving(row)}
                    >
                      Left
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </div>
        ) : (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyTitle>Nobody waiting</EmptyTitle>
              <EmptyDescription>
                {line.serving.length
                  ? `The current service is still in progress. No clients are waiting in the ${service} line.`
                  : `No one is being served or waiting in the ${service} line.`}
              </EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" onClick={() => onCheckIn(service)}>
              Check in a client
            </Button>
          </Empty>
        )}
      </CardContent>
      <CardFooter>
        <Button
          size="lg"
          className="w-full"
          disabled={!next || pending}
          onClick={() => {
            if (!next) return;
            setBusy(next.id);
            startTransition(async () => {
              try {
                const result = await startEntry(next.id);
                if (result.status === "error") {
                  toast.error(result.message ?? "Please try again.");
                  return;
                }
                const { batch } = result;
                toast.success(`Batch ${batch.batch_no} opened`, {
                  description: `${next.client.name} is now being served.`,
                  action: {
                    label: "View batch",
                    onClick: () => router.push(`/batches/${batch.id}`),
                  },
                });
              } catch {
                toast.error("Unable to start service. Please try again.");
              } finally {
                setBusy(null);
              }
            });
          }}
        >
          {busy && busy === next?.id ? (
            <Spinner data-icon="inline-start" />
          ) : null}
          {next ? (
            <>
              Start next
              <ArrowRight />
              opens batch
            </>
          ) : (
            "Start next"
          )}
        </Button>
      </CardFooter>
      <AlertDialog
        open={leaving !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setLeaving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Did {leaving?.client.name} leave?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They are removed from the {service} line. Check them in again if
              they come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              Keep in line
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (!leaving) return;
                const row = leaving;
                act(
                  row.id,
                  () => leaveEntry(row.id),
                  () => {
                    setLeaving(null);
                    toast.success(`${row.client.name} left the queue.`);
                  },
                );
              }}
            >
              {pending ? "Removing…" : "Mark as left"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
