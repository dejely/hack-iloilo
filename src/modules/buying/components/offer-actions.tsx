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
import { decideOffer, withdrawOffer } from "../actions";

/**
 * Row actions for an open offer: Accept up front, the rest in a menu to keep
 * the table narrow. Accept and decline are manager only; any staff withdraws.
 */
export function OfferActions({
  id,
  isManager,
}: {
  id: string;
  isManager: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-end gap-1">
      {isManager ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => start(() => decideOffer(id, true))}
        >
          Accept
        </Button>
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
          {isManager ? (
            <DropdownMenuItem
              onClick={() => start(() => decideOffer(id, false))}
            >
              Decline
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => start(() => withdrawOffer(id))}>
            Withdraw
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
