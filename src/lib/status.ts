/**
 * Colour for a status, shared by every module so a status reads the same
 * everywhere:
 * - neutral: not started, or closed out (cancelled, withdrawn, idle)
 * - info: scheduled or in progress
 * - warning: waiting on a decision, or close to a limit
 * - success: done, or healthy
 * - danger: failed, refused or over a limit
 */
export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";
