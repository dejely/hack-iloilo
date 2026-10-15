import Link from "next/link";
import { cn } from "cn";
import { StatusBadge } from "@/components/status-badge";
import { badgeVariants } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatKg } from "@/lib/format";
import { getStaff } from "@/modules/accounts/auth";
import { offerStatusLabels, offerStatusTones } from "../logic";
import { listOffers, type OfferListItem, type OfferStatus } from "../queries";
import { OfferActions } from "./offer-actions";

const FILTERS: { label: string; value: OfferStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Offered", value: "offered" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
  { label: "Withdrawn", value: "withdrawn" },
];

// Single source of truth for valid statuses; the tone map is exhaustive.
const KNOWN = Object.keys(offerStatusTones) as OfferStatus[];

function asStatus(raw: string | string[] | undefined): OfferStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return KNOWN.find((s) => s === value);
}

export async function OffersView({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { status: rawStatus } = await searchParams;
  const status = asStatus(rawStatus);
  const [staff, offers] = await Promise.all([getStaff(), listOffers(status)]);
  const isManager = staff?.role === "manager";

  return (
    <div className="flex flex-col gap-3">
      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.value === status;
          return (
            <Link
              key={f.label}
              href={f.value ? `/selling?status=${f.value}` : "/selling"}
              className={cn(
                badgeVariants({ variant: active ? "default" : "outline" }),
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {offers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No offers.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted [&_th]:text-xs [&_th]:font-bold [&_th]:tracking-wide [&_th]:uppercase">
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Est. kg</TableHead>
                <TableHead>Harvest</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.map((offer) => (
                <OfferRow key={offer.id} offer={offer} isManager={isManager} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function OfferRow({
  offer,
  isManager,
}: {
  offer: OfferListItem;
  isManager: boolean;
}) {
  const decidable = offer.status === "offered";
  return (
    <TableRow>
      <TableCell className="font-mono">{offer.ref}</TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{offer.client?.name ?? "—"}</span>
          {offer.variety ? (
            <span className="text-xs text-muted-foreground">
              {offer.variety.code}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right">{formatKg(offer.est_kg)}</TableCell>
      <TableCell>{formatDate(offer.harvest_date)}</TableCell>
      <TableCell>
        <StatusBadge tone={offerStatusTones[offer.status]}>
          {offerStatusLabels[offer.status]}
        </StatusBadge>
      </TableCell>
      <TableCell>
        {decidable && <OfferActions id={offer.id} isManager={isManager} />}
      </TableCell>
    </TableRow>
  );
}
