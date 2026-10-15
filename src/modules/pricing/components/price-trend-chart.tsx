"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { PricePoint } from "../logic";

const config = {
  rice: { label: "Rice", color: "var(--chart-2)" },
  buyBase: { label: "Palay base", color: "var(--chart-1)" },
  milling: { label: "Milling fee", color: "var(--chart-3)" },
  drying: { label: "Drying fee", color: "var(--chart-4)" },
} satisfies ChartConfig;
type Series = keyof typeof config;
const series = Object.keys(config) as Series[];

const day = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const short = (date: string) => day.format(new Date(`${date}T00:00:00Z`));

/** Prices per kg by effective date. Steps, since a price holds until the next. */
export function PriceTrendChart({ points }: { points: PricePoint[] }) {
  if (points.length === 0)
    return <p className="text-sm text-muted-foreground">No prices set yet.</p>;
  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <LineChart data={points} margin={{ top: 8, right: 12, left: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={short}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(value: number) => `₱${value}`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                short(String(payload?.[0]?.payload?.date ?? ""))
              }
              formatter={(value, name) => (
                <div className="flex w-full items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ background: `var(--color-${name})` }}
                  />
                  <span className="text-muted-foreground">
                    {config[name as Series].label}
                  </span>
                  <span className="ml-auto font-mono font-medium tabular-nums">
                    ₱{Number(value).toFixed(2)}/kg
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((key) => (
          <Line
            key={key}
            dataKey={key}
            type="stepAfter"
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
