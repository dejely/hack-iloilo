"use client";

import { useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cancelOrderByStaff, decideOrder } from "../actions";
import type { OrderStatus } from "../logic";
import { PickupDialog, type SaleBatch } from "./pickup-dialog";

/**
 * Row actions for an open request: the next step up front, the rest in a menu.
 * Accept and decline are manager only; any staff records pickup or cancels.
 */
export function OrderActions({
  order,
  isManager,
  batches,
  riceMinorPerKg,
}: {
  order: { id: string; ref: string; kg: number; status: OrderStatus };
  isManager: boolean;
  batches: SaleBatch[];
  riceMinorPerKg: number | null;
}) {
  const { id, status } = order;
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-end gap-1">
      {status === "requested" && isManager ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => start(() => decideOrder(id, true))}
        >
          Accept
        </Button>
      ) : null}
      {status === "accepted" ? (
        <PickupDialog
          order={order}
          batches={batches}
          riceMinorPerKg={riceMinorPerKg}
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={pending}
              aria-label="More actions"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === "requested" && isManager ? (
            <DropdownMenuItem
              onClick={() => start(() => decideOrder(id, false))}
            >
              Decline
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => start(() => cancelOrderByStaff(id))}>
            Cancel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
