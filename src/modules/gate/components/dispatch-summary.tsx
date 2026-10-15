import { DateInput } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatKg } from "@/lib/format";
import { buyerTypeLabels, buyerTypes } from "@/modules/accounts/logic";
import { dispatchedKgByBuyerType } from "../queries";

/**
 * Kg dispatched to buyers per buyer type over a period, so IRPC can report how
 * much went to the ₱20/kg program. `keep` carries the list's other filters
 * through the period form.
 */
export async function DispatchSummary({
  from,
  to,
  keep,
}: {
  from: string;
  to: string;
  keep: Record<string, string | undefined>;
}) {
  const kg = await dispatchedKgByBuyerType(from, to);
  const total = [...kg.values()].reduce((sum, value) => sum + value, 0);
  const rows = [
    ...buyerTypes.map((type) => ({
      key: type,
      label: buyerTypeLabels[type],
      kg: kg.get(type) ?? 0,
    })),
    ...(kg.has(null)
      ? [{ key: "unset", label: "Type not set", kg: kg.get(null)! }]
      : []),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dispatched by buyer type</CardTitle>
        <CardDescription>
          Rice dispatched to buyers, {formatDate(from)} to {formatDate(to)}.
          Owner pickups are not counted.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action="/batches" className="flex flex-wrap items-end gap-3">
          {Object.entries(keep).map(([name, value]) =>
            value ? (
              <input key={name} type="hidden" name={name} value={value} />
            ) : null,
          )}
          <Field className="w-auto">
            <FieldLabel htmlFor="dispatch-from">From</FieldLabel>
            <DateInput id="dispatch-from" name="from" defaultValue={from} />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="dispatch-to">To</FieldLabel>
            <DateInput id="dispatch-to" name="to" defaultValue={to} />
          </Field>
          <Button type="submit" variant="outline">
            Show
          </Button>
        </form>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Buyer type</TableHead>
                <TableHead className="text-right">Dispatched</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="text-right">
                    {formatKg(row.kg)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {total ? `${Math.round((row.kg / total) * 100)}%` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{formatKg(total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
