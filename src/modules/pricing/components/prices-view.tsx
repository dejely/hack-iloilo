import { ServiceLabel } from "@/components/service-icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { splitManila } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { priceTrend } from "../logic";
import { listPrices } from "../queries";
import { PriceTrendChart } from "./price-trend-chart";

/** The recent price trend, one point per effective date. */
export async function PriceTrend() {
  return <PriceTrendChart points={priceTrend(await listPrices())} />;
}

export async function PricesView() {
  const prices = await listPrices();

  if (prices.length === 0) {
    return <p className="text-sm text-muted-foreground">No prices set yet.</p>;
  }

  return (
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow>
          <TableHead>Effective</TableHead>
          <TableHead>Saved</TableHead>
          <TableHead className="text-right">Buy base</TableHead>
          <TableHead className="text-right">
            <ServiceLabel kind="drying">Drying</ServiceLabel>
          </TableHead>
          <TableHead className="text-right">
            <ServiceLabel kind="milling">Milling</ServiceLabel>
          </TableHead>
          <TableHead className="text-right">Rice</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {prices.map((p) => {
          const saved = splitManila(p.created_at);
          return (
            <TableRow key={p.id}>
              <TableCell>{p.effective_date}</TableCell>
              <TableCell className="text-muted-foreground">
                {saved.date} {saved.time}
              </TableCell>
              <TableCell className="text-right">
                {formatMoney(p.buy_base_minor_per_kg)}/kg
              </TableCell>
              <TableCell className="text-right">
                {formatMoney(p.drying_fee_minor_per_kg)}/kg
              </TableCell>
              <TableCell className="text-right">
                {formatMoney(p.milling_fee_minor_per_kg)}/kg
              </TableCell>
              <TableCell className="text-right">
                {formatMoney(p.rice_minor_per_kg)}/kg
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
