import "server-only";
import { createGoogle } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output, type LanguageModel } from "ai";
import type { z } from "zod";
import { todayManila } from "@/lib/dates";
import { env } from "@/lib/env";
import {
  createKeyPool,
  reserveKey,
  coolDownKey,
  quotaCooldown,
} from "./ai-keys";
import { providerOrder, providerFailure, attemptTimeout } from "./ai-providers";

function createPool() {
  const config = env();
  return {
    models: config.GOOGLE_GENERATIVE_AI_API_KEYS.map((apiKey) =>
      createGoogle({ apiKey })("gemini-3.5-flash"),
    ),
    openRouter: config.OPENROUTER_API_KEY
      ? createOpenRouter({ apiKey: config.OPENROUTER_API_KEY }).chat(
          config.OPENROUTER_MODEL,
          {
            provider: { require_parameters: true },
            // Preserve optional Zod fields; Output.object still validates the response.
            structuredOutputs: { strict: false },
          },
        )
      : undefined,
    state: createKeyPool(
      config.GOOGLE_GENERATIVE_AI_API_KEYS.length,
      Date.now(),
    ),
    limits: {
      perMinute: config.GOOGLE_GENERATIVE_AI_RPM_LIMIT,
      perDay: config.GOOGLE_GENERATIVE_AI_RPD_LIMIT,
      threshold: config.GOOGLE_GENERATIVE_AI_QUOTA_THRESHOLD,
    },
  };
}

// Per server instance only: counters reset on cold starts and are not shared
// between instances. Keys from the same Google project still share its quota.
let pool: ReturnType<typeof createPool> | undefined;

// Past this, the sender gets the rule-based help reply instead.
const TIMEOUT_MS = 8000;

/** Either configured provider can read free text; otherwise SMS is keyword-only. */
export function aiEnabled(): boolean {
  const config = env();
  return (
    config.GOOGLE_GENERATIVE_AI_API_KEYS.length > 0 ||
    Boolean(config.OPENROUTER_API_KEY)
  );
}

/**
 * Turns free-text SMS into data matching a command's schema.
 * Returns null on failure so callers fall back to the help text.
 */
export async function extract<T>(
  schema: z.ZodType<T>,
  text: string,
): Promise<T | null> {
  if (!aiEnabled()) return null;
  pool ??= createPool();
  const deadline = Date.now() + TIMEOUT_MS;
  const attempted: number[] = [];
  // Count currently eligible keys without reserving usage for unused fallbacks.
  const available: number[] = [];
  for (let i = 0; i < 2; i++) {
    const choice = reserveKey(pool.state, pool.limits, Date.now(), available);
    if (choice.index === null) break;
    available.push(choice.index);
  }
  const order = providerOrder(available.length, Boolean(pool.openRouter));
  const system = `Extract the farmer's request from this SMS, which may be in Hiligaynon, Tagalog, English or a mix. Today is ${todayManila()}. Copy amounts exactly as stated, in the farmer's unit; never convert units or calculate. Leave out anything not stated.`;
  for (const [attempt, provider] of order.entries()) {
    const now = Date.now();
    const timeout = attemptTimeout(deadline, now, order.length - attempt);
    if (timeout === 0) return null;
    let index: number | null = null;
    let model: LanguageModel | undefined = pool.openRouter;
    if (provider === "gemini") {
      const previous = pool.state.current;
      // Retry the configured primary on a new SMS after transient outages;
      // quota/cooldown checks still skip it when it is unavailable.
      const preferred = attempted.length
        ? pool.state
        : { ...pool.state, current: 0 };
      const selection = reserveKey(preferred, pool.limits, now, attempted);
      pool.state = selection.pool;
      index = selection.index;
      if (index === null) continue;
      attempted.push(index);
      if (index !== previous) console.info("[ai:key]", index);
      model = pool.models[index];
    }
    if (!model) continue;
    try {
      const { output } = await generateText({
        model,
        timeout,
        // Short SMS command objects do not need the model's 65k-token default.
        ...(provider === "openrouter" ? { maxOutputTokens: 1024 } : {}),
        // Reserve/count each API attempt ourselves, including quota failover.
        maxRetries: 0,
        output: Output.object({ schema }),
        system,
        prompt: text,
      });
      console.info("[ai:provider]", provider, "answered");
      return output;
    } catch (error) {
      const failure = providerFailure(error, Date.now());
      console.warn("[ai:provider]", provider, "failed", failure);
      const until =
        failure === "quota" ? quotaCooldown(error, Date.now()) : null;
      if (index !== null && until !== null) {
        pool.state = coolDownKey(pool.state, index, until);
      }
      if (failure === "invalid") {
        // Provider errors may contain credentials or the farmer's SMS.
        console.error("[ai:extract]", "request failed");
        return null;
      }
    }
  }
  return null;
}
