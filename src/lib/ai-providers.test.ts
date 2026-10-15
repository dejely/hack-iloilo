import { describe, expect, it } from "vitest";
import { attemptTimeout, providerFailure, providerOrder } from "./ai-providers";

describe("AI provider selection", () => {
  it.each([
    [2, true, ["openrouter", "gemini", "gemini"]],
    [10, true, ["openrouter", "gemini", "gemini"]],
    [1, true, ["openrouter", "gemini"]],
    [2, false, ["gemini", "gemini"]],
    [1, false, ["gemini"]],
    [0, true, ["openrouter"]],
    [0, false, []],
  ])("orders %s Gemini keys with OpenRouter=%s", (count, router, expected) => {
    expect(providerOrder(count, router)).toEqual(expected);
  });

  it("reserves time for each fallback without extending the total deadline", () => {
    expect(attemptTimeout(8000, 0, 3)).toBe(4000);
    expect(attemptTimeout(8000, 2000, 2)).toBe(3000);
    expect(attemptTimeout(8000, 5000, 1)).toBe(3000);
    expect(attemptTimeout(8000, 4000, 2)).toBe(2000);
    expect(attemptTimeout(8000, 8000, 1)).toBe(0);
    expect(attemptTimeout(8000, 9000, 1)).toBe(0);
    expect(attemptTimeout(8000, 0, 0)).toBe(0);
  });
});

describe("AI provider failure classification", () => {
  it.each([429, 500, 502, 503, 504])(
    "allows fallback after HTTP %s",
    (statusCode) => {
      expect(providerFailure({ statusCode }, 0)).toBe(
        statusCode === 429 ? "quota" : "server",
      );
    },
  );
  it.each(["TimeoutError", "AbortError"])(
    "allows fallback after %s",
    (name) => {
      expect(providerFailure({ name }, 0)).toBe("timeout");
    },
  );
  it("allows retryable transport failures without an HTTP response", () => {
    expect(
      providerFailure({ name: "AI_APICallError", isRetryable: true }, 0),
    ).toBe("network");
  });
  it("allows a backup after a provider cannot reserve account credits", () => {
    expect(providerFailure({ statusCode: 402 }, 0)).toBe("billing");
  });
  it.each([400, 401, 403, 404])("does not retry HTTP %s", (statusCode) => {
    expect(providerFailure({ statusCode }, 0)).toBe("invalid");
  });
  it.each([
    "AI_NoObjectGeneratedError",
    "AI_TypeValidationError",
    "AI_JSONParseError",
    "ZodError",
  ])("does not retry %s even with a transient cause", (name) => {
    expect(providerFailure({ name, cause: { statusCode: 503 } }, 0)).toBe(
      "invalid",
    );
  });
  it("treats arbitrary errors as terminal", () => {
    expect(providerFailure(new Error("banana"), 0)).toBe("invalid");
    expect(providerFailure(null, 0)).toBe("invalid");
  });
});
