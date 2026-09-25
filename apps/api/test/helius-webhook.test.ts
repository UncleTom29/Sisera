import { describe, expect, it } from "vitest";
import { buildApi } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { parseHeliusWebhook, validWebhookSecret } from "../src/helius-webhook.js";

describe("Helius webhook intake", () => {
  it("rejects missing or incorrect shared secrets", () => {
    expect(validWebhookSecret(undefined, "secret")).toBe(false);
    expect(validWebhookSecret("wrong", "secret")).toBe(false);
    expect(validWebhookSecret("secret", "secret")).toBe(true);
  });

  it("validates enhanced event signatures without trusting event body details", () => {
    const signature = "1".repeat(70);
    expect(parseHeliusWebhook([{ signature, type: "SWAP", payload: { arbitrary: true } }])).toEqual(
      [{ signature, eventType: "SWAP" }],
    );
    expect(() => parseHeliusWebhook([{ signature: "bad", type: "SWAP" }])).toThrow();
  });

  it("fails closed when event persistence is unavailable", async () => {
    const app = await buildApi(readConfig({ NODE_ENV: "test", HELIUS_WEBHOOK_SECRET: "secret" }));
    try {
      const body = [{ signature: "1".repeat(70), type: "SWAP" }];
      const unauthorized = await app.inject({
        method: "POST",
        url: "/v1/helius/webhook",
        payload: body,
      });
      expect(unauthorized.statusCode).toBe(401);
      const unavailable = await app.inject({
        method: "POST",
        url: "/v1/helius/webhook",
        headers: { authorization: "secret" },
        payload: body,
      });
      expect(unavailable.statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });
});
