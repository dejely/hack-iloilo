"use server";

// M6. Gate and Batches: Queue, batch record, dispatch. See TRD.md.
// Server actions. Check the staff role first with requireRole().

import { revalidatePath } from "next/cache";
import { z, type ZodType } from "zod";
import { requireRole } from "@/modules/accounts/auth";
import { ClientInputError } from "@/modules/accounts/queries";
import {
  finishDryingSchema,
  finishMillingSchema,
  receivingSchema,
  startDryingSchema,
  startMillingSchema,
} from "./batch-schema";
import { checkInSchema, type CheckInInput } from "./checkin-schema";
import { dispatchSchema } from "./dispatch-schema";
import {
  confirmWeightInPerson,
  checkIn,
  dispatch,
  finish,
  finishDrying,
  finishMilling,
  GateError,
  markLeft,
  recordReceiving,
  refPreview,
  skipDrying,
  start,
  startDrying,
  startMilling,
  type CheckInParams,
} from "./queries";
import type { RefPreview } from "./types";

type Failure = {
  status: "error";
  message?: string;
  fieldErrors?: Partial<Record<keyof CheckInInput, string>>;
};
export type CheckInResult = { status: "ok"; entryId: string } | Failure;
export type StartResult =
  { status: "ok"; batch: { id: string; batch_no: string } } | Failure;
export type MoveResult = { status: "ok" } | Failure;
export type LookupRefResult =
  { status: "ok"; preview: RefPreview } | { status: "error"; message: string };
export type StageResult =
  | { status: "ok" }
  | { status: "error"; message?: string; fieldErrors?: Record<string, string> };

const invalidBatch: StageResult = {
  status: "error",
  message: "Invalid batch. Refresh the page.",
};

const invalidEntry: Failure = {
  status: "error",
  message: "Invalid queue entry. Refresh the queue.",
};

export async function checkInClient(input: unknown): Promise<CheckInResult> {
  await requireRole();
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success)
    return {
      status: "error",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path[0], issue.message]),
      ),
    };
  const { mode, ref, phone, service, ownership, estKg, name, kind } =
    parsed.data;
  const params: CheckInParams =
    mode === "booking"
      ? { bookingRef: ref }
      : mode === "offer"
        ? { offerRef: ref }
        : mode === "walkIn"
          ? {
              walkIn: {
                name,
                phone,
                kind,
                municipality_id: parsed.data.municipality_id,
              },
              service,
              ownership,
              estKg,
            }
          : { phone, service, ownership, estKg };
  try {
    const entry = await checkIn(params);
    revalidatePath("/queue");
    if (mode === "booking") revalidatePath("/bookings");
    if (mode === "offer") revalidatePath("/selling");
    return { status: "ok", entryId: entry.id };
  } catch (error) {
    if (error instanceof GateError)
      return { status: "error", fieldErrors: { ref: error.message } };
    if (error instanceof ClientInputError)
      return {
        status: "error",
        fieldErrors: {
          [error.field in parsed.data ? error.field : "phone"]: error.message,
        },
      };
    console.error("Unable to check in client", error);
    return {
      status: "error",
      message: "Unable to check in the client. Please try again.",
    };
  }
}

/** What a booking or offer ref would check in, for the card's summary. */
export async function lookupRef(ref: string): Promise<LookupRefResult> {
  await requireRole();
  if (typeof ref !== "string")
    return { status: "error", message: "Enter the code." };
  try {
    return { status: "ok", preview: await refPreview(ref) };
  } catch (error) {
    if (error instanceof GateError)
      return { status: "error", message: error.message };
    console.error("Unable to look up ref", error);
    return {
      status: "error",
      message: "Unable to look up the code. Please try again.",
    };
  }
}

async function run<T>(
  id: string,
  label: string,
  action: (id: string) => Promise<T>,
): Promise<T | Failure> {
  await requireRole();
  if (!z.guid().safeParse(id).success) return invalidEntry;
  try {
    const result = await action(id);
    revalidatePath("/queue");
    return result;
  } catch (error) {
    if (error instanceof GateError)
      return { status: "error", message: error.message };
    console.error(`Unable to ${label}`, error);
    return {
      status: "error",
      message: `Unable to ${label}. Please try again.`,
    };
  }
}

/** Starts service for the entry and opens its batch. */
export async function startEntry(id: string): Promise<StartResult> {
  return run(id, "start service", async (entryId) => {
    const batch = await start(entryId);
    revalidatePath("/batches");
    return {
      status: "ok" as const,
      batch: { id: batch.id, batch_no: batch.batch_no },
    };
  });
}

