import { InfoIcon } from "@/components/hint-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatKg, formatMoney } from "@/lib/format";
import { getStaff, requireRole } from "@/modules/accounts/auth";
import type { Deductions } from "@/modules/pricing/logic";
import { purchaseByBatch } from "../queries";
import { OverrideForm } from "./override-form";
import { VoucherForm } from "./voucher-form";

/**
 * The purchase priced from an IRPC batch's receiving, shown to the encoder with
 * the deductions and the running voucher number. Nothing renders for a custom
 * batch, which has no purchase.
 */
export async function PurchaseCard({ id }: { id: string }) {
  await requireRole();
  const [staff, purchase] = await Promise.all([
    getStaff(),
    purchaseByBatch(id),
  ]);
  if (!purchase) return null;
  const deductions = purchase.deductions as Deductions;
  const isManager = staff?.role === "manager";
  const overridden = purchase.override_reason != null;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Purchase</CardTitle>
        <CardDescription>
          Priced from the receiving report on today&apos;s prices.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {(
            [
              ["Net weight", formatKg(purchase.net_kg)],
              ["Damaged", formatKg(deductions.damaged)],
              ["Immature", formatKg(deductions.immature)],
              ["Foreign matter", formatKg(deductions.foreign)],
              ["Sacks", formatKg(deductions.sack)],
              [
                "Paid weight",
                formatKg(purchase.paid_kg),
                "Net weight minus the deductions above.",
              ],
              [
                "Price",
                `${formatMoney(purchase.price_minor_per_kg)}/kg`,
                "The buying base, adjusted for this delivery's moisture.",
              ],
            ] as [string, string, string?][]
          ).map(([label, value, info]) => (
            <div key={label} className="contents">
              <dt className="flex items-center gap-1 text-muted-foreground">
                {label}
                {info ? <InfoIcon text={info} /> : null}
              </dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
          {overridden && deductions.original_minor_per_kg != null ? (
            <div className="contents">
              <dt className="text-muted-foreground">Original price</dt>
              <dd className="font-medium text-muted-foreground line-through">
                {formatMoney(deductions.original_minor_per_kg)}/kg
              </dd>
            </div>
          ) : null}
          <div className="contents">
            <dt className="text-muted-foreground">Total</dt>
            <dd className="text-base font-semibold">
              {formatMoney(purchase.total_minor)}
            </dd>
          </div>
        </dl>
        {overridden ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Override reason: </span>
            {purchase.override_reason}
          </p>
        ) : null}
        <VoucherForm batchId={id} current={purchase.voucher_ref} />
        {isManager ? (
          <OverrideForm batchId={id} reason={purchase.override_reason} />
        ) : null}
      </CardContent>
    </Card>
  );
}
