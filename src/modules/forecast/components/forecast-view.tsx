import { InfoIcon } from "@/components/hint-icons";
import { connection } from "next/server";
import { TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addDays, todayManila } from "@/lib/dates";
import { formatTonnes } from "@/lib/format";
import {
  byMunicipality,
  peak,
  sumByDay,
  sumByWeek,
  total,
  type KgRange,
} from "../logic";
import { arrivalRows, latestForecastMetrics } from "../queries";
import { ArrivalsCard, type ArrivalBar } from "./forecast-charts";

const CHART_WEEKS = 12;
const TABLE_WEEKS = 8;
const TABLE_ROWS = 10;

const dayMonth = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});
/** `Oct 15` from a `YYYY-MM-DD` date. */
const short = (date: string) => dayMonth.format(new Date(`${date}T00:00:00Z`));

/** `Oct 15 – 21`, or `Oct 29 – Nov 4` across months. */
function span(from: string, to: string): string {
  const [a, b] = [short(from), short(to)];
  return a.slice(0, 3) === b.slice(0, 3)
    ? `${a} – ${b.slice(4)}`
    : `${a} – ${b}`;
}

const rangeT = (r: KgRange) =>
  `${formatTonnes(r.kgLow)} – ${formatTonnes(r.kgHigh)}`;

function bar(
  r: KgRange,
  label: string,
  title: string,
  top: boolean,
): ArrivalBar {
  return {
    label,
    title,
    t: r.kgMid / 1000,
    range: [(r.kgMid - r.kgLow) / 1000, (r.kgHigh - r.kgMid) / 1000],
    rangeLabel: `likely ${rangeT(r)}`,
    peak: top,
  };
}

function Stat({
  label,
  info,
  value,
  detail,
}: {
  label: string;
  info?: string;
  value: string;
  detail: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-1">
          {label}
          {info ? <InfoIcon text={info} /> : null}
        </CardDescription>
        <div className="text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </div>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {detail}
      </CardContent>
    </Card>
  );
}

/** The forecast page body: headline, chart and municipalities. */
export async function ForecastView() {
  await connection();
  const from = todayManila();
  const to = addDays(from, CHART_WEEKS * 7 - 1);
  const tableTo = addDays(from, TABLE_WEEKS * 7 - 1);
  const [metrics, rows] = await Promise.all([
    latestForecastMetrics(),
    arrivalRows(from, to),
  ]);

  if (!metrics || rows.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TrendingUp />
          </EmptyMedia>
          <EmptyTitle>No forecast for the next {CHART_WEEKS} weeks</EmptyTitle>
          <EmptyDescription>
            Expected arrivals show here once the forecast is loaded.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const days = sumByDay(rows, from, to);
  const weeks = sumByWeek(days);
  const all = total(weeks);
  const topWeek = peak(weeks);
  const topDay = peak(days);
  const municipalities = byMunicipality(rows.filter((r) => r.date <= tableTo));
  const shown = municipalities.slice(0, TABLE_ROWS);
  const rest = municipalities.slice(TABLE_ROWS);
  const restTotal = total(rest);

  const topPlace = municipalities[0];
  const months = Math.round(metrics.mean_lag_days / 30);
  const spread = Math.round(metrics.band.p90 * 100);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          label={`Expected palay, next ${CHART_WEEKS} weeks`}
          info="Expected is the middle estimate. Likely is the range it should fall in about 8 times out of 10."
          value={formatTonnes(all.kgMid)}
          detail={`Likely ${rangeT(all)}`}
        />
        <Stat
          label="Busiest week"
          value={topWeek ? span(topWeek.from, topWeek.to) : "—"}
          detail={
            topWeek
              ? `About ${formatTonnes(topWeek.kgMid)}`
              : "No arrivals expected"
          }
        />
        <Stat
          label="Top municipality"
          value={topPlace?.municipality ?? "—"}
          detail={
            topPlace
              ? `About ${formatTonnes(topPlace.kgMid)} in the next ${TABLE_WEEKS} weeks`
              : "No arrivals expected"
          }
        />
      </div>

      <ArrivalsCard
        weekly={weeks.map((w) =>
          bar(w, short(w.from), span(w.from, w.to), w === topWeek),
        )}
        daily={days.map((d) =>
          bar(d, short(d.date), short(d.date), d === topDay),
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>By municipality · next {TABLE_WEEKS} weeks</CardTitle>
          <CardDescription>
            Palay expected at IRPC from each municipality.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Municipality</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead>Busiest period</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((m) => (
                <TableRow key={m.municipality}>
                  <TableCell className="font-medium">
                    {m.municipality}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatTonnes(m.kgMid)}
                  </TableCell>
                  <TableCell>
                    {m.peak ? span(m.peak.from, m.peak.to) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {rest.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell>{rest.length} more municipalities</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatTonnes(restTotal.kgMid)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Estimated from the province&apos;s planting reports: palay planted now
        reaches IRPC about {months} months later. Totals for the whole province
        usually land within ±{spread}% of the estimate.
      </p>
    </>
  );
}

export function ForecastViewSkeleton() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-96" />
      <Skeleton className="h-80" />
    </>
  );
}