export async function finishEntry(id: string): Promise<MoveResult> {
  return run(id, "finish service", async (entryId) => {
    await finish(entryId);
    return { status: "ok" as const };
  });
}

export async function leaveEntry(id: string): Promise<MoveResult> {
  return run(id, "remove the client", async (entryId) => {
    await markLeft(entryId);
    return { status: "ok" as const };
  });
}

/** Runs a batch stage write, revalidating its pages and mapping a stale stage. */
async function commit(
  batchId: string,
  label: string,
  work: () => Promise<unknown>,
): Promise<StageResult> {
  try {
    await work();
    revalidatePath(`/batches/${batchId}`);
    revalidatePath("/batches");
    return { status: "ok" };
  } catch (error) {
    if (error instanceof GateError)
      return { status: "error", message: error.message };
    console.error(`Unable to ${label}`, error);
    return {
      status: "error",
      message: `Unable to ${label}. Please try again.`,
    };
  }
}

/**
 * Validates a batch stage form and runs its write, mapping Zod issues to field
 * errors and a stale stage to a refresh prompt.
 */
async function record<T>(
  batchId: string,
  label: string,
  schema: ZodType<T>,
  input: unknown,
  write: (batchId: string, data: T) => Promise<unknown>,
): Promise<StageResult> {
  await requireRole();
  if (!z.guid().safeParse(batchId).success) return invalidBatch;
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      status: "error",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[0]),
          issue.message,
        ]),
      ),
    };
  return commit(batchId, label, () => write(batchId, parsed.data));
}

/**
 * Records the Receiving Report on a `received` batch. For IRPC-bought palay it
 * also prices the receiving and saves the purchase; a custom batch gets none.
 * The priced result is shown by the batch page's purchase card after this
 * revalidates it.
 */
export async function recordReceivingBatch(
  batchId: string,
  input: unknown,
): Promise<StageResult> {
  return record(
    batchId,
    "record receiving",
    receivingSchema,
    input,
    async (id, data) => {
      await recordReceiving(id, {
        ...data,
        // A blank variety select means "not recorded".
        variety_id: data.variety_id === "" ? null : data.variety_id,
      });
    },
  );
}

export async function startDryingBatch(
  batchId: string,
  input: unknown,
): Promise<StageResult> {
  return record(batchId, "start drying", startDryingSchema, input, startDrying);
}

export async function finishDryingBatch(
  batchId: string,
  input: unknown,
): Promise<StageResult> {
  return record(
    batchId,
    "finish drying",
    finishDryingSchema,
    input,
    finishDrying,
  );
}

export async function skipDryingBatch(batchId: string): Promise<StageResult> {
  await requireRole();
  if (!z.guid().safeParse(batchId).success) return invalidBatch;
  return commit(batchId, "skip drying", () => skipDrying(batchId));
}

export async function startMillingBatch(
  batchId: string,
  input: unknown,
): Promise<StageResult> {
  return record(
    batchId,
    "start milling",
    startMillingSchema,
    input,
    startMilling,
  );
}

export async function finishMillingBatch(
  batchId: string,
  input: unknown,
): Promise<StageResult> {
  return record(
    batchId,
    "finish milling",
    finishMillingSchema,
    input,
    (id, data) =>
      finishMilling(id, {
        mill_end: data.mill_end,
        mill_in_kg: data.mill_in_kg,
        rice_kg: data.rice_kg,
        byproducts: { bran_kg: data.bran_kg, husk_kg: data.husk_kg },
      }),
  );
}

/** Records a dispatch (sale or owner pickup), checking kg against what's left. */
export async function dispatchBatch(
  batchId: string,
  input: unknown,
): Promise<StageResult> {
  return record(batchId, "record dispatch", dispatchSchema, input, (id, data) =>
    dispatch({ batchId: id, ...data }),
  );
}

export async function confirmBatchWeightInPerson(
  batchId: string,
  input: unknown,
): Promise<StageResult> {
  const staff = await requireRole();
  if (!z.guid().safeParse(batchId).success) return invalidBatch;
  const parsed = z
    .object({
      stage: z.enum(["receiving", "drying"]),
      updatedAt: z.iso.datetime({ offset: true }),
    })
    .safeParse(input);
  if (!parsed.success)
    return {
      status: "error",
      message: "Invalid weight confirmation. Refresh the page.",
    };
  return commit(batchId, "confirm weight", () =>
    confirmWeightInPerson(
      batchId,
      parsed.data.stage,
      staff.id,
      parsed.data.updatedAt,
    ),
  );
}
