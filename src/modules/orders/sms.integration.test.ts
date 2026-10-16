import { randomInt, randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { z } from "zod";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { extract, aiEnabled, gatewaySend } = vi.hoisted(() => ({
  extract: vi.fn(),
  aiEnabled: vi.fn(() => true),
  gatewaySend: vi.fn(),
}));
vi.mock("@/lib/ai", () => ({ extract, aiEnabled }));
vi.mock("@/lib/sms", () => ({ smsGateway: () => ({ send: gatewaySend }) }));
import * as dates from "@/lib/dates";
import { db } from "@/lib/supabase/admin";
import { findOrRegisterByPhone } from "@/modules/accounts/queries";
import { isGsm7, SMS_MAX_CHARS } from "@/modules/sms/logic";
import { handleInbound, smsThread } from "@/modules/sms/queries";
import { buyBySms, listOrders } from "./queries";

// Uses only an isolated/local DB and mocked extraction/gateway. No live AI or SMS.
describe.skipIf(process.env.RUN_TRADE_SMS_DB_TESTS !== "1")(
  "natural-language buying and selling SMS",
  () => {
    let phone: string;
    let stranger: string;
    let readings: unknown[];
    const message = (body: string, gatewayId?: string, from = phone) =>
      handleInbound({ phone: from, body, gatewayId });
    const reply = async (from = phone) =>
      (await smsThread(from)).filter((m) => m.direction === "outbound").at(-1)!
        .body;
    const orders = async () => {
      const { data, error } = await db()
        .from("rice_orders")
        .select()
        .eq("booked_by_phone", phone);
      if (error) throw error;
      return data!;
    };
    const offers = async () => {
      const { data, error } = await db()
        .from("sell_offers")
        .select()
        .eq("booked_by_phone", phone);
      if (error) throw error;
      return data!;
    };
    const pending = async () => {
      const { data, error } = await db()
        .from("sms_prompts")
        .select()
        .eq("phone", phone)
        .eq("status", "open")
        .eq("kind", "ai_confirm")
        .single();
      if (error) throw error;
      return data!;
    };
    const buyInput = {
      amount: 100,
      unit: "kg",
      dayMonth: "25/10",
      name: "Maria Reyes",
      buyerType: "retailer",
    } as const;
    const sellInput = {
      amount: 3000,
      unit: "kg",
      dayMonth: "25/10",
      varietyCode: "RC222",
    } as const;
    const requestBuy = async (
      input: Record<string, unknown> = buyInput,
      body = "I want to buy 100 kg of rice for pickup on 25/10",
    ) => {
      readings.push({ intent: { command: "BUY", args: input } });
      await message(body);
    };
    const requestSell = async (
      input: Record<string, unknown> = sellInput,
      body = "I want to sell 3000 kg RC222 palay harvested on 25/10",
    ) => {
      readings.push({ intent: { command: "SELL", args: input } });
      await message(body);
    };
    beforeAll(() => {
      if (
        !["127.0.0.1", "localhost"].includes(
          new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid")
            .hostname,
        )
      )
        throw new Error("Trade tests require local Supabase.");
    });
    beforeEach(() => {
      phone = `+639${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
      stranger = `+639${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
      readings = [];
      aiEnabled.mockReturnValue(true);
      extract.mockReset().mockImplementation(async (schema: z.ZodType) => {
        const next = readings.shift();
        if (next === undefined || next === null) return null;
        return schema.parse(next);
      });
      gatewaySend
        .mockReset()
        .mockImplementation(async () => ({ id: `trade-${randomUUID()}` }));
      vi.spyOn(dates, "todayManila").mockReturnValue("2026-10-16");
    });
    afterEach(async () => {
      const thread = await smsThread(phone);
      for (const m of thread.filter((m) => m.direction === "outbound")) {
        expect(isGsm7(m.body)).toBe(true);
        expect(m.body.length).toBeLessThanOrEqual(SMS_MAX_CHARS);
      }
      for (const [table, column] of [
        ["rice_orders", "booked_by_phone"],
        ["sell_offers", "booked_by_phone"],
        ["request_attempts", "phone"],
        ["sms_messages", "phone"],
        ["sms_prompts", "phone"],
        ["clients", "phone"],
      ] as const) {
        const { error } = await db()
          .from(table)
          .delete()
          .in(column, [phone, stranger]);
        if (error) throw error;
      }
      vi.restoreAllMocks();
    });

    it("confirms rice buying before saving and snapshots buyer details without changing a farmer", async () => {
      const farmer = await findOrRegisterByPhone(phone, {
        name: "Existing Farmer",
      });
      await requestBuy();
      expect(await orders()).toHaveLength(0);
      expect(await reply()).toContain("Husto bala?");
      await message("huo");
      const [order] = await orders();
      expect(order).toMatchObject({
        kg: 100,
        pickup_date: "2026-10-25",
        status: "requested",
        buyer_name: "Maria Reyes",
        buyer_type: "retailer",
        client_id: farmer.id,
      });
      expect(order.sms_prompt_id).toBeTruthy();
      expect(await findOrRegisterByPhone(phone)).toMatchObject({
        name: "Existing Farmer",
        kind: "farmer",
        buyer_type: null,
      });
      expect((await listOrders()).find((o) => o.id === order.id)).toMatchObject(
        { buyer_name: "Maria Reyes", buyer_type: "retailer" },
      );
      expect(await reply()).toContain(order.ref);
    });
    it("confirms palay selling, keeping offers distinct from rice orders", async () => {
      await requestSell();
      expect(await offers()).toHaveLength(0);
      await message("yes");
      expect(await offers()).toMatchObject([
        { est_kg: 3000, harvest_date: "2026-10-25", status: "offered" },
      ]);
      expect(await orders()).toHaveLength(0);
    });
    it("collects missing buyer identity and classification over separate texts", async () => {
      await requestBuy({ amount: 100, unit: "kg", dayMonth: "25/10" });
      expect(await reply()).toContain("ngalan");
      await message("NAME Maria Reyes");
      expect(await reply()).toContain("buyer");
      await message("retailer");
      expect(await reply()).toContain("Husto bala?");
      await message("yes");
      expect(await orders()).toMatchObject([
        { buyer_name: "Maria Reyes", buyer_type: "retailer" },
      ]);
    });
    it("uses existing buyer details as defaults without asking again", async () => {
      await findOrRegisterByPhone(phone, {
        name: "Store Owner",
        kind: "buyer",
        buyer_type: "wholesaler",
      });
      await requestBuy({ amount: 100, unit: "kg", dayMonth: "25/10" });
      expect(await reply()).toContain("Store Owner");
      expect(await reply()).toContain("Husto bala?");
      await message("yes");
      expect(await orders()).toMatchObject([
        { buyer_name: "Store Owner", buyer_type: "wholesaler" },
      ]);
    });
    it("asks for kg per sack and converts the stated weight for both flows", async () => {
      await requestBuy(
        { ...buyInput, amount: 20, unit: "sacks" },
        "Mabakal ko 20 ka sako nga bugas sa 25/10",
      );
      expect(await reply()).toContain("isa ka sako");
      await message("42 kg");
      expect(await reply()).toContain("840 kg");
      await message("yes");
      expect(await orders()).toMatchObject([{ kg: 840 }]);
      await requestSell(
        { ...sellInput, amount: 10, unit: "sacks" },
        "May 10 sako ko nga RC222 palay ibaligya, harvest 25/10",
      );
      await message("45");
      await message("yes");
      expect(await offers()).toMatchObject([{ est_kg: 450 }]);
    });
    it("asks for missing variety/harvest and preserves the conversation through VARIETIES", async () => {
      await requestSell(
        { amount: 1000, unit: "kg" },
        "May palay ko nga ibaligya, 1000 kg",
      );
      await message("VARIETIES");
      expect(await reply()).toContain("RC222");
      await message("RC222 harvest 25/10");
      expect(await reply()).toContain("Husto bala?");
      await message("yes");
      expect(await offers()).toMatchObject([
        { est_kg: 1000, harvest_date: "2026-10-25" },
      ]);
    });
    it("clarifies buy/sell ambiguity and carries the original quantity into follow-up", async () => {
      readings.push({ intent: { command: "CLARIFY" } });
      await message("I want 20 sacks");
      expect(await reply()).toContain("bugas ukon");
      readings.push({
        intent: {
          command: "BUY",
          args: { ...buyInput, amount: 20, unit: "sacks" },
        },
      });
      await message("Buy rice, pickup 25/10, NAME Maria Reyes retailer");
      expect(extract.mock.calls.at(-1)?.[1]).toContain("I want 20 sacks");
      expect(await reply()).toContain("isa ka sako");
      expect(await orders()).toHaveLength(0);
    });
    it("revises a qualified yes and requires fresh confirmation", async () => {
      await requestBuy(
        { ...buyInput, amount: 20, unit: "sacks", kgPerSack: 50 },
        "Buy 20 sacks rice at 50 kg per sack on 25/10",
      );
      const first = await pending();
      readings.push({
        action: "correct",
        changes: { amount: 25, unit: "sacks" },
      });
      await message("yes but 25 sacks");
      expect(await orders()).toHaveLength(0);
      expect(await reply()).toContain("1,250 kg");
      const revised = await pending();
      expect(revised.id).not.toBe(first.id);
      await message(`YES ${first.ref}`);
      expect(await orders()).toHaveLength(0);
      await message(`YES ${revised.ref}`);
      expect(await orders()).toMatchObject([{ kg: 1250 }]);
    });
    it("does not save an unclear or negated confirmation", async () => {
      await requestSell();
      readings.push({ action: "unclear", changes: {} });
      await message("yes not yet");
      expect(await offers()).toHaveLength(0);
      await message("no");
      expect(await offers()).toHaveLength(0);
      await message("yes");
      expect(await offers()).toHaveLength(0);
    });
    it("rejects expired and wrong-phone confirmations", async () => {
      await requestBuy();
      const prompt = await pending();
      await message(`YES ${prompt.ref}`, undefined, stranger);
      expect(await orders()).toHaveLength(0);
      await db()
        .from("sms_prompts")
        .update({ expires_at: "2020-01-01T00:00:00Z" })
        .eq("id", prompt.id);
      await message(`YES ${prompt.ref}`);
      expect(await orders()).toHaveLength(0);
    });
    it("claims simultaneous confirmations and deduplicates inbound delivery", async () => {
      const gatewayId = randomUUID();
      await requestBuy();
      const prompt = await pending();
      await Promise.all([
        message(`YES ${prompt.ref}`, gatewayId),
        message(`YES ${prompt.ref}`, gatewayId),
        message(`YES ${prompt.ref}`, randomUUID()),
      ]);
      expect(await orders()).toHaveLength(1);
      await message("YES");
      expect(await orders()).toHaveLength(1);
    });
    it("reuses saved transactions after a later failure instead of creating another", async () => {
      await requestBuy();
      const prompt = await pending();
      await message("yes");
      // Simulate a prompt reopened after a post-save handler failure.
      await db()
        .from("sms_prompts")
        .update({ status: "open" })
        .eq("id", prompt.id);
      await message(`YES ${prompt.ref}`);
      expect(await orders()).toHaveLength(1);
      await requestSell();
      const sellPrompt = await pending();
      await message("yes");
      await db()
        .from("sms_prompts")
        .update({ status: "open" })
        .eq("id", sellPrompt.id);
      await message(`YES ${sellPrompt.ref}`);
      expect(await offers()).toHaveLength(1);
    });
    it("survives outbound gateway failure with one saved request", async () => {
      await requestBuy();
      gatewaySend.mockRejectedValueOnce(new Error("Mock gateway unavailable"));
      await message("yes");
      expect(await orders()).toHaveLength(1);
      await message("yes");
      expect(await orders()).toHaveLength(1);
    });
    it("validates unknown varieties, fractional kg, and out-of-range pickup dates before confirmation", async () => {
      await requestSell(
        { ...sellInput, varietyCode: "UNKNOWN" },
        "I want to sell palay",
      );
      expect(await reply()).toContain("variety");
      expect(await offers()).toHaveLength(0);
      await message("NO");
      await requestBuy(
        { ...buyInput, dayMonth: "31/02" },
        "I want to buy rice",
      );
      expect(await reply()).toContain("30 ka adlaw");
      await message("NO");
      await requestBuy(
        { ...buyInput, dayMonth: "20/12" },
        "I want to buy rice",
      );
      expect(await reply()).toContain("30 ka adlaw");
      await message("NO");
      await requestBuy({ ...buyInput, amount: 1.5 }, "I want to buy rice");
      expect(await reply()).toContain("kadamuon");
      expect(await orders()).toHaveLength(0);
    });
    it("resolves relative dates in code and calculates read-only quote estimates", async () => {
      await requestBuy(
        { ...buyInput, dayMonth: "25/10" },
        "Buy 100 kg rice tomorrow",
      );
      await message("yes");
      expect(await orders()).toMatchObject([{ pickup_date: "2026-10-17" }]);
      readings.push({
        intent: {
          command: "QUOTE",
          args: { mc: 23, amount: 5000, unit: "kg" },
        },
      });
      await message("How much for my palay at 23% moisture, 5000 kg?");
      expect(await reply()).toContain("estimate");
      expect(await offers()).toHaveLength(0);
      readings.push({ intent: { command: "PRICE", args: {} } });
      await message("Pila ang presyo sang bugas subong?");
      expect(await reply()).toContain("bugas");
    });
    it("keeps keyword fallback usable without AI and enforces the three-request limit", async () => {
      aiEnabled.mockReturnValue(false);
      for (let i = 0; i < 3; i++) {
        await message("BUY 100 25/10 retailer NAME Maria Reyes");
        expect(await reply()).toContain("Husto bala?");
        await message("YES");
      }
      await message("BUY 100 25/10 retailer NAME Maria Reyes");
      await message("YES");
      expect(await reply()).toContain("Tatlo lang");
      expect(await orders()).toHaveLength(3);
      await message("SELL 1000 RC222 25/10");
      expect(await offers()).toHaveLength(1);
      await message("QUOTE 23% 5000");
      expect(await reply()).toContain("estimate");
      await message("PRICE");
      expect(await reply()).toContain("bugas");
      expect(extract).not.toHaveBeenCalled();
    });
    it("serializes concurrent rice-request allowance and reuses its reservation", async () => {
      const client = await findOrRegisterByPhone(phone, {
        name: "Maria Reyes",
        kind: "buyer",
        buyer_type: "retailer",
      });
      const { data: prompts, error } = await db()
        .from("sms_prompts")
        .insert(
          Array.from({ length: 4 }, () => ({
            phone,
            kind: "ai_confirm" as const,
            status: "accepted" as const,
            ref: randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase(),
            payload: { keyword: "BUY", args: buyInput },
          })),
        )
        .select();
      if (error) throw error;
      const results = await Promise.all(
        prompts!.map((p) =>
          buyBySms(buyInput, { phone, client, promptId: p.id }),
        ),
      );
      expect(
        results.filter((text) => text.includes("Tatlo lang")),
      ).toHaveLength(1);
      expect(await orders()).toHaveLength(3);
      const [saved] = await orders();
      await buyBySms(buyInput, {
        phone,
        client,
        promptId: saved.sms_prompt_id!,
      });
      expect(await orders()).toHaveLength(3);
      const { count } = await db()
        .from("request_attempts")
        .select("id", { count: "exact", head: true })
        .eq("phone", phone);
      expect(count).toBe(3);
    });
    it("does not substitute a delivery date for the harvest date", async () => {
      await requestSell(
        sellInput,
        "I want to sell 3000 kg RC222 palay, delivery on 25/10",
      );
      expect(await reply()).toContain("San-o ang harvest");
      expect(await offers()).toHaveLength(0);
      await message("harvest 20/10");
      expect(await reply()).toContain("20/10");
      await message("yes");
      expect(await offers()).toMatchObject([{ harvest_date: "2026-10-20" }]);
    });
    it("asks about conflicting weights or dates instead of choosing one", async () => {
      await requestBuy(
        buyInput,
        "I want to buy rice, 100 kg or 200 kg, pickup 25/10 or 26/10",
      );
      expect(await reply()).not.toContain("Husto bala?");
      await message("100 kg pickup 25/10");
      expect(await reply()).toContain("Husto bala?");
      await message("yes");
      expect(await orders()).toMatchObject([
        { kg: 100, pickup_date: "2026-10-25" },
      ]);
    });
    it("reconfirms a palay correction and asks for a changed sack weight", async () => {
      await requestSell();
      readings.push({
        action: "correct",
        changes: { amount: 25, unit: "sacks" },
      });
      await message("huo pero 25 sako gali");
      expect(await offers()).toHaveLength(0);
      expect(await reply()).toContain("isa ka sako");
      await message("40 kg");
      expect(await reply()).toContain("1,000 kg");
      await message("yes");
      expect(await offers()).toMatchObject([{ est_kg: 1000 }]);
    });
    it("keeps a price-only quote read-only while asking for missing MC or sack weight", async () => {
      readings.push({ intent: { command: "QUOTE", args: {} } });
      await message("How much for my palay?");
      expect(await reply()).toContain("moisture");
      await message("23%");
      expect(await reply()).toContain("estimate");
      readings.push({
        intent: {
          command: "QUOTE",
          args: { mc: 23, amount: 20, unit: "sacks" },
        },
      });
      await message("Estimate 20 sacks palay at 23% moisture");
      expect(await reply()).toContain("isa ka sako");
      await message("50 kg per sack");
      expect(await reply()).toContain("1,000 kg");
      expect(await offers()).toHaveLength(0);
      expect(await orders()).toHaveLength(0);
    });
    it("rejects negative stated weight even if extraction drops the minus sign", async () => {
      await requestBuy(
        { ...buyInput, amount: 5 },
        "I want to buy -5 kg of rice",
      );
      expect(await reply()).not.toContain("Husto bala?");
      expect(await orders()).toHaveLength(0);
    });
    it("refuses BUY for another phone without altering their profile", async () => {
      aiEnabled.mockReturnValue(false);
      await message(`BUY 100 25/10 retailer NAME Maria Reyes FOR ${stranger}`);
      expect(await reply()).toContain("indi gamiton ang FOR");
      expect(await orders()).toHaveLength(0);
      const { count } = await db()
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("phone", stranger);
      expect(count).toBe(0);
    });
    it("returns useful help on AI failure or unrelated banana text", async () => {
      readings.push(null);
      await message("Mabakal ko bugas");
      expect(await reply()).toContain("BUY");
      readings.push({ intent: { command: "NONE" } });
      await message("banana");
      expect(await orders()).toHaveLength(0);
      expect(await offers()).toHaveLength(0);
    });
  },
);
