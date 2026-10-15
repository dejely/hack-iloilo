import { StatusBadge } from "@/components/status-badge";
import { formatTonnes } from "@/lib/format";
import { expectedKg, plantStatus, plantStatusTones } from "../logic";
import type { DayPool } from "../types";

export function DayBadge({ day }: { day: DayPool }) {
  const tone = plantStatusTones[plantStatus(day)];
  if (day.overloaded) {
    return (
      <StatusBadge tone={tone}>{formatTonnes(day.overflowKg)} over</StatusBadge>
    );
  }
  if (day.idle) return <StatusBadge tone={tone}>Idle</StatusBadge>;
  const pct = day.capacityKg
    ? Math.round((expectedKg(day) / day.capacityKg) * 100)
    : null;
  return (
    <StatusBadge tone={tone}>{pct === null ? "—" : `${pct}%`}</StatusBadge>
  );
}
