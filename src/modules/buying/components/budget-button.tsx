import { Wallet } from "lucide-react";
import { ToolDialog } from "@/components/tool-dialog";
import { formatDate, formatMoney } from "@/lib/format";
import { getStaff } from "@/modules/accounts/auth";
import { cn } from "cn";
import { buyingBudget } from "../queries";
import { BudgetForm } from "./budget-form";

/**
 * Working capital used and remaining against the manager's buying budget,
 * behind a button that shows what is left. Renders nothing for encoders
 * (costs are manager-only) without redirecting them off the shared buying
 * page, as `RoleGate` would.
 */
export async function BudgetButton() {
  const staff = await getStaff();
  if (staff?.role !== "manager") return null;

  const budget = await buyingBudget();
  const over = budget.remainingMinor < 0;
  const left = formatMoney(Math.abs(budget.remainingMinor));

  return (
    <ToolDialog
      trigger={
        <>
          <Wallet data-icon="inline-start" />
          Budget ·{" "}
          <span className={cn("tabular-nums", over && "text-destructive")}>
            {over ? `${left} over` : `${left} left`}
          </span>
        </>
      }
      title="Buying budget"
      description={
        budget.start
          ? `Purchases since ${formatDate(budget.start)}.`
          : "All purchases. Set a start date to begin a period."
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Budget</dt>
            <dd className="font-medium tabular-nums">
              {formatMoney(budget.budgetMinor)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Used</dt>
            <dd className="font-medium tabular-nums">
              {formatMoney(budget.usedMinor)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {over ? "Over" : "Remaining"}
            </dt>
            <dd
              className={cn(
                "font-medium tabular-nums",
                over && "text-destructive",
              )}
            >
              {left}
            </dd>
          </div>
        </dl>
        <BudgetForm
          // Remount after a save so inputs show the stored values.
          key={`${budget.budgetMinor}-${budget.start}`}
          budget={(budget.budgetMinor / 100).toFixed(2)}
          start={budget.start ?? ""}
        />
      </div>
    </ToolDialog>
  );
}
