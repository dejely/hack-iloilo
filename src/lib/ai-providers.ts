import { quotaCooldown } from "./ai-keys";

export type AiProvider = "gemini" | "openrouter";
export type ProviderFailure =
  "quota" | "server" | "timeout" | "network" | "billing" | "invalid";

/** Prefer OpenRouter, then try up to two eligible Gemini keys. */
export function providerOrder(
  geminiKeys: number,
  openRouter: boolean,
): AiProvider[] {
  const order: AiProvider[] = [];
  if (openRouter) order.push("openrouter");
  if (geminiKeys > 0) order.push("gemini");
  if (geminiKeys > 1) order.push("gemini");
  return order;
}

/** Leave a share of the total deadline for every remaining fallback. */
export function attemptTimeout(
  deadline: number,
  now: number,
  attemptsLeft: number,
): number {
  const remaining = Math.max(0, deadline - now);
  if (attemptsLeft <= 0) return 0;
  if (attemptsLeft === 1) return remaining;
  return remaining - Math.ceil(remaining / 2);
}

export function providerFailure(error: unknown, now: number): ProviderFailure {
  if (error === null || typeof error !== "object") return "invalid";
  const failure = error as {
    name?: unknown;
    statusCode?: unknown;
    isRetryable?: unknown;
  };
  // Structured-output failures can contain sensitive generated text and causes.
  // They are terminal even when a nested cause resembles a transient error.
  if (
    [
      "AI_NoObjectGeneratedError",
      "AI_NoOutputGeneratedError",
      "AI_TypeValidationError",
      "AI_JSONParseError",
      "ZodError",
    ].includes(String(failure.name))
  )
    return "invalid";
  if (quotaCooldown(error, now) !== null) return "quota";
  if (failure.statusCode === 402) return "billing";
  if (typeof failure.statusCode === "number")
    return failure.statusCode >= 500 && failure.statusCode <= 599
      ? "server"
      : "invalid";
  if (failure.name === "TimeoutError" || failure.name === "AbortError")
    return "timeout";
  if (failure.name === "AI_APICallError" && failure.isRetryable === true)
    return "network";
  return "invalid";
}
