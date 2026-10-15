import { Cog, Sun, Warehouse, type LucideProps } from "lucide-react";
import { cn } from "cn";

/**
 * Drying is the sun, milling the cog and storage the warehouse, wherever a
 * service, pool or machine shows.
 */
const icons = {
  drying: Sun,
  dryer: Sun,
  milling: Cog,
  mill: Cog,
  storage: Warehouse,
};

export type ServiceIconKind = keyof typeof icons;

export const isServiceIconKind = (value: string): value is ServiceIconKind =>
  value in icons;

export function ServiceIcon({
  kind,
  ...props
}: LucideProps & { kind: ServiceIconKind }) {
  const Icon = icons[kind];
  return <Icon aria-hidden {...props} />;
}

/** A service name with its icon, for table cells, headings and summaries. */
export function ServiceLabel({
  kind,
  className,
  children,
}: {
  kind: ServiceIconKind;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <ServiceIcon kind={kind} className="size-4 shrink-0 text-primary" />
      {children}
    </span>
  );
}
