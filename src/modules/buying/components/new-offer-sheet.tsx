"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { OfferForm } from "./offer-form";

/** "New sell offer" button that opens the offer form in a sheet. */
export function NewOfferSheet(props: React.ComponentProps<typeof OfferForm>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New sell offer</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New sell offer</SheetTitle>
            <SheetDescription>
              Record a client&apos;s offer to sell palay.
            </SheetDescription>
          </SheetHeader>
          {open ? (
            <OfferForm {...props} onSaved={() => setOpen(false)} />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
