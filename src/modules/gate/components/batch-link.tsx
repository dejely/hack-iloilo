import Link from "next/link";
import { cn } from "cn";

/** The batch number chip: monospace on a soft brand fill. */
export const batchChip =
  "inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono font-semibold text-primary";

/** A batch number that opens the batch, the same everywhere it shows. */
export function BatchLink({
  id,
  batchNo,
  className,
}: {
  id: string;
  batchNo: string;
  className?: string;
}) {
  return (
    <Link
      href={`/batches/${id}`}
      aria-label={`Batch ${batchNo}`}
      className={cn(
        batchChip,
        "text-xs underline-offset-4 hover:underline",
        className,
      )}
    >
      {batchNo}
    </Link>
  );
}
