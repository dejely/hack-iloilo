import { z } from "zod";

/**
 * Optional AI fields also accept null/empty placeholders for missing details.
 * `only` drops the other fields. Keeps the schema's own settings.
 */
export function optionalAiFields(
  schema: z.ZodType<unknown>,
  fields: readonly string[],
  only = false,
): z.ZodType<unknown> {
  if (!(schema instanceof z.ZodObject) || !fields.length) return schema;
  const object = schema as z.ZodObject<Record<string, z.ZodType>>;
  // Zod types masks against a literal shape; this one is built at runtime.
  const mask = Object.fromEntries(
    fields.filter((f) => f in object.shape).map((f) => [f, true]),
  ) as Record<never, true>;
  const base = only ? object.pick(mask) : object;
  return base.extend(
    Object.fromEntries(
      Object.keys(mask).map((field) => [
        field,
        z.union([object.shape[field], z.null(), z.literal("")]).optional(),
      ]),
    ),
  );
}
