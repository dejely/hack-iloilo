import { formatDate, formatKg } from "@/lib/format";
import { serviceLabels } from "../logic";
import type { Service } from "../types";

export type BookingSlip = {
  ref: string;
  name: string;
  service: Service;
  est_kg: number;
  scheduled_date: string;
};

const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 90;
const INK = "#0a0a0a";
const MUTED = "#6b7280";
const RULE = "#e5e7eb";

/** Breaks text into lines that fit `maxWidth` at the context's current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the booking slip a client shows at the gate, as a JPEG. */
export async function bookingSlipJpeg(slip: BookingSlip): Promise<Blob> {
  await document.fonts.ready;
  const sans = getComputedStyle(document.body).fontFamily;
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported.");

  // JPEG has no transparency, so paint the background first.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = MUTED;
  ctx.font = `500 36px ${sans}`;
  ctx.fillText("Iloilo Rice Processing Complex", PAD, 160);
  ctx.fillStyle = INK;
  ctx.font = `600 56px ${sans}`;
  ctx.fillText("Booking confirmed", PAD, 240);

  ctx.fillStyle = MUTED;
  ctx.font = `500 32px ${sans}`;
  ctx.fillText("Booking code", PAD, 360);
  ctx.fillStyle = INK;
  ctx.font = `700 150px ${mono}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "16px";
  ctx.fillText(slip.ref, PAD, 520);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

  ctx.fillStyle = RULE;
  ctx.fillRect(PAD, 590, WIDTH - PAD * 2, 3);

  const rows: [string, string][] = [
    ["Name", slip.name],
    ["Service", serviceLabels[slip.service]],
    ["Estimated weight", formatKg(slip.est_kg)],
    ["Date", formatDate(slip.scheduled_date)],
  ];
  let y = 680;
  for (const [label, value] of rows) {
    ctx.fillStyle = MUTED;
    ctx.font = `500 32px ${sans}`;
    ctx.fillText(label, PAD, y);
    ctx.fillStyle = INK;
    ctx.font = `600 44px ${sans}`;
    ctx.fillText(value, PAD, y + 56, WIDTH - PAD * 2);
    y += 132;
  }

  ctx.fillStyle = RULE;
  ctx.fillRect(PAD, y - 20, WIDTH - PAD * 2, 3);
  ctx.fillStyle = MUTED;
  ctx.font = `400 34px ${sans}`;
  const note = `Show this at the gate. To cancel, text CANCEL ${slip.ref}.`;
  for (const [i, line] of wrap(ctx, note, WIDTH - PAD * 2).entries())
    ctx.fillText(line, PAD, y + 50 + i * 48);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Unable to draw the image.")),
      "image/jpeg",
      0.92,
    ),
  );
}

/** Saves the slip as `irpc-booking-<ref>.jpg`. */
export async function saveBookingSlip(slip: BookingSlip): Promise<void> {
  const url = URL.createObjectURL(await bookingSlipJpeg(slip));
  const link = document.createElement("a");
  link.href = url;
  link.download = `irpc-booking-${slip.ref}.jpg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
