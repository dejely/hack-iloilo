import { Badge } from "@/components/ui/badge";
import type { StatusTone } from "@/lib/status";
import { cn } from "cn";

const tones: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-destructive/10 text-destructive",
};

/** Dot + word in the status's tone, so status never relies on colour alone. */
export function StatusBadge({
  tone,
  icon,
  className,
  children,
}: {
  tone: StatusTone;
  /** Shown in place of the dot, e.g. a drying or milling icon. */
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Badge className={cn("gap-1.5 font-semibold", tones[tone], className)}>
      {icon ?? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-current"
        />
      )}
      {children}
    </Badge>
  );
}
