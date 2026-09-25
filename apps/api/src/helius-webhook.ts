import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const Event = z.object({
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/),
  type: z.string().min(1).max(80),
});

export function validWebhookSecret(actual: string | undefined, expected: string | undefined) {
  if (!expected || !actual) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function parseHeliusWebhook(payload: unknown) {
  return z
    .array(Event)
    .max(100)
    .parse(payload)
    .map((event) => ({
      signature: event.signature,
      eventType: event.type,
    }));
}
