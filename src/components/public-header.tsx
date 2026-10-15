import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

/**
 * Header for public client pages: a back link to `back` and the wordmark,
 * which always links home.
 */
export function PublicHeader({
  back,
  subtitle,
}: {
  back: string;
  subtitle?: string;
}) {
  return (
    <header className="flex w-full max-w-sm flex-col gap-4">
      <Link
        href={back}
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ArrowLeft data-icon="inline-start" />
        Back
      </Link>
      <div className="flex flex-col items-center gap-1">
        <Link href="/" aria-label="SACKTO home" className="rounded-md">
          <Wordmark aria-hidden className="h-8 w-auto text-primary" />
        </Link>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
