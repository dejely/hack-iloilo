import { InfoIcon } from "@/components/hint-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { batchCost } from "../queries";

/**
 * A batch's direct cost against its revenue and margin, for the manager. Wrap
 * the caller in `<RoleGate role="manager">` — encoders don't see cost.
 */
export async function BatchCostCard({ id }: { id: string }) {
  const cost = await batchCost(id);

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Cost and margin</CardTitle>
        <CardDescription>
          Electricity and labor against revenue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {(
            [
              [
                "Electricity",
                formatMoney(cost.electricityMinor),
                "Dryer and mill hours times their rated kW and the tariff. The plant's base load is left out.",
              ],
              [
                "Labor",
                formatMoney(cost.laborMinor),
                "Drying and milling hours times the labor rate.",
              ],
              [
                "Revenue",
                formatMoney(cost.revenueMinor),
                "Custom: the drying and milling fees. IRPC-owned: rice sales minus what IRPC paid for the palay.",
              ],
            ] as [string, string, string][]
          ).map(([label, value, info]) => (
            <div key={label} className="contents">
              <dt className="flex items-center gap-1 text-muted-foreground">
                {label}
                <InfoIcon text={info} />
              </dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
          <div className="contents">
            <dt className="text-muted-foreground">Margin</dt>
            <dd className="text-base font-semibold">
              {formatMoney(cost.marginMinor)}
            </dd>
          </div>
          <div className="contents">
            <dt className="flex items-center gap-1 text-muted-foreground">
              Margin per kg
              <InfoIcon text="Margin divided by the kilos received." />
            </dt>
            <dd className="font-medium">{formatMoney(cost.perKgMinor)}/kg</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
