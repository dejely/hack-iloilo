import { Info, type LucideIcon, TriangleAlert } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "cn";

/**
 * An icon that explains something. A popover rather than a tooltip, so it
 * opens on hover and focus on desktop and on tap on phones.
 */
function HintIcon({
  icon: Icon,
  text,
  className,
}: {
  icon: LucideIcon;
  text: string;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        openOnHover
        delay={100}
        aria-label={text}
        className={cn(
          "inline-flex cursor-help rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
      >
        <Icon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-auto max-w-64 p-2 text-xs leading-snug font-normal"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}

/** Marks a figure IRPC has not confirmed yet (see PRD open questions). */
export function UnconfirmedIcon() {
  return (
    <HintIcon
      icon={TriangleAlert}
      text="Unconfirmed by IRPC"
      className="text-warning"
    />
  );
}

/** Explains a field on hover or focus. */
export function InfoIcon({ text }: { text: string }) {
  return <HintIcon icon={Info} text={text} className="text-muted-foreground" />;
}
