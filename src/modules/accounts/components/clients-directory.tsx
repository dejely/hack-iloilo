"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientKindSelect } from "./client-kind-select";
import { groupClients } from "../logic";
import type { Client, ClientKind, Municipality } from "../types";
import { ClientForm } from "./client-form";
import { ClientsDataTable } from "./clients-data-table";

/** Client directory and walk-in registration, arranged like the reference frame. */
export function ClientsDirectory({
  clients,
  municipalities,
}: {
  clients: Client[];
  municipalities: Municipality[];
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<ClientKind | "all">("all");
  const [sheet, setSheet] = useState<{
    client: Client;
    version: number;
  } | null>(null);
  const { groups, count } = groupClients(clients, search, kind, municipalities);
  const coops = clients
    .filter((client) => client.kind === "coop")
    .sort((a, b) => a.name.localeCompare(b.name));
  const edit = (client: Client) =>
    setSheet((previous) => ({ client, version: (previous?.version ?? 0) + 1 }));
  return (
    <section className="flex min-w-0 flex-col gap-6 font-sans [--font-sans:var(--font-geist-sans)]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Clients &amp; staff
          </h1>
          <p className="text-sm text-muted-foreground">
            Clients are identified by phone number
          </p>
        </div>
        <Tabs value="clients">
          <TabsList aria-label="Account directory">
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="staff" disabled>
              Staff
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,2.15fr)_minmax(18rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Field className="max-w-sm min-w-48 flex-1">
              <FieldLabel htmlFor="clients-search">Search</FieldLabel>
              <Input
                id="clients-search"
                aria-label="Search clients"
                placeholder="Name, phone or municipality"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            <Field className="w-40">
              <FieldLabel htmlFor="client-kind-filter">Kind</FieldLabel>
              <ClientKindSelect
                id="client-kind-filter"
                value={kind}
                onChange={setKind}
                includeAll
              />
            </Field>
          </div>
          <p aria-live="polite" className="sr-only">
            {count} {count === 1 ? "client" : "clients"}
          </p>
          {!count ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>
                  {clients.length ? "No matching clients" : "No clients yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {clients.length
                    ? "Try another name, phone, municipality or kind filter."
                    : "Use Quick register to add the first walk-in."}
                </EmptyDescription>
              </EmptyHeader>
              {clients.length ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setKind("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </Empty>
          ) : (
            <ClientsDataTable
              groups={groups}
              municipalities={municipalities}
              onEdit={edit}
            />
          )}
        </div>
        <aside
          aria-label="Quick registration"
          className="flex min-w-0 flex-col gap-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Quick register</CardTitle>
              <CardDescription>
                Walk-in at the gate · takes seconds
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClientForm
                presentation="inline"
                coops={coops}
                municipalities={municipalities}
                onSaved={() => {}}
                onCancel={() => {}}
                onEditExisting={edit}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
      <Sheet
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit client</SheetTitle>
            <SheetDescription>
              Update this client&apos;s details.
            </SheetDescription>
          </SheetHeader>
          {sheet ? (
            <ClientForm
              key={`${sheet.client.id}-${sheet.version}`}
              client={sheet.client}
              coops={coops}
              municipalities={municipalities}
              onSaved={() => setSheet(null)}
              onCancel={() => setSheet(null)}
              onEditExisting={edit}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
