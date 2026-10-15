import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
type Enums = Database["public"]["Enums"];

export type QueueEntry = Tables["queue_entries"]["Row"];
export type Batch = Tables["batches"]["Row"];
export type Dispatch = Tables["dispatches"]["Row"];
export type QueueStatus = Enums["queue_status"];
export type BatchOwnership = Enums["batch_ownership"];
export type BuyerType = Enums["buyer_type"];
export type Service = Enums["service"];
export type BookingStatus = Enums["booking_status"];
export type OfferStatus = Enums["sell_offer_status"];
export type RefKind = "booking" | "offer";
/** A live queue entry with what the gate columns show. */
export type QueueRow = QueueEntry & {
  client: Pick<Tables["clients"]["Row"], "name" | "phone" | "kind">;
  batch: Pick<Batch, "id" | "batch_no"> | null;
  booking: { ref: string } | null;
  offer: { ref: string } | null;
};
/** What the check-in card shows for a booking or offer ref before checking in. */
export type RefPreview = {
  kind: RefKind;
  ref: string;
  client: { name: string; kind: string; phone: string };
  service: Service;
  ownership: BatchOwnership;
  estKg: number;
  /** Scheduled date for a booking, harvest date for an offer. */
  date: string;
};
export type BatchSummary = Batch & {
  client: Pick<Tables["clients"]["Row"], "name" | "phone" | "kind">;
  entry: Pick<QueueEntry, "service" | "started_at" | "est_kg"> | null;
  variety: Pick<Tables["varieties"]["Row"], "code" | "name"> | null;
};
/** A batch row for the list page. */
export type BatchListRow = Pick<
  Batch,
  | "id"
  | "batch_no"
  | "ownership"
  | "stage"
  | "net_kg"
  | "dried_kg"
  | "rice_kg"
  | "created_at"
> & {
  client: Pick<Tables["clients"]["Row"], "name">;
  entry: Pick<QueueEntry, "service"> | null;
  confirmations: { status: string }[];
};
/** A dispatch with the buyer (or owner, for a pickup) it went to. */
export type DispatchRow = Dispatch & {
  buyer: Pick<Tables["clients"]["Row"], "name" | "buyer_type">;
};
/** A batch with its origin and every dispatch, for the trail from gate to buyers. */
export type BatchTrail = Batch & {
  client: Pick<Tables["clients"]["Row"], "name" | "phone" | "kind"> & {
    municipality: Pick<Tables["municipalities"]["Row"], "name"> | null;
  };
  entry: Pick<QueueEntry, "service" | "started_at"> | null;
  dispatches: DispatchRow[];
};
/** What a public batch lookup shows: no names, phones or buyers. */
export type PublicTrail = {
  batchNo: string;
  /** The co-op, or "<municipality> farmers"; never a person's name. */
  origin: string | null;
  variety: string | null;
  steps: { label: string; date: string }[];
};
