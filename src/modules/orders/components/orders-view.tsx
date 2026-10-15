import Link from "next/link";
import { connection } from "next/server";
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
import { todayManila } from "@/lib/dates";
import { formatDate, formatKg, formatMoney } from "@/lib/format";
import { getStaff } from "@/modules/accounts/auth";
import { buyerTypeLabels } from "@/modules/accounts/logic";
import { priceOn } from "@/modules/pricing/queries";
import {
  canCancel,
  estimateMinor,
  exceedsFree,
  freeKg,
  orderStatusLabels,
  orderStatusTones,
} from "../logic";
import {
  listOrders,
  orderStock,
  pickupBatches,
  type OrderListItem,
  type OrderStatus,
} from "../queries";
import { OrderActions } from "./order-actions";
import type { SaleBatch } from "./pickup-dialog";

const FILTERS: { label: string; value: OrderStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Requested", value: "requested" },
  { label: "Accepted", value: "accepted" },
  { label: "Picked up", value: "picked_up" },
  { label: "Declined", value: "declined" },
  { label: "Cancelled", value: "cancelled" },
];

// Single source of truth for valid statuses; the tone map is exhaustive.
const KNOWN = Object.keys(orderStatusTones) as OrderStatus[];

function asStatus(raw: string | string[] | undefined): OrderStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return KNOWN.find((s) => s === value);
}

export async function OrdersView({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  // Today's price is read fresh per request; defer past the prerendered shell.
  await connection();
  const { status: rawStatus } = await searchParams;
  const status = asStatus(rawStatus);
  const [staff, orders, prices, stock, batches] = await Promise.all([
    getStaff(),
    listOrders(status),
    priceOn(todayManila()).catch(() => null),
    orderStock(),
    pickupBatches(),
  ]);
  const isManager = staff?.role === "manager";
  const free = freeKg(stock.onHandKg, stock.acceptedKg);

  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Rice on hand</dt>
          <dd className="font-semibold tabular-nums">
            {formatKg(stock.onHandKg)}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Accepted, not picked up</dt>
          <dd className="font-semibold tabular-nums">
            {formatKg(stock.acceptedKg)}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Free</dt>
          <dd
            className={cn(
              "font-semibold tabular-nums",
              free < 0 && "text-destructive",
            )}
          >
            {free < 0 ? `Over by ${formatKg(-free)}` : formatKg(free)}
          </dd>
        </div>
      </dl>

      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.value === status;
          return (
            <Link
              key={f.label}
              href={f.value ? `/rice-buying?status=${f.value}` : "/rice-buying"}
              className={cn(
                badgeVariants({ variant: active ? "default" : "outline" }),
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No requests.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted [&_th]:text-xs [&_th]:font-bold [&_th]:tracking-wide [&_th]:uppercase">
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead className="text-right">Kg</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead className="text-right">Est. ₱</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  isManager={isManager}
                  riceMinorPerKg={prices?.rice_minor_per_kg ?? null}
                  overFree={exceedsFree(order, free)}
                  batches={batches}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function OrderRow({
  order,
  isManager,
  riceMinorPerKg,
  overFree,
  batches,
}: {
  order: OrderListItem;
  isManager: boolean;
  riceMinorPerKg: number | null;
  /** Accepting would promise more rice than is free. */
  overFree: boolean;
  batches: SaleBatch[];
}) {
  const type = order.client?.buyer_type;
  return (
    <TableRow>
      <TableCell className="font-mono">{order.ref}</TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{order.client?.name ?? "—"}</span>
          {type ? (
            <span className="text-xs text-muted-foreground">
              {buyerTypeLabels[type]}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end">
          <span>{formatKg(order.kg)}</span>
          {overFree ? (
            <span className="text-xs text-warning">More than free stock</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>{formatDate(order.pickup_date)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {riceMinorPerKg !== null
          ? formatMoney(estimateMinor(order.kg, riceMinorPerKg))
          : "—"}
      </TableCell>
      <TableCell>
        <StatusBadge tone={orderStatusTones[order.status]}>
          {orderStatusLabels[order.status]}
        </StatusBadge>
      </TableCell>
      <TableCell>
        {canCancel(order.status) && (
          <OrderActions
            order={order}
            isManager={isManager}
            batches={batches}
            riceMinorPerKg={riceMinorPerKg}
          />
        )}
      </TableCell>
    </TableRow>
  );
}
