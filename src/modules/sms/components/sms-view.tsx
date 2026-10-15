"use client";

import { InfoIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Message, MessageContent } from "@/components/ui/message";
import { Textarea } from "@/components/ui/textarea";
import { splitManila } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { simulateInbound } from "../actions";
import { smsStatusLabels, smsStatusTones } from "../logic";
import type { SmsMessage } from "../queries";

const REFRESH_MS = 5000;

/** SMS log per phone, with a phone-style simulator for demoing commands. */
export function SmsView({
  threads,
  messages,
  names,
  phone,
  simulator,
}: {
  threads: SmsMessage[] | null;
  messages: SmsMessage[];
  names: Record<string, string>;
  phone: string | null;
  simulator: boolean;
}) {
  const router = useRouter();

  // With a real gateway, texts arrive outside this page: poll for them.
  useEffect(() => {
    if (simulator) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [simulator, router]);

  return (
    <section className="flex min-w-0 flex-col gap-6 font-sans [--font-sans:var(--font-geist-sans)]">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {simulator ? "SMS simulator" : "SMS log"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Every text in and out, per phone.
          {simulator && " Send a text as any phone to try the commands."}
        </p>
      </header>

      {!simulator && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Simulator off</AlertTitle>
          <AlertDescription>
            The SMS gateway is on (<code>SMS_GATEWAY=smsgate</code>), so texts
            come from real phones. This log refreshes every few seconds.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid min-w-0 gap-6 md:grid-cols-[18rem_1fr]">
        <aside className="flex min-w-0 flex-col gap-3">
          <PhonePicker names={names} />
          <ThreadList threads={threads} names={names} phone={phone} />
        </aside>
        {phone ? (
          <Phone
            key={phone}
            phone={phone}
            name={names[phone]}
            messages={messages}
            simulator={simulator}
          />
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No phone selected</EmptyTitle>
              <EmptyDescription>
                Pick a thread or type a phone number.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </section>
  );
}

function PhonePicker({ names }: { names: Record<string, string> }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim())
          router.push(`/sms?phone=${encodeURIComponent(value.trim())}`);
      }}
    >
      <Input
        aria-label="Phone number"
        placeholder="09XX XXX XXXX"
        list="sms-client-phones"
        inputMode="tel"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <datalist id="sms-client-phones">
        {Object.entries(names).map(([phone, name]) => (
          <option key={phone} value={phone}>
            {name}
          </option>
        ))}
      </datalist>
      <Button type="submit" variant="outline">
        Open
      </Button>
    </form>
  );
}

function ThreadList({
  threads,
  names,
  phone,
}: {
  threads: SmsMessage[] | null;
  names: Record<string, string>;
  phone: string | null;
}) {
  if (!threads)
    return (
      <p className="text-sm text-destructive">Unable to load the SMS log.</p>
    );
  if (!threads.length)
    return <p className="text-sm text-muted-foreground">No texts yet.</p>;
  return (
    <nav className="flex max-h-[32rem] flex-col overflow-y-auto rounded-lg border">
      {threads.map((last) => (
        <Link
          key={last.phone}
          href={`/sms?phone=${encodeURIComponent(last.phone)}`}
          className={cn(
            "flex flex-col gap-0.5 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted",
            last.phone === phone && "bg-muted",
          )}
        >
          <span className="flex justify-between gap-2">
            <span className="truncate font-medium">
              {names[last.phone] ?? last.phone}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatTime(last.created_at)}
            </span>
          </span>
          <span className="truncate text-muted-foreground">
            {last.direction === "outbound" ? "↩ " : ""}
            {last.body}
          </span>
        </Link>
      ))}
    </nav>
  );
}

function Phone({
  phone,
  name,
  messages,
  simulator,
}: {
  phone: string;
  name?: string;
  messages: SmsMessage[];
  simulator: boolean;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const submit = () => {
    if (!body.trim() || pending) return;
    startTransition(async () => {
      const result = await simulateInbound({ phone, body });
      if (result.status === "error") setError(result.message);
      else {
        setError(null);
        setBody("");
      }
    });
  };

  return (
    <div className="mx-auto flex h-[36rem] w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border-8 border-foreground/80 bg-background shadow-sm">
      <div className="border-b px-4 py-3 text-center">
        <p className="font-medium">{name ?? phone}</p>
        {name && <p className="text-xs text-muted-foreground">{phone}</p>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="m-auto text-sm text-muted-foreground">No texts yet.</p>
        )}
        {messages.map((message) => {
          // The phone's own texts are on the right, IRPC's on the left.
          const mine = message.direction === "inbound";
          return (
            <Message key={message.id} align={mine ? "end" : "start"}>
              <MessageContent>
                <Bubble
                  align={mine ? "end" : "start"}
                  variant={
                    message.status === "failed"
                      ? "destructive"
                      : mine
                        ? "default"
                        : "muted"
                  }
                >
                  <BubbleContent className="whitespace-pre-wrap">
                    {message.body}
                  </BubbleContent>
                </Bubble>
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-xs text-muted-foreground",
                    mine && "self-end",
                  )}
                >
                  {formatTime(message.created_at)}
                  {message.status !== "processed" &&
                    message.status !== "sent" && (
                      <StatusBadge tone={smsStatusTones[message.status]}>
                        {smsStatusLabels[message.status]}
                      </StatusBadge>
                    )}
                </span>
              </MessageContent>
            </Message>
          );
        })}
        <div ref={end} />
      </div>

      <form
        className="flex flex-col gap-1 border-t p-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Text message"
            placeholder={simulator ? "Text IRPC…" : "Simulator off"}
            rows={1}
            className="min-h-9 resize-none"
            disabled={!simulator || pending}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={!simulator || pending || !body.trim()}
          >
            <SendIcon />
          </Button>
        </div>
        {error && <p className="px-1 text-xs text-destructive">{error}</p>}
      </form>
    </div>
  );
}

function formatTime(iso: string): string {
  const { date, time } = splitManila(iso);
  return `${date.slice(5).replace("-", "/")} ${time}`;
}
