import { existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const extract = vi.hoisted(() => vi.fn(async (): Promise<unknown> => null));
const aiEnabled = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/lib/ai", () => ({ extract, aiEnabled }));
import { db } from "@/lib/supabase/admin";
import {
  handleInbound,
  openPrompt,
  processInbound,
  smsThread,
} from "./queries";
import { registerCommand } from "./registry";

describe.skipIf(process.env.RUN_SMS_DB_TESTS !== "1")(
  "local Supabase SMS flow",
  () => {
    const phone = `+639${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    const other = `+639${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    const flood = `+639${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    const lastReply = async (to = phone) =>
      (await smsThread(to)).filter((m) => m.direction === "outbound").at(-1);

    beforeAll(() => {
      for (const file of [".env.local", ".env"])
        if (existsSync(file)) process.loadEnvFile(file);
      process.env.SMS_GATEWAY = "simulator";
      const hostname = new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid",
      ).hostname;
      if (!["localhost", "127.0.0.1"].includes(hostname))
        throw new Error("Integration tests require local Supabase.");

      registerCommand({
        keywords: ["ECHOTEST"],
        schema: z.object({ n: z.coerce.number().int() }),
        parse: ([n]) => ({ n }),
        handle: async ({ n }, ctx) =>
          `n=${n} from=${ctx.phone} for=${ctx.forPhone ?? "-"} client=${ctx.client.phone}`,
        ai: {
          description: "Echo a number.",
          summary: ({ n }) => `echo ${n}`,
        },
      });
    });

    afterAll(async () => {
      for (const p of [phone, other, flood]) {
        await db().from("sms_messages").delete().eq("phone", p);
        await db().from("sms_prompts").delete().eq("phone", p);
        await db().from("clients").delete().eq("phone", p);
      }
    });

    it("self-registers unknown phones and replies with help", async () => {
      await handleInbound({ phone, body: "hello there" });
      const { data: client } = await db()
        .from("clients")
        .select()
        .eq("phone", phone)
        .single();
      expect(client?.name).toMatch(/^SMS /);
      expect((await lastReply())?.body).toMatch(/Palihog i-text: .*ECHOTEST/);
      expect((await lastReply())?.status).toBe("sent");
    });

    it("routes keywords with FOR <phone>", async () => {
      await handleInbound({ phone, body: "echotest 5 FOR 09171234567" });
      expect((await lastReply())?.body).toBe(
        `n=5 from=${phone} for=+639171234567 client=${phone}`,
      );
    });

    it("replies with help when args fail the schema", async () => {
      await handleInbound({ phone, body: "ECHOTEST abc" });
      expect((await lastReply())?.body).toMatch(/wala namon naintiendihan/);
    });

    it("dedupes on gateway id", async () => {
      const gatewayId = `test-${randomInt(0, 1e9)}`;
      await handleInbound({ phone, body: "ECHOTEST 1", gatewayId });
      await handleInbound({ phone, body: "ECHOTEST 1", gatewayId });
      const inbound = (await smsThread(phone)).filter(
        (m) => m.gateway_id === gatewayId,
      );
      expect(inbound).toHaveLength(1);
      expect(inbound[0].status).toBe("processed");
    });

    it("processes a relayed row once", async () => {
      const { data } = await db()
        .from("sms_messages")
        .insert({
          direction: "inbound",
          phone: phone.replace("+63", "0"),
          body: "ECHOTEST 2",
          status: "received",
        })
        .select("id")
        .single();
      const before = (await smsThread(phone)).length;
      await processInbound(data!.id);
      await processInbound(data!.id);
      // Phone is normalized onto the row; one inbound + one reply.
      expect((await smsThread(phone)).length).toBe(before + 2);
      expect((await lastReply())?.body).toMatch(/^n=2 /);
    });

    it("answers prompts by ref, refusing other phones", async () => {
      const ref = await openPrompt({
        phone,
        kind: "ai_confirm",
        payload: { keyword: "ECHOTEST", args: { n: 3 } },
      });
      await handleInbound({ phone: other, body: `YES ${ref}` });
      expect((await lastReply(other))?.body).toMatch(
        /wala namon naintiendihan/,
      );

      await handleInbound({ phone, body: `yes ${ref.toLowerCase()}` });
      expect((await lastReply())?.body).toMatch(/^n=3 /);

      await handleInbound({ phone, body: `NO ${ref}` });
      expect((await lastReply())?.body).toMatch(/Wala kami pamangkot/);
    });

    it("reads free text with AI and runs it on a plain yes", async () => {
      extract.mockResolvedValueOnce({
        intent: { command: "ECHOTEST", args: { n: 7 } },
      });
      await handleInbound({ phone, body: "echo seven please" });
      expect((await lastReply())?.body).toBe(
        "IRPC: Para sigurado, gusto mo echo 7? Husto bala?",
      );
      const inbound = (await smsThread(phone)).filter(
        (m) => m.body === "echo seven please",
      );
      expect(inbound[0].via_ai).toBe(true);

      await handleInbound({ phone, body: "Oo sige" });
      expect((await lastReply())?.body).toMatch(/^n=7 /);
    });

    it("discards an AI reading on a plain no", async () => {
      extract.mockResolvedValueOnce({
        intent: { command: "ECHOTEST", args: { n: 8 } },
      });
      await handleInbound({ phone, body: "echo eight" });
      await handleInbound({ phone, body: "indi" });
      expect((await lastReply())?.body).toBe("IRPC: Sige, wala kami gin-save.");
      await handleInbound({ phone, body: "yes please" });
      expect((await lastReply())?.body).toMatch(/Wala kami pamangkot/);
    });

    it("runs AI readings without a summary right away", async () => {
      registerCommand({
        keywords: ["PEEKTEST"],
        schema: z.object({}),
        parse: () => ({}),
        handle: async () => "peeked",
        ai: { description: "Peek." },
      });
      extract.mockResolvedValueOnce({
        intent: { command: "PEEKTEST", args: {} },
      });
      await handleInbound({ phone, body: "can i peek" });
      expect((await lastReply())?.body).toBe("peeked");
    });

    it("maps an AI input reading to the command's args in code", async () => {
      registerCommand({
        keywords: ["SACKTEST"],
        schema: z.object({ kg: z.number().int() }),
        parse: () => null,
        handle: async ({ kg }) => `kg=${kg}`,
        ai: {
          description: "Weigh sacks.",
          input: {
            schema: z.object({ sacks: z.number() }),
            toArgs: ({ sacks }) => ({ kg: sacks * 50 }),
          },
        },
      });
      extract.mockResolvedValueOnce({
        intent: { command: "SACKTEST", args: { sacks: 20 } },
      });
      await handleInbound({ phone, body: "20 ka sako" });
      expect((await lastReply())?.body).toBe("kg=1000");
      extract.mockResolvedValueOnce({
        intent: { command: "SACKTEST", args: { kg: 1000 } },
      });
      await handleInbound({ phone, body: "1000 kg" });
      expect((await lastReply())?.body).toMatch(/wala namon naintiendihan/);
    });

    it("falls back to the keyword formats when AI fails", async () => {
      extract.mockResolvedValueOnce(null);
      await handleInbound({ phone, body: "pa dry 20 sako" });
      const reply = (await lastReply())?.body ?? "";
      expect(reply).toMatch(/Palihog i-text: .*ECHOTEST/);
      expect(reply).not.toMatch(/sako/);
      await handleInbound({ phone, body: "ECHOTEST 4" });
      expect((await lastReply())?.body).toMatch(/^n=4 /);
    });

    describe("edge cases", () => {
      beforeAll(() => {
        registerCommand({
          keywords: ["KEYTEST", "SUSI"],
          usage: "KEYTEST <n>",
          schema: z.object({ n: z.number().int() }),
          parse: ([n]) => (/^\d+$/.test(n ?? "") ? { n: Number(n) } : null),
          handle: async ({ n }) => `key=${n}`,
        });
      });

      it("reads keywords with punctuation, aliases and odd characters", async () => {
        await handleInbound({ phone, body: "#susi: 4." });
        expect((await lastReply())?.body).toBe("key=4");
        await handleInbound({ phone, body: "ＫＥＹＴＥＳＴ\u200B 5" });
        expect((await lastReply())?.body).toBe("key=5");
      });

      it("gives a keyword-only command's usage for bad args", async () => {
        await handleInbound({ phone, body: "KEYTEST lima" });
        expect((await lastReply())?.body).toBe(
          "IRPC: Pasensya, wala namon naintiendihan. Palihog i-text: KEYTEST <n>",
        );
      });

      it("reads an AI command's bad args with AI", async () => {
        extract.mockResolvedValueOnce({
          intent: { command: "ECHOTEST", args: { n: 12 } },
        });
        await handleInbound({ phone, body: "ECHOTEST dose palihog" });
        expect((await lastReply())?.body).toMatch(/gusto mo echo 12\?/);
        await handleInbound({ phone, body: "no" });
      });

      it("answers help words and punctuation-only texts with help", async () => {
        for (const body of ["tabang", "???", "🙂"]) {
          await handleInbound({ phone, body });
          expect((await lastReply())?.body).toMatch(
            /Palihog i-text|Ukon i-text/,
          );
        }
      });

      it("doesn't send a wall of text to AI", async () => {
        extract.mockClear();
        await handleInbound({ phone, body: "palihog ".repeat(80) });
        expect((await lastReply())?.body).toMatch(/malawig gid/);
        expect(extract).not.toHaveBeenCalled();
      });

      it("warns once, then stops replying to a flood", async () => {
        const rows = Array.from({ length: 60 }, (_, i) => ({
          direction: "inbound" as const,
          phone: flood,
          body: `spam ${i}`,
          status: "processed" as const,
        }));
        await db().from("sms_messages").insert(rows);
        await handleInbound({ phone: flood, body: "PRICE" });
        expect((await lastReply(flood))?.body).toMatch(/Damo na ang text/);
        await handleInbound({ phone: flood, body: "PRICE" });
        const replies = (await smsThread(flood)).filter(
          (m) => m.direction === "outbound",
        );
        expect(replies).toHaveLength(1);
      });
    });

    it("replies with help when AI reads nothing valid", async () => {
      extract.mockResolvedValueOnce({ intent: { command: "NONE" } });
      await handleInbound({ phone, body: "hi" });
      expect((await lastReply())?.body).toMatch(/wala namon naintiendihan/);
      extract.mockResolvedValueOnce({
        intent: { command: "ECHOTEST", args: { n: "x" } },
      });
      await handleInbound({ phone, body: "echo x" });
      expect((await lastReply())?.body).toMatch(/wala namon naintiendihan/);
    });

    describe("asking for missing values", () => {
      const fillStatus = async () => {
        const { data } = await db()
          .from("sms_prompts")
          .select("status")
          .eq("phone", phone)
          .eq("kind", "ai_fill")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        return data?.status;
      };
      const askForN = async () => {
        extract.mockResolvedValueOnce({
          intent: { command: "FILLTEST", args: { label: "x" } },
        });
        await handleInbound({ phone, body: "fill x please" });
        expect((await lastReply())?.body).toBe("IRPC: Pila?");
      };

      beforeAll(() => {
        registerCommand({
          keywords: ["FILLTEST"],
          schema: z.object({ label: z.string(), n: z.number().int() }),
          parse: () => null,
          handle: async ({ label, n }) => `filled ${label}=${n}`,
          ai: {
            description: "Fill a number.",
            summary: ({ label, n }) => `fill ${label}=${n}`,
            ask: { n: "Pila?" },
            readReply: (text) =>
              /^\d+$/.test(text.trim()) ? { n: Number(text) } : null,
          },
        });
      });

      it("asks, then confirms once the value comes in", async () => {
        await askForN();
        await handleInbound({ phone, body: "5" });
        expect((await lastReply())?.body).toBe(
          "IRPC: Para sigurado, gusto mo fill x=5? Husto bala?",
        );
        expect(await fillStatus()).toBe("accepted");
        await handleInbound({ phone, body: "yes" });
        expect((await lastReply())?.body).toBe("filled x=5");
      });

      it("reads a reply with AI when code can't", async () => {
        await askForN();
        extract.mockResolvedValueOnce({ n: 6 });
        await handleInbound({ phone, body: "unom" });
        expect((await lastReply())?.body).toMatch(/fill x=6/);
        await handleInbound({ phone, body: "no" });
      });

      it("asks again, then gives up with help", async () => {
        await askForN();
        await handleInbound({ phone, body: "ambot" });
        expect((await lastReply())?.body).toBe("IRPC: Pila?");
        await handleInbound({ phone, body: "ambot gid" });
        expect((await lastReply())?.body).toMatch(/wala namon naintiendihan/);
        expect(await fillStatus()).toBe("expired");
      });

      it("is cancelled by a keyword command", async () => {
        await askForN();
        await handleInbound({ phone, body: "ECHOTEST 9" });
        expect((await lastReply())?.body).toMatch(/^n=9 /);
        expect(await fillStatus()).toBe("expired");
      });

      it("is dropped on a no and not answered later", async () => {
        await askForN();
        await handleInbound({ phone, body: "indi" });
        expect((await lastReply())?.body).toBe(
          "IRPC: Sige, wala kami gin-save.",
        );
        expect(await fillStatus()).toBe("declined");
        await handleInbound({ phone, body: "5" });
        expect((await lastReply())?.body).toMatch(/wala namon naintiendihan/);
      });

      it("leaves a plain yes to other prompts", async () => {
        await askForN();
        await handleInbound({ phone, body: "yes" });
        expect((await lastReply())?.body).toMatch(/Wala kami pamangkot/);
        expect(await fillStatus()).toBe("open");
        await handleInbound({ phone, body: "5" });
        expect((await lastReply())?.body).toMatch(/fill x=5/);
        await handleInbound({ phone, body: "no" });
      });

      it("supersedes an unanswered AI confirmation", async () => {
        extract.mockResolvedValueOnce({
          intent: { command: "ECHOTEST", args: { n: 4 } },
        });
        await handleInbound({ phone, body: "echo four" });
        expect((await lastReply())?.body).toMatch(/Husto bala/);
        await askForN();
        await handleInbound({ phone, body: "yes" });
        expect((await lastReply())?.body).toMatch(/Wala kami pamangkot/);
        await handleInbound({ phone, body: "no" });
      });

      it("takes a reply with no missing value as a new request", async () => {
        await askForN();
        extract
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({ intent: { command: "NONE" } });
        await handleInbound({ phone, body: "Pila presyo subong?" });
        expect((await lastReply())?.body).toMatch(/wala namon naintiendihan/);
        expect(await fillStatus()).toBe("expired");
      });

      it("is not answered once expired", async () => {
        await askForN();
        await db()
          .from("sms_prompts")
          .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
          .eq("phone", phone)
          .eq("kind", "ai_fill")
          .eq("status", "open");
        await handleInbound({ phone, body: "5" });
        expect((await lastReply())?.body).toMatch(/wala namon naintiendihan/);
      });

      it("never asks with AI off", async () => {
        aiEnabled.mockReturnValueOnce(false);
        await handleInbound({ phone, body: "fill x please" });
        expect((await lastReply())?.body).toMatch(/Palihog i-text: /);
      });
    });

    it("expires prompts after 24 hours", async () => {
      const ref = await openPrompt({ phone, kind: "ai_confirm", payload: {} });
      await db()
        .from("sms_prompts")
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("ref", ref);
      await handleInbound({ phone, body: `YES ${ref}` });
      expect((await lastReply())?.body).toMatch(/expired/);
      const { data } = await db()
        .from("sms_prompts")
        .select("status")
        .eq("ref", ref)
        .single();
      expect(data?.status).toBe("expired");
    });

    it("reuses a given ref, replacing its open prompt", async () => {
      const ref = await openPrompt({ phone, kind: "reschedule", payload: {} });
      expect(
        await openPrompt({ phone, kind: "reschedule", payload: {}, ref }),
      ).toBe(ref);
      const { data } = await db()
        .from("sms_prompts")
        .select("status")
        .eq("ref", ref);
      expect(data?.map((p) => p.status).sort()).toEqual(["expired", "open"]);
    });
  },
);
