"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Municipality } from "@/modules/accounts/types";
import { formatDay, queueLines, services } from "../logic";
import type { QueueRow } from "../types";
import { CheckInForm, type CheckInRequest } from "./check-in-form";
import { QueueLine } from "./queue-line";

const REFRESH_MS = 30_000;
const TICK_MS = 60_000;

/** Gate workspace: check-in popover and one live column per service line. */
export function GateQueue({
  rows,
  municipalities,
  today,
  renderedAt,
}: {
  rows: QueueRow[];
  municipalities: Municipality[];
  today: string;
  renderedAt: string;
}) {
  const router = useRouter();
  // Starts at the server's clock so wait times hydrate identically.
  const [now, setNow] = useState(() => new Date(renderedAt));
  const [request, setRequest] = useState<CheckInRequest | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const lines = queueLines(rows);
  const todayLabel = formatDay(today);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), TICK_MS);
    const refresh = setInterval(() => router.refresh(), REFRESH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  const prefill = (next: Omit<CheckInRequest, "seq">) =>
    setRequest((previous) => ({ ...next, seq: (previous?.seq ?? 0) + 1 }));

  return (
    // The page fills the viewport below the app header; only the lines scroll.
    <section className="flex min-w-0 flex-col gap-6 font-sans [--font-sans:var(--font-geist-sans)] lg:h-[calc(100svh-5rem)]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge>{todayLabel}</Badge>
            One line per service · first come, first served
          </p>
        </div>
        <Popover open={checkingIn} onOpenChange={setCheckingIn}>
          <PopoverTrigger
            render={<Button />}
            onClick={() => prefill({ mode: "phone" })}
          >
            Check in
          </PopoverTrigger>
          <PopoverContent
            align="end"
            initialFocus={false}
            className="max-h-(--available-height) w-96 gap-4 overflow-y-auto p-4"
          >
            <PopoverHeader>
              <PopoverTitle>Check in</PopoverTitle>
            </PopoverHeader>
            <CheckInForm
              municipalities={municipalities}
              request={request}
              onCheckedIn={() => setCheckingIn(false)}
            />
          </PopoverContent>
        </Popover>
      </header>
      <div className="grid min-h-0 min-w-0 flex-1 gap-6 lg:grid-cols-2">
        {services.map((service) => (
          <QueueLine
            key={service}
            service={service}
            line={lines[service]}
            now={now}
            onCheckIn={(line) => {
              prefill({ mode: "phone", service: line });
              setCheckingIn(true);
            }}
          />
        ))}
      </div>
    </section>
  );
}
