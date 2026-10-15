"use client";

import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  MessageSquareText,
} from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { InfoIcon } from "@/components/hint-icons";
import { ServiceIcon } from "@/components/service-icon";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatMoney, formatTonnes } from "@/lib/format";
import { decidePrescription } from "../actions";
import { dayList, shortDay, templateNote } from "../logic";
import type {
  Decision,
  FillIdlePrescription,
  MillFullLoadsPrescription,
  MoveBookingsPrescription,
  Prescription,
  StoreMillLaterPrescription,
} from "../types";

const kindLabels: Record<Prescription["kind"], string> = {
  move_bookings: "Move bookings",
  fill_idle: "Fill idle days",
  mill_full_loads: "Mill in full loads",
  store_mill_later: "Store now, mill later",
};

const kindIcons: Record<Prescription["kind"], React.ReactNode> = {
  move_bookings: <CalendarClock aria-hidden />,
  fill_idle: <MessageSquareText aria-hidden />,
  mill_full_loads: <ServiceIcon kind="mill" />,
  store_mill_later: <ServiceIcon kind="storage" />,
};

/** What accepting each kind does, for its hint. */
const kindInfo: Record<Prescription["kind"], string> = {
  move_bookings:
    "Texts clients with flexible bookings to come on a quieter day, so the full day fits.",
  fill_idle:
    "Texts clients with no booking today's prices, to bring palay on quiet days.",
  mill_full_loads:
    "Mills on fewer, fuller days. The plant's base power, paid on every running day, is paid on fewer days.",
  store_mill_later:
    "Keeps dried palay in storage and mills it on quiet mill days.",
};

/** Recipients listed by name before "+N". */
const SHOWN_RECIPIENTS = 3;

/** One suggestion with its numbers and accept / dismiss. Managers only. */
export function PrescriptionCard({
  prescription: p,
}: {
  prescription: Prescription;
}) {
  const [pending, start] = useTransition();
  const { accept, accepted } = acceptCopy(p);
  const decide = (decision: Decision) =>
    start(async () => {
      const result = await decidePrescription(p.key, decision);
      if (result.status === "error") toast.error(result.message);
      else toast.success(decision === "accepted" ? accepted : "Dismissed.");
    });

  return (
    <Card className="h-full">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary">
            {kindIcons[p.kind]}
            {kindLabels[p.kind]}
          </Badge>
          <InfoIcon text={kindInfo[p.kind]} />
        </div>
        <CardTitle className="text-lg leading-snug">{p.title}</CardTitle>
        <CardDescription className="text-pretty">
          {templateNote(p)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {p.kind === "move_bookings" && <Moves p={p} />}
        {p.kind === "fill_idle" && <Recipients p={p} />}
        {p.kind === "mill_full_loads" && <MillPlans p={p} />}
        {p.kind === "store_mill_later" && <MillLater p={p} />}
      </CardContent>
      <CardFooter className="gap-2">
        <Button disabled={pending} onClick={() => decide("accepted")}>
          {accept}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => decide("dismissed")}
        >
          Dismiss
        </Button>
      </CardFooter>
    </Card>
  );
}

/** A compact list: one line per row, label left, figure right. */
function Rows({
  rows,
}: {
  rows: { key: string; label: React.ReactNode; value: React.ReactNode }[];
}) {
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((r) => (
        <li
          key={r.key}
          className="flex items-center justify-between gap-3 px-2.5 py-1.5"
        >
          <span className="min-w-0 truncate">{r.label}</span>
          <span className="shrink-0 tabular-nums">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Remainder({ kg }: { kg: number }) {
  if (kg <= 0) return null;
  return <StatusBadge tone="danger">{formatTonnes(kg)} still over</StatusBadge>;
}

function Moves({ p }: { p: MoveBookingsPrescription }) {
  return (
    <>
      <Rows
        rows={p.moves.map((m) => ({
          key: m.bookingId,
          label: (
            <>
              {m.client}{" "}
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                {m.ref}
                <ArrowRight aria-label="to" className="size-3.5" />
                {shortDay(m.to)}
              </span>
            </>
          ),
          value: formatTonnes(m.kg),
        }))}
      />
      {p.incomingKg > 0 && (
        <p className="text-xs text-muted-foreground">
          +{formatTonnes(p.incomingKg)} already asked to move here
        </p>
      )}
      <Remainder kg={p.remainderKg} />
    </>
  );
}

function Recipients({ p }: { p: FillIdlePrescription }) {
  const more = p.recipients.length - SHOWN_RECIPIENTS;
  return (
    <>
      <p className="text-muted-foreground">
        <span className="text-foreground">
          {p.recipients
            .slice(0, SHOWN_RECIPIENTS)
            .map((r) => r.name)
            .join(", ")}
          {more > 0 && ` +${more}`}
        </span>{" "}
        · {p.facts.municipalities}
      </p>
      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-3.5 transition-transform group-data-panel-open:rotate-90" />
          Text ({p.message.length}/320)
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="mt-2 rounded-lg border bg-muted/50 p-2.5 font-mono text-xs break-words">
            {p.message}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

function MillPlans({ p }: { p: MillFullLoadsPrescription }) {
  const plan = (label: string, dates: string[]) => (
    <>
      {label} <span className="text-muted-foreground">{dayList(dates)}</span>
    </>
  );
  return (
    <Rows
      rows={[
        {
          key: "full",
          label: plan(`${p.fullDates.length} full`, p.fullDates),
          value: `${formatMoney(p.fullMinorPerKg)}/kg`,
        },
        {
          key: "spread",
          label: plan(`${p.spreadDates.length} partial`, p.spreadDates),
          value: `${formatMoney(p.spreadMinorPerKg)}/kg`,
        },
      ]}
    />
  );
}

function MillLater({ p }: { p: StoreMillLaterPrescription }) {
  return (
    <>
      <Rows
        rows={p.millDays.map((m) => ({
          key: m.date,
          label: `Mill on ${shortDay(m.date)}`,
          value: formatTonnes(m.kg),
        }))}
      />
      <Remainder kg={p.remainderKg} />
    </>
  );
}

/** The accept button label and the toast once accepted. */
function acceptCopy(p: Prescription): { accept: string; accepted: string } {
  switch (p.kind) {
    case "move_bookings":
      return { accept: "Ask to move", accepted: "Clients asked to move." };
    case "fill_idle": {
      const n = p.recipients.length;
      return {
        accept: `Send ${n} ${n === 1 ? "text" : "texts"}`,
        accepted: `${n} ${n === 1 ? "text" : "texts"} sent.`,
      };
    }
    case "mill_full_loads":
      return {
        accept: "Plan full loads",
        accepted: "Full-load plan accepted.",
      };
    case "store_mill_later":
      return {
        accept: "Store and mill later",
        accepted: "Storage plan accepted.",
      };
  }
}
